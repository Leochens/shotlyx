import { describe, expect, test } from "bun:test";
import { getToolResultTimeoutMs } from "../tool-timeouts";

describe("agent chat tool timeouts", () => {
	test("waits much longer for MiniMax vision video analysis than ordinary tools", () => {
		expect(getToolResultTimeoutMs("timeline_add_text")).toBe(120_000);
		expect(getToolResultTimeoutMs("vision_analyze_media")).toBe(10 * 60_000);
	});
});
