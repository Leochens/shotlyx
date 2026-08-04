import { resolveToolPolicy } from "./tool-policy";
import type { Tool, ToolParameter, ToolPolicy } from "./types";

export interface FunctionSchema {
	name: string;
	description: string;
	policy?: ToolPolicy;
	parameters: {
		type: "object";
		properties: Record<string, unknown>;
		required: string[];
	};
}

function parameterToSchema(param: ToolParameter): unknown {
	const base: Record<string, unknown> = {
		type: param.type,
		description: param.description,
	};

	if (param.type === "array" && param.items) {
		base.items = parameterToSchema(param.items);
	}

	if (param.type === "object" && param.properties) {
		const properties: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(param.properties)) {
			properties[key] = parameterToSchema(value);
		}
		base.properties = properties;
	}

	return base;
}

export function toolToFunctionSchema(tool: Tool): FunctionSchema {
	const required: string[] = [];
	const properties: Record<string, unknown> = {};

	for (const [key, param] of Object.entries(tool.parameters)) {
		properties[key] = parameterToSchema(param);
		if (!param.optional) required.push(key);
	}

	return {
		name: tool.name,
		description: tool.description,
		policy: resolveToolPolicy(tool),
		parameters: {
			type: "object",
			properties,
			required,
		},
	};
}

export function toolsToFunctionSchemas(tools: Tool[]): FunctionSchema[] {
	return tools.map(toolToFunctionSchema);
}
