import { App, PluginSettingTab, Setting } from "obsidian";
import LLMPipelinesPlugin from "./main";

export type DestinationType =
	| "Append"
	| "Prepend"
	| "New Note"
	| "Replace Section";

export interface Pipeline {
	id: string;
	name: string;
	trigger: string;
	outputTag: string;
	promptPath: string;
	destination: DestinationType;
	modelId: string;
	// When true, approving a note also removes the trigger tag (a state change,
	// e.g. #summarise → #summarised). Off by default: the output tag alone marks
	// a note as done. Optional so pipelines persisted before this field default
	// to "off" (undefined is falsy).
	removeTriggerOnApprove?: boolean;
}

export interface LLMPipelinesSettings {
	pipelines: Array<Pipeline>;
}

export const DEFAULT_SETTINGS: LLMPipelinesSettings = {
	pipelines: [
		{
			id: "summarise-pipeline",
			name: "Summarise Notes",
			trigger: "#summarise",
			outputTag: "#summarised",
			promptPath: "prompts/summarise.md",
			destination: "Replace Section",
			modelId: "gemma3:1b",
			removeTriggerOnApprove: false,
		},
		{
			id: "title-generator",
			name: "Generate Titles",
			trigger: "#generate-title",
			outputTag: "#titled",
			promptPath: "prompts/generate-title.md",
			destination: "Prepend",
			modelId: "gemma3:1b",
			removeTriggerOnApprove: false,
		},
	],
};

export class LLMPipelinesSettingTab extends PluginSettingTab {
	plugin: LLMPipelinesPlugin;

	constructor(app: App, plugin: LLMPipelinesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private getUniqueName(baseName: string): string {
		let currentName = baseName;
		let counter = 2;

		while (
			this.plugin.settings.pipelines.some((p) => p.name === currentName)
		) {
			currentName = `${baseName} ${counter}`;
			counter++;
		}

		return currentName;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Pipelines")
			.setDesc("Create and manage your LLM pipelines.")
			.addButton((btn) =>
				btn
					.setButtonText("Add new pipeline")
					.setCta()
					.onClick(async () => {
						const uniqueName = this.getUniqueName("New pipeline");

						this.plugin.settings.pipelines.push({
							id: `pipeline-${Date.now()}`,
							name: uniqueName,
							trigger: "#new-tag",
							outputTag: "#processed", // Default output tag
							promptPath: "prompts/template.md",
							destination: "Append",
							modelId: "gemma3:1b",
							removeTriggerOnApprove: false,
						});
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		this.plugin.settings.pipelines.forEach((pipeline) => {
			const detailsEl = containerEl.createEl("details");
			detailsEl.setCssStyles({ marginBottom: "1rem" });

			const summaryEl = detailsEl.createEl("summary", {
				text: `Pipeline: ${pipeline.name}`,
			});
			summaryEl.setCssStyles({ cursor: "pointer", fontWeight: "bold" });

			new Setting(detailsEl).setName("Name").addText((text) =>
				text.setValue(pipeline.name).onChange(async (value) => {
					pipeline.name = value;
					summaryEl.setText(`Pipeline: ${value}`);
					await this.plugin.saveSettings();
				}),
			);

			new Setting(detailsEl)
				.setName("Trigger")
				.setDesc("Enter a tag (e.g., #summarise)")
				.addText((text) =>
					text.setValue(pipeline.trigger).onChange(async (value) => {
						pipeline.trigger = value;
						await this.plugin.saveSettings();
					}),
				);

			new Setting(detailsEl)
				.setName("Prompt path")
				.setDesc("Path to your prompt Markdown file")
				.addText((text) =>
					text
						.setValue(pipeline.promptPath)
						.onChange(async (value) => {
							pipeline.promptPath = value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(detailsEl)
				.setName("Destination")
				.setDesc("Where should the LLM output go?")
				.addDropdown((dropdown) =>
					dropdown
						.addOption("Append", "Append to bottom")
						.addOption("Prepend", "Prepend to top")
						.addOption(
							"Replace Section",
							"Replace specific section",
						)
						.addOption("New Note", "Create a new note")
						.setValue(pipeline.destination)
						.onChange(async (value) => {
							pipeline.destination = value as DestinationType;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(detailsEl)
				.setName("Delete pipeline")
				.setDesc("This action cannot be undone.")
				.addButton((btn) =>
					btn
						.setButtonText("Delete")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.pipelines =
								this.plugin.settings.pipelines.filter(
									(p) => p.id !== pipeline.id,
								);
							await this.plugin.saveSettings();
							this.display();
						}),
				);
		});
	}
}
