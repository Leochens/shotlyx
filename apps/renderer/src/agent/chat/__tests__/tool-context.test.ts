import { describe, expect, test } from "bun:test";
import { buildToolResultContext } from "@/agent/chat/tool-context";

describe("buildToolResultContext", () => {
	test("includes silence analysis plan id for follow-up turns", () => {
		const context = buildToolResultContext({
			toolCalls: [
				{
					tool: "silence_analyze_timeline",
					params: { scope: "timeline" },
					result: {
						status: "success",
						data: {
							planId: "silence-plan-1",
							segmentCount: 341,
							totalSilenceSeconds: 1336.88,
							targets: [],
						},
					},
				},
			],
		});

		expect(context).toContain("Recent Tool Results");
		expect(context).toContain("silence-plan-1");
		expect(context).toContain("silence_apply_cut_plan");
	});

	test("omits unrelated tool results to keep prompt context small", () => {
		const context = buildToolResultContext({
			toolCalls: [
				{
					tool: "media_get_all",
					params: {},
					result: {
						status: "success",
						data: { results: [{ id: "asset-1" }] },
					},
				},
			],
		});

		expect(context).toBe("");
	});
});
