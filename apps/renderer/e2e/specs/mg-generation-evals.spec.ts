import { expect, test } from "@playwright/test";

test.describe("MG generation eval contracts", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
	});

	test("runs representative intent, duration and VisualDNA cases in the real renderer", async ({
		page,
	}) => {
		const result = await page.evaluate(async () => {
			const evals = await import("/src/shotlyx/remotion-components/evals.ts");
			const prompts = await import("/src/agent/chat/prompt-builders.ts");
			const quality =
				await import("/src/shotlyx/remotion-components/quality.ts");
			const visual =
				await import("/src/shotlyx/remotion-components/visual-dna.ts");
			const requestModule =
				await import("/src/shotlyx/remotion-components/generation-request.ts");
			const failures = evals.SHOTLYX_MG_EVAL_CASES.flatMap((testCase) => {
				const evalResult = evals.runShotlyxMGEvalCase(testCase);
				const request = requestModule.buildShotlyxMGGenerationRequest({
					prompt: testCase.prompt,
					duration: testCase.duration ?? "auto",
					aspectRatio: testCase.aspectRatio ?? "16:9",
					styleGuide: testCase.styleGuide,
				});
				const dna = visual.createShotlyxMGVisualDNA({ request });
				const spec = visual.createShotlyxMGMotionSpec({
					request,
					visualDNA: dna,
				});
				const structuralFailures = [
					dna.fingerprint.length < 5 ? "missing fingerprint" : "",
					spec.beats.length !== 3 ? "missing motion beats" : "",
					request.mode === "single" && request.componentCount
						? "single request has componentCount"
						: "",
				].filter(Boolean);
				return [...evalResult.failures, ...structuralFailures].map(
					(failure) => `${testCase.id}: ${failure}`,
				);
			});
			const qualityDocument = {
				version: 1,
				runtime: "shotlyx-remotion-component-v1",
				name: "E2E quality fixture",
				durationSeconds: 4,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
				componentSource:
					"const frame = useCurrentFrame(); return <div style={{maxWidth: 1200}}>{props.title}{frame}</div>;",
				compiledModule: "",
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "年度增长",
					},
				],
				defaultProps: { title: "年度增长" },
				sourcePrompt: "年度增长",
				motionSpec: {
					version: 1,
					textPolicy: "required",
					readingOrder: ["hero"],
					elements: [],
					beats: [],
					constraints: [],
				},
			};
			const passingQuality = quality.evaluateShotlyxMGLocalQuality({
				document: qualityDocument,
				frames: [
					{
						frame: 30,
						markup:
							'<div style="max-width:1200px;width:800px;height:200px">年度增长</div>',
					},
				],
			});
			const failingQuality = quality.evaluateShotlyxMGLocalQuality({
				document: qualityDocument,
				frames: [
					{
						frame: 30,
						markup: '<div style="width:800px;height:200px"></div>',
					},
				],
			});
			const hiddenPromptSubmission = prompts.buildRemotionMGSubmission({
				description: "帮我生成一段中国人口近十年变化的 MG 动画",
				aspectRatio: "16:9",
				duration: 5,
			});
			const precedenceSubmission = prompts.buildRemotionMGSubmission({
				description: "生成标题『可信增长』，主色 #b42318",
				aspectRatio: "16:9",
				duration: 5,
				primaryColor: "#2864dc",
			});
			return {
				caseCount: evals.SHOTLYX_MG_EVAL_CASES.length,
				failures,
				qualityChecks: {
					visibleTextPasses: passingQuality.status === "passed",
					missingTextFails: failingQuality.issues.some(
						(issue) => issue.code === "required-text-not-rendered",
					),
				},
				promptVisibility: {
					displayPrompt: hiddenPromptSubmission.displayPrompt,
					internalPromptHidden:
						!hiddenPromptSubmission.displayPrompt.includes(
							"shotlyx_generate",
						) &&
						hiddenPromptSubmission.requestPrompt.includes(
							"shotlyx_generate_mg_component",
						),
				},
				preferencePriority:
					precedenceSubmission.requestPrompt.includes("#b42318") &&
					!precedenceSubmission.requestPrompt.includes("#2864dc"),
			};
		});

		expect(result.caseCount).toBeGreaterThanOrEqual(15);
		expect(result.failures).toEqual([]);
		expect(result.qualityChecks).toEqual({
			visibleTextPasses: true,
			missingTextFails: true,
		});
		expect(result.promptVisibility).toEqual({
			displayPrompt: "帮我生成一段中国人口近十年变化的 MG 动画",
			internalPromptHidden: true,
		});
		expect(result.preferencePriority).toBe(true);
	});
});
