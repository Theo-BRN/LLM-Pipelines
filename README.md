# LLM Pipelines

A **human-in-the-loop (HITL) LLM automation engine for Obsidian.** Tag notes,
run them through a local [Ollama](https://ollama.com) model, and review every
result before anything is written to your vault.

## How it works

1. Tag notes with a trigger (e.g. `#summarise`).
2. Define a **pipeline** — trigger tag → prompt file → Ollama model → output tag
   → destination — in settings or the sidebar.
3. Run the pipeline. It scans the vault for files with the trigger tag and
   streams each one through your local model.
4. Results are **not** written to notes. They land in a sidecar
   `review-queue.json` ("Limbo").
5. Review each item (prompt + source vs. proposed output) and **Approve** (write
   the output, swap trigger tag → output tag, drop from queue) or **Reject**
   (drop from queue).

> **Core rule:** the LLM never writes to a `.md` file until you approve.

## Requirements

- [Ollama](https://ollama.com) running locally (`http://localhost:11434`) with at
  least one model pulled (e.g. `ollama pull gemma3:1b`).
- Desktop Obsidian (this plugin is desktop-only).

## Development

- `npm install`
- `npm run dev` — esbuild watch mode (rebuilds `main.js` on change).
- `npm run build` — `tsc -noEmit` typecheck + production bundle.
- `npm run lint` — ESLint with `eslint-plugin-obsidianmd`.

Reload Obsidian and enable the plugin to load a dev build.

## API documentation

See https://docs.obsidian.md

## Status

This is an early (`0.1.0`) release. Core functionality works, but expect rough
edges — see the project's GitHub Issues for known bugs and planned work.

## Disclaimer

This project was developed independently, in my own time, using my own personal
equipment. It is not affiliated with, sponsored by, or endorsed by my employer,
and was not created in the course of, or using resources provided for, my
employment duties.

Development was done with the assistance of AI coding tools (Claude Code) —
architecture, pipeline design, and review-flow decisions are my own.
