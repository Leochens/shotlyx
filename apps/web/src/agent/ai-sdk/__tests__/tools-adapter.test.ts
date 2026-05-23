import { describe, test, expect } from "bun:test";
import { functionSchemaToZod, mcpToolsToAISDKTools } from "@/agent/ai-sdk/tools-adapter";
import type { FunctionSchema } from "@/agent/mcp/schema";
import type { EditorCore } from "@/core";

describe("functionSchemaToZod", () => {
	test("converts string parameter", () => {
		const schema: FunctionSchema = {
			name: "test",
			description: "Test",
			parameters: {
				type: "object",
				properties: {
					name: { type: "string", description: "Name" },
				},
				required: [],
			},
		};
		const zodSchema = functionSchemaToZod(schema);
		expect(zodSchema).toBeDefined();
	});

	test("converts number parameter", () => {
		const schema: FunctionSchema = {
			name: "test",
			description: "Test",
			parameters: {
				type: "object",
				properties: {
					count: { type: "number", description: "Count" },
				},
				required: [],
			},
		};
		const zodSchema = functionSchemaToZod(schema);
		expect(zodSchema).toBeDefined();
	});

	test("converts optional parameter", () => {
		const schema: FunctionSchema = {
			name: "test",
			description: "Test",
			parameters: {
				type: "object",
				properties: {
					optional: { type: "string", description: "Optional", optional: true },
				},
				required: [],
			},
		};
		const zodSchema = functionSchemaToZod(schema);
		expect(zodSchema).toBeDefined();
	});
});

describe("mcpToolsToAISDKTools", () => {
	test("converts FunctionSchema to AI SDK Tool", () => {
		const schemas: FunctionSchema[] = [
			{
				name: "test_tool",
				description: "Test tool",
				parameters: {
					type: "object",
					properties: {
						param1: { type: "string", description: "Param 1" },
					},
					required: ["param1"],
				},
			},
		];

		const mockEditor = {
			mcp: {
				execute: async () => ({ status: "success" as const, data: null }),
			},
		} as unknown as EditorCore;

		const tools = mcpToolsToAISDKTools(schemas, mockEditor);

		expect(tools.test_tool).toBeDefined();
		expect(tools.test_tool.description).toBe("Test tool");
		expect(tools.test_tool.inputSchema).toBeDefined();
		expect(tools.test_tool.execute).toBeDefined();
	});

	test("returns empty record for empty schemas", () => {
		const mockEditor = {
			mcp: {
				execute: async () => ({ status: "success" as const, data: null }),
			},
		} as unknown as EditorCore;

		const tools = mcpToolsToAISDKTools([], mockEditor);
		expect(Object.keys(tools)).toHaveLength(0);
	});
});
