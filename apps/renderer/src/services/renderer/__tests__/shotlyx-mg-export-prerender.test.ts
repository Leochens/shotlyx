import { describe, expect, mock, test } from "bun:test";
import { wasmMock } from "@/test/wasm-mock";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { shotlyxBattleCardFixture } =
	await import("@/shotlyx/remotion-components/fixtures/battle-card");
const { buildShotlyxMGElementFromAsset, shotlyxMediaTimeFromSeconds } =
	await import("@/shotlyx/remotion-components/project-assets");
const {
	buildShotlyxMGExportRenderKey,
	collectShotlyxMGExportPrerenderJobs,
	getShotlyxMGExportPrerenderConcurrency,
	prerenderShotlyxMGExportSegments,
} = await import("../shotlyx-mg-export-prerender");
const { buildScene } = await import("../scene-builder");
const { GraphicNode } = await import("../nodes/graphic-node");
const { VideoNode } = await import("../nodes/video-node");

function buildAsset() {
	return {
		id: "shotlyx-mg-asset",
		type: "shotlyx-remotion-component" as const,
		name: "Interview Result MG",
		runtime: "shotlyx-remotion-component-v1" as const,
		document: shotlyxBattleCardFixture,
		sourcePrompt: "",
		createdAt: "",
		updatedAt: "",
	};
}

function buildTracks() {
	const asset = buildAsset();
	const element = {
		...buildShotlyxMGElementFromAsset({
			asset,
			startTime: shotlyxMediaTimeFromSeconds({ seconds: 0 }),
		}),
		id: "mg-element-1",
	};
	return {
		asset,
		element,
		tracks: {
			overlay: [
				{
					id: "graphic-track",
					name: "Graphics",
					type: "graphic" as const,
					hidden: false,
					elements: [element],
				},
			],
			main: {
				id: "main",
				name: "Main",
				type: "video" as const,
				elements: [],
				muted: false,
				hidden: true,
			},
			audio: [],
		},
	};
}

describe("Shotlyx MG export prerender mapping", () => {
	test("collects Remotion MG elements as per-element prerender jobs", () => {
		const { asset, element, tracks } = buildTracks();

		const jobs = collectShotlyxMGExportPrerenderJobs({
			shotlyxMGAssets: [asset],
			tracks,
		});

		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.trackId).toBe("graphic-track");
		expect(jobs[0]?.element.id).toBe(element.id);
		expect(jobs[0]?.sourceWidth).toBe(1920);
		expect(jobs[0]?.sourceHeight).toBe(1080);
	});

	test("keeps prerendered MG in its original track order slot", () => {
		const { element, tracks } = buildTracks();
		const file = new File(["fake"], "mg.webm", { type: "video/webm" });
		const mediaAsset = {
			id: "rendered-mg-video",
			name: "Rendered MG",
			type: "video" as const,
			file,
			url: "blob:rendered-mg-video",
			width: 1920,
			height: 1920,
			duration: 5,
			fps: 30,
			hasAudio: false,
			ephemeral: true,
		};
		const renderMap = new Map([
			[
				buildShotlyxMGExportRenderKey({
					elementId: element.id,
					trackId: "graphic-track",
				}),
				mediaAsset,
			],
		]);

		const scene = buildScene({
			background: { type: "color", color: "transparent" },
			canvasSize: { width: 1920, height: 1080 },
			duration: element.duration,
			mediaAssets: [mediaAsset],
			shotlyxMGRenderMap: renderMap,
			tracks,
		});

		expect(scene.children[0]).toBeInstanceOf(VideoNode);
		expect(scene.children[0]).not.toBeInstanceOf(GraphicNode);
	});

	test("surfaces frame-level progress while reading streamed MG prerender frames", async () => {
		const previousDesktopFlag = process.env.VITE_SHOTLYX_DESKTOP;
		const previousFetch = globalThis.fetch;
		const previousCreateObjectURL = URL.createObjectURL;
		process.env.VITE_SHOTLYX_DESKTOP = "1";
		URL.createObjectURL = mock(() => "blob:shotlyx-mg-frame");
		const { asset, element, tracks } = buildTracks();
		const progressEvents: unknown[] = [];
		const encoder = new TextEncoder();
		globalThis.fetch = mock(async () => {
			const stream = new ReadableStream({
				start(controller) {
					for (const event of [
						{
							type: "started",
							durationSeconds: 2,
							fps: 30,
							frameCount: 2,
							width: 1920,
							height: 1080,
						},
						{
							type: "progress",
							framesRendered: 1,
							frameCount: 2,
							progress: 0.5,
						},
						{
							type: "frame",
							frame: 0,
							data: btoa("frame-0"),
							mimeType: "image/png",
						},
						{
							type: "progress",
							framesRendered: 2,
							frameCount: 2,
							progress: 1,
						},
						{
							type: "frame",
							frame: 1,
							data: btoa("frame-1"),
							mimeType: "image/png",
						},
						{
							type: "completed",
							durationSeconds: 2,
							fps: 30,
							frameCount: 2,
							width: 1920,
							height: 1080,
						},
					]) {
						controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
					}
					controller.close();
				},
			});
			return new Response(stream, {
				headers: { "Content-Type": "application/x-ndjson" },
			});
		});

		try {
			const result = await prerenderShotlyxMGExportSegments({
				fps: 30,
				mediaAssets: [],
				onProgress: (event) => progressEvents.push(event),
				shotlyxMGAssets: [asset],
				tracks,
			});

			const render = result.renderMap.get(
				buildShotlyxMGExportRenderKey({
					elementId: element.id,
					trackId: "graphic-track",
				}),
			);
			expect(render?.type).toBe("shotlyx-mg-frame-sequence");
			expect(render && "frames" in render ? render.frames : []).toHaveLength(2);
			expect(progressEvents).toContainEqual(
				expect.objectContaining({
					frameCount: 2,
					frameIndex: 1,
					frameProgress: 0.5,
					segmentCount: 1,
					segmentIndex: 0,
					segmentName: "Interview Result MG",
				}),
			);
		} finally {
			globalThis.fetch = previousFetch;
			URL.createObjectURL = previousCreateObjectURL;
			if (previousDesktopFlag === undefined) {
				delete process.env.VITE_SHOTLYX_DESKTOP;
			} else {
				process.env.VITE_SHOTLYX_DESKTOP = previousDesktopFlag;
			}
		}
	});

	test("keeps subprogress visible while the desktop render response is pending", async () => {
		const previousDesktopFlag = process.env.VITE_SHOTLYX_DESKTOP;
		const previousFetch = globalThis.fetch;
		const previousCreateObjectURL = URL.createObjectURL;
		process.env.VITE_SHOTLYX_DESKTOP = "1";
		URL.createObjectURL = mock(() => "blob:shotlyx-mg-frame");
		const { asset, tracks } = buildTracks();
		const progressEvents: unknown[] = [];
		let resolveFetch: ((response: Response) => void) | null = null;
		globalThis.fetch = mock(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve;
				}),
		);

		try {
			const renderPromise = prerenderShotlyxMGExportSegments({
				fps: 30,
				mediaAssets: [],
				onProgress: (event) => progressEvents.push(event),
				shotlyxMGAssets: [asset],
				tracks,
			});

			await new Promise((resolve) => setTimeout(resolve, 650));
			expect(progressEvents).toContainEqual(
				expect.objectContaining({
					frameCount: 150,
					frameIndex: expect.any(Number),
					segmentCount: 1,
					segmentIndex: 0,
					segmentName: "Interview Result MG",
				}),
			);

			const encoder = new TextEncoder();
			resolveFetch?.(
				new Response(
					new ReadableStream({
						start(controller) {
							for (const event of [
								{
									type: "started",
									durationSeconds: 2,
									fps: 30,
									frameCount: 1,
									width: 1920,
									height: 1080,
								},
								{
									type: "frame",
									frame: 0,
									data: btoa("frame-0"),
									mimeType: "image/png",
								},
								{
									type: "completed",
									durationSeconds: 2,
									fps: 30,
									frameCount: 1,
									width: 1920,
									height: 1080,
								},
							]) {
								controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
							}
							controller.close();
						},
					}),
					{ headers: { "Content-Type": "application/x-ndjson" } },
				),
			);
			await renderPromise;
		} finally {
			globalThis.fetch = previousFetch;
			URL.createObjectURL = previousCreateObjectURL;
			if (previousDesktopFlag === undefined) {
				delete process.env.VITE_SHOTLYX_DESKTOP;
			} else {
				process.env.VITE_SHOTLYX_DESKTOP = previousDesktopFlag;
			}
		}
	});

	test("limits parallel MG prerender requests", async () => {
		const previousDesktopFlag = process.env.VITE_SHOTLYX_DESKTOP;
		const previousConcurrency = process.env.VITE_SHOTLYX_MG_EXPORT_PRERENDER_CONCURRENCY;
		const previousFetch = globalThis.fetch;
		const previousCreateObjectURL = URL.createObjectURL;
		process.env.VITE_SHOTLYX_DESKTOP = "1";
		process.env.VITE_SHOTLYX_MG_EXPORT_PRERENDER_CONCURRENCY = "2";
		URL.createObjectURL = mock(() => "blob:shotlyx-mg-frame");
		const { asset, element, tracks } = buildTracks();
		const elements = [0, 1, 2].map((index) => ({
			...element,
			id: `mg-element-${index + 1}`,
		}));
		tracks.overlay[0] = {
			...tracks.overlay[0],
			elements,
		};
		let activeRequests = 0;
		let maxActiveRequests = 0;
		const encoder = new TextEncoder();
		globalThis.fetch = mock(async () => {
			activeRequests += 1;
			maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
			await new Promise((resolve) => setTimeout(resolve, 20));
			activeRequests -= 1;
			return new Response(
				new ReadableStream({
					start(controller) {
						for (const event of [
							{
								type: "started",
								durationSeconds: 1,
								fps: 30,
								frameCount: 1,
								width: 1920,
								height: 1080,
							},
							{
								type: "frame",
								frame: 0,
								data: btoa("frame-0"),
								mimeType: "image/png",
							},
							{
								type: "completed",
								durationSeconds: 1,
								fps: 30,
								frameCount: 1,
								width: 1920,
								height: 1080,
							},
						]) {
							controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
						}
						controller.close();
					},
				}),
				{ headers: { "Content-Type": "application/x-ndjson" } },
			);
		});

		try {
			const result = await prerenderShotlyxMGExportSegments({
				fps: { numerator: 30, denominator: 1 },
				mediaAssets: [],
				shotlyxMGAssets: [asset],
				tracks,
			});

			expect(getShotlyxMGExportPrerenderConcurrency({ jobCount: 3 })).toBe(2);
			expect(maxActiveRequests).toBe(2);
			expect(result.renderMap.size).toBe(3);
		} finally {
			globalThis.fetch = previousFetch;
			URL.createObjectURL = previousCreateObjectURL;
			if (previousDesktopFlag === undefined) {
				delete process.env.VITE_SHOTLYX_DESKTOP;
			} else {
				process.env.VITE_SHOTLYX_DESKTOP = previousDesktopFlag;
			}
			if (previousConcurrency === undefined) {
				delete process.env.VITE_SHOTLYX_MG_EXPORT_PRERENDER_CONCURRENCY;
			} else {
				process.env.VITE_SHOTLYX_MG_EXPORT_PRERENDER_CONCURRENCY =
					previousConcurrency;
			}
		}
	});
});
