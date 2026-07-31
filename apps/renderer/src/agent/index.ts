/*
 * SPDX-FileCopyrightText: 2026 GuanTou Lab and Shotlyx contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export { MCPServer } from "./mcp/server";
export type { Tool, ToolResult, ToolCall, ToolParameter } from "./mcp/types";
export { toolToFunctionSchema, toolsToFunctionSchemas } from "./mcp/schema";
export { resolveExecutionMode } from "./controller/mode-resolver";
export { fallbackPlan, mockPlan } from "./controller/fallback";
export { AgentLogger } from "./controller/agent-logger";
export type {
	AgentMessage,
	AgentPlan,
	AgentStep,
	ExecutionMode,
} from "./controller/types";
export { ChatPanel } from "./chat/panel";
export { useChatStore } from "./chat/store";
export { loadLLMConfigFromEnv } from "./llm/config";
export { buildSystemPrompt } from "./llm/prompts";
export type { LLMProviderConfig } from "./llm/types";
export {
	getDefaultModel,
	getASRModel,
	getVisionModel,
} from "./ai-sdk/providers";
export {
	mcpToolsToAISDKTools,
	mcpToolsToAISDKProxyTools,
	mcpToolsToAISDKSchemaTools,
} from "./ai-sdk/tools-adapter";
export type { ToolResultCallback } from "./ai-sdk/tools-adapter";
export { parseSSEStream } from "./chat/sse-parser";
export type { SSEEvent, SSECallback } from "./chat/sse-parser";
