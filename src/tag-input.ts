import { AbstractInputSuggest, App, getAllTags } from "obsidian";
import { normaliseTagInput } from "./tag-utils";

/** Every distinct tag in the vault (with the leading `#`), sorted. */
function getAllVaultTags(app: App): string[] {
	const tags = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;
		for (const tag of getAllTags(cache) ?? []) tags.add(tag);
	}
	return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

/** Autocomplete that suggests existing vault tags as the user types. */
class TagInputSuggest extends AbstractInputSuggest<string> {
	private readonly tags: string[];

	constructor(
		app: App,
		private readonly inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
		// Snapshot once on open — the modal is short-lived.
		this.tags = getAllVaultTags(app);
	}

	protected getSuggestions(query: string): string[] {
		const q = normaliseTagInput(query).toLowerCase();
		return q
			? this.tags.filter((t) => t.toLowerCase().includes(q))
			: this.tags;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.inputEl.dispatchEvent(new Event("input"));
		this.close();
	}
}

export function attachTagSuggest(app: App, inputEl: HTMLInputElement): void {
	new TagInputSuggest(app, inputEl);
	inputEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter") inputEl.blur();
	});
}
