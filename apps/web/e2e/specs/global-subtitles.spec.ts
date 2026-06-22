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

	test("transcript switches track-level word transcripts without creating timeline subtitle clips", async ({
		page,
	}) => {
		const runtimeErrors = collectSubtitleRuntimeErrors({ page });
		await setupEditorPage(page);

		await page.evaluate(async () => {
			const { EditorCore } = await import("/src/core/index.ts");
			const editor = EditorCore.getInstance();
			await editor.mcp.execute({
				toolName: "subtitles_import",
				params: {
					format: "cues",
					sourceTrackId: "voice-track",
					sourceTrackName: "V1",
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
			await editor.mcp.execute({
				toolName: "subtitles_import",
				params: {
					format: "cues",
					sourceTrackId: "screen-track",
					sourceTrackName: "V2",
					cues: [
						{
							text: "屏幕轨道文字",
							startTimeSeconds: 1,
							durationSeconds: 2,
							tokens: [
								{ text: "屏幕", startTime: 1, duration: 0.5 },
								{ text: "轨道", startTime: 1.5, duration: 0.5 },
								{ text: "文字", startTime: 2, duration: 0.5 },
							],
						},
					],
				},
			});
		});

		await page.getByRole("button", { name: /文字稿|Transcript/ }).click();
		await page.getByRole("combobox", { name: "选择轨道" }).click();
		await page.getByRole("option", { name: "V1" }).click();

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
		await expect(page.getByLabel(/编辑第/)).toHaveCount(0);

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

		await page.getByRole("combobox", { name: "选择轨道" }).click();
		await page.getByRole("option", { name: "V2" }).click();
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"屏幕轨道文字",
		);
		await expect(page.getByTestId("global-transcript-list")).not.toContainText(
			"第二句点击跳转",
		);
		await expect
			.poll(async () =>
				page.evaluate(async () => {
					const { EditorCore } = await import("/src/core/index.ts");
					const editor = EditorCore.getInstance();
					return editor.project.getActive().settings.subtitles?.selectedTrackId;
				}),
			)
			.toBe("track:screen-track");

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

	test("generate transcript requests every audible track", async ({ page }) => {
		const runtimeErrors = collectSubtitleRuntimeErrors({ page });
		await setupEditorPage(page);

		await page.evaluate(async () => {
			const [{ EditorCore }, { mediaTimeFromSeconds }] = await Promise.all([
				import("/src/core/index.ts"),
				import("/src/wasm/media-time.ts"),
			]);
			const editor = EditorCore.getInstance();
			const voiceTrackId = "voice-track";
			const musicTrackId = "music-track";
			const mediaManager = editor.media as typeof editor.media & {
				assets: unknown[];
				notify: () => void;
			};
			mediaManager.assets = [
				...editor.media.getAssets(),
				{
					id: "voice-media",
					name: "voice.wav",
					type: "audio",
					file: new File(["voice"], "voice.wav", { type: "audio/wav" }),
				},
				{
					id: "music-media",
					name: "music.wav",
					type: "audio",
					file: new File(["music"], "music.wav", { type: "audio/wav" }),
				},
			];
			mediaManager.notify();
			const scene = editor.scenes.getActiveScene();
			scene.tracks.audio = [
				{
					id: voiceTrackId,
					type: "audio",
					name: "Audio 1",
					muted: false,
					elements: [
						{
							id: "voice-clip",
							type: "audio",
							name: "Voice",
							sourceType: "upload",
							mediaId: "voice-media",
							startTime: mediaTimeFromSeconds({ seconds: 0 }),
							duration: mediaTimeFromSeconds({ seconds: 2 }),
							trimStart: mediaTimeFromSeconds({ seconds: 0 }),
							trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
							sourceDuration: mediaTimeFromSeconds({ seconds: 2 }),
							params: {},
						},
					],
				},
				{
					id: musicTrackId,
					type: "audio",
					name: "Audio 2",
					muted: false,
					elements: [
						{
							id: "music-clip",
							type: "audio",
							name: "Music",
							sourceType: "upload",
							mediaId: "music-media",
							startTime: mediaTimeFromSeconds({ seconds: 1 }),
							duration: mediaTimeFromSeconds({ seconds: 2 }),
							trimStart: mediaTimeFromSeconds({ seconds: 0 }),
							trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
							sourceDuration: mediaTimeFromSeconds({ seconds: 2 }),
							params: {},
						},
					],
				},
			];
			(
				editor.scenes as typeof editor.scenes & { notify: () => void }
			).notify();
			(
				editor.timeline as typeof editor.timeline & { notify: () => void }
			).notify();

			const originalExecute = editor.mcp.execute.bind(editor.mcp);
			(
				window as typeof window & {
					__globalSubtitleGenerateTrackIds?: string[];
				}
			).__globalSubtitleGenerateTrackIds = [];
			editor.mcp.execute = async (request) => {
				if (request.toolName !== "subtitles_generate_from_video") {
					return originalExecute(request);
				}
				const params = request.params as {
					audioRangeTrackId?: string;
					audioRangeStartSeconds?: number;
				};
				if (params.audioRangeTrackId) {
					(
						window as typeof window & {
							__globalSubtitleGenerateTrackIds?: string[];
						}
					).__globalSubtitleGenerateTrackIds?.push(params.audioRangeTrackId);
				}
				await originalExecute({
					toolName: "subtitles_import",
					params: {
						format: "cues",
						sourceTrackId: params.audioRangeTrackId,
						sourceTrackName:
							params.audioRangeTrackId === voiceTrackId ? "Audio 1" : "Audio 2",
						cues: [
							{
								text:
									params.audioRangeTrackId === voiceTrackId
										? "人声轨道"
										: "音乐轨道",
								startTimeSeconds: params.audioRangeStartSeconds ?? 0,
								durationSeconds: 1,
							},
						],
					},
				});
				return {
					status: "success",
					data: { imported: true, global: true, cueCount: 1 },
				};
			};
		});

		await page.getByRole("button", { name: /文字稿|Transcript/ }).click();
		await page.getByRole("button", { name: "Generate all tracks" }).click();
		await expect
			.poll(async () =>
				page.evaluate(
					() =>
						(
							window as typeof window & {
								__globalSubtitleGenerateTrackIds?: string[];
							}
						).__globalSubtitleGenerateTrackIds?.length,
				),
			)
			.toBe(2);
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"音乐轨道",
		);
		expect(runtimeErrors).toEqual([]);
	});
});
