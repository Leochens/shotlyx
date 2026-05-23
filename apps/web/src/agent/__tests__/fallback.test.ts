import { describe, expect, test } from "bun:test";
import { fallbackPlan, mockPlan } from "@/agent/controller/fallback";

describe("fallbackPlan", () => {
	test("returns medium complexity with empty steps", () => {
		const plan = fallbackPlan("Something went wrong");
		expect(plan.complexity).toBe("medium");
		expect(plan.reasoning).toBe("Something went wrong");
		expect(plan.steps).toEqual([]);
		expect(plan.needsConfirmation).toBe(true);
	});
});

describe("mockPlan", () => {
	test("returns play plan for 'play' input", () => {
		const plan = mockPlan("play the timeline");
		expect(plan.complexity).toBe("simple");
		expect(plan.steps[0].tool).toBe("playback_play");
		expect(plan.needsConfirmation).toBe(false);
	});

	test("returns pause plan for 'pause' input", () => {
		const plan = mockPlan("pause");
		expect(plan.steps[0].tool).toBe("playback_pause");
	});

	test("returns summary plan for 'status' input", () => {
		const plan = mockPlan("what is the status");
		expect(plan.steps[0].tool).toBe("timeline_get_summary");
	});

	test("returns unclear plan for unknown input", () => {
		const plan = mockPlan("something random");
		expect(plan.complexity).toBe("medium");
		expect(plan.steps).toEqual([]);
		expect(plan.needsConfirmation).toBe(true);
	});
});
