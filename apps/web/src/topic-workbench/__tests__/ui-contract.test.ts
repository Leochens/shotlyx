import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const topicWorkbenchSource = readFileSync(
	fileURLToPath(new URL("../topic-workbench.tsx", import.meta.url)),
	"utf8",
);

describe("topic workbench UI contract", () => {
	test("keeps the right-side workbench as a tool-driven results surface", () => {
		expect(topicWorkbenchSource).not.toContain("<input");
		expect(topicWorkbenchSource).not.toContain("<textarea");
		expect(topicWorkbenchSource).not.toContain(
			"updateCandidate = useTopicWorkbenchStore",
		);
		expect(topicWorkbenchSource).not.toContain(
			"updatePackageVersion = useTopicWorkbenchStore",
		);
		expect(topicWorkbenchSource).not.toContain(
			"updateScriptSegment = useTopicWorkbenchStore",
		);
		expect(topicWorkbenchSource).not.toContain(
			"resetToStage = useTopicWorkbenchStore",
		);

		expect(topicWorkbenchSource).toContain("选择这个");
		expect(topicWorkbenchSource).toContain("让 Agent 调整");
		expect(topicWorkbenchSource).toContain("查看依据");
		expect(topicWorkbenchSource).toContain('toolName: "topic_reset_to_stage"');
	});
});
