// Pure prompt-input helpers. Deliberately free of any `obsidian` imports so
// they can be unit-tested under Node/vitest (same trade-off as tag-utils.ts —
// the `obsidian` package has no runtime entry point outside Obsidian, which is
// also why this reimplements frontmatter splitting instead of using Obsidian's
// `getFrontMatterInfo`).

/** What part of a note a pipeline sends to the model. `undefined` (pipelines
 *  persisted before this field existed) means `"full"`. */
export type PromptInputMode = "full" | "body" | "title";

/**
 * Remove a YAML frontmatter block from note content, returning the body.
 *
 * Matches Obsidian's own rules: the block only counts if the **first line** of
 * the file is exactly `---`, and it must be closed by a later `---` line. An
 * unclosed block, or a `---` that isn't the first line (e.g. a horizontal
 * rule), is not frontmatter — the content is returned unchanged.
 */
export function stripFrontmatter(content: string): string {
	const open = /^---[ \t]*\r?\n/.exec(content);
	if (!open) return content;

	const rest = content.slice(open[0].length);
	const close = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
	if (!close) return content;

	return rest.slice(close.index + close[0].length);
}

/**
 * The note-derived part of a prompt: the full content, the content without
 * frontmatter, or just the title. Returned verbatim — prompt assembly adds no
 * separators or glue, so what the caller concatenates is exactly what the
 * model receives.
 */
export function selectPromptInput(
	mode: PromptInputMode | undefined,
	title: string,
	content: string,
): string {
	switch (mode) {
		case "title":
			return title;
		case "body":
			return stripFrontmatter(content);
		default:
			return content;
	}
}
