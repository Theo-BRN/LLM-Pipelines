interface OllamaErrorResponse {
	error?: string;
}

interface OllamaStreamChunk {
	response?: string;
	model?: string;
}

export async function streamOllama(
	model: string,
	prompt: string,
	onChunk: (chunk: string, modelName: string) => void,
	signal?: AbortSignal,
): Promise<void> {
	// May have to get rid of the streaming + fetch combination at some point,
	// but in the meantime it's a very satisfying aspect of the plugin.
	// Further explantation (Claude Opus Code):
	// Streaming needs fetch's ReadableStream body; Obsidian's requestUrl()
	// buffers the full response and can't stream token-by-token. Requires Ollama
	// to allow the app://obsidian.md origin (OLLAMA_ORIGINS) — fine for default
	// local setups.
	// eslint-disable-next-line no-restricted-globals
	const response = await fetch("http://localhost:11434/api/generate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		signal,
		body: JSON.stringify({
			model: model,
			prompt: prompt,
			stream: true,
		}),
	});

	if (!response.ok) {
		const error = (await response.json()) as OllamaErrorResponse;
		throw new Error(error.error || "Ollama error");
	}

	if (!response.body) return;
	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8");

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunkString = decoder.decode(value, { stream: true });
		const lines = chunkString.split("\n").filter((l) => l.trim() !== "");

		for (const line of lines) {
			try {
				const data = JSON.parse(line) as OllamaStreamChunk;
				if (data.response !== undefined) {
					onChunk(data.response, data.model ?? "");
				}
			} catch {
				/* Ignore partial JSON */
			}
		}
	}
}
