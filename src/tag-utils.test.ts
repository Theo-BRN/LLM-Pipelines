import { describe, it, expect } from "vitest";
import {
	normaliseFrontmatterTags,
	normaliseTagInput,
	resolveOutputTag,
	stripInlineTag,
} from "./tag-utils";

describe("normaliseFrontmatterTags", () => {
	it("returns an array unchanged (sans #)", () => {
		expect(normaliseFrontmatterTags(["a", "b"])).toEqual(["a", "b"]);
		expect(normaliseFrontmatterTags(["#a", "#b"])).toEqual(["a", "b"]);
	});

	it("splits a single string on commas and whitespace", () => {
		expect(normaliseFrontmatterTags("summarise")).toEqual(["summarise"]);
		expect(normaliseFrontmatterTags("a, b, c")).toEqual(["a", "b", "c"]);
		expect(normaliseFrontmatterTags("a b")).toEqual(["a", "b"]);
		expect(normaliseFrontmatterTags("#a, #b")).toEqual(["a", "b"]);
	});

	it("trims whitespace and drops empties", () => {
		expect(normaliseFrontmatterTags(" a , b ")).toEqual(["a", "b"]);
		expect(normaliseFrontmatterTags("")).toEqual([]);
	});

	it("coerces non-string array members", () => {
		expect(normaliseFrontmatterTags([1, 2])).toEqual(["1", "2"]);
	});

	it("treats undefined / null as no tags", () => {
		expect(normaliseFrontmatterTags(undefined)).toEqual([]);
		expect(normaliseFrontmatterTags(null)).toEqual([]);
	});
});

describe("stripInlineTag", () => {
	it("removes a standalone inline tag and its leading space", () => {
		expect(stripInlineTag("Please #summarise this", "#summarise")).toBe(
			"Please this",
		);
	});

	it("removes every occurrence", () => {
		expect(
			stripInlineTag("a #summarise b #summarise c", "#summarise"),
		).toBe("a b c");
	});

	it("leaves a longer tag with the same prefix untouched", () => {
		expect(stripInlineTag("Keep #summarised please", "#summarise")).toBe(
			"Keep #summarised please",
		);
	});

	it("leaves a nested child tag untouched", () => {
		expect(
			stripInlineTag("Keep #summarise/weekly please", "#summarise"),
		).toBe("Keep #summarise/weekly please");
	});

	it("accepts a tag with or without the leading #", () => {
		expect(stripInlineTag("a #foo b", "foo")).toBe("a b");
		expect(stripInlineTag("a #foo b", "#foo")).toBe("a b");
	});

	it("does not touch a '#' glued to a preceding word char", () => {
		expect(stripInlineTag("word#summarise", "#summarise")).toBe(
			"word#summarise",
		);
	});

	it("returns content unchanged when the tag is absent", () => {
		expect(stripInlineTag("no tags here", "#summarise")).toBe(
			"no tags here",
		);
	});
});

describe("normaliseTagInput", () => {
	it("strips a leading # and trims", () => {
		expect(normaliseTagInput("  #summarise ")).toBe("summarise");
		expect(normaliseTagInput("summarise")).toBe("summarise");
	});

	it("collapses repeated leading #", () => {
		expect(normaliseTagInput("##foo")).toBe("foo");
	});

	it("returns empty for blank / hash-only input", () => {
		expect(normaliseTagInput("")).toBe("");
		expect(normaliseTagInput("#")).toBe("");
	});
});

describe("resolveOutputTag", () => {
	it("returns the configured output tag (with #)", () => {
		expect(resolveOutputTag("#done", "#summarise")).toBe("#done");
		expect(resolveOutputTag("done", "summarise")).toBe("#done");
	});

	it("derives {trigger}-reviewed when no output tag is set", () => {
		expect(resolveOutputTag("", "#summarise")).toBe("#summarise-reviewed");
		expect(resolveOutputTag("  ", "summarise")).toBe("#summarise-reviewed");
	});

	it("returns empty only when there is also no trigger", () => {
		expect(resolveOutputTag("", "")).toBe("");
	});
});
