import {
	ItemView,
	WorkspaceLeaf,
	MarkdownRenderer,
	TFile,
	Notice,
} from "obsidian";
import LLMPipelinesPlugin from "./main";
import { reportError } from "./notify";
import { ReviewItem } from "./queue-manager";

export const REVIEW_DETAIL_VIEW_TYPE = "llm-pipelines-review-detail-view";

export class ReviewDetailView extends ItemView {
	plugin: LLMPipelinesPlugin;
	item: ReviewItem | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LLMPipelinesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return REVIEW_DETAIL_VIEW_TYPE;
	}

	getDisplayText() {
		return this.item
			? `Review: ${this.item.filePath.split("/").pop()}`
			: "Review Item";
	}

	async setItem(item: ReviewItem) {
		this.item = item;
		this.app.workspace.requestSaveLayout();
		await this.onOpen();
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.item) return;

		contentEl.addClass("llm-review-detail");

		const panes = contentEl.createEl("div", {
			cls: "llm-review-detail__panes",
		});
		const outputPane = panes.createEl("div", {
			cls: "llm-review-detail__pane",
		});
		const sentPane = panes.createEl("div", {
			cls: "llm-review-detail__pane",
		});

		const pipeline = this.plugin.settings.pipelines.find(
			(p) => p.id === this.item?.pipelineId,
		);

		const noteName =
			this.item.filePath.split("/").pop() ?? this.item.filePath;
		const noteLink = `[[${this.item.filePath}|${noteName}]]`;
		const promptLink = pipeline
			? `[[${pipeline.promptPath}|${pipeline.promptPath.split("/").pop() ?? pipeline.promptPath}]]`
			: "prompt";

		// The output comes first — it's the thing under review. "Appending" is
		// literal: approval always appends to the original note today.
		await MarkdownRenderer.render(
			this.app,
			`# Appending to ${noteLink}\n${this.item.proposedContent}`,
			outputPane,
			this.item.filePath,
			this,
		);

		// Beneath it, the model input: one heading, then the prompt followed
		// directly by the note-derived input — concatenated exactly as it was
		// sent, with no added headings or dividers.
		const sentPayload =
			(this.item.promptContent || "") + (this.item.originalContent || "");
		await MarkdownRenderer.render(
			this.app,
			`# Sent to ${this.item.modelName || "model"}: ${promptLink} + ${noteLink}\n${sentPayload || "*Nothing saved for this item.*"}`,
			sentPane,
			this.item.filePath,
			this,
		);

		panes.addEventListener("click", (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const link = target.closest(".internal-link") as HTMLElement;
			if (link) {
				const path = link.getAttribute("data-href");
				if (path) {
					void this.app.workspace
						.openLinkText(
							path,
							this.item!.filePath,
							event.ctrlKey || event.metaKey,
						)
						.catch(reportError("Couldn't open link"));
				}
			}
		});

		const bannerContainer = contentEl.createEl("div", {
			cls: "llm-review-detail__actions",
		});

		const rejectBtn = bannerContainer.createEl("button", {
			text: "Reject",
			cls: "mod-warning",
		});
		rejectBtn.onclick = async () => {
			try {
				await this.plugin.queueManager.rejectChange(
					this.item!.filePath,
				);
				new Notice("Rejected");
				this.leaf.detach();
			} catch (e) {
				console.error("Failed to reject item", e);
				new Notice("Couldn't reject — see console.");
			}
			this.plugin.refreshSidebar();
		};

		const approveBtn = bannerContainer.createEl("button", {
			text: "Approve & apply",
			cls: "mod-cta",
		});
		approveBtn.onclick = async () => {
			const file = this.app.vault.getAbstractFileByPath(
				this.item!.filePath,
			);
			const pipeline = this.plugin.settings.pipelines.find(
				(p) => p.id === this.item!.pipelineId,
			);

			// The approve path currently always appends to the original note, so
			// a missing source is a hard stop. When destinations land (P2),
			// "New Note" can proceed without it — branch on pipeline.destination.
			if (!(file instanceof TFile)) {
				new Notice("Original note no longer exists.");
				return;
			}
			if (!pipeline) {
				new Notice("This pipeline no longer exists.");
				return;
			}

			try {
				await this.plugin.queueManager.approveChange(
					file,
					this.item!.proposedContent,
					pipeline,
				);
				new Notice("Applied changes and updated tags!");
				this.leaf.detach();
			} catch (e) {
				console.error("Failed to approve item", e);
				new Notice("Couldn't apply changes — see console.");
			}
			this.plugin.refreshSidebar();
		};
	}
}
