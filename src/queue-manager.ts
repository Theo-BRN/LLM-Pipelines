import { App, TFile } from "obsidian";
import { getFilesWithTag } from "./vault-helpers";
import {
	normaliseFrontmatterTags,
	resolveOutputTag,
	stripInlineTag,
} from "./tag-utils";
import { Pipeline } from "./settings";

export interface ReviewItem {
	filePath: string;
	proposedContent: string;
	promptContent: string;
	// The note-derived input actually sent to the model — may be less than the
	// full note (title only, or frontmatter stripped) depending on the
	// pipeline's promptInput mode.
	originalContent: string;
	modelName: string;
	timestamp: number;
	pipelineId: string;
}

export class QueueManager {
	private app: App;
	private pluginPath: string;
	private reviewQueue: Record<string, ReviewItem> = {};

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.pluginPath = `.obsidian/plugins/${pluginId}/review-queue.json`;
	}

	async load() {
		if (await this.app.vault.adapter.exists(this.pluginPath)) {
			const data = await this.app.vault.adapter.read(this.pluginPath);
			const parsed = JSON.parse(data) as Record<
				string,
				ReviewItem & { workflowId?: string }
			>;
			// Migrate legacy "workflowId" field → "pipelineId"
			for (const item of Object.values(parsed)) {
				if (item.workflowId && !item.pipelineId) {
					item.pipelineId = item.workflowId;
				}
				delete item.workflowId;
			}
			this.reviewQueue = parsed;
		}
	}

	async rejectChange(filePath: string) {
		if (this.reviewQueue[filePath]) {
			delete this.reviewQueue[filePath];
			await this.save();
		}
	}

	getTodoFiles(pipeline: Pipeline): TFile[] {
		const triggered = getFilesWithTag(this.app, pipeline.trigger);
		const outputTag = resolveOutputTag(
			pipeline.outputTag,
			pipeline.trigger,
		);
		const done = outputTag
			? new Set(getFilesWithTag(this.app, outputTag).map((f) => f.path))
			: new Set<string>();
		return triggered.filter(
			(file) => !done.has(file.path) && !this.reviewQueue[file.path],
		);
	}

	getReviewItems(): ReviewItem[] {
		return Object.values(this.reviewQueue);
	}

	async addToReview(
		filePath: string,
		proposedContent: string,
		promptContent: string,
		originalContent: string,
		pipelineId: string,
		modelName: string,
	) {
		this.reviewQueue[filePath] = {
			filePath,
			proposedContent,
			promptContent,
			originalContent,
			pipelineId,
			modelName,
			timestamp: Date.now(),
		};
		await this.save();
	}

	async approveChange(file: TFile, content: string, pipeline: Pipeline) {
		const currentContent = await this.app.vault.read(file);
		await this.app.vault.modify(file, currentContent + "\n\n" + content);

		const triggerClean = pipeline.trigger.replace("#", "");
		const outputClean = resolveOutputTag(
			pipeline.outputTag,
			pipeline.trigger,
		).replace("#", "");
		const removeTrigger = pipeline.removeTriggerOnApprove === true;

		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				let tags = normaliseFrontmatterTags(frontmatter.tags);
				if (removeTrigger) {
					tags = tags.filter((t) => t !== triggerClean);
				}
				if (outputClean && !tags.includes(outputClean)) {
					tags.push(outputClean);
				}
				frontmatter.tags = tags;
			},
		);

		// processFrontMatter only touches YAML; an inline trigger lives in the
		// body, so strip it there too when replacing.
		if (removeTrigger) {
			await this.app.vault.process(file, (data) =>
				stripInlineTag(data, pipeline.trigger),
			);
		}

		delete this.reviewQueue[file.path];
		await this.save();
	}

	private async save() {
		await this.app.vault.adapter.write(
			this.pluginPath,
			JSON.stringify(this.reviewQueue, null, 2),
		);
	}
}
