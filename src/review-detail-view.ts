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

		contentEl.setCssStyles({
			display: "flex",
			flexDirection: "column",
			height: "100%",
			padding: "0",
			backgroundColor: "var(--background-primary)",
		});

		const mainGrid = contentEl.createEl("div", {
			attr: {
				style: "display: grid; grid-template-columns: 1fr 1fr; flex: 1; overflow: hidden;",
			},
		});

		const leftCol = mainGrid.createEl("div", {
			attr: {
				style: "overflow-y: auto; padding: 30px; border-right: 1px solid var(--divider-color); background: var(--background-primary);",
			},
		});

		const pipeline = this.plugin.settings.pipelines.find(
			(p) => p.id === this.item?.pipelineId,
		);

		const promptLink = pipeline
			? `[[${pipeline.promptPath}|Prompt: ${pipeline.name}]]`
			: "Prompt Source";
		const noteLink = `[[${this.item.filePath}|Note: ${this.item.filePath.split("/").pop()}]]`;

		const promptContent =
			this.item.promptContent || "No prompt data saved.";
		const noteContent =
			this.item.originalContent || "No original content saved.";

		const leftMarkdown = `# Source: ${promptLink}\n${promptContent}\n\n---\n\n# Target: ${noteLink}\n${noteContent}`;

		await MarkdownRenderer.render(
			this.app,
			leftMarkdown,
			leftCol,
			this.item.filePath,
			this,
		);

		const rightCol = mainGrid.createEl("div", {
			attr: {
				style: "overflow-y: auto; padding: 30px; background: var(--background-primary);",
			},
		});

		await MarkdownRenderer.render(
			this.app,
			`# Proposed Output\n${this.item.proposedContent}`,
			rightCol,
			this.item.filePath,
			this,
		);

		[leftCol, rightCol].forEach((col) => {
			col.addEventListener("click", (event: MouseEvent) => {
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
		});

		const bannerContainer = contentEl.createEl("div", {
			attr: {
				style: "padding: 20px; border-top: 1px solid var(--divider-color); background: var(--background-primary); display: flex; justify-content: flex-end; gap: 12px; margin-bottom: var(--status-bar-height, 30px);",
			},
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
