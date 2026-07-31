import { z } from "zod";
import type { EditorCore } from "@/core";
import type { FunctionSchema } from "@/agent/mcp/schema";
import type { Tool } from "ai";

export function functionSchemaToZod(
	schema: FunctionSchema,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const [key, rawParam] of Object.entries(schema.parameters.properties)) {
		const param = rawParam as {
			type: string;
			description: string;
			optional?: boolean;
		};

		let zodType: z.ZodTypeAny;

		switch (param.type) {
			case "string": {
				zodType = z.string();
				break;
			}
			case "number": {
				zodType = z.number();
				break;
			}
			case "boolean": {
				zodType = z.boolean();
				break;
			}
			case "array": {
				zodType = z.array(z.any());
				break;
			}
			case "object": {
				zodType = z.record(z.string(), z.any());
				break;
			}
			default: {
				zodType = z.any();
				break;
			}
		}

		if (param.optional) {
			zodType = zodType.optional();
		}

		shape[key] = zodType.describe(param.description);
	}

	return z.object(shape);
}

export function mcpToolsToAISDKTools(
	schemas: FunctionSchema[],
	editor: EditorCore,
): Record<string, Tool> {
	const result: Record<string, Tool> = {};

	for (const schema of schemas) {
		result[schema.name] = {
			description: schema.description,
			inputSchema: functionSchemaToZod(schema),
			execute: async (params: Record<string, unknown>) => {
				const toolResult = await editor.mcp.execute({
					toolName: schema.name,
					params,
				});

				if (toolResult.status === "error") {
					throw new Error(
						toolResult.error ?? "Tool execution failed",
					);
				}

				return toolResult.data;
			},
		};
	}

	return result;
}

export type ToolResultCallback = (
	callId: string,
	toolName: string,
	params: Record<string, unknown>,
) => Promise<unknown>;

export function mcpToolsToAISDKProxyTools({
	schemas,
	onToolCall,
}: {
	schemas: FunctionSchema[];
	onToolCall: ToolResultCallback;
}): Record<string, Tool> {
	const result: Record<string, Tool> = {};

	for (const schema of schemas) {
		result[schema.name] = {
			description: schema.description,
			inputSchema: functionSchemaToZod(schema),
			execute: async (params: Record<string, unknown>) => {
				const callId = `${schema.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
				return onToolCall(callId, schema.name, params);
			},
		};
	}

	return result;
}

/**
 * Creates tools with schema only (no execute).
 * Used for plan generation where we want to capture
 * the LLM's tool-call intent without executing.
 */
export function mcpToolsToAISDKSchemaTools(
	schemas: FunctionSchema[],
): Record<string, Tool> {
	const result: Record<string, Tool> = {};

	for (const schema of schemas) {
		result[schema.name] = {
			description: schema.description,
			inputSchema: functionSchemaToZod(schema),
		};
	}

	return result;
}
