import { Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	LLMPipelinesSettings,
	LLMPipelinesSettingTab,
	Pipeline,
} from "./settings";
import { streamOllama } from "./ollama-engine";
import { reportError } from "./notify";
import { selectPromptInput } from "./prompt-input";
import { getPromptTemplate } from "./vault-helpers";
import { QueueManager } from "./queue-manager";
import { PipelineSuggester } from "./pipeline-manager";
import { REVIEW_QUEUE_VIEW_TYPE, ReviewQueueView } from "./review-view";
import {
	REVIEW_DETAIL_VIEW_TYPE,
	ReviewDetailView,
} from "./review-detail-view";

export interface ProcessingSession {
	pipelineName: string;
	totalFiles: number;
	currentIndex: number;
	currentFileName: string;
	status: "reading" | "thinking" | "writing" | "idle";
	currentOutput: string;
	actualModelName?: string;
}

export default class LLMPipelinesPlugin extends Plugin {
	settings!: LLMPipelinesSettings;
	queueManager!: QueueManager;
	isProcessing = false;
	session: ProcessingSession | null = null;
	statusBarItem!: HTMLElement;
	abortController: AbortController | null = null;

	stopProcessing() {
		// Only signal the abort — don't null the controller. The batch loop
		// checks `signal.aborted` to break and still references the signal for
		// the in-flight request; nulling here breaks both (and crashes on a
		// second stop). The controller is cleared in the loop's `finally`.
		this.abortController?.abort();
	}

	async onload() {
		await this.loadSettings();
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar("idle");

		this.queueManager = new QueueManager(this.app, this.manifest.id);
		await this.queueManager.load();

		this.registerView(
			REVIEW_DETAIL_VIEW_TYPE,
			(leaf) => new ReviewDetailView(leaf, this),
		);

		this.registerView(
			REVIEW_QUEUE_VIEW_TYPE,
			(leaf) => new ReviewQueueView(leaf, this),
		);

		this.addCommand({
			id: "open-review-queue",
			name: "Open pipelines pane",
			callback: () =>
				void this.activateView().catch(
					reportError("Couldn't open pipelines pane"),
				),
		});

		this.addRibbonIcon("list-checks", "Open LLM pipelines", () => {
			void this.activateView().catch(
				reportError("Couldn't open pipelines pane"),
			);
		});

		this.addCommand({
			id: "run-pipeline-picker",
			name: "Run pipeline…",
			callback: () => {
				new PipelineSuggester(this.app, this).open();
			},
		});

		this.addSettingTab(new LLMPipelinesSettingTab(this.app, this));
	}

	onunload() {
		void this.saveSettings();
	}

	updateStatusBar(status: ProcessingSession["status"]) {
		const icons = {
			reading: "📖",
			thinking: "🧠",
			writing: "✍️",
			idle: "💤",
		};
		const label = status.charAt(0).toUpperCase() + status.slice(1);
		this.statusBarItem.setText(
			`Pipelines: ${icons[status] || ""} ${label}`,
		);
	}

	refreshSidebar() {
		this.app.workspace
			.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof ReviewQueueView) {
					void leaf.view
						.onOpen()
						.catch(reportError("Sidebar refresh failed", false));
				}
			});
	}

	/**
	 * Lightweight per-token update: patch just the live activity text in place.
	 * A full `refreshSidebar()` rebuilds the whole pane (including the Stop
	 * button), so calling it per chunk made the button a constantly-recreated,
	 * near-unclickable target. Structural changes still go through refreshSidebar.
	 */
	updateSidebarActivity() {
		this.app.workspace
			.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof ReviewQueueView) {
					leaf.view.updateActivity();
				}
			});
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE)[0];
		if (!leaf) {
			const newLeaf = workspace.getRightLeaf(false);
			if (newLeaf) {
				await newLeaf.setViewState({
					type: REVIEW_QUEUE_VIEW_TYPE,
					active: true,
				});
				leaf = newLeaf;
			}
		}
		if (leaf) await workspace.revealLeaf(leaf);
	}

	async startBatchProcessing(pipeline: Pipeline) {
		this.isProcessing = true;
		this.abortController = new AbortController();

		const files = this.queueManager.getTodoFiles(pipeline);
		if (files.length === 0) {
			this.isProcessing = false;
			new Notice(`No notes tagged ${pipeline.trigger} to process.`);
			return;
		}

		this.session = {
			pipelineName: pipeline.name,
			totalFiles: files.length,
			currentIndex: 0,
			currentFileName: "",
			status: "idle",
			currentOutput: "",
			actualModelName: pipeline.modelId,
		};

		this.refreshSidebar();

		let outcome: "complete" | "stopped" | "error" = "complete";
		try {
			for (let i = 0; i < files.length; i++) {
				if (this.abortController?.signal.aborted) {
					outcome = "stopped";
					break;
				}

				this.isProcessing = true;
				const file = files[i];
				if (typeof file === "undefined") {
					console.warn(
						"failed to process file as file was undefined",
					);
				} else {
					// LLM is 'Reading'
					this.session.status = "reading";
					this.session.currentIndex = i;
					this.session.currentFileName = file.name;
					this.session.currentOutput = "";
					this.updateStatusBar("reading");
					this.refreshSidebar();

					const content = await this.app.vault.read(file);
					const template = await getPromptTemplate(
						this.app,
						pipeline.promptPath,
					);
					const input = selectPromptInput(
						pipeline.promptInput,
						file.basename,
						content,
					);

					// LLM is 'Writing' or 'Thinking' TODO try capture thinking from thinking models
					this.session.status = "writing";
					this.updateStatusBar("writing");

					// Deliberately no separator: spacing between prompt and
					// input belongs in the prompt file, so what's concatenated
					// here is exactly what the user authored.
					const fullPrompt = template + input;

					try {
						await streamOllama(
							pipeline.modelId,
							fullPrompt,
							(chunk, model) => {
								this.session!.currentOutput += chunk;
								this.session!.actualModelName = model;
								this.updateSidebarActivity();
							},
							this.abortController.signal,
						);
					} catch (e) {
						if (e instanceof Error && e.name === "AbortError") {
							// User stopped — abandon this file's partial output
							// and end the batch (don't queue it).
							outcome = "stopped";
							break;
						}
						const message =
							e instanceof Error ? e.message : String(e);
						new Notice(`Ollama Error: ${message}`);
						console.error(e);
						outcome = "error";
						break;
					}

					// Store `input`, not the raw file content: the review
					// screen must show exactly what the model received.
					await this.queueManager.addToReview(
						file.path,
						this.session.currentOutput,
						template,
						input,
						pipeline.id,
						this.session.actualModelName || pipeline.modelId,
					);
					this.refreshSidebar();
				}
			}
			if (outcome === "stopped") {
				new Notice("Pipeline stopped.");
			} else if (outcome === "complete") {
				new Notice("Batch complete!");
			}
			// "error" already surfaced its own Notice above.
		} catch (e) {
			console.error("Batch processing failed", e);
			const message = e instanceof Error ? e.message : String(e);
			new Notice(`Batch processing failed: ${message}`);
		} finally {
			this.isProcessing = false;
			this.abortController = null;
			if (this.session) this.session.status = "idle";
			this.updateStatusBar("idle");
			this.refreshSidebar();
		}
	}

	async loadSettings() {
		const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
		// Migrate legacy "workflows" field → "pipelines"
		if (data.workflows && !data.pipelines) {
			data.pipelines = data.workflows;
		}
		delete data.workflows;
		delete data.mySetting; // leftover from the sample-plugin template
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data,
		) as LLMPipelinesSettings;
		console.debug(
			"Plugin settings loaded:",
			JSON.stringify(this.settings, null, 2),
		);
	}

	async saveSettings() {
		try {
			await this.saveData(this.settings);
		} catch (e) {
			console.error("Failed to save settings", e);
			new Notice("Couldn't save settings — see console.");
		}
	}
}
