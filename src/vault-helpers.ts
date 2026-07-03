import { App, TFile, getAllTags } from "obsidian";

export function getFilesWithTag(app: App, tag: string): TFile[] {
	const allFiles = app.vault.getMarkdownFiles();

	return allFiles.filter((file) => {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) return false;

		const tags = getAllTags(cache) || [];
		return tags.includes(tag);
	});
}

export async function getPromptTemplate(
	app: App,
	filePath: string,
): Promise<string> {
	const file = app.vault.getAbstractFileByPath(filePath);

	if (file instanceof TFile) {
		return await app.vault.read(file);
	}

	throw new Error(`Could not find prompt file at: ${filePath}`);
}
