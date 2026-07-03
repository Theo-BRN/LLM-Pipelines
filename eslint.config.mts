// @ts-nocheck
// Claude Opus (2026-05) via Claude Code explains this ts-nocheck:
// This ESLint flat-config file is loaded by ESLint via jiti (transpiled, not
// type-checked) and is excluded from the `tsc` build (tsconfig `include` is
// "src/**/*.ts"). The editor's TS server still checks it and reports noise:
// the `import.meta.dirname` typing gap from @types/node 16, and the loose
// `configs.recommended` types in eslint-plugin-obsidianmd. Neither affects
// runtime, so we skip type-checking this config file.

import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.js", "manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		plugins: { obsidianmd },
		rules: {
			// "LLM" is known acronym for this plugin
			"obsidianmd/ui/sentence-case": ["error", { ignoreWords: ["LLM"] }],
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
