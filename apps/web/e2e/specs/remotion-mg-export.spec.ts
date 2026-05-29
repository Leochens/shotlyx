import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const isDesktopE2E = process.env.SHOTLYX_DESKTOP === "1";
const desktopConfigPath = process.env.SHOTLYX_DESKTOP_CONFIG_PATH;

type PixelCounts = {
	red: number;
	cyan: number;
	gold: number;
	white: number;
	visible: number;
};

function hasBinary({ command }: { command: string }): boolean {
	try {
		execFileSync(command, ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function writeReadyDesktopConfig() {
	if (!desktopConfigPath) return;
	writeFileSync(
		desktopConfigPath,
		JSON.stringify(
			{
				version: 1,
				updatedAt: new Date().toISOString(),
				values: {
					AGENT_RUNTIME: "api",
					AGENT_LLM_PROVIDER: "openai",
					AGENT_LLM_KEY: "e2e-agent-key",
					AGENT_LLM_MODEL: "gpt-4o-mini",
				},
			},
			null,
			2,
		),
	);
}

async function analyzeImageColors({
	buffer,
}: {
	buffer: Buffer;
}): Promise<PixelCounts> {
	const image = await sharp(buffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const counts: PixelCounts = {
		red: 0,
		cyan: 0,
		gold: 0,
		white: 0,
		visible: 0,
	};

	for (let index = 0; index < image.data.length; index += 4) {
		const red = image.data[index] ?? 0;
		const green = image.data[index + 1] ?? 0;
		const blue = image.data[index + 2] ?? 0;
		const alpha = image.data[index + 3] ?? 0;
		if (alpha <= 16) continue;

		counts.visible += 1;
		if (red > 145 && green < 90 && blue < 90) counts.red += 1;
		if (green > 135 && blue > 150 && red < 100) counts.cyan += 1;
		if (red > 150 && green > 80 && green < 180 && blue < 80) counts.gold += 1;
		if (red > 210 && green > 210 && blue > 210) counts.white += 1;
	}

	return counts;
}

async function bootstrapProjectWithGeneratedMG({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(async () => {
		const [{ EditorCore }, projectAssets] = await Promise.all([
			import("/src/core/index.ts"),
			import("/src/shotlyx/remotion-components/project-assets.ts"),
		]);
		const editor = EditorCore.getInstance();
		const now = new Date().toISOString();
		const ticksPerSecond = 120_000;
		const durationSeconds = 1.4;
		const duration = Math.round(durationSeconds * ticksPerSecond);

		await editor.project.updateSettings({
			settings: {
				fps: { numerator: 15, denominator: 1 },
				canvasSize: { width: 640, height: 360 },
				canvasSizeMode: "custom",
				background: { type: "color", color: "#050505" },
			},
			pushHistory: false,
		});
		const validComponentSource = `
export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ background: "transparent", color: props.color || "#ffffff" }}>
			<div style={{ opacity: Math.min(1, frame / 10) }}>{String(frame)}</div>
		</AbsoluteFill>
	);
}
`;

		const createDocument = ({
			compiledModule,
			defaultProps,
			name,
			propsSchema,
			sourcePrompt,
		}: {
			compiledModule: string;
			defaultProps: Record<string, string | number | boolean>;
			name: string;
			propsSchema: Array<{
				key: string;
				label: string;
				type: "text" | "number" | "color" | "boolean";
				role: "content" | "style" | "motion";
				default: string | number | boolean;
				min?: number;
				max?: number;
				step?: number;
			}>;
			sourcePrompt: string;
		}) => ({
			version: 1,
			runtime: "shotlyx-remotion-component-v1",
			name,
			durationSeconds,
			fps: 30,
			width: 1920,
			height: 1080,
			aspectRatio: "16:9",
			transparentBackground: true,
			componentSource: validComponentSource,
			compiledModule,
			propsSchema,
			defaultProps,
			sourcePrompt,
			thumbnailFrame: 12,
		});

		const cyanRain = createDocument({
			name: "E2E Generated MG · Cyan Data Rain",
			sourcePrompt: "Generated cyan data rain background for MG export E2E.",
			defaultProps: {
				color: "#00d4ff",
				density: 42,
			},
			propsSchema: [
				{
					key: "color",
					label: "Cyan glow",
					type: "color",
					role: "style",
					default: "#00d4ff",
				},
				{
					key: "density",
					label: "Density",
					type: "number",
					role: "motion",
					default: 42,
					min: 12,
					max: 80,
					step: 1,
				},
			],
			compiledModule: `
const React = globalThis.__SHOTLYX_REMOTION_RUNTIME__.React;
const Remotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;
function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	const dots = Array.from({ length: Math.max(12, Math.floor(props.density || 42)) });
	return React.createElement(AbsoluteFill, { style: { overflow: "hidden", background: "transparent" } },
		dots.map((_, index) => {
			const x = ((index * 137) % 1920);
			const y = (((index * 211) + frame * (5 + (index % 5))) % 1180) - 50;
			const opacity = 0.25 + ((index % 7) / 10);
			return React.createElement("div", {
				key: index,
				style: {
					position: "absolute",
					left: x,
					top: y,
					color: props.color || "#00d4ff",
					opacity,
					fontSize: 18 + (index % 4) * 6,
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					textShadow: "0 0 12px rgba(0,212,255,0.85)"
				}
			}, String(1400 + ((index * 17) % 99)));
		})
	);
}
export default ShotlyxComponent;
`,
		});

		const redRing = createDocument({
			name: "E2E Generated MG · Red Interview Ring",
			sourcePrompt: "Generated red donut metric ring with labels for MG export E2E.",
			defaultProps: {
				centerText: "不确定性",
				labelLeft: "等待回复",
				labelTop: "面试结果",
				labelBottom: "竞争激烈",
				warningColor: "#dc1717",
			},
			propsSchema: [
				{
					key: "centerText",
					label: "Center text",
					type: "text",
					role: "content",
					default: "不确定性",
				},
				{
					key: "labelLeft",
					label: "Left label",
					type: "text",
					role: "content",
					default: "等待回复",
				},
				{
					key: "labelTop",
					label: "Top label",
					type: "text",
					role: "content",
					default: "面试结果",
				},
				{
					key: "labelBottom",
					label: "Bottom label",
					type: "text",
					role: "content",
					default: "竞争激烈",
				},
				{
					key: "warningColor",
					label: "Warning",
					type: "color",
					role: "style",
					default: "#dc1717",
				},
			],
			compiledModule: `
const React = globalThis.__SHOTLYX_REMOTION_RUNTIME__.React;
const Remotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;
function ShotlyxComponent(props) {
	const { AbsoluteFill, interpolate, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	const progress = typeof props.progress === "number" ? props.progress : interpolate(frame, [0, 28], [0, 1], { extrapolateRight: "clamp" });
	const sweep = Math.floor(360 * (0.2 + progress * 0.55));
	const ringStyle = {
		width: 330,
		height: 330,
		borderRadius: 999,
		background: "conic-gradient(" + (props.warningColor || "#dc1717") + " 0deg " + sweep + "deg, rgba(255,255,255,0.32) " + sweep + "deg 360deg)",
		transform: "scale(" + (0.75 + progress * 0.25) + ") rotate(" + (frame * 0.8) + "deg)",
		boxShadow: "0 0 40px rgba(220,23,23,0.25)"
	};
	const labelStyle = { position: "absolute", color: "#ffffff", fontSize: 42, fontWeight: 800, textShadow: "0 0 18px rgba(255,255,255,0.28)" };
	return React.createElement(AbsoluteFill, { style: { background: "transparent", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" } },
		React.createElement("div", { style: ringStyle },
			React.createElement("div", { style: { position: "absolute", inset: 82, borderRadius: 999, background: "rgba(5,5,5,0.92)", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(" + (-frame * 0.8) + "deg)" } },
				React.createElement("div", { style: { color: "#ffffff", fontSize: 40, fontWeight: 900 } }, props.centerText)
			)
		),
		React.createElement("div", { style: { ...labelStyle, left: 250, top: 430 } }, props.labelLeft),
		React.createElement("div", { style: { ...labelStyle, left: 1140, top: 250 } }, props.labelTop),
		React.createElement("div", { style: { ...labelStyle, left: 760, top: 790 } }, props.labelBottom)
	);
}
export default ShotlyxComponent;
`,
		});

		const goldBurst = createDocument({
			name: "E2E Generated MG · Gold Particle Burst",
			sourcePrompt: "Generated gold particle burst foreground for MG export E2E.",
			defaultProps: {
				color: "#d98b16",
				count: 36,
			},
			propsSchema: [
				{
					key: "color",
					label: "Gold",
					type: "color",
					role: "style",
					default: "#d98b16",
				},
				{
					key: "count",
					label: "Particle count",
					type: "number",
					role: "motion",
					default: 36,
					min: 12,
					max: 60,
					step: 1,
				},
			],
			compiledModule: `
const React = globalThis.__SHOTLYX_REMOTION_RUNTIME__.React;
const Remotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;
function ShotlyxComponent(props) {
	const { AbsoluteFill, interpolate, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	const progress = typeof props.progress === "number" ? props.progress : interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
	const particles = Array.from({ length: Math.max(12, Math.floor(props.count || 36)) });
	return React.createElement(AbsoluteFill, { style: { background: "transparent", overflow: "hidden" } },
		particles.map((_, index) => {
			const angle = (index / particles.length) * Math.PI * 2;
			const radius = 80 + progress * (260 + (index % 6) * 42);
			const x = 960 + Math.cos(angle) * radius;
			const y = 540 + Math.sin(angle) * radius * 0.56;
			const size = 7 + (index % 4) * 3;
			return React.createElement("div", {
				key: index,
				style: {
					position: "absolute",
					left: x,
					top: y,
					width: size,
					height: size,
					borderRadius: 99,
					background: props.color || "#d98b16",
					opacity: 0.9 - progress * 0.15,
					boxShadow: "0 0 18px rgba(217,139,22,0.9)",
					transform: "translate(-50%, -50%)"
				}
			});
		})
	);
}
export default ShotlyxComponent;
`,
		});

		const documents = [cyanRain, redRing, goldBurst];
		const assets = documents.map((document, index) => ({
			id: `e2e-generated-mg-${index + 1}`,
			type: "shotlyx-remotion-component",
			name: document.name,
			runtime: "shotlyx-remotion-component-v1",
			document,
			sourcePrompt: document.sourcePrompt,
			createdAt: now,
			updatedAt: now,
		}));

		for (const asset of assets) {
			editor.project.upsertShotlyxMGAsset({ asset });
		}

		const elements = assets.map((asset, index) => ({
			...projectAssets.buildShotlyxMGElementFromAsset({
				asset,
				startTime: 0,
			}),
			id: `e2e-generated-mg-element-${index + 1}`,
			duration,
		}));
		const activeScene = editor.scenes.getActiveScene();
		editor.scenes.updateSceneTracks({
			tracks: {
				...activeScene.tracks,
				overlay: [
					{
						id: "e2e-mg-top",
						name: "E2E MG Top",
						type: "graphic",
						hidden: false,
						elements: [elements[2]],
					},
					{
						id: "e2e-mg-middle",
						name: "E2E MG Middle",
						type: "graphic",
						hidden: false,
						elements: [elements[1]],
					},
					{
						id: "e2e-mg-bottom",
						name: "E2E MG Bottom",
						type: "graphic",
						hidden: false,
						elements: [elements[0]],
					},
				],
				audio: [],
			},
		});
		editor.playback.seek({ time: Math.round(0.7 * ticksPerSecond) });
	});
}

async function exportProjectToWebM({
	page,
	testInfo,
}: {
	page: Page;
	testInfo: TestInfo;
}): Promise<{
	exportPath: string;
	progressSnapshots: Array<{
		progress: number;
		stage?: string;
		subProgress?: {
			current?: number;
			progress: number;
			stepCount?: number;
			stepIndex?: number;
			total?: number;
		} | null;
	}>;
}> {
	const exportPath = testInfo.outputPath("remotion-mg-export.webm");
	await page
		.locator('button[aria-label="Export"], button[aria-label="导出"]')
		.first()
		.click();
	await page.evaluate(() => {
		const windowWithExport = window as typeof window & {
			__shotlyxE2EExportPromise?: Promise<{
				bytes: number[];
				progressSnapshots: Array<{
					progress: number;
					stage?: string;
					subProgress?: {
						current?: number;
						progress: number;
						stepCount?: number;
						stepIndex?: number;
						total?: number;
					} | null;
				}>;
			}>;
		};
		windowWithExport.__shotlyxE2EExportPromise = (async () => {
			const { EditorCore } = await import("/src/core/index.ts");
			const editor = EditorCore.getInstance();
			const activeProject = editor.project.getActive();
			const progressSnapshots: Array<{
				progress: number;
				stage?: string;
				subProgress?: {
					current?: number;
					progress: number;
					stepCount?: number;
					stepIndex?: number;
					total?: number;
				} | null;
			}> = [];
			const unsubscribe = editor.project.subscribe(() => {
				const state = editor.project.getExportState();
				if (state.stage !== "prerendering-mg" || !state.subProgress) return;
				progressSnapshots.push({
					progress: state.progress,
					stage: state.stage,
					subProgress: {
						current: state.subProgress.current,
						progress: state.subProgress.progress,
						stepCount: state.subProgress.stepCount,
						stepIndex: state.subProgress.stepIndex,
						total: state.subProgress.total,
					},
				});
			});
			try {
				const exportResult = await editor.project.export({
					options: {
						format: "webm",
						quality: "low",
						fps: activeProject.settings.fps,
						includeAudio: false,
					},
				});
				if (!exportResult.success || !exportResult.buffer) {
					throw new Error(
						exportResult.error || "Export did not produce a buffer",
					);
				}
				return {
					bytes: Array.from(new Uint8Array(exportResult.buffer)),
					progressSnapshots,
				};
			} finally {
				unsubscribe();
			}
		})();
	});
	await expect(
		page.getByText(/Rendering MG segments|正在渲染 MG 片段/),
	).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.getByText(/MG segment \d+\/\d+|MG 片段 \d+\/\d+/)).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.getByText(/Estimated remaining|预计剩余/)).toBeVisible({
		timeout: 30_000,
	});
	const progressBuffer = await page.getByRole("dialog").screenshot({
		path: testInfo.outputPath("remotion-mg-export-progress.png"),
	});
	await testInfo.attach("remotion-mg-export-progress.png", {
		body: progressBuffer,
		contentType: "image/png",
	});
	const result = await page.evaluate(async () => {
		const promise = (
			window as typeof window & {
				__shotlyxE2EExportPromise?: Promise<{
					bytes: number[];
					progressSnapshots: Array<{
						progress: number;
						stage?: string;
						subProgress?: {
							current?: number;
							progress: number;
							stepCount?: number;
							stepIndex?: number;
							total?: number;
						} | null;
					}>;
				}>;
			}
		).__shotlyxE2EExportPromise;
		if (!promise) throw new Error("Export promise was not started");
		return await promise;
	});
	const buffer = Buffer.from(result.bytes);
	writeFileSync(exportPath, buffer);
	await testInfo.attach("remotion-mg-export.webm", {
		body: buffer,
		contentType: "video/webm",
	});
	return { exportPath, progressSnapshots: result.progressSnapshots };
}

test.describe("Remotion MG desktop export", () => {
	test.skip(!isDesktopE2E, "desktop MG export requires the local API bridge");
	test.skip(!hasBinary({ command: "ffmpeg" }), "ffmpeg is required");
	test.skip(!hasBinary({ command: "ffprobe" }), "ffprobe is required");
	test.setTimeout(180_000);
	test.use({
		colorScheme: "dark",
		viewport: { width: 1440, height: 900 },
	});

	test.beforeEach(async ({ page }) => {
		if (desktopConfigPath) {
			rmSync(desktopConfigPath, { force: true });
			writeReadyDesktopConfig();
		}
		await page.addInitScript(() => {
			window.localStorage.setItem("hasSeenOnboarding", "true");
		});
	});

	test("renders generated MG assets in preview and exported video", async ({
		page,
	}, testInfo) => {
		page.on("console", (message) => {
			const text = message.text();
			if (text.includes("[shotlyx-mg-export]")) {
				console.info(`[browser] ${text}`);
			}
		});

		await page.goto("/projects");
		await page
			.getByRole("button", { name: "Create your first project" })
			.click();
		await page.waitForURL(/\/editor\//);
		await expect(page.locator(".editor-workbench")).toBeVisible();

		await bootstrapProjectWithGeneratedMG({ page });
		const preview = page.getByTestId("preview-viewport");
		await expect(preview).toBeVisible();
		await page.waitForTimeout(1000);
		const previewBuffer = await preview.screenshot({
			path: testInfo.outputPath("remotion-mg-preview.png"),
		});
		await testInfo.attach("remotion-mg-preview.png", {
			body: previewBuffer,
			contentType: "image/png",
		});

		const previewCounts = await analyzeImageColors({ buffer: previewBuffer });
		expect(previewCounts.red).toBeGreaterThan(300);
		expect(previewCounts.cyan).toBeGreaterThan(60);
		expect(previewCounts.gold).toBeGreaterThan(40);
		expect(previewCounts.white).toBeGreaterThan(120);

		const prerenderDiagnostics = await page.evaluate(async () => {
			const [{ EditorCore }, prerender] = await Promise.all([
				import("/src/core/index.ts"),
				import("/src/services/renderer/shotlyx-mg-export-prerender.ts"),
			]);
			const editor = EditorCore.getInstance();
			const project = editor.project.getActive();
			const tracks = editor.scenes.getActiveScene().tracks;
			return {
				assetCount: project.shotlyxMGAssets?.length ?? 0,
				jobCount: prerender.collectShotlyxMGExportPrerenderJobs({
					shotlyxMGAssets: project.shotlyxMGAssets ?? [],
					tracks,
				}).length,
			};
		});
		expect(prerenderDiagnostics).toMatchObject({
			assetCount: 3,
			jobCount: 3,
		});

		const { exportPath, progressSnapshots } = await exportProjectToWebM({
			page,
			testInfo,
		});
		expect(progressSnapshots.length).toBeGreaterThan(0);
		expect(
			progressSnapshots.some(
				(snapshot) =>
					snapshot.subProgress?.total &&
					snapshot.subProgress.current &&
					snapshot.subProgress.current > 0,
			),
		).toBe(true);
		const metadata = JSON.parse(
			execFileSync("ffprobe", [
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=width,height",
				"-of",
				"json",
				exportPath,
			]).toString("utf8"),
		);
		expect(metadata.streams[0].width).toBe(640);
		expect(metadata.streams[0].height).toBe(360);

		const framePath = testInfo.outputPath("remotion-mg-export-frame.png");
		execFileSync("ffmpeg", [
			"-y",
			"-loglevel",
			"error",
			"-ss",
			"0.7",
			"-i",
			exportPath,
			"-frames:v",
			"1",
			framePath,
		]);
		const exportedFrame = await sharp(framePath).png().toBuffer();
		await testInfo.attach("remotion-mg-export-frame.png", {
			path: framePath,
			contentType: "image/png",
		});
		const exportCounts = await analyzeImageColors({ buffer: exportedFrame });
		expect(exportCounts.red).toBeGreaterThan(250);
		expect(exportCounts.cyan).toBeGreaterThan(40);
		expect(exportCounts.gold).toBeGreaterThan(25);
		expect(exportCounts.white).toBeGreaterThan(80);
		expect(exportCounts.visible).toBeGreaterThan(12_000);
	});
});
