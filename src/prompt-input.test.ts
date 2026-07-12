import { describe, it, expect } from "vitest";
import { selectPromptInput, stripFrontmatter } from "./prompt-input";

describe("stripFrontmatter", () => {
	it("removes a simple frontmatter block", () => {
		expect(stripFrontmatter("---\ntags: [a]\n---\nBody text")).toBe(
			"Body text",
		);
	});

	it("returns content without frontmatter unchanged", () => {
		expect(stripFrontmatter("Just a note")).toBe("Just a note");
		expect(stripFrontmatter("")).toBe("");
	});

	it("removes an empty frontmatter block", () => {
		expect(stripFrontmatter("---\n---\nBody")).toBe("Body");
	});

	it("keeps a horizontal rule that isn't at the first line", () => {
		expect(stripFrontmatter("Intro\n\n---\n\nOutro")).toBe(
			"Intro\n\n---\n\nOutro",
		);
	});

	it("keeps a horizontal rule in the body after stripping frontmatter", () => {
		expect(stripFrontmatter("---\ntags: [a]\n---\nIntro\n---\nOutro")).toBe(
			"Intro\n---\nOutro",
		);
	});

	it("leaves an unclosed block unchanged", () => {
		expect(stripFrontmatter("---\ntags: [a]\nno closing fence")).toBe(
			"---\ntags: [a]\nno closing fence",
		);
		expect(stripFrontmatter("---\n")).toBe("---\n");
		expect(stripFrontmatter("---")).toBe("---");
	});

	it("does not treat a longer dash run as a fence", () => {
		expect(stripFrontmatter("----\nnot frontmatter")).toBe(
			"----\nnot frontmatter",
		);
		expect(stripFrontmatter("---\ntags: [a]\n----\nbody")).toBe(
			"---\ntags: [a]\n----\nbody",
		);
	});

	it("requires the opening fence on the very first line", () => {
		expect(stripFrontmatter("\n---\ntags: [a]\n---\nBody")).toBe(
			"\n---\ntags: [a]\n---\nBody",
		);
	});

	it("handles CRLF line endings", () => {
		expect(stripFrontmatter("---\r\ntags: [a]\r\n---\r\nBody")).toBe("Body");
	});

	it("handles a closing fence at the end of the file", () => {
		expect(stripFrontmatter("---\ntags: [a]\n---")).toBe("");
		expect(stripFrontmatter("---\ntags: [a]\n---\n")).toBe("");
	});

	it("preserves the body verbatim, including a leading blank line", () => {
		expect(stripFrontmatter("---\ntags: [a]\n---\n\nBody")).toBe("\nBody");
	});
});

describe("selectPromptInput", () => {
	const content = "---\ntags: [a]\n---\nBody text";

	it("returns the full content for 'full'", () => {
		expect(selectPromptInput("full", "My note", content)).toBe(content);
	});

	it("returns the full content when the mode is undefined (legacy pipelines)", () => {
		expect(selectPromptInput(undefined, "My note", content)).toBe(content);
	});

	it("returns the content without frontmatter for 'body'", () => {
		expect(selectPromptInput("body", "My note", content)).toBe("Body text");
	});

	it("returns just the title for 'title'", () => {
		expect(selectPromptInput("title", "My note", content)).toBe("My note");
	});
});
