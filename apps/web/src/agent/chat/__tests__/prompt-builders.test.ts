import { describe, expect, test } from "bun:test";
import {
	buildHyperFramesMGPrompt,
	buildSeedanceMediaPrompt,
} from "../prompt-builders";

describe("chat prompt builders", () => {
	test("builds a Seedance media prompt with reference state", () => {
		expect(
			buildSeedanceMediaPrompt({
				description: "生成一段海边产品展示",
				aspectRatio: "16:9",
				durationSeconds: 5,
				hasReferences: true,
			}),
		).toContain("creative_generate_seedance_video");
	});

	test("builds a HyperFrames MG prompt with the selected template", () => {
		const prompt = buildHyperFramesMGPrompt({
			description: "给字幕关键词加箭头和圆圈",
			templateId: "data-drift-ai",
			templateLabel: "Data Drift AI",
			aspectRatio: "16:9",
			durationSeconds: 5,
		});

		expect(prompt).toContain("shotlyx_generate_hyperframes_overlay");
		expect(prompt).toContain('"templateId": "data-drift-ai"');
		expect(prompt).toContain('"transparentBackground": true');
		expect(prompt).toContain("Data Drift AI");
	});
});
