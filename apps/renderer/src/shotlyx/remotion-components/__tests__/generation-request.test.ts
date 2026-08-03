import { describe, expect, test } from "bun:test";
import { SHOTLYX_MG_EVAL_CASES, runShotlyxMGEvalCase } from "../evals";
import {
	buildShotlyxMGGenerationRequest,
	hasConcreteMGSubject,
} from "../generation-request";
import {
	createShotlyxMGMotionSpec,
	createShotlyxMGVisualDNA,
} from "../visual-dna";

describe("Shotlyx MG generation request and evals", () => {
	test("distinguishes a concrete subject from generic MG settings", () => {
		expect(
			hasConcreteMGSubject({ prompt: "帮我做一个 5 秒好看的蓝色 MG 动画" }),
		).toBe(false);
		expect(
			hasConcreteMGSubject({ prompt: "做一个中国人口近十年变化的 MG" }),
		).toBe(true);
		expect(hasConcreteMGSubject({ prompt: "纯视觉粒子爆炸动画" })).toBe(true);
	});

	for (const testCase of SHOTLYX_MG_EVAL_CASES) {
		test(`passes eval contract: ${testCase.id}`, () => {
			const result = runShotlyxMGEvalCase(testCase);
			expect(result.failures).toEqual([]);
			expect(result.passed).toBe(true);
		});
	}

	test("keeps user colors and fonts locked in VisualDNA", () => {
		const request = buildShotlyxMGGenerationRequest({
			prompt: "标题『可信增长』，颜色 #b42318，字体 Source Han Sans，5 秒",
		});
		const visualDNA = createShotlyxMGVisualDNA({ request });
		const motionSpec = createShotlyxMGMotionSpec({ request, visualDNA });

		expect(visualDNA.sources.colors).toBe("locked");
		expect(visualDNA.colors.primary).toBe("#b42318");
		expect(visualDNA.sources.typography).toBe("locked");
		expect(motionSpec.textPolicy).toBe("required");
		expect(motionSpec.beats.map((beat) => beat.id)).toEqual([
			"build",
			"hold",
			"resolve",
		]);
	});
});
