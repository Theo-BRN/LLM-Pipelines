// Pure tag-string helpers. Deliberately free of any `obsidian` imports so they
// can be unit-tested under Node/vitest (the `obsidian` package has no runtime
// entry point, so importing it outside Obsidian fails).

/**
 * Normalise a frontmatter `tags` value into a clean array of tag names (no `#`).
 * Obsidian may store it as a YAML list, a single string, or a comma/space
 * separated string.
 */
export function normaliseFrontmatterTags(value: unknown): string[] {
	const raw: string[] = Array.isArray(value)
		? value.map((v) => String(v))
		: typeof value === "string"
			? value.split(/[\s,]+/)
			: [];
	return raw
		.map((t) => t.trim().replace(/^#/, ""))
		.filter((t) => t.length > 0);
}

/** Strip a leading `#` (and surrounding whitespace) so a user can type a tag
 *  with or without it. Returns the bare tag name. */
export function normaliseTagInput(value: string): string {
	return value.trim().replace(/^#+/, "");
}

/**
 * The tag that marks a note "done" for a pipeline, returned **with** a leading
 * `#` to match how triggers are stored.
 */
export function resolveOutputTag(outputTag: string, trigger: string): string {
	const output = normaliseTagInput(outputTag || "");
	if (output) return `#${output}`;
	const base = normaliseTagInput(trigger || "");
	return base ? `#${base}-reviewed` : "";
}

/**
 * Remove every inline occurrence of `tag` from note content. Word-boundary
 * aware: stripping `#summarise` leaves `#summarised` and `#summarise/weekly`
 * untouched, and a single leading space is swallowed to avoid double spaces.
 */
export function stripInlineTag(content: string, tag: string): string {
	const clean = tag.startsWith("#") ? tag : `#${tag}`;
	const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	// (^|[^\w/#-]) — start of string, or a char that can't be part of a tag, so
	// we don't split a longer tag. (?![\w/-]) — not followed by a tag-continuation
	// char, so #summarise doesn't match #summarised or #summarise/x.
	const re = new RegExp(`(^|[^\\w/#-])${escaped}(?![\\w/-])`, "g");
	return content.replace(re, (_match, lead: string) =>
		lead === " " || lead === "\t" ? "" : lead,
	);
}
