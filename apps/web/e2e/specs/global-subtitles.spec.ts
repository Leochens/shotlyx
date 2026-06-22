import { expect, test, type Page } from "@playwright/test";

function collectSubtitleRuntimeErrors({ page }: { page: Page }): string[] {
	const errors: string[] = [];
	const isRelevant = (text: string) =>
		text.includes("getSnapshot should be cached") ||
		text.includes("Maximum update depth exceeded") ||
		text.includes("An error occurred in the <button> component");

	page.on("console", (message) => {
		if (
			(message.type() === "error" || message.type() === "warning") &&
			isRelevant(message.text())
		) {
			errors.push(message.text());
		}
	});
	page.on("pageerror", (error) => {
		if (isRelevant(error.message)) {
			errors.push(error.message);
		}
	});

	return errors;
}

async function setupEditorPage(page: Page): Promise<void> {
	await page.route("**/api/account/me", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				user: {
					id: "e2e-user",
					email: "e2e@shotlyx.test",
					name: "E2E User",
					createdAt: "2026-01-01T00:00:00.000Z",
				},
				session: {
					token: "shotlyx_session_e2e",
					userId: "e2e-user",
					createdAt: "2026-01-01T00:00:00.000Z",
					expiresAt: "2099-01-01T00:00:00.000Z",
				},
				newApiKey: null,
			}),
		});
	});
	await page.addInitScript(() => {
		localStorage.setItem("hasSeenOnboarding", JSON.stringify({ value: true }));
		localStorage.setItem(
			"shotlyx.auth.session.v1",
			JSON.stringify({
				token: "shotlyx_session_e2e",
				expiresAt: "2099-01-01T00:00:00.000Z",
			}),
		);
		localStorage.setItem(
			"panel-sizes",
			JSON.stringify({
				state: {
					panels: {
						chat: 20,
						tools: 25,
						preview: 50,
						properties: 25,
						mainContent: 50,
						timeline: 50,
					},
				},
				version: 2,
			}),
		);
	});
	await page.goto("/editor/test-project");
	await page.waitForSelector('[data-testid="preview-viewport"]');
}

test.describe("global subtitles", () => {
	test("opens an empty legacy transcript without snapshot update loops", async ({
		page,
	}) => {
		const runtimeErrors = collectSubtitleRuntimeErrors({ page });
		await setupEditorPage(page);

		await page.evaluate(async () => {
			const { EditorCore } = await import("/src/core/index.ts");
			const editor = EditorCore.getInstance();
			await editor.project.updateSettings({
				settings: { subtitles: undefined },
				pushHistory: false,
			});
		});

		await page.getByRole("button", { name: /文字稿|Transcript/ }).click();
		await expect(page.getByText("暂无文字稿")).toBeVisible();
		expect(runtimeErrors).toEqual([]);
	});

	test("transcript edits global subtitles without creating timeline subtitle clips", async ({
		page,
	}) => {
		const runtimeErrors = collectSubtitleRuntimeErrors({ page });
		await setupEditorPage(page);

		await page.evaluate(async () => {
			const [{ EditorCore }, { buildDefaultTextParams }, { mediaTimeFromSeconds }] =
				await Promise.all([
					import("/src/core/index.ts"),
					import("/src/agent/mcp/text-overlay-planner.ts"),
					import("/src/wasm/media-time.ts"),
				]);
			const editor = EditorCore.getInstance();
			const trackId = editor.timeline.addTrack({ type: "text", index: 0 });
			editor.timeline.insertElement({
				element: {
					type: "text",
					name: "E2E duration anchor",
					startTime: mediaTimeFromSeconds({ seconds: 0 }),
					duration: mediaTimeFromSeconds({ seconds: 5 }),
					trimStart: mediaTimeFromSeconds({ seconds: 0 }),
					trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
					params: {
						...buildDefaultTextParams({ content: "" }),
						content: "",
					},
				},
				placement: { mode: "explicit", trackId },
			});
			await editor.mcp.execute({
				toolName: "subtitles_import",
				params: {
					format: "cues",
					cues: [
						{
							text: "第一句全局字幕",
							startTimeSeconds: 0,
							durationSeconds: 2,
							tokens: [
								{ text: "第一句", startTime: 0, duration: 0.8 },
								{ text: "全局字幕", startTime: 0.9, duration: 1 },
							],
						},
						{
							text: "第二句点击跳转",
							startTimeSeconds: 2.5,
							durationSeconds: 2,
							tokens: [
								{ text: "第二句", startTime: 2.5, duration: 0.8 },
								{ text: "点击跳转", startTime: 3.4, duration: 0.8 },
							],
						},
					],
				},
			});
		});

		await page.getByRole("button", { name: /文字稿|Transcript/ }).click();

		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"第一句全局字幕",
		);
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"第二句点击跳转",
		);

		await expect
			.poll(async () =>
				page.evaluate(async () => {
					const { EditorCore } = await import("/src/core/index.ts");
					const editor = EditorCore.getInstance();
					return editor.scenes
						.getActiveScene()
						.tracks.overlay.flatMap((track) => track.elements)
						.filter((element) => element.type === "subtitle").length;
				}),
			)
			.toBe(0);

		await page.evaluate(async () => {
			const { EditorCore } = await import("/src/core/index.ts");
			const editor = EditorCore.getInstance();
			const originalSeek = editor.playback.seek.bind(editor.playback);
			(
				window as typeof window & {
					__globalSubtitlesSeekTime?: number;
				}
			).__globalSubtitlesSeekTime = undefined;
			editor.playback.seek = ({ time }: { time: number }) => {
				(
					window as typeof window & {
						__globalSubtitlesSeekTime?: number;
					}
				).__globalSubtitlesSeekTime = time;
				originalSeek({ time });
			};
		});

		await page.getByRole("button", { name: "第二句" }).click();
		await expect
			.poll(async () =>
				page.evaluate(
					() =>
						(
							window as typeof window & {
								__globalSubtitlesSeekTime?: number;
							}
						).__globalSubtitlesSeekTime,
				),
			)
			.toBe(300_000);

		const secondCueEditor = page.getByLabel("编辑第 2 条字幕");
		await secondCueEditor.fill("第二句已经修改");
		await expect
			.poll(async () =>
				page.evaluate(async () => {
					const { EditorCore } = await import("/src/core/index.ts");
					const editor = EditorCore.getInstance();
					return editor.project.getActive().settings.subtitles?.cues[1]?.text;
				}),
			)
			.toBe("第二句已经修改");

		await page.getByRole("button", { name: "关闭字幕" }).click();
		await expect
			.poll(async () =>
				page.evaluate(async () => {
					const { EditorCore } = await import("/src/core/index.ts");
					const editor = EditorCore.getInstance();
					return editor.project.getActive().settings.subtitles?.enabled;
				}),
			)
			.toBe(false);
		expect(runtimeErrors).toEqual([]);
	});
});
