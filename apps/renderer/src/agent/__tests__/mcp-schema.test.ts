import { describe, expect, test } from "bun:test";
import { toolToFunctionSchema, toolsToFunctionSchemas } from "@/agent/mcp/schema";
import type { Tool } from "@/agent/mcp/types";

describe("Tool schema conversion", () => {
	test("converts simple tool to function schema", () => {
		const tool: Tool = {
			name: "playback_play",
			description: "Start playback",
			parameters: {},
			handler: () => ({ status: "ok" }),
		};
		const schema = toolToFunctionSchema(tool);
		expect(schema.name).toBe("playback_play");
		expect(schema.description).toBe("Start playback");
		expect(schema.parameters.type).toBe("object");
		expect(schema.parameters.required).toEqual([]);
		expect(Object.keys(schema.parameters.properties)).toEqual([]);
	});

	test("marks non-optional params as required", () => {
		const tool: Tool = {
			name: "playback_seek",
			description: "Seek to time",
			parameters: {
				time: { type: "number", description: "Time in seconds" },
			},
			handler: () => ({ status: "ok" }),
		};
		const schema = toolToFunctionSchema(tool);
		expect(schema.parameters.required).toEqual(["time"]);
		expect(schema.parameters.properties.time).toEqual({
			type: "number",
			description: "Time in seconds",
		});
	});

	test("optional params are not required", () => {
		const tool: Tool = {
			name: "test_tool",
			description: "Test",
			parameters: {
				req: { type: "string", description: "Required" },
				op: { type: "string", description: "Optional", optional: true },
			},
			handler: () => ({ status: "ok" }),
		};
		const schema = toolToFunctionSchema(tool);
		expect(schema.parameters.required).toEqual(["req"]);
		expect(schema.parameters.properties.op).toBeDefined();
	});

	test("converts nested array parameters", () => {
		const tool: Tool = {
			name: "test_array",
			description: "Test array",
			parameters: {
				items: {
					type: "array",
					description: "List of items",
					items: { type: "string", description: "An item" },
				},
			},
			handler: () => ({ status: "ok" }),
		};
		const schema = toolToFunctionSchema(tool);
		expect(schema.parameters.properties.items).toEqual({
			type: "array",
			description: "List of items",
			items: { type: "string", description: "An item" },
		});
	});

	test("converts nested object parameters", () => {
		const tool: Tool = {
			name: "test_object",
			description: "Test object",
			parameters: {
				config: {
					type: "object",
					description: "Config object",
					properties: {
						name: { type: "string", description: "Name" },
						value: { type: "number", description: "Value" },
					},
				},
			},
			handler: () => ({ status: "ok" }),
		};
		const schema = toolToFunctionSchema(tool);
		expect(schema.parameters.properties.config).toEqual({
			type: "object",
			description: "Config object",
			properties: {
				name: { type: "string", description: "Name" },
				value: { type: "number", description: "Value" },
			},
		});
	});

	test("toolsToFunctionSchemas converts multiple tools", () => {
		const tools: Tool[] = [
			{ name: "a", description: "A", parameters: {}, handler: () => ({}) },
			{ name: "b", description: "B", parameters: {}, handler: () => ({}) },
		];
		const schemas = toolsToFunctionSchemas(tools);
		expect(schemas).toHaveLength(2);
		expect(schemas[0]?.name).toBe("a");
		expect(schemas[1]?.name).toBe("b");
	});
});
