import { describe, expect, test } from "bun:test";
import { getToolResultTimeoutMs } from "../tool-timeouts";

describe("agent chat tool timeouts", () => {
	test("waits much longer for MiniMax vision video analysis than ordinary tools", () => {
		expect(getToolResultTimeoutMs("timeline_add_text")).toBe(120_000);
		expect(getToolResultTimeoutMs("shotlyx_generate_mg_component")).toBe(
			4 * 60_000,
		);
		expect(getToolResultTimeoutMs("vision_analyze_image")).toBe(10 * 60_000);
		expect(getToolResultTimeoutMs("vision_analyze_video")).toBe(10 * 60_000);
	});
});
