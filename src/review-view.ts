import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian"; // Added setIcon here
import LLMPipelinesPlugin from "./main";
import { reportError } from "./notify";
import { ReviewItem } from "./queue-manager";
import { PipelineEditModal } from "./PipelineEditModal";
import {
	REVIEW_DETAIL_VIEW_TYPE,
	ReviewDetailView,
} from "./review-detail-view";
import { Pipeline } from "./settings";

export const REVIEW_QUEUE_VIEW_TYPE = "llm-pipelines-review-queue-view";

export class ReviewQueueView extends ItemView {
	plugin: LLMPipelinesPlugin;
	// Live-activity text nodes, patched in place by updateActivity() between full
	// renders. Null when no activity box is currently shown.
	private activityStatusEl: HTMLElement | null = null;
	private activityOutputEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LLMPipelinesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	private getOutputPreview(text: string): string {
		// Collapse whitespace (incl. newlines) so the activity box stays a
		// stable, compact line rather than growing tall as multi-line output
		// streams in.
		const flat = text.replace(/\s+/g, " ").trim();
		if (flat.length <= 100) return flat;
		return "…" + flat.slice(-100);
	}

	getViewType() {
		return REVIEW_QUEUE_VIEW_TYPE;
	}
	getDisplayText() {
		// "LLM Pipelines" is the plugin's proper name; sentence case doesn't
		// apply to the second word here. ("LLM" is already in the rule's
		// ignoreWords, but the check flags the capitalised "Pipelines".)
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		return "LLM Pipelines";
	}
	getIcon() {
		return "list-checks";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("llm-pipelines-view");
		// Stale after empty(); re-set only if an activity box is rendered below.
		this.activityStatusEl = null;
		this.activityOutputEl = null;

		// "Pipelines" heading with the add button on the same row, so the +
		// clearly belongs to pipelines.
		const pipelinesHeading = container.createEl("div", {
			cls: "llm-section-heading",
		});
		pipelinesHeading.createEl("span", { text: "Pipelines" });
		const addBtn = pipelinesHeading.createEl("div", {
			cls: "clickable-icon",
			attr: { "aria-label": "New pipeline" },
		});
		setIcon(addBtn, "plus");
		addBtn.onclick = () =>
			void this.createNewPipeline().catch(
				reportError("Couldn't create pipeline"),
			);

		const list = container.createEl("div", { cls: "llm-pipeline-list" });

		this.plugin.settings.pipelines.forEach((pipeline) => {
			const isRunning =
				this.plugin.isProcessing &&
				this.plugin.session?.pipelineName === pipeline.name;

			const row = list.createEl("div", { cls: "llm-pipeline-row" });
			const nameEl = row.createEl("div", {
				cls: "llm-pipeline-row__name",
				text: pipeline.name,
			});
			nameEl.onclick = () =>
				new PipelineEditModal(
					this.app,
					this.plugin,
					pipeline,
					() =>
						void this.onOpen().catch(
							reportError("Sidebar refresh failed", false),
						),
				).open();

			const actionBtn = row.createEl("div", {
				cls: "clickable-icon",
				attr: {
					"aria-label": isRunning ? "Stop pipeline" : "Run pipeline",
				},
			});
			if (isRunning) {
				actionBtn.addClass("llm-pipeline-row__stop");
				setIcon(actionBtn, "square");
				actionBtn.onclick = (e) => {
					e.stopPropagation();
					this.plugin.stopProcessing();
					new Notice("Stopping…");
				};
			} else {
				setIcon(actionBtn, "play");
				actionBtn.onclick = (e) => {
					e.stopPropagation();
					void this.plugin
						.startBatchProcessing(pipeline)
						.catch(reportError("Pipeline run failed"));
				};
			}

			// Live activity sits beneath the pipeline that's actually running,
			// rather than floating at the top of the pane.
			if (isRunning && this.plugin.session) {
				this.renderActivity(list);
			}
		});

		// Pending review.
		container.createEl("hr", { cls: "llm-divider" });
		const reviewHeading = container.createEl("div", {
			cls: "llm-section-heading",
		});
		reviewHeading.createEl("span", { text: "Pending review" });

		const items = this.plugin.queueManager.getReviewItems();
		if (items.length === 0) {
			container.createEl("div", {
				cls: "llm-review-empty",
				text: "All caught up!",
			});
		}

		items.forEach((item) => {
			const name = item.filePath.split("/").pop() ?? item.filePath;
			const itemEl = container.createEl("div", {
				cls: "llm-review-item",
				text: name.replace(/\.md$/, ""),
			});
			itemEl.onclick = () =>
				void this.openDetailView(item).catch(
					reportError("Couldn't open review item"),
				);
		});
	}

	private renderActivity(parent: HTMLElement) {
		const box = parent.createEl("div", { cls: "llm-activity" });
		this.activityStatusEl = box.createEl("div", {
			cls: "llm-activity__status",
		});
		this.activityOutputEl = box.createEl("div", {
			cls: "llm-activity__output",
		});
		this.updateActivity();
	}

	/** Patch the live-activity text in place (called per streamed token). Does
	 *  nothing if no activity box is currently rendered. */
	updateActivity() {
		const session = this.plugin.session;
		if (!session || !this.activityStatusEl || !this.activityOutputEl) return;

		const statusIcons = {
			reading: "📖",
			thinking: "🧠",
			writing: "✍️",
			idle: "💤",
		};
		const label =
			session.status.charAt(0).toUpperCase() + session.status.slice(1);
		this.activityStatusEl.setText(
			`✨ ${session.actualModelName || "Ollama"}: ${statusIcons[session.status]} ${label}`,
		);
		this.activityOutputEl.setText(
			this.getOutputPreview(session.currentOutput),
		);
	}

	async createNewPipeline() {
		const newPipeline: Pipeline = {
			id: "pipeline-" + Date.now(),
			name: "New pipeline",
			trigger: "#tag",
			outputTag: "#done",
			promptPath: "prompts/template.md",
			destination: "Append",
			modelId: "gemma3:1b", // Fix: Add the missing property
		};
		this.plugin.settings.pipelines.push(newPipeline);
		await this.plugin.saveSettings();
		new PipelineEditModal(
			this.app,
			this.plugin,
			newPipeline,
			() => void this.onOpen(),
		).open();
	}

	async openDetailView(item: ReviewItem) {
		let leaf = this.app.workspace.getLeavesOfType(
			REVIEW_DETAIL_VIEW_TYPE,
		)[0];

		if (!leaf) {
			leaf = this.app.workspace.getLeaf("tab");
		}

		await leaf.setViewState({
			type: REVIEW_DETAIL_VIEW_TYPE,
			active: true,
		});

		const view = leaf.view as ReviewDetailView;
		await view.setItem(item);
		await this.app.workspace.revealLeaf(leaf);
	}
}
