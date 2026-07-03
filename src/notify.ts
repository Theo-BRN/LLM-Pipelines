import { Notice } from "obsidian";

/**
 * Build a `.catch` handler for a fire-and-forget (`void`) promise so a rejection
 * is logged — and optionally surfaced to the user — instead of being silently
 * swallowed.
 *
 * @param context human-readable description of what failed (e.g. "Couldn't open
 *   pipelines pane"). Used both in the console and the Notice.
 * @param notify  also show a Notice (default `true`). Pass `false` for
 *   high-frequency calls like sidebar redraws, where a popup per failure would
 *   spam — those still reach the console.
 */
export function reportError(
	context: string,
	notify = true,
): (e: unknown) => void {
	return (e: unknown) => {
		console.error(`${context}:`, e);
		if (notify) new Notice(`${context} — see console.`);
	};
}
