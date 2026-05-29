import { describe, expect, mock, test } from "bun:test";
import { wasmMock } from "@/test/wasm-mock";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { shotlyxBattleCardFixture } =
	await import("@/shotlyx/remotion-components/fixtures/battle-card");
const { buildShotlyxMGElementFromAsset, shotlyxMediaTimeFromSeconds } =
	await import("@/shotlyx/remotion-components/project-assets");
const { buildShotlyxMGExportRenderKey, collectShotlyxMGExportPrerenderJobs } =
	await import("../shotlyx-mg-export-prerender");
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
			canvasSize: { width: 1920, height: 1080 },
			shotlyxMGAssets: [asset],
			tracks,
		});

		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.trackId).toBe("graphic-track");
		expect(jobs[0]?.element.id).toBe(element.id);
		expect(jobs[0]?.sourceSize).toBe(1920);
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
});
