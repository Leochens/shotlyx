import { describe, expect, test } from "bun:test";
import {
	formatExportRemainingTime,
	formatExportSubProgressLabel,
} from "../progress";

describe("export progress helpers", () => {
	test("formats MG segment frame progress for the export dialog", () => {
		expect(
			formatExportSubProgressLabel({
				copy: {
					estimatedRemaining: "预计剩余",
					frame: "帧",
					mgSegment: "MG 片段",
				},
				subProgress: {
					current: 12,
					estimatedRemainingSeconds: 80,
					label: "红色圆环强调",
					progress: 0.4,
					stepCount: 5,
					stepIndex: 1,
					total: 30,
				},
			}),
		).toBe("MG 片段 2/5 · 红色圆环强调 · 帧 12/30 · 预计剩余 1分20秒");
	});

	test("formats short and long remaining-time estimates", () => {
		expect(formatExportRemainingTime({ seconds: 8 })).toBe("8秒");
		expect(formatExportRemainingTime({ seconds: 80 })).toBe("1分20秒");
		expect(formatExportRemainingTime({ seconds: 3665 })).toBe("1小时1分");
	});
});
