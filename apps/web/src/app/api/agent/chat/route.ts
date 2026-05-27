/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, shotlyx/prefer-object-params -- This route bridges AI SDK stream parts, parsed request schemas, and SSE helper closures where the existing APIs expose positional callbacks and narrowed route data. */
import { type NextRequest } from "next/server";
import { generateObject, streamText, stepCountIs } from "ai";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { checkRateLimit } from "@/auth/rate-limit";
import { getDefaultModel } from "@/agent/ai-sdk/providers";
import {
	mcpToolsToAISDKProxyTools,
	mcpToolsToAISDKSchemaTools,
} from "@/agent/ai-sdk/tools-adapter";
import { buildSystemPrompt } from "@/agent/llm/prompts";
import { resolveExecutionMode } from "@/agent/controller/mode-resolver";
import type { AgentPlan, AgentStep } from "@/agent/controller/types";
import { AgentLogger } from "@/agent/controller/agent-logger";
import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";
import {
	compactReferencesForModel,
	isAgentContextReference,
	sanitizeAgentContextPayload,
} from "@/agent/context/reference-format";
import { compactBrandKit } from "@/brand-kit/compact";
import type { ProjectBrandKit } from "@/brand-kit/types";
import type { FunctionSchema } from "@/agent/mcp/schema";
import { splitPreviewSafeSteps } from "@/agent/controller/creative-preview";
import type { MessageAction } from "@/agent/controller/types";
import {
	normalizeQuickReplyActions,
	quickReplyResponseSchema,
	shouldRequestQuickReplies,
} from "@/agent/controller/quick-replies";
import {
	generatePlanWithLocalCli,
	isLocalCliRuntimeEnabled,
	resolveLocalCliRuntimeConfig,
	runLocalCliReactLoop,
	type LocalCliEvent,
} from "@/agent/local-cli/runtime";
import { registerPendingCall } from "./resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messageSchema = z.object({
	role: z.string(),
	content: z.string(),
	references: z.array(z.unknown()).optional(),
});

const stepSchema = z.object({
	tool: z.string(),
	params: z.record(z.string(), z.unknown()),
	description: z.string().optional(),
	risk: z.enum(["none", "destructive", "irreversible"]).optional(),
});

const toolSchemaDef = z.object({
	name: z.string(),
	description: z.string(),
	parameters: z.object({
		properties: z.record(z.string(), z.unknown()),
	}),
});

const requestSchema = z.object({
	messages: z.array(messageSchema),
	mode: z.enum(["auto", "suggest", "manual"]).default("suggest"),
	toolSchemas: z.array(toolSchemaDef).optional().default([]),
	context: z
		.object({
			activeBrandKit: z.unknown().optional(),
		})
		.optional(),
	action: z.enum(["confirm", "continue", "modify"]).optional(),
	plan: z
		.object({
			reasoning: z.string().optional(),
			steps: z.array(stepSchema),
		})
		.optional(),
});

function buildReferencesContextText({
	references,
}: {
	references?: unknown[];
}): string {
	if (!references || references.length === 0) return "";
	const agentReferences = references.filter(isAgentContextReference);
	if (agentReferences.length === 0) return "";
	try {
		const compact = compactReferencesForModel({
			references: agentReferences,
			primaryReferenceId: agentReferences[0]?.id ?? null,
		});
		return `\n\n[Agent References]\n${JSON.stringify(compact)}`;
	} catch {
		return `\n\n[Agent References]\n${JSON.stringify(
			sanitizeAgentContextPayload(references),
		)}`;
	}
}

function isProjectBrandKit(value: unknown): value is ProjectBrandKit {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	return (
		"id" in value &&
		"name" in value &&
		"colors" in value &&
		"fonts" in value &&
		"logos" in value &&
		"images" in value &&
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		Array.isArray(value.colors) &&
		Array.isArray(value.fonts) &&
		Array.isArray(value.logos) &&
		Array.isArray(value.images)
	);
}

function buildRequestContextText({
	activeBrandKit,
}: {
	activeBrandKit?: unknown;
}): string | null {
	if (!activeBrandKit) return null;
	try {
		if (isProjectBrandKit(activeBrandKit)) {
			const compact = compactBrandKit({
				kit: activeBrandKit,
			});
			return `[Shotlyx Context]\nActive brand kit:\n${JSON.stringify(compact)}`;
		}
	} catch {
		// Fall through to sanitized unknown context.
	}
	return `[Shotlyx Context]\nActive brand kit:\n${JSON.stringify(
		sanitizeAgentContextPayload(activeBrandKit),
	)}`;
}

async function generatePlanFromLLM(
	systemPrompt: string,
	messages: Array<{ role: string; content: string; references?: unknown[] }>,
	toolSchemas: FunctionSchema[],
	logger: AgentLogger,
	abortSignal?: AbortSignal,
): Promise<AgentPlan> {
	if (toolSchemas.length === 0) {
		return {
			complexity: "simple",
			reasoning: "工具列表为空",
			steps: [],
			needsConfirmation: true,
		};
	}

	if (isLocalCliRuntimeEnabled()) {
		try {
			return await generatePlanWithLocalCli({
				systemPrompt,
				messages,
				toolSchemas,
				signal: abortSignal,
			});
		} catch (err) {
			logger.error(err);
			return {
				complexity: "medium",
				reasoning: `本地 CLI 计划生成失败: ${String(err)}`,
				steps: [],
				needsConfirmation: true,
			};
		}
	}

	const model = getDefaultModel();
	const tools = mcpToolsToAISDKSchemaTools(toolSchemas);

	const coreMessages: ModelMessage[] = messages.map((m) => ({
		role: m.role as "user" | "assistant",
		content: `${m.content}${buildReferencesContextText({
			references: m.references,
		})}`,
	}));

	try {
		console.log("[agent] generatePlan start");
		const result = await streamText({
			model,
			system: systemPrompt,
			messages: coreMessages,
			tools,
			stopWhen: stepCountIs(1),
			abortSignal,
		});

		let reasoning = "";
		const steps: AgentStep[] = [];

		for await (const part of result.fullStream) {
			if (part.type === "text-delta") {
				// Strip <think> tags (injected by DeepSeek response interceptor)
				// and accumulate all content as reasoning for plan generation.
				reasoning += part.text
					.replace(/<\/think>/g, "")
					.replace(/<think>/g, "");
			} else if (part.type === "reasoning-delta") {
				reasoning += part.text;
			} else if (part.type === "tool-call") {
				steps.push({
					tool: part.toolName,
					params: (part.input as Record<string, unknown>) ?? {},
					description: `调用 ${part.toolName}`,
					risk: "none",
				});
			}
		}

		console.log("[agent] generatePlan done, steps=" + steps.length);
		return {
			complexity:
				steps.length > 3 ? "complex" : steps.length > 1 ? "medium" : "simple",
			reasoning,
			steps,
			needsConfirmation: steps.length > 3,
		};
	} catch (err) {
		logger.error(err);
		return {
			complexity: "medium",
			reasoning: `计划生成失败: ${String(err)}`,
			steps: [],
			needsConfirmation: true,
		};
	}
}

async function proxyExecuteStep(
	step: { tool: string; params: Record<string, unknown> },
	sessionId: string,
	logger: AgentLogger,
	sseSend: (event: string, data: unknown) => void,
	signal?: AbortSignal,
): Promise<string> {
	const callId = `${step.tool}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	logger.toolCall(callId, step.tool, step.params);
	sseSend("tool-call", {
		callId,
		tool: step.tool,
		params: step.params,
		timestamp: Date.now(),
	});

	try {
		const result = await waitWithAbort({
			promise: registerPendingCall({
				sessionId,
				callId,
				timeoutMs: 120000,
			}),
			signal,
		});
		const modelResult = sanitizeToolResultForModel({
			toolName: step.tool,
			result,
		});
		logger.toolResult(callId, modelResult);
		return `[SUCCESS] ${step.tool}: ${JSON.stringify(modelResult)}`;
	} catch (err) {
		logger.error(err);
		if (isAbortError(err)) {
			throw err;
		}
		return `[FAILED] ${step.tool}: ${String(err)}`;
	}
}

function buildPlanEvent(plan: AgentPlan, strategy: "suggest" | "step_by_step") {
	const stepsDesc = plan.steps
		.map((s, i) => `${i + 1}. ${s.description}`)
		.join("\n");

	const isManual = strategy === "step_by_step";
	const hasSteps = plan.steps.length > 0;

	return {
		reasoning: plan.reasoning,
		steps: plan.steps,
		displayContent: isManual
			? hasSteps
				? plan.steps[0].description
				: plan.reasoning
			: hasSteps
				? plan.reasoning
					? `${plan.reasoning}\n\n${stepsDesc}`
					: stepsDesc
				: plan.reasoning,
		needsConfirmation: hasSteps,
		strategy,
		actions: hasSteps
			? isManual
				? [
						{ id: "continue", label: "继续", variant: "primary" as const },
						{ id: "modify", label: "修改", variant: "secondary" as const },
					]
				: [
						{ id: "confirm", label: "确认", variant: "primary" as const },
						{ id: "modify", label: "修改", variant: "secondary" as const },
					]
			: plan.actions,
	};
}

async function generateQuickReplyActions({
	assistantText,
	messages,
	toolCallCount,
	toolSchemas,
	logger,
	abortSignal,
}: {
	assistantText: string;
	messages: ModelMessage[];
	toolCallCount: number;
	toolSchemas: FunctionSchema[];
	logger: AgentLogger;
	abortSignal?: AbortSignal;
}): Promise<MessageAction[]> {
	if (isLocalCliRuntimeEnabled()) {
		return [];
	}

	if (
		!shouldRequestQuickReplies({
			assistantText,
			toolCallCount,
		})
	) {
		return [];
	}

	try {
		const model = getDefaultModel();
		const availableTools = toolSchemas.slice(0, 80).map((tool) => ({
			name: tool.name,
			description: tool.description,
		}));
		const recentMessages = messages.slice(-6).map((message) => ({
			role: message.role,
			content:
				typeof message.content === "string"
					? message.content
					: JSON.stringify(message.content),
		}));
		const result = await generateObject({
			model,
			schema: quickReplyResponseSchema,
			system:
				"You generate quick-reply options for an editing assistant. Return only valid JSON that matches the schema. Only offer options when the assistant's latest reply asks a genuine blocking clarification question that the user can answer by selecting one option. Do not offer options for status updates, completed work, confirmations, or rhetorical questions. Options must be contextual, not fixed presets. Labels should be short. Descriptions should be one concise phrase explaining what that choice does. Values must be complete user replies in the same language as the assistant. For broad video-editing clarification, prefer choices that map to available tools, such as AI rough-cut review for filler/repeat removal, silence removal, subtitle generation, B-roll/media insertion, title text, voiceover, or style cleanup when those tools exist. Never offer unavailable capabilities.",
			prompt: JSON.stringify({
				recentMessages,
				assistantText,
				availableTools,
				requirements: [
					"Return shouldOffer=false unless options are clearly useful.",
					"Return 2 to 4 options when shouldOffer=true.",
					"Do not include an Other option; the app adds it.",
					"Each option must include a description so the UI can render a title plus supporting line.",
					"Each value must be a complete user answer that can be sent back directly.",
				],
			}),
			abortSignal,
		});

		return normalizeQuickReplyActions({
			response: result.object,
			assistantText,
		});
	} catch (err) {
		logger.error(err);
		return [];
	}
}

function waitWithAbort<T>({
	promise,
	signal,
}: {
	promise: Promise<T>;
	signal?: AbortSignal;
}): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) {
		return Promise.reject(new DOMException("Aborted", "AbortError"));
	}
	return new Promise<T>((resolve, reject) => {
		const handleAbort = () => reject(new DOMException("Aborted", "AbortError"));
		signal.addEventListener("abort", handleAbort, { once: true });
		promise
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", handleAbort));
	});
}

function isAbortError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === "AbortError" || error.message === "Aborted")
	);
}

export async function POST(request: NextRequest) {
	try {
		const { limited } = await checkRateLimit({ request });
		if (limited) {
			return new Response(JSON.stringify({ error: "Too many requests" }), {
				status: 429,
				headers: { "Content-Type": "application/json" },
			});
		}
	} catch {
		// rate limit check failed, continue
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return new Response(
			JSON.stringify({
				error: "Invalid input",
				details: parsed.error.flatten().fieldErrors,
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const {
		messages,
		mode,
		action,
		plan: existingPlan,
		toolSchemas,
		context,
	} = parsed.data;

	const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const logger = new AgentLogger(sessionId);
	logger.request({
		messageCount: messages.length,
		mode,
		action,
		hasPlan: !!existingPlan,
		toolCount: toolSchemas.length,
	});

	const systemPrompt = buildSystemPrompt({
		toolSchemas: toolSchemas.map((t) => ({
			name: t.name,
			description: t.description,
		})),
	});

	console.log(
		`[agent] POST session=${sessionId} mode=${mode} action=${action ?? "none"} messages=${messages.length} tools=${toolSchemas.length}`,
	);

	const getPlanningMessages = () => {
		const contextText = buildRequestContextText({
			activeBrandKit: context?.activeBrandKit,
		});
		if (!contextText) return messages;
		return [
			...messages,
			{
				role: "user",
				content: `${contextText}\n这段上下文只用于解析用户指代和风格约束，不是新的编辑指令。`,
			},
		];
	};

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			request.signal.addEventListener(
				"abort",
				() => {
					closed = true;
				},
				{ once: true },
			);
			const sseSend = (event: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(
						encoder.encode(
							`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
						),
					);
				} catch {
					closed = true;
				}
			};

			async function proxyOnToolCall(
				callId: string,
				toolName: string,
				params: Record<string, unknown>,
			): Promise<unknown> {
				console.log(`[agent] tool-call: ${toolName} callId=${callId}`);
				logger.toolCall(callId, toolName, params);
				sseSend("tool-call", {
					callId,
					tool: toolName,
					params,
					timestamp: Date.now(),
				});

				try {
					const result = await waitWithAbort({
						promise: registerPendingCall({
							sessionId,
							callId,
							timeoutMs: 120000,
						}),
						signal: request.signal,
					});
					console.log(`[agent] tool-result: ${toolName} callId=${callId}`);
					const modelResult = sanitizeToolResultForModel({
						toolName,
						result,
					});
					logger.toolResult(callId, modelResult);

					const r = modelResult as {
						status?: string;
						error?: string;
						errorCategory?: string;
						suggestion?: string;
						verified?: boolean;
						data?: unknown;
					};

					if (r?.status === "error") {
						const parts: string[] = [
							`Tool "${toolName}" failed: ${r.error ?? "unknown error"}`,
						];
						if (r.errorCategory) {
							parts.push(`Category: ${r.errorCategory}`);
						}
						if (r.suggestion) {
							parts.push(`Suggestion: ${r.suggestion}`);
						}
						parts.push(
							"You may retry with corrected parameters or try a different approach.",
						);
						return parts.join("\n");
					}

					const data = r?.data ?? result;
					const verified =
						r?.verified !== undefined ? ` (verified: ${r.verified})` : "";
					return typeof data === "string"
						? `${data}${verified}`
						: `${JSON.stringify(data)}${verified}`;
				} catch (err) {
					logger.error(err);
					if (isAbortError(err) || request.signal.aborted) {
						closed = true;
						return;
					}
					console.log(`[agent] tool-timeout: ${toolName} callId=${callId}`);
					return `Tool "${toolName}" timed out or failed. You may retry or try an alternative tool. Error: ${err instanceof Error ? err.message : "Tool execution failed"}`;
				}
			}

			const makeProxyTools = () =>
				mcpToolsToAISDKProxyTools({
					schemas: toolSchemas as FunctionSchema[],
					onToolCall: proxyOnToolCall,
				});

			async function runApiProxyLoop(
				messagesForLLM: ModelMessage[],
			): Promise<void> {
				const model = getDefaultModel();
				const proxyTools = makeProxyTools();

				console.log(
					"[agent] runProxyLoop start, messages=" + messagesForLLM.length,
				);

				const result = await streamText({
					model,
					system: systemPrompt,
					messages: messagesForLLM,
					tools: proxyTools,
					stopWhen: stepCountIs(20),
					abortSignal: request.signal,
				});

				let partCount = 0;
				// Buffer for parsing <think> tags across text-delta chunks
				let thinkBuffer = "";
				let inThinkTag = false;
				const MAX_TAG_LEN = 8; // max("<think>".length, "</think>".length)
				// Track start/end events for text and reasoning streams
				let hasTextStarted = false;
				let hasReasoningStarted = false;
				let hasThinkTagReasoningStarted = false;
				let assistantText = "";
				let toolCallCount = 0;

				function sendTextDelta(text: string) {
					if (!text) return;
					if (!hasTextStarted) {
						hasTextStarted = true;
						sseSend("text-start", { timestamp: Date.now() });
					}
					assistantText += text;
					logger.textDelta(text);
					sseSend("text-delta", { text, timestamp: Date.now() });
				}

				function flushThinkBuffer() {
					while (thinkBuffer.length > MAX_TAG_LEN) {
						if (!inThinkTag) {
							const idx = thinkBuffer.indexOf("<think>");
							if (idx === -1) {
								const toSend = thinkBuffer.slice(0, -MAX_TAG_LEN);
								thinkBuffer = thinkBuffer.slice(-MAX_TAG_LEN);
								sendTextDelta(toSend);
								return;
							}
							if (idx > 0) {
								const toSend = thinkBuffer.slice(0, idx);
								sendTextDelta(toSend);
							}
							thinkBuffer = thinkBuffer.slice(idx + 7);
							inThinkTag = true;
							// Send reasoning-start when entering <think> tag
							if (!hasThinkTagReasoningStarted) {
								hasThinkTagReasoningStarted = true;
								sseSend("reasoning-start", { timestamp: Date.now() });
							}
						} else {
							const idx = thinkBuffer.indexOf("</think>");
							if (idx === -1) {
								const toSend = thinkBuffer.slice(0, -MAX_TAG_LEN);
								thinkBuffer = thinkBuffer.slice(-MAX_TAG_LEN);
								if (toSend) {
									logger.reasoningDelta(toSend);
									sseSend("reasoning-delta", {
										text: toSend,
										timestamp: Date.now(),
									});
								}
								return;
							}
							if (idx > 0) {
								const toSend = thinkBuffer.slice(0, idx);
								logger.reasoningDelta(toSend);
								sseSend("reasoning-delta", {
									text: toSend,
									timestamp: Date.now(),
								});
							}
							thinkBuffer = thinkBuffer.slice(idx + 8);
							inThinkTag = false;
							// Send reasoning-end when exiting </think> tag
							if (hasThinkTagReasoningStarted) {
								hasThinkTagReasoningStarted = false;
								sseSend("reasoning-end", { timestamp: Date.now() });
							}
						}
					}
				}

				for await (const part of result.fullStream) {
					partCount++;

					if (part.type === "text-delta") {
						// <think> tags are injected by the DeepSeek response interceptor
						// in providers.ts. Parse them here since extractReasoningMiddleware
						// was removed (it strips tags from stored messages).
						thinkBuffer += part.text;
						flushThinkBuffer();
					} else if (part.type === "reasoning-delta") {
						if (!hasReasoningStarted) {
							hasReasoningStarted = true;
							sseSend("reasoning-start", { timestamp: Date.now() });
						}
						logger.reasoningDelta(part.text);
						sseSend("reasoning-delta", {
							text: part.text,
							timestamp: Date.now(),
						});
					} else if (part.type === "tool-call") {
						toolCallCount++;
						logger.request({
							type: "stream-tool-call",
							toolName: part.toolName,
						});
					} else if (part.type === "tool-result") {
						sseSend("tool-result", {
							callId: part.toolCallId,
							timestamp: Date.now(),
						});
					} else {
						logger.request({
							type: "stream-part",
							partType: part.type,
							partIndex: partCount,
						});
					}
				}

				// Flush remaining buffer
				if (thinkBuffer) {
					if (inThinkTag) {
						logger.reasoningDelta(thinkBuffer);
						sseSend("reasoning-delta", {
							text: thinkBuffer,
							timestamp: Date.now(),
						});
					} else {
						sendTextDelta(thinkBuffer);
					}
				}

				// Send end events for any started streams
				if (hasTextStarted) {
					sseSend("text-end", { timestamp: Date.now() });
				}
				if (hasReasoningStarted) {
					sseSend("reasoning-end", { timestamp: Date.now() });
				}
				if (hasThinkTagReasoningStarted) {
					sseSend("reasoning-end", { timestamp: Date.now() });
				}

				console.log("[agent] runProxyLoop done, totalParts=" + partCount);
				logger.request({
					type: "runProxyLoop:done",
					totalParts: partCount,
				});

				const actions = await generateQuickReplyActions({
					assistantText,
					messages: messagesForLLM,
					toolCallCount,
					toolSchemas: toolSchemas as FunctionSchema[],
					logger,
					abortSignal: request.signal,
				});
				if (actions.length > 0) {
					sseSend("message-actions", { actions, timestamp: Date.now() });
				}
			}

			async function runLocalCliProxyLoop(
				messagesForLLM: ModelMessage[],
			): Promise<void> {
				const config = resolveLocalCliRuntimeConfig();
				if (!config.binPath) {
					throw new Error(
						`configuration_error: ${config.agentId} CLI is not available`,
					);
				}

				console.log(
					"[agent] runLocalCliProxyLoop start, messages=" +
						messagesForLLM.length,
				);

				let hasTextStarted = false;
				let hasReasoningStarted = false;
				let assistantText = "";
				let toolCallCount = 0;

				function sendTextDelta(text: string) {
					if (!text) return;
					if (!hasTextStarted) {
						hasTextStarted = true;
						sseSend("text-start", { timestamp: Date.now() });
					}
					assistantText += text;
					logger.textDelta(text);
					sseSend("text-delta", { text, timestamp: Date.now() });
				}

				function sendReasoningDelta(text: string) {
					if (!text) return;
					if (!hasReasoningStarted) {
						hasReasoningStarted = true;
						sseSend("reasoning-start", { timestamp: Date.now() });
					}
					logger.reasoningDelta(text);
					sseSend("reasoning-delta", { text, timestamp: Date.now() });
				}

				function handleCliEvent(event: LocalCliEvent) {
					if (event.type === "reasoning") {
						sendReasoningDelta(event.text);
					} else if (event.type === "text" || event.type === "final") {
						sendTextDelta(event.text);
					} else if (event.type === "plan" && event.reasoning) {
						sendReasoningDelta(event.reasoning);
					} else if (event.type === "error") {
						throw new Error(event.message);
					}
				}

				await runLocalCliReactLoop({
					agentId: config.agentId,
					binPath: config.binPath,
					model: config.model,
					systemPrompt,
					messages: messagesForLLM,
					toolSchemas: toolSchemas as FunctionSchema[],
					onEvent: handleCliEvent,
					onToolCall: async ({ callId, tool, params }) => {
						toolCallCount += 1;
						const result = await proxyOnToolCall(callId, tool, params);
						sseSend("tool-result", { callId, timestamp: Date.now() });
						return result;
					},
					env: config.env,
					signal: request.signal,
				});

				if (hasTextStarted) {
					sseSend("text-end", { timestamp: Date.now() });
				}
				if (hasReasoningStarted) {
					sseSend("reasoning-end", { timestamp: Date.now() });
				}

				logger.request({
					type: "runLocalCliProxyLoop:done",
					toolCallCount,
				});

				const actions = await generateQuickReplyActions({
					assistantText,
					messages: messagesForLLM,
					toolCallCount,
					toolSchemas: toolSchemas as FunctionSchema[],
					logger,
					abortSignal: request.signal,
				});
				if (actions.length > 0) {
					sseSend("message-actions", { actions, timestamp: Date.now() });
				}
			}

			async function runProxyLoop(messagesForLLM: ModelMessage[]): Promise<void> {
				if (isLocalCliRuntimeEnabled()) {
					await runLocalCliProxyLoop(messagesForLLM);
					return;
				}
				await runApiProxyLoop(messagesForLLM);
			}

			function makeCoreMessages(): ModelMessage[] {
				const coreMessages: ModelMessage[] = messages.map((m) => ({
					role: m.role as "user" | "assistant",
					content: `${m.content}${buildReferencesContextText({
						references: m.references,
					})}`,
				}));
				const contextText = buildRequestContextText({
					activeBrandKit: context?.activeBrandKit,
				});
				if (contextText) {
					coreMessages.push({
						role: "user",
						content: `${contextText}\n这段上下文只用于解析用户指代和风格约束，不是新的编辑指令。`,
					});
				}
				return coreMessages;
			}

			async function handleSuggestOrManual(plan: AgentPlan): Promise<void> {
				const resolution = resolveExecutionMode({
					userMode: mode,
					plan,
				});
				const enrichQuestionPlan = async (
					nextPlan: AgentPlan,
				): Promise<AgentPlan> => {
					if (nextPlan.steps.length > 0 || !nextPlan.reasoning) {
						return nextPlan;
					}
					const actions = await generateQuickReplyActions({
						assistantText: nextPlan.reasoning,
						messages: makeCoreMessages(),
						toolCallCount: 0,
						toolSchemas: toolSchemas as FunctionSchema[],
						logger,
						abortSignal: request.signal,
					});
					return actions.length > 0 ? { ...nextPlan, actions } : nextPlan;
				};

				if (resolution.strategy === "execute") {
					await runProxyLoop(makeCoreMessages());
				} else if (resolution.strategy === "suggest") {
					const { previewSteps } = splitPreviewSafeSteps({
						steps: plan.steps,
					});

					if (mode === "suggest" && previewSteps.length > 0) {
						const observationLines: string[] = [];
						const hasStockPreview = previewSteps.some(
							(step) => step.tool === "stock_search_media",
						);
						const hasSilenceAnalysisPreview = previewSteps.some(
							(step) => step.tool === "silence_analyze_timeline",
						);
						const hasRoughCutReviewPreview = previewSteps.some(
							(step) => step.tool === "rough_cut_create_review",
						);

						for (const step of previewSteps) {
							const line = await proxyExecuteStep(
								step,
								sessionId,
								logger,
								sseSend,
								request.signal,
							);
							observationLines.push(line);
						}

						const followUpPlan = await generatePlanFromLLM(
							systemPrompt,
							[
								...getPlanningMessages(),
								{
									role: "user",
									content:
										"以下预览/分析步骤已经执行完成。素材候选会由 UI 以资源卡片展示；静音分析结果会提供 planId；粗剪审核单会由 UI 弹窗展示。请基于这些真实结果生成下一步计划，不要用 Markdown 复述候选列表，不要粘贴候选链接，也不要再次调用 creative_search_video、stock_search_media、creative_generate_image、silence_analyze_timeline 或 rough_cut_create_review。" +
										(hasStockPreview
											? " 如果只是展示 stock_search_media 候选，不要生成 stock_import_media 计划；导入交给卡片底部的导入到资源库按钮。"
											: " 只包含需要用户确认后执行的修改步骤。") +
										(hasSilenceAnalysisPreview
											? " 如果静音分析检测到 segmentCount > 0，并且用户的目标是剪掉静音，下一步只生成 silence_apply_cut_plan，并使用分析返回的 planId。"
											: "") +
										(hasRoughCutReviewPreview
											? " 如果粗剪审核单已经打开，等待用户在弹窗里确认，不要生成 rough_cut_apply_review 计划。"
											: "") +
										"\n\n" +
										observationLines.join("\n\n"),
								},
							],
							toolSchemas as FunctionSchema[],
							logger,
							request.signal,
						);

						const remainingSteps = followUpPlan.steps
							.filter(
								(step) =>
									!splitPreviewSafeSteps({ steps: [step] }).previewSteps.length,
							)
							.filter(
								(step) =>
									!(hasStockPreview && step.tool === "stock_import_media"),
							);

						const displayPlan: AgentPlan = {
							...followUpPlan,
							steps: remainingSteps,
							reasoning: [
								plan.reasoning,
								followUpPlan.reasoning,
								hasStockPreview
									? "已找到候选素材，可以在卡片里预览并导入资源库。"
									: "已先执行素材搜索/生图预览，等待确认后再导入或插入时间线。",
							]
								.filter(Boolean)
								.join("\n\n"),
							needsConfirmation: remainingSteps.length > 0,
						};

						sseSend("plan", buildPlanEvent(displayPlan, "suggest"));
						return;
					}

					sseSend(
						"plan",
						buildPlanEvent(await enrichQuestionPlan(plan), "suggest"),
					);
				} else {
					sseSend(
						"plan",
						buildPlanEvent(await enrichQuestionPlan(plan), "step_by_step"),
					);
				}
			}

			try {
				const runtimeConfig = resolveLocalCliRuntimeConfig();
				sseSend("init", {
					sessionId,
					runtime: runtimeConfig.enabled
						? {
								type: "local-cli",
								agentId: runtimeConfig.agentId,
								model: runtimeConfig.model ?? "default",
							}
						: { type: "api" },
				});

				if (action === "confirm" && existingPlan) {
					const observationLines: string[] = [];
					for (const step of existingPlan.steps) {
						const line = await proxyExecuteStep(
							step,
							sessionId,
							logger,
							sseSend,
							request.signal,
						);
						observationLines.push(line);
					}

					const msgs: ModelMessage[] = [
						...makeCoreMessages(),
						{
							role: "user",
							content: `执行结果分析:\n\n${observationLines.join("\n\n")}\n\n请根据以上结果总结当前已完成的操作并直接回复用户。`,
						},
					];

					await runProxyLoop(msgs);
					logger.done();
					sseSend("done", {});
					controller.close();
					return;
				}

				if (
					action === "continue" &&
					existingPlan &&
					existingPlan.steps.length > 0
				) {
					await proxyExecuteStep(
						existingPlan.steps[0],
						sessionId,
						logger,
						sseSend,
						request.signal,
					);

					if (mode === "auto") {
						await runProxyLoop(makeCoreMessages());
					} else {
						const plan = await generatePlanFromLLM(
							systemPrompt,
							getPlanningMessages(),
							toolSchemas as FunctionSchema[],
							logger,
							request.signal,
						);
						logger.plan(plan);
						await handleSuggestOrManual(plan);
					}

					logger.done();
					sseSend("done", {});
					controller.close();
					return;
				}

				if (mode === "auto") {
					await runProxyLoop(makeCoreMessages());
				} else {
					const plan = await generatePlanFromLLM(
						systemPrompt,
						getPlanningMessages(),
						toolSchemas as FunctionSchema[],
						logger,
						request.signal,
					);
					logger.plan(plan);
					await handleSuggestOrManual(plan);
				}

				logger.done();
				sseSend("done", {});
			} catch (err) {
				logger.error(err);
				if (isAbortError(err) || request.signal.aborted) {
					closed = true;
					return;
				}
				const errMsg = err instanceof Error ? err.message : String(err);
				console.error("[agent] error:", errMsg);
				try {
					console.error(
						"[agent] error full:",
						JSON.stringify(err, Object.getOwnPropertyNames(err), 2).slice(
							0,
							3000,
						),
					);
				} catch {
					console.error("[agent] error full (non-serializable):", err);
				}
				// Classify error for frontend handling
				let category = "unknown";
				const msg = errMsg.toLowerCase();
				if (
					msg.includes("enotfound") ||
					msg.includes("econnrefused") ||
					msg.includes("etimedout") ||
					msg.includes("timeout") ||
					msg.includes("network") ||
					(err as { reason?: string }).reason === "maxRetriesExceeded"
				) {
					category = "network";
				} else if (
					msg.includes("429") ||
					msg.includes("rate limit") ||
					msg.includes("too many requests")
				) {
					category = "rate_limit";
				} else if (
					msg.includes("401") ||
					msg.includes("403") ||
					msg.includes("unauthorized") ||
					msg.includes("api key")
				) {
					category = "auth";
				} else if (
					msg.includes("413") ||
					msg.includes("context length") ||
					msg.includes("too long")
				) {
					category = "context_length";
				}

				sseSend("error", {
					message: errMsg,
					category,
				});
			}

			try {
				controller.close();
			} catch {
				// stream already closed
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
