import { describe, expect, test } from "bun:test";
import {
	executeTopicWorkbenchTool,
	getTopicWorkbenchToolSchemas,
	TOPIC_WORKBENCH_TOOL_NAMES,
} from "@/topic-workbench/tools";

describe("topic workbench tools", () => {
	test("exposes topic-only workbench write tools", () => {
		const names = getTopicWorkbenchToolSchemas().map((schema) => schema.name);

		for (const name of TOPIC_WORKBENCH_TOOL_NAMES) {
			expect(names).toContain(name);
		}
		expect(names).toContain("topic_workbench_set_candidates");
		expect(names).toContain("topic_workbench_set_research_sources");
		expect(names).toContain("topic_workbench_set_structure_options");
	});

	test("rejects invalid structured candidate payloads before mutating state", () => {
		const result = executeTopicWorkbenchTool({
			toolName: "topic_workbench_set_candidates",
			editorProjectId: "project-1",
			params: { candidates: [{ summary: "missing title" }] },
		});

		expect(result.status).toBe("error");
		expect(result.errorCategory).toBe("param_error");
	});
});
