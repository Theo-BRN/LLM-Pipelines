import { App, FuzzySuggestModal } from "obsidian";
import { Pipeline } from "./settings";
import { reportError } from "./notify";
import LLMPipelinesPlugin from "./main";

export class PipelineSuggester extends FuzzySuggestModal<Pipeline> {
	plugin: LLMPipelinesPlugin;

	constructor(app: App, plugin: LLMPipelinesPlugin) {
		super(app);
		this.plugin = plugin;
	}

	getItems(): Pipeline[] {
		return this.plugin.settings.pipelines;
	}

	getItemText(pipeline: Pipeline): string {
		return pipeline.name;
	}

	onChooseItem(pipeline: Pipeline, evt: MouseEvent | KeyboardEvent): void {
		void this.plugin
			.startBatchProcessing(pipeline)
			.catch(reportError("Pipeline run failed"));
	}
}
