import { App, Modal, Setting, TextComponent } from "obsidian";
import { Pipeline, DestinationType } from "./settings";
import { attachTagSuggest } from "./tag-input";
import { normaliseTagInput, resolveOutputTag } from "./tag-utils";
import { reportError } from "./notify";
import LLMPipelinesPlugin from "./main";

export class PipelineEditModal extends Modal {
	plugin: LLMPipelinesPlugin;
	pipeline: Pipeline;
	onSave: () => void;

	constructor(
		app: App,
		plugin: LLMPipelinesPlugin,
		pipeline: Pipeline,
		onSave: () => void,
	) {
		super(app);
		this.plugin = plugin;
		this.pipeline = pipeline;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Edit pipeline` });

		new Setting(contentEl).setName("Pipeline name").addText((text) =>
			text.setValue(this.pipeline.name).onChange(async (value) => {
				this.pipeline.name = value;
				await this.plugin.saveSettings();
			}),
		);

		const save = () =>
			void this.plugin
				.saveSettings()
				.catch(reportError("Couldn't save pipeline"));

		new Setting(contentEl)
			.setName("Trigger tag")
			.setDesc("Notes with this tag are queued for this pipeline.")
			.addText((text) => {
				text.setValue(this.pipeline.trigger).onChange((value) => {
					this.pipeline.trigger = value;
					syncOutputPlaceholder();
					updateOutputWarning();
					save();
				});
				attachTagSuggest(this.app, text.inputEl);
			});

		let outputText!: TextComponent;
		new Setting(contentEl)
			.setName("Output tag")
			.setDesc(
				"Added when you approve a result. Notes with this tag are treated as done and won't be processed again.",
			)
			.addText((text) => {
				outputText = text;
				text.setValue(this.pipeline.outputTag || "").onChange(
					(value) => {
						this.pipeline.outputTag = value;
						updateOutputWarning();
						save();
					},
				);
				attachTagSuggest(this.app, text.inputEl);
			});

		const warningEl = contentEl.createEl("div");
		warningEl.setCssStyles({
			color: "var(--text-error)",
			fontSize: "var(--font-ui-smaller)",
			marginBottom: "0.75em",
		});
		// Show the derived default an empty output tag will fall back to, so it's
		// clear approved notes still get marked done.
		const syncOutputPlaceholder = () => {
			outputText.setPlaceholder(
				resolveOutputTag("", this.pipeline.trigger) || "#reviewed",
			);
		};
		const updateOutputWarning = () => {
			const output = normaliseTagInput(this.pipeline.outputTag);
			const trigger = normaliseTagInput(this.pipeline.trigger);
			// Empty is fine now — it falls back to {trigger}-reviewed. Only an
			// output tag that equals the trigger is a problem (nothing processes).
			const message =
				output && output === trigger
					? "The output tag must differ from the trigger tag, or notes will never leave the queue."
					: "";
			warningEl.setText(message);
			warningEl.toggle(message.length > 0);
		};
		syncOutputPlaceholder();
		updateOutputWarning();

		new Setting(contentEl)
			.setName("Remove trigger tag on approval")
			.setDesc(
				"Also strip the trigger tag when approving, turning it into a state change (e.g. #summarise → #summarised). Off by default — the output tag alone marks a note as done.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.pipeline.removeTriggerOnApprove === true)
					.onChange(async (value) => {
						this.pipeline.removeTriggerOnApprove = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(contentEl)
			.setName("Ollama model")
			.setDesc("The exact model name from 'ollama list'")
			.addText((text) =>
				text
					.setValue(this.pipeline.modelId || "")
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- needs to stay lowercase
					.setPlaceholder("gemma3:1b")
					.onChange(async (value) => {
						this.pipeline.modelId = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(contentEl).setName("Prompt path").addText((text) =>
			text.setValue(this.pipeline.promptPath).onChange(async (value) => {
				this.pipeline.promptPath = value;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(contentEl).setName("Destination").addDropdown((dropdown) =>
			dropdown
				.addOption("Append", "Append")
				.addOption("Prepend", "Prepend")
				.addOption("Replace Section", "Replace section")
				.addOption("New Note", "New note")
				.setValue(this.pipeline.destination)
				.onChange(async (value) => {
					this.pipeline.destination = value as DestinationType;
					await this.plugin.saveSettings();
				}),
		);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Delete")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.pipelines =
							this.plugin.settings.pipelines.filter(
								(p) => p.id !== this.pipeline.id,
							);
						await this.plugin.saveSettings();
						this.onSave();
						this.close();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Save & close")
					.setCta()
					.onClick(() => {
						this.onSave();
						this.close();
					}),
			);
	}
}
