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
		await page.getByRole("switch", { name: "当前轨道字幕是否显示" }).click();
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"屏幕轨道文字",
		);
		await expect
			.poll(async () =>
				page.evaluate(async () => {
					const [{ EditorCore }, { buildProjectSubtitleElements }] =
						await Promise.all([
							import("/src/core/index.ts"),
							import("/src/subtitles/project-subtitles.ts"),
						]);
					const editor = EditorCore.getInstance();
					const subtitles = editor.project.getActive().settings.subtitles;
					return {
						renderEnabled: subtitles?.tracks?.find(
							(track) => track.id === "track:screen-track",
						)?.renderEnabled,
						renderedNames: buildProjectSubtitleElements({
							subtitles,
							canvasSize: { width: 1920, height: 1080 },
							duration: 120_000,
						}).map((element) => element.name),
					};
				}),
			)
			.toEqual({
				renderEnabled: false,
				renderedNames: ["V1"],
			});
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
			(editor.scenes as typeof editor.scenes & { notify: () => void }).notify();
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

	test("highlights playback word and edits video by transcript selection", async ({
		page,
	}) => {
		const runtimeErrors = collectSubtitleRuntimeErrors({ page });
		await setupEditorPage(page);

		await page.evaluate(async () => {
			const [{ EditorCore }, { mediaTimeFromSeconds }] = await Promise.all([
				import("/src/core/index.ts"),
				import("/src/wasm/media-time.ts"),
			]);
			const editor = EditorCore.getInstance();
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
			];
			mediaManager.notify();
			const scene = editor.scenes.getActiveScene();
			scene.tracks.audio = [
				{
					id: "voice-track",
					type: "audio",
					name: "V1",
					muted: false,
					elements: [
						{
							id: "voice-clip",
							type: "audio",
							name: "Voice",
							sourceType: "upload",
							mediaId: "voice-media",
							startTime: mediaTimeFromSeconds({ seconds: 0 }),
							duration: mediaTimeFromSeconds({ seconds: 10 }),
							trimStart: mediaTimeFromSeconds({ seconds: 0 }),
							trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
							sourceDuration: mediaTimeFromSeconds({ seconds: 10 }),
							params: {},
						},
					],
				},
			];
			(editor.scenes as typeof editor.scenes & { notify: () => void }).notify();
			(
				editor.timeline as typeof editor.timeline & { notify: () => void }
			).notify();
			await editor.mcp.execute({
				toolName: "subtitles_import",
				params: {
					format: "cues",
					sourceTrackId: "voice-track",
					sourceTrackName: "V1",
					cues: [
						{
							text: "这是错字",
							startTimeSeconds: 0,
							durationSeconds: 4,
							tokens: [
								{ text: "这", startTime: 0, duration: 1 },
								{ text: "是", startTime: 1, duration: 1 },
								{ text: "错", startTime: 2, duration: 1 },
								{ text: "字", startTime: 3, duration: 1 },
							],
						},
						{
							text: "删除后面",
							startTimeSeconds: 4,
							durationSeconds: 3,
							tokens: [
								{ text: "删除", startTime: 4, duration: 1 },
								{ text: "后", startTime: 5, duration: 1 },
								{ text: "面", startTime: 6, duration: 1 },
							],
						},
					],
				},
			});
		});

		await page.getByRole("button", { name: /文字稿|Transcript/ }).click();
		await page.evaluate(async () => {
			const [{ EditorCore }, { mediaTimeFromSeconds }] = await Promise.all([
				import("/src/core/index.ts"),
				import("/src/wasm/media-time.ts"),
			]);
			const editor = EditorCore.getInstance();
			editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: 2.2 }) });
		});
		await expect(page.getByTestId("transcript-token-0-2")).toHaveAttribute(
			"data-active",
			"true",
		);
		await expect(page.getByTestId("transcript-token-0-2")).toHaveClass(
			/bg-cyan-400\/30/,
		);
		await expect(page.getByTestId("transcript-token-0-2")).not.toHaveClass(
			/emerald/,
		);

		await page.getByTestId("transcript-token-0-2").click();
		await page.getByRole("button", { name: "编辑选区" }).click();
		await page.getByLabel("编辑选中文字").fill("对");
		await page.getByRole("button", { name: "保存" }).click();
		await expect(page.getByTestId("transcript-token-0-2")).toHaveText("对");
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"这是对字",
		);

		const dragBetweenTokens = async ({
			from,
			to,
		}: {
			from: string;
			to: string;
		}) => {
			await page.getByTestId(from).scrollIntoViewIfNeeded();
			await page.getByTestId(to).scrollIntoViewIfNeeded();
			const fromBox = await page.getByTestId(from).boundingBox();
			const toBox = await page.getByTestId(to).boundingBox();
			expect(fromBox).not.toBeNull();
			expect(toBox).not.toBeNull();
			if (!fromBox || !toBox) return;
			await page.mouse.move(
				fromBox.x + fromBox.width / 2,
				fromBox.y + fromBox.height / 2,
			);
			await page.mouse.down();
			await page.mouse.move(
				toBox.x + toBox.width / 2,
				toBox.y + toBox.height / 2,
			);
			await page.mouse.up();
		};

		await dragBetweenTokens({
			from: "transcript-token-0-3",
			to: "transcript-token-1-0",
		});
		await expect(page.getByTestId("transcript-token-0-3")).toHaveAttribute(
			"data-selected",
			"true",
		);
		await expect(page.getByTestId("transcript-token-1-0")).toHaveAttribute(
			"data-selected",
			"false",
		);

		await dragBetweenTokens({
			from: "transcript-token-1-0",
			to: "transcript-token-1-1",
		});
		await expect(
			page.getByTestId("transcript-selection-toolbar"),
		).toBeVisible();
		await expect(
			page.getByTestId("transcript-selection-toolbar"),
		).not.toContainText("删除后");
		await expect(page.getByRole("button", { name: "编辑选区" })).toHaveText("");
		await expect(page.getByRole("button", { name: "删除选区" })).toHaveText("");
		const toolbarBox = await page
			.getByTestId("transcript-selection-toolbar")
			.boundingBox();
		const selectionStartBox = await page
			.getByTestId("transcript-token-1-0")
			.boundingBox();
		expect(toolbarBox).not.toBeNull();
		expect(selectionStartBox).not.toBeNull();
		if (toolbarBox && selectionStartBox) {
			expect(Math.abs(toolbarBox.x - selectionStartBox.x)).toBeLessThan(24);
			expect(toolbarBox.y).toBeLessThan(selectionStartBox.y);
		}
		await expect(page.getByTestId("transcript-token-1-0")).toHaveAttribute(
			"data-selected",
			"true",
		);
		await expect(page.getByTestId("transcript-token-1-0")).toHaveAttribute(
			"data-selection-position",
			"start",
		);
		await expect(page.getByTestId("transcript-token-1-1")).toHaveAttribute(
			"data-selected",
			"true",
		);
		await expect(page.getByTestId("transcript-token-1-1")).toHaveAttribute(
			"data-selection-position",
			"end",
		);
		await page.getByRole("button", { name: "删除选区" }).click();

		await expect(page.getByTestId("global-transcript-list")).not.toContainText(
			"删除",
		);
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"面",
		);
		await expect
			.poll(async () =>
				page.evaluate(async () => {
					const { EditorCore } = await import("/src/core/index.ts");
					const editor = EditorCore.getInstance();
					const track = editor.timeline.getTrackById({
						trackId: "voice-track",
					});
					if (!track) return null;
					return Math.max(
						...track.elements.map(
							(element) => element.startTime + element.duration,
						),
					);
				}),
			)
			.toBe(960_000);
		expect(runtimeErrors).toEqual([]);
	});

	test("cuts filler words from the selected global transcript track", async ({
		page,
	}) => {
		const runtimeErrors = collectSubtitleRuntimeErrors({ page });
		await setupEditorPage(page);

		await page.evaluate(async () => {
			const [{ EditorCore }, { mediaTimeFromSeconds }] = await Promise.all([
				import("/src/core/index.ts"),
				import("/src/wasm/media-time.ts"),
			]);
			const editor = EditorCore.getInstance();
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
			];
			mediaManager.notify();
			const scene = editor.scenes.getActiveScene();
			scene.tracks.audio = [
				{
					id: "voice-track",
					type: "audio",
					name: "V1",
					muted: false,
					elements: [
						{
							id: "voice-clip",
							type: "audio",
							name: "Voice",
							sourceType: "upload",
							mediaId: "voice-media",
							startTime: mediaTimeFromSeconds({ seconds: 0 }),
							duration: mediaTimeFromSeconds({ seconds: 6 }),
							trimStart: mediaTimeFromSeconds({ seconds: 0 }),
							trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
							sourceDuration: mediaTimeFromSeconds({ seconds: 6 }),
							params: {},
						},
					],
				},
			];
			(editor.scenes as typeof editor.scenes & { notify: () => void }).notify();
			(
				editor.timeline as typeof editor.timeline & { notify: () => void }
			).notify();
			await editor.mcp.execute({
				toolName: "subtitles_import",
				params: {
					format: "cues",
					sourceTrackId: "voice-track",
					sourceTrackName: "V1",
					cues: [
						{
							text: "嗯大家好",
							startTimeSeconds: 0,
							durationSeconds: 2,
							tokens: [
								{ text: "嗯", startTime: 0, duration: 0.4 },
								{ text: "大家", startTime: 0.4, duration: 0.8 },
								{ text: "好", startTime: 1.2, duration: 0.4 },
							],
						},
						{
							text: "好啊继续",
							startTimeSeconds: 2,
							durationSeconds: 2,
							tokens: [
								{ text: "好啊", startTime: 2, duration: 0.8 },
								{ text: "继续", startTime: 2.8, duration: 0.8 },
							],
						},
					],
				},
			});
		});

		await page.getByRole("button", { name: /文字稿|Transcript/ }).click();
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"嗯大家好",
		);
		const routeProbe = await page.request.post(
			"/api/agent/subtitle-filler-analysis",
			{
				data: { candidates: [] },
			},
		);
		expect(routeProbe.status()).toBe(400);
		let analysisCallCount = 0;
		await page.route("**/api/agent/subtitle-filler-analysis", async (route) => {
			analysisCallCount += 1;
			const body = route.request().postDataJSON() as {
				candidates: Array<{ id: string; text: string }>;
			};
			expect(body.candidates).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: "track:voice-track:0:0", text: "嗯" }),
					expect.objectContaining({
						id: "track:voice-track:1:0",
						text: "好啊",
					}),
				]),
			);
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					cutIds: ["track:voice-track:0:0"],
					decisions: [
						{
							id: "track:voice-track:0:0",
							shouldCut: true,
							reason: "AI selected standalone filler",
						},
					],
				}),
			});
		});
		await page.getByRole("button", { name: "一键剪气口" }).click();
		await expect(page.getByTestId("global-transcript-list")).not.toContainText(
			"嗯",
		);
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"大家好",
		);
		await expect(page.getByTestId("global-transcript-list")).toContainText(
			"好啊继续",
		);
		await expect
			.poll(async () =>
				page.evaluate(async () => {
					const { EditorCore } = await import("/src/core/index.ts");
					const editor = EditorCore.getInstance();
					const track = editor.timeline.getTrackById({
						trackId: "voice-track",
					});
					if (!track) return null;
					return Math.max(
						...track.elements.map(
							(element) => element.startTime + element.duration,
						),
					);
				}),
			)
			.toBe(672_000);
		expect(analysisCallCount).toBe(1);
		expect(runtimeErrors).toEqual([]);
	});
});
