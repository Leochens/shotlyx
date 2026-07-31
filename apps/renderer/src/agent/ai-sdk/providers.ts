import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { loadLLMConfigFromEnv } from "@/agent/llm/config";
import type { LLMProviderConfig } from "@/agent/llm/types";
import type { LanguageModel } from "ai";

type ModelName = "default" | "mg" | "asr" | "vision";

type DeepSeekRequestBody = {
	stream?: unknown;
	response_format?: { type?: unknown };
	messages?: Array<{
		role?: unknown;
		content?: unknown;
		tool_calls?: unknown[];
		reasoning_content?: unknown;
	}>;
};

export interface AgentLanguageModelBundle {
	model: LanguageModel;
	config: LLMProviderConfig;
}

export function formatDeepSeekSyntheticContentChunk({
	content,
	finishReason,
}: {
	content: string;
	finishReason?: string;
}): string {
	return (
		"data: " +
		JSON.stringify({
			choices: [
				{
					index: 0,
					delta: { content },
					...(finishReason ? { finish_reason: finishReason } : {}),
				},
			],
		}) +
		"\n\n"
	);
}

export function normalizeOpenAICompatibleReasoningRequestBody(
	options?: RequestInit,
): RequestInit | undefined {
	if (typeof options?.body !== "string") return options;
	try {
		const body: DeepSeekRequestBody = JSON.parse(options.body);
		if (
			typeof body.response_format === "object" &&
			body.response_format !== null &&
			body.response_format.type !== "json_object" &&
			body.response_format.type !== "text"
		) {
			body.response_format = { type: "json_object" };
		}
		if (Array.isArray(body.messages)) {
			let hasToolCallInHistory = false;
			for (const msg of body.messages) {
				if (
					msg.role === "assistant" &&
					Array.isArray(msg.tool_calls) &&
					msg.tool_calls.length > 0
				) {
					hasToolCallInHistory = true;
					break;
				}
			}

			for (const msg of body.messages) {
				if (msg.role !== "assistant") continue;
				if (typeof msg.content === "string") {
					const thinkMatch = msg.content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
					if (thinkMatch) {
						msg.reasoning_content = thinkMatch[1];
						msg.content = msg.content
							.replace(/<think>[\s\S]*?(?:<\/think>|$)/, "")
							.trim();
					}
				}
				if (hasToolCallInHistory && msg.reasoning_content === undefined) {
					msg.reasoning_content = "";
				}
			}
		}
		return {
			...options,
			body: JSON.stringify(body),
		};
	} catch {
		return options;
	}
}

function streamDeepSeekReasoningAsThinkTags(res: Response): Response {
	if (!res.body) return res;
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = "";
	let inThinkTag = false;
	let closedCleanly = false;

	const stream = new ReadableStream({
		async pull(controller) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					if (inThinkTag && !closedCleanly) {
						controller.enqueue(
							encoder.encode(
								formatDeepSeekSyntheticContentChunk({ content: "</think>" }),
							),
						);
					}
					controller.close();
					return;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				let output = "";
				for (const line of lines) {
					if (!line.startsWith("data: ")) {
						output += line + "\n";
						continue;
					}

					const dataStr = line.slice(6);
					if (dataStr === "[DONE]") {
						if (inThinkTag && !closedCleanly) {
							output += formatDeepSeekSyntheticContentChunk({
								content: "</think>",
							});
							closedCleanly = true;
						}
						output += line + "\n";
						continue;
					}

					try {
						const data = JSON.parse(dataStr);
						const delta = data.choices?.[0]?.delta;
						const finishReason = data.choices?.[0]?.finish_reason;

						if (finishReason && inThinkTag && !closedCleanly) {
							output += formatDeepSeekSyntheticContentChunk({
								content: "</think>",
								finishReason: String(finishReason),
							});
							closedCleanly = true;
							continue;
						}

						if (delta) {
							const reasoning = delta.reasoning_content;
							const content = delta.content;
							if (reasoning != null && reasoning !== "") {
								if (!inThinkTag) {
									inThinkTag = true;
									closedCleanly = false;
									delta.content = "<think>" + reasoning;
								} else {
									delta.content = reasoning;
								}
								delete delta.reasoning_content;
							} else if (content != null && content !== "" && inThinkTag) {
								inThinkTag = false;
								closedCleanly = true;
								delta.content = "</think>" + content;
							} else if (content === "" && inThinkTag && delta.tool_calls) {
								inThinkTag = false;
								closedCleanly = true;
								delta.content = "</think>";
							}
						}
						output += "data: " + JSON.stringify(data) + "\n";
					} catch {
						output += line + "\n";
					}
				}

				if (output) {
					controller.enqueue(encoder.encode(output));
				}
			}
		},
	});

	return new Response(stream, {
		headers: res.headers,
		status: res.status,
		statusText: res.statusText,
	});
}

function createDeepSeekFetch(): typeof fetch {
	const fetchWithPreconnect = globalThis.fetch as typeof fetch & {
		preconnect?: typeof globalThis.fetch;
	};
	return Object.assign(
		async (
			url: Parameters<typeof fetch>[0],
			options?: Parameters<typeof fetch>[1],
		) => {
			let isStreamingRequest = false;
			if (typeof options?.body === "string") {
				try {
					const body: DeepSeekRequestBody = JSON.parse(options.body);
					isStreamingRequest = body.stream === true;
				} catch {
					isStreamingRequest = false;
				}
			}
			const res = await fetch(
				url,
				normalizeOpenAICompatibleReasoningRequestBody(options),
			);
			if (!res.ok) {
				const text = await res.text();
				console.error(`[agent-ds-res] HTTP ${res.status}:`, text.slice(0, 500));
				return new Response(text, {
					headers: res.headers,
					status: res.status,
					statusText: res.statusText,
				});
			}
			if (!isStreamingRequest) return res;
			return streamDeepSeekReasoningAsThinkTags(res);
		},
		{ preconnect: fetchWithPreconnect.preconnect },
	);
}

function createOpenAICompatibleModel(config: LLMProviderConfig): LanguageModel {
	const provider = createOpenAI({
		baseURL: config.host,
		apiKey: config.apiKey,
		fetch:
			config.provider === "openai-compatible" ||
			config.host.includes("deepseek.com")
				? createDeepSeekFetch()
				: undefined,
	});
	return provider.chat(config.model);
}

function createModelFromConfig(config: LLMProviderConfig): LanguageModel {
	if (config.provider === "google") {
		return createGoogleGenerativeAI({
			apiKey: config.apiKey,
			baseURL: config.host,
		})(config.model);
	}
	if (config.provider === "anthropic") {
		return createAnthropic({
			apiKey: config.apiKey,
			baseURL: config.host,
		})(config.model);
	}
	return createOpenAICompatibleModel(config);
}

function createModelBundle(name: ModelName): AgentLanguageModelBundle {
	const config = loadLLMConfigFromEnv()[name];
	if (!config) {
		throw new Error(`LLM provider config not found: ${name}`);
	}
	if (!config.apiKey) {
		const keyName =
			name === "mg"
				? "AGENT_MG_KEY or AGENT_LLM_KEY"
				: name === "vision"
					? "AGENT_VISION_KEY"
					: "AGENT_LLM_KEY";
		throw new Error(`configuration_error: missing ${keyName}`);
	}
	return {
		config,
		model: createModelFromConfig(config),
	};
}

export function getDefaultModel() {
	return getDefaultModelBundle().model;
}

export function getMGModel() {
	return getMGModelBundle().model;
}

export function getASRModel() {
	return getASRModelBundle().model;
}

export function getVisionModel() {
	return getVisionModelBundle().model;
}

export function getDefaultModelBundle() {
	return createModelBundle("default");
}

export function getMGModelBundle() {
	return createModelBundle("mg");
}

export function getASRModelBundle() {
	return createModelBundle("asr");
}

export function getVisionModelBundle() {
	return createModelBundle("vision");
}
