import { afterEach, describe, expect, mock, test } from "bun:test";
import { clearShotlyxMGAssets } from "@/shotlyx/remotion-components";
import { shotlyxBattleCardFixture } from "@/shotlyx/remotion-components/fixtures/battle-card";
import type { EditorCore } from "@/core";
import type { TimelineElement } from "@/timeline";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import {
	clearCreativeAssets,
	registerCreativeAsset,
} from "@/agent/tools/creative/creative-asset-store";
import { buildCreativeTools } from "@/agent/tools/creative/creative-tools";

const originalFetch = globalThis.fetch;

afterEach(() => {
	clearCreativeAssets();
	clearShotlyxMGAssets();
	globalThis.fetch = originalFetch;
	mock.restore();
});

function asEditorCore(value: unknown): EditorCore {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return value as EditorCore;
}

function requireImageResult(value: unknown): {
	images: Array<{
		id: string;
		width?: number;
		height?: number;
		model?: string;
		mediaAssetId?: string;
		name?: string;
		sizeBytes?: number;
		previewUrl?: string;
	}>;
} {
	if (
		typeof value !== "object" ||
		value === null ||
		!("images" in value) ||
		!Array.isArray(value.images)
	) {
		throw new Error("Expected creative image result");
	}

	return {
		images: value.images.map((item) => {
			if (typeof item !== "object" || item === null) {
				throw new Error("Expected creative image result item");
			}

			const id = "id" in item ? item.id : undefined;
			const width = "width" in item ? item.width : undefined;
			const height = "height" in item ? item.height : undefined;
			const model = "model" in item ? item.model : undefined;
			const mediaAssetId =
				"mediaAssetId" in item ? item.mediaAssetId : undefined;
			const name = "name" in item ? item.name : undefined;
			const sizeBytes = "sizeBytes" in item ? item.sizeBytes : undefined;
			const previewUrl = "previewUrl" in item ? item.previewUrl : undefined;

			if (typeof id !== "string") {
				throw new Error("Expected creative image id");
			}
			if (width !== undefined && typeof width !== "number") {
				throw new Error("Expected numeric image width");
			}
			if (height !== undefined && typeof height !== "number") {
				throw new Error("Expected numeric image height");
			}
			if (model !== undefined && typeof model !== "string") {
				throw new Error("Expected string image model");
			}
			if (mediaAssetId !== undefined && typeof mediaAssetId !== "string") {
				throw new Error("Expected string media asset id");
			}
			if (name !== undefined && typeof name !== "string") {
				throw new Error("Expected string image name");
			}
			if (sizeBytes !== undefined && typeof sizeBytes !== "number") {
				throw new Error("Expected numeric image size");
			}
			if (previewUrl !== undefined && typeof previewUrl !== "string") {
				throw new Error("Expected string preview URL");
			}

			return {
				id,
				width,
				height,
				model,
				mediaAssetId,
				name,
				sizeBytes,
				previewUrl,
			};
		}),
	};
}

function requireShotlyxMGComponentResult(value: unknown): {
	shotlyxMGAssetId: string;
	name: string;
	runtime: string;
	inserted: boolean;
	trackId?: string;
	elementId?: string;
	editableProps: Array<{ key: string; type: string }>;
} {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected Shotlyx MG component result");
	}
	const shotlyxMGAssetId =
		"shotlyxMGAssetId" in value ? value.shotlyxMGAssetId : undefined;
	const name = "name" in value ? value.name : undefined;
	const runtime = "runtime" in value ? value.runtime : undefined;
	const inserted = "inserted" in value ? value.inserted : undefined;
	const trackId = "trackId" in value ? value.trackId : undefined;
	const elementId = "elementId" in value ? value.elementId : undefined;
	const editableProps =
		"editableProps" in value ? value.editableProps : undefined;
	if (
		typeof shotlyxMGAssetId !== "string" ||
		typeof name !== "string" ||
		typeof runtime !== "string" ||
		typeof inserted !== "boolean" ||
		!Array.isArray(editableProps)
	) {
		throw new Error("Expected Shotlyx MG component result shape");
	}

	return {
		shotlyxMGAssetId,
		name,
		runtime,
		inserted,
		trackId: typeof trackId === "string" ? trackId : undefined,
		elementId: typeof elementId === "string" ? elementId : undefined,
		editableProps: editableProps.map((item) => {
			if (typeof item !== "object" || item === null) {
				throw new Error("Expected editable prop item");
			}
			const key = "key" in item ? item.key : undefined;
			const type = "type" in item ? item.type : undefined;
			if (typeof key !== "string" || typeof type !== "string") {
				throw new Error("Expected editable prop key/type");
			}
			return { key, type };
		}),
	};
}

function requireShotlyxMGJobResult(value: unknown): {
	jobId: string;
	runtime: string;
	status: string;
	inserted: boolean;
} {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected Shotlyx MG job result");
	}
	const jobId = "jobId" in value ? value.jobId : undefined;
	const runtime = "runtime" in value ? value.runtime : undefined;
	const status = "status" in value ? value.status : undefined;
	const inserted = "inserted" in value ? value.inserted : undefined;
	if (
		typeof jobId !== "string" ||
		typeof runtime !== "string" ||
		typeof status !== "string" ||
		typeof inserted !== "boolean"
	) {
		throw new Error("Expected Shotlyx MG job result shape");
	}
	return { jobId, runtime, status, inserted };
}

function sseResponse(events: unknown[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const event of events) {
					controller.enqueue(
						encoder.encode(
							`event: job-event\ndata: ${JSON.stringify(event)}\n\n`,
						),
					);
				}
				controller.close();
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "text/event-stream" },
		},
	);
}

async function waitForCondition({
	condition,
}: {
	condition: () => boolean;
}): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("Timed out waiting for condition");
}

describe("buildCreativeTools", () => {
	test("creates expected tools", () => {
		const tools = buildCreativeTools({
			editor: asEditorCore({}),
		});
		const names = tools.map((tool) => tool.name);
		expect(names).not.toContain("creative_search_video");
		expect(names).toContain("creative_generate_image");
		expect(names).not.toContain("shotlyx_generate_mg_scene");
		expect(names).not.toContain("shotlyx_get_mg_scene_schema");
		expect(names).not.toContain("shotlyx_update_mg_props");
		expect(names).not.toContain("creative_generate_mg_animation");
		expect(names).toContain("shotlyx_generate_mg_component");
		expect(names).toContain("shotlyx_generate_mg_composition");
		expect(names).toContain("creative_update_mg_animation");
		expect(names).toContain("creative_update_mg_asset");
		expect(names).toContain("creative_get_mg_asset_schema");
		expect(names).toContain("creative_get_mg_animation_schema");
		expect(names).toContain("creative_import_asset");
		expect(
			tools.find((tool) => tool.name === "shotlyx_generate_mg_component")
				?.parameters.transparentBackground,
		).toMatchObject({
			type: "boolean",
			optional: true,
		});
		expect(
			tools.find((tool) => tool.name === "creative_update_mg_animation")
				?.parameters.transparentBackground,
		).toMatchObject({
			type: "boolean",
			optional: true,
		});
		expect(
			tools.find((tool) => tool.name === "creative_update_mg_asset")?.parameters
				.transparentBackground,
		).toMatchObject({
			type: "boolean",
			optional: true,
		});
	});

	test("creative_generate_image stores and imports generated images", async () => {
		const fetchMock = mock(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				if (String(input) !== "/api/agent/creative/image") {
					return new Response(new Blob(["fake image"], { type: "image/png" }));
				}

				return new Response(
					JSON.stringify({
						images: [
							{
								url: "https://cdn.example.com/generated.png",
								model: "test-model",
								prompt: "cinematic editor cover",
								provider: "openai-compatible",
							},
						],
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		);
		const addMediaAsset = mock(async () => ({
			id: "media-1",
			name: "cinematic-editor-cover.png",
			type: "image" as const,
			file: new File(["fake image"], "cinematic-editor-cover.png", {
				type: "image/png",
			}),
			url: "blob:generated",
			width: 1536,
			height: 1024,
		}));

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
				},
				media: {
					addMediaAsset,
				},
			}),
			deps: {
				fetchFn: fetchMock,
				processMediaAssetsFn: async () => [
					{
						name: "cinematic-editor-cover.png",
						type: "image",
						file: new File(["fake image"], "cinematic-editor-cover.png", {
							type: "image/png",
						}),
						url: "blob:processed",
						width: 1536,
						height: 1024,
					},
				],
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "creative_generate_image",
		);
		const result = requireImageResult(
			await generateTool?.handler({
				prompt: "cinematic editor cover",
				aspectRatio: "16:9",
				count: 1,
			}),
		);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe("/api/agent/creative/image");
		expect(init?.method).toBe("POST");
		if (typeof init?.body !== "string") {
			throw new Error("Expected image generation request body to be a string");
		}
		expect(JSON.parse(init.body)).toEqual({
			prompt: "cinematic editor cover",
			size: "1536x1024",
			count: 1,
		});
		expect(result.images[0]?.id).toStartWith("creative_");
		expect(result.images[0]?.width).toBe(1536);
		expect(result.images[0]?.height).toBe(1024);
		expect(result.images[0]?.model).toBe("test-model");
		expect(result.images[0]?.mediaAssetId).toBe("media-1");
		expect(result.images[0]?.name).toBe("cinematic-editor-cover.png");
		expect(result.images[0]?.sizeBytes).toBe(10);
		expect(result.images[0]?.previewUrl).toBe("blob:generated");
		expect(addMediaAsset).toHaveBeenCalledTimes(1);
	});

	test("creative_generate_seedance_video omits blank reference fields", async () => {
		let postedBody: unknown;
		const fetchMock = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe("/api/agent/creative/video/seedance");
				if (typeof init?.body !== "string") {
					throw new Error("Expected Seedance request body to be a string");
				}
				postedBody = JSON.parse(init.body);

				return new Response(
					JSON.stringify({ error: "provider_error: synthetic stop" }),
					{
						status: 502,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				media: {
					getAssets: () => [],
				},
			}),
			deps: {
				fetchFn: fetchMock,
			},
		});

		const seedanceTool = tools.find(
			(tool) => tool.name === "creative_generate_seedance_video",
		);
		if (!seedanceTool) {
			throw new Error("Expected Seedance tool to be registered");
		}

		await expect(
			seedanceTool.handler({
				prompt: "claymation peanut seedling",
				aspectRatio: "16:9",
				durationSeconds: 5,
				referenceMediaAssetId: "",
				referenceImageUrl: "",
			}),
		).rejects.toThrow("provider_error: synthetic stop");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(postedBody).toEqual({
			prompt: "claymation peanut seedling",
			aspectRatio: "16:9",
			durationSeconds: 5,
		});
	});

	test("shotlyx_generate_mg_component saves an editable MG asset and inserts it", async () => {
		let selectedElements: Array<{ trackId: string; elementId: string }> = [];
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						elements: [] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({ element }: { element: Omit<TimelineElement, "id"> }) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: "shotlyx-el-1",
				} as unknown as TimelineElement;
				scene.tracks.overlay[0]!.elements.push(insertedElement);
				selectedElements = [
					{ trackId: "graphic-track", elementId: "shotlyx-el-1" },
				];
			},
		);
		const upsertShotlyxMGAsset = mock(() => undefined);
		const generateShotlyxMGComponent = mock(async (_args: unknown) => ({
			...shotlyxBattleCardFixture,
			name: "人口变化折线图",
			durationSeconds: 6,
			sourcePrompt: "生成中国人口近十年变化折线图 MG",
		}));

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset,
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => selectedElements,
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				generateShotlyxMGComponentFn: generateShotlyxMGComponent,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_component",
		);
		const result = requireShotlyxMGComponentResult(
			await generateTool?.handler({
				prompt: "生成中国人口近十年变化折线图 MG",
				durationSeconds: 6,
				aspectRatio: "16:9",
				insertToTimeline: true,
			}),
		);

		expect(generateShotlyxMGComponent).toHaveBeenCalledTimes(1);
		expect(generateShotlyxMGComponent.mock.calls[0]?.[0]).toMatchObject({
			prompt: "生成中国人口近十年变化折线图 MG",
			durationSeconds: 6,
			aspectRatio: "16:9",
			transparentBackground: true,
			maxOutputTokens: 12_000,
		});
		expect(upsertShotlyxMGAsset).toHaveBeenCalledTimes(1);
		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(result.name).toBe("人口变化折线图");
		expect(result.runtime).toBe("shotlyx-mg-component-v1");
		expect(result.inserted).toBe(true);
		expect(result.trackId).toBe("graphic-track");
		expect(result.elementId).toBe("shotlyx-el-1");
		expect(result.editableProps.some((prop) => prop.key === "title")).toBe(
			true,
		);
		const insertedGraphic = scene.tracks.overlay[0]!.elements[0] as
			| (TimelineElement & {
					definitionId?: string;
					motionGraphicAssetId?: string;
			  })
			| undefined;
		expect(insertedGraphic?.definitionId).toBe("shotlyx-remotion-component");
		expect(insertedGraphic?.motionGraphicAssetId).toBe(result.shotlyxMGAssetId);
	});

	test("shotlyx_generate_mg_component appends after existing Shotlyx MG on the same track", async () => {
		const existingDuration = 6 * MEDIA_TIME_TICKS_PER_SECOND;
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test fixture constructs timeline element shape.
						elements: [
							{
								id: "existing-mg",
								type: "graphic",
								name: "Existing MG",
								definitionId: "shotlyx-remotion-component",
								motionGraphicAssetId: "existing-asset",
								startTime: 0,
								duration: existingDuration,
								trimStart: 0,
								trimEnd: 0,
								params: {},
							},
						] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({
				element,
			}: {
				element: Omit<TimelineElement, "id">;
				placement: unknown;
			}) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: "shotlyx-el-2",
				} as unknown as TimelineElement;
				scene.tracks.overlay[0]!.elements.push(insertedElement);
			},
		);
		const generateShotlyxMGComponent = mock(async (_args: unknown) => ({
			...shotlyxBattleCardFixture,
			name: "第二个 MG",
			durationSeconds: 4,
			sourcePrompt: "生成第二个 MG",
		}));

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset: mock(() => undefined),
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				generateShotlyxMGComponentFn: generateShotlyxMGComponent,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_component",
		);
		await generateTool?.handler({
			prompt: "生成第二个 MG",
			durationSeconds: 4,
			aspectRatio: "16:9",
			insertToTimeline: true,
		});

		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				startTime: existingDuration,
			},
			placement: { mode: "explicit", trackId: "graphic-track" },
		});
	});

	test("shotlyx_generate_mg_component starts at first subtitle cue when timeline has subtitles but no MG", async () => {
		const subtitleStart = 5 * MEDIA_TIME_TICKS_PER_SECOND;
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "subtitle-track",
						type: "text",
						// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test fixture constructs timeline element shape.
						elements: [
							{
								id: "subtitles",
								type: "subtitle",
								name: "Subtitles",
								startTime: 0,
								duration: 10 * MEDIA_TIME_TICKS_PER_SECOND,
								trimStart: 0,
								trimEnd: 0,
								params: {},
								cues: [
									{
										text: "种子开始发芽",
										startTime: 5,
										duration: 2,
									},
								],
							},
						] as TimelineElement[],
					},
					{
						id: "graphic-track",
						type: "graphic",
						elements: [] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({ element }: { element: Omit<TimelineElement, "id"> }) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: "shotlyx-el-1",
				} as unknown as TimelineElement;
				scene.tracks.overlay[1]!.elements.push(insertedElement);
			},
		);
		const generateShotlyxMGComponent = mock(async (_args: unknown) => ({
			...shotlyxBattleCardFixture,
			name: "种子发芽 MG",
			durationSeconds: 2,
			sourcePrompt: "生成种子发芽 MG",
		}));

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset: mock(() => undefined),
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				generateShotlyxMGComponentFn: generateShotlyxMGComponent,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_component",
		);
		await generateTool?.handler({
			prompt: "生成种子发芽 MG",
			durationSeconds: 2,
			aspectRatio: "16:9",
			insertToTimeline: true,
		});

		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				startTime: subtitleStart,
			},
			placement: { mode: "explicit", trackId: "graphic-track" },
		});
	});

	test("shotlyx_generate_mg_component starts a backend job and saves streamed component results", async () => {
		let selectedElements: Array<{ trackId: string; elementId: string }> = [];
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						elements: [] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({ element }: { element: Omit<TimelineElement, "id"> }) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: "shotlyx-route-el-1",
				} as unknown as TimelineElement;
				scene.tracks.overlay[0]!.elements.push(insertedElement);
				selectedElements = [
					{ trackId: "graphic-track", elementId: "shotlyx-route-el-1" },
				];
			},
		);
		const upsertShotlyxMGAsset = mock(() => undefined);
		const fetchMock = mock(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				if (String(input) === "/api/agent/creative/mg-jobs") {
					return new Response(JSON.stringify({ jobId: "mg-job-1" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (String(input) === "/api/agent/creative/mg-jobs/mg-job-1/events") {
					return sseResponse([
						{
							type: "started",
							jobId: "mg-job-1",
							label: "MG 子智能体已启动",
							status: "running",
						},
						{
							type: "component-complete",
							jobId: "mg-job-1",
							index: 0,
							total: 1,
							label: "已生成后端生成 MG",
							document: {
								...shotlyxBattleCardFixture,
								name: "后端生成 MG",
								durationSeconds: 5,
							},
						},
						{
							type: "completed",
							jobId: "mg-job-1",
							label: "MG 子智能体已完成",
							status: "success",
						},
					]);
				}
				return new Response("not found", { status: 404 });
			},
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset,
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => selectedElements,
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				fetchFn: fetchMock,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_component",
		);
		const progressEvents: Array<{ label?: string; status?: string }> = [];
		const result = requireShotlyxMGJobResult(
			await generateTool?.handler(
				{
					prompt: "生成后端 route MG",
					durationSeconds: 5,
					aspectRatio: "16:9",
					insertToTimeline: true,
				},
				{
					onProgress: (event) => {
						progressEvents.push(event);
					},
				},
			),
		);

		expect(result).toMatchObject({
			jobId: "mg-job-1",
			runtime: "shotlyx-mg-job-v1",
			status: "completed",
			inserted: true,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe("/api/agent/creative/mg-jobs");
		expect(init?.method).toBe("POST");
		if (typeof init?.body !== "string") {
			throw new Error("Expected MG job request body to be a string");
		}
		expect(JSON.parse(init.body)).toMatchObject({
			prompt: "生成后端 route MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
			transparentBackground: true,
			componentCount: 1,
			maxOutputTokens: 12_000,
		});

		expect(upsertShotlyxMGAsset).toHaveBeenCalledTimes(2);
		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(scene.tracks.overlay[0]!.elements[0]?.name).toBe("后端生成 MG");
		expect(
			progressEvents.some((event) => event.label === "MG 子智能体已启动"),
		).toBe(true);
		expect(
			progressEvents.some((event) => event.label === "已生成后端生成 MG"),
		).toBe(true);
		expect(
			progressEvents.some((event) => event.label === "MG 子智能体已完成"),
		).toBe(true);
	});

	test("shotlyx_generate_mg_component saves streamed components before the job barrier", async () => {
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						elements: [] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({ element }: { element: Omit<TimelineElement, "id"> }) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: "shotlyx-barrier-el-1",
				} as TimelineElement;
				scene.tracks.overlay[0]!.elements.push(insertedElement);
			},
		);
		const upsertShotlyxMGAsset = mock(() => undefined);
		const encoder = new TextEncoder();
		let sendEvent!: (event: unknown) => void;
		let closeEvents!: () => void;
		const fetchMock = mock(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				if (String(input) === "/api/agent/creative/mg-jobs") {
					return new Response(JSON.stringify({ jobId: "mg-job-barrier" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (
					String(input) === "/api/agent/creative/mg-jobs/mg-job-barrier/events"
				) {
					return new Response(
						new ReadableStream({
							start(controller) {
								sendEvent = (event: unknown) => {
									controller.enqueue(
										encoder.encode(
											`event: job-event\ndata: ${JSON.stringify(event)}\n\n`,
										),
									);
								};
								closeEvents = () => controller.close();
							},
						}),
						{
							status: 200,
							headers: { "Content-Type": "text/event-stream" },
						},
					);
				}
				return new Response("not found", { status: 404 });
			},
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset,
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				fetchFn: fetchMock,
			},
		});
		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_component",
		);
		let handlerResolved = false;
		const resultPromise = Promise.resolve(
			generateTool?.handler({
				prompt: "生成 barrier MG",
				durationSeconds: 5,
				aspectRatio: "16:9",
				insertToTimeline: true,
			}),
		).then((result) => {
			handlerResolved = true;
			return result;
		});

		await waitForCondition({
			condition: () => fetchMock.mock.calls.length === 2,
		});
		sendEvent({
			type: "component-complete",
			jobId: "mg-job-barrier",
			index: 0,
			total: 1,
			label: "已生成 barrier MG",
			document: {
				...shotlyxBattleCardFixture,
				name: "barrier MG",
				durationSeconds: 5,
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(handlerResolved).toBe(false);
		expect(upsertShotlyxMGAsset).toHaveBeenCalledTimes(1);
		expect(insertElement).not.toHaveBeenCalled();

		sendEvent({
			type: "completed",
			jobId: "mg-job-barrier",
			label: "MG 子智能体已完成",
			status: "success",
			documents: [
				{
					...shotlyxBattleCardFixture,
					name: "barrier MG",
					durationSeconds: 5,
				},
			],
		});
		closeEvents();

		const result = requireShotlyxMGJobResult(await resultPromise);
		expect(result).toMatchObject({
			jobId: "mg-job-barrier",
			runtime: "shotlyx-mg-job-v1",
			status: "completed",
			inserted: true,
		});
		expect(upsertShotlyxMGAsset).toHaveBeenCalledTimes(2);
		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(scene.tracks.overlay[0]!.elements[0]?.name).toBe("barrier MG");
	});

	test("shotlyx_generate_mg_composition surfaces backend job errors to the caller", async () => {
		const fetchMock = mock(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				if (String(input) === "/api/agent/creative/mg-jobs") {
					return new Response(JSON.stringify({ jobId: "mg-job-error" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (
					String(input) === "/api/agent/creative/mg-jobs/mg-job-error/events"
				) {
					return sseResponse([
						{
							type: "started",
							jobId: "mg-job-error",
							label: "MG 子智能体已启动",
							status: "running",
						},
						{
							type: "error",
							jobId: "mg-job-error",
							label: "MG 子智能体失败",
							status: "error",
							error: "模型输出不可用",
						},
					]);
				}
				return new Response("not found", { status: 404 });
			},
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset: mock(() => undefined),
				},
				scenes: {
					getActiveSceneOrNull: () => null,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
			}),
			deps: {
				fetchFn: fetchMock,
			},
		});
		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_composition",
		);

		await expect(
			Promise.resolve(
				generateTool?.handler({
					prompt: "生成一个失败示例 MG",
					durationSeconds: 5,
					aspectRatio: "16:9",
					componentCount: 2,
					insertToTimeline: false,
				}),
			),
		).rejects.toThrow("模型输出不可用");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("shotlyx_generate_mg_composition defaults to custom generation when no template is selected", async () => {
		const routeBodies: unknown[] = [];
		const fetchMock = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input) === "/api/agent/creative/mg-jobs") {
					routeBodies.push(
						typeof init?.body === "string" ? JSON.parse(init.body) : null,
					);
					return new Response(JSON.stringify({ jobId: "mg-job-custom" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (
					String(input) === "/api/agent/creative/mg-jobs/mg-job-custom/events"
				) {
					return sseResponse([
						{
							type: "completed",
							jobId: "mg-job-custom",
							label: "MG 子智能体已完成",
							status: "success",
							documents: [
								{
									...shotlyxBattleCardFixture,
									name: "自定义数字雨",
									durationSeconds: 3,
								},
							],
						},
					]);
				}
				return new Response("not found", { status: 404 });
			},
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset: mock(() => undefined),
				},
				scenes: {
					getActiveSceneOrNull: () => null,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
			}),
			deps: {
				fetchFn: fetchMock,
			},
		});
		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_composition",
		);

		await generateTool?.handler({
			prompt: "Matrix-style digital rain character rain effect",
			durationSeconds: 3,
			aspectRatio: "16:9",
			componentCount: 1,
			insertToTimeline: false,
		});

		expect(routeBodies[0]).toMatchObject({
			templateMode: "off",
		});
		expect(routeBodies[0]).not.toMatchObject({
			templateId: expect.any(String),
		});
	});

	test("shotlyx_generate_mg_composition ignores non-builtin template ids for custom generation", async () => {
		const routeBodies: unknown[] = [];
		const fetchMock = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input) === "/api/agent/creative/mg-jobs") {
					routeBodies.push(
						typeof init?.body === "string" ? JSON.parse(init.body) : null,
					);
					return new Response(JSON.stringify({ jobId: "mg-job-custom" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (
					String(input) === "/api/agent/creative/mg-jobs/mg-job-custom/events"
				) {
					return sseResponse([
						{
							type: "completed",
							jobId: "mg-job-custom",
							label: "MG 子智能体已完成",
							status: "success",
							documents: [
								{
									...shotlyxBattleCardFixture,
									name: "自定义 MG",
									durationSeconds: 5,
								},
							],
						},
					]);
				}
				return new Response("not found", { status: 404 });
			},
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset: mock(() => undefined),
				},
				scenes: {
					getActiveSceneOrNull: () => null,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
			}),
			deps: {
				fetchFn: fetchMock,
			},
		});
		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_composition",
		);

		await generateTool?.handler({
			prompt: "自定义生成一个新的复杂 MG 动画",
			durationSeconds: 5,
			aspectRatio: "16:9",
			componentCount: 1,
			templateMode: "auto",
			templateId: "custom-template",
			insertToTimeline: false,
		});

		expect(routeBodies[0]).toMatchObject({
			templateMode: "auto",
		});
		expect(routeBodies[0]).not.toMatchObject({
			templateId: expect.any(String),
		});
	});

	test("shotlyx_generate_mg_component does not duplicate timeline inserts when a job event is replayed", async () => {
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						elements: [] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({ element }: { element: Omit<TimelineElement, "id"> }) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: `shotlyx-replay-el-${scene.tracks.overlay[0]!.elements.length + 1}`,
				} as TimelineElement;
				scene.tracks.overlay[0]!.elements.push(insertedElement);
			},
		);
		const upsertShotlyxMGAsset = mock(() => undefined);
		const replayedComponent = {
			type: "component-complete",
			jobId: "mg-job-replay",
			index: 0,
			total: 1,
			label: "已生成重连 MG",
			document: {
				...shotlyxBattleCardFixture,
				name: "重连 MG",
				durationSeconds: 5,
			},
		};
		const fetchMock = mock(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				if (String(input) === "/api/agent/creative/mg-jobs") {
					return new Response(JSON.stringify({ jobId: "mg-job-replay" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (
					String(input) === "/api/agent/creative/mg-jobs/mg-job-replay/events"
				) {
					return sseResponse([
						{
							type: "started",
							jobId: "mg-job-replay",
							label: "MG 子智能体已启动",
							status: "running",
						},
						replayedComponent,
						replayedComponent,
						{
							type: "completed",
							jobId: "mg-job-replay",
							label: "MG 子智能体已完成",
							status: "success",
						},
					]);
				}
				return new Response("not found", { status: 404 });
			},
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset,
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				fetchFn: fetchMock,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_component",
		);
		await generateTool?.handler({
			prompt: "生成可重连 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
			insertToTimeline: true,
		});

		expect(upsertShotlyxMGAsset).toHaveBeenCalledTimes(2);
		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(scene.tracks.overlay[0]!.elements).toHaveLength(1);
	});

	test("shotlyx_generate_mg_component can still use injected synchronous generator", async () => {
		let selectedElements: Array<{ trackId: string; elementId: string }> = [];
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						elements: [] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({ element }: { element: Omit<TimelineElement, "id"> }) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: "shotlyx-route-el-1",
				} as unknown as TimelineElement;
				scene.tracks.overlay[0]!.elements.push(insertedElement);
				selectedElements = [
					{ trackId: "graphic-track", elementId: "shotlyx-route-el-1" },
				];
			},
		);
		const upsertShotlyxMGAsset = mock(() => undefined);
		const generateShotlyxMGComponent = mock(async () => ({
			...shotlyxBattleCardFixture,
			name: "后端生成 MG",
			durationSeconds: 5,
		}));

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset,
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => selectedElements,
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				generateShotlyxMGComponentFn: generateShotlyxMGComponent,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_component",
		);
		const result = requireShotlyxMGComponentResult(
			await generateTool?.handler({
				prompt: "生成后端 route MG",
				durationSeconds: 5,
				aspectRatio: "16:9",
				insertToTimeline: true,
			}),
		);

		expect(generateShotlyxMGComponent).toHaveBeenCalledTimes(1);
		expect(generateShotlyxMGComponent.mock.calls[0]?.[0]).toMatchObject({
			transparentBackground: true,
		});
		expect(result.name).toBe("后端生成 MG");
		expect(result.trackId).toBe("graphic-track");
		expect(result.elementId).toBe("shotlyx-route-el-1");
	});

	test("shotlyx_generate_mg_composition adds smart MG guidance when called directly", async () => {
		const upsertShotlyxMGAsset = mock(() => undefined);
		const generateShotlyxMGComponent = mock(
			async ({
				prompt,
				durationSeconds,
			}: {
				prompt: string;
				durationSeconds?: number;
			}) => ({
				...shotlyxBattleCardFixture,
				name: `智能组合层 ${prompt.includes("标题大字展示") ? "1" : "x"}`,
				durationSeconds: durationSeconds ?? 5,
				sourcePrompt: prompt,
			}),
		);

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset,
				},
				scenes: {
					getActiveSceneOrNull: () => null,
				},
				selection: {
					getSelectedElements: () => [],
				},
				playback: {
					getCurrentTime: () => 0,
				},
			}),
			deps: {
				generateShotlyxMGComponentFn: generateShotlyxMGComponent,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_composition",
		);
		await generateTool?.handler({
			prompt: "生成一个近十年来中国人口变化的折线图",
			durationSeconds: 5,
			aspectRatio: "16:9",
			componentCount: 4,
			insertToTimeline: false,
		});

		expect(generateShotlyxMGComponent).toHaveBeenCalledTimes(4);
		const firstCall = generateShotlyxMGComponent.mock.calls[0]?.[0];
		if (typeof firstCall !== "object" || firstCall === null) {
			throw new Error("Expected first MG generation call");
		}
		const firstPrompt = Reflect.get(firstCall, "prompt");
		const firstStyleGuide = Reflect.get(firstCall, "styleGuide");
		expect(firstStyleGuide).toContain("Remotion 视频图形包装风格");
		expect(Reflect.get(firstCall, "transparentBackground")).toBe(true);
		expect(firstPrompt).toContain("只允许使用 Remotion / Shotlyx Component");
		expect(firstPrompt).toContain("不能保留");
		expect(firstPrompt).toContain("像高质量视频图形包装");
	});

	test("shotlyx_generate_mg_composition emits progress while saving multiple editable assets", async () => {
		let selectedElements: Array<{ trackId: string; elementId: string }> = [];
		const scene = {
			tracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						elements: [] as TimelineElement[],
					},
				],
				audio: [],
			},
		};
		const insertElement = mock(
			({ element }: { element: Omit<TimelineElement, "id"> }) => {
				const elementId = `shotlyx-el-${scene.tracks.overlay[0]!.elements.length + 1}`;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				const insertedElement = {
					...element,
					id: elementId,
				} as unknown as TimelineElement;
				scene.tracks.overlay[0]!.elements.push(insertedElement);
				selectedElements = [{ trackId: "graphic-track", elementId }];
			},
		);
		const upsertShotlyxMGAsset = mock(() => undefined);
		const generateShotlyxMGComponent = mock(
			async ({
				prompt,
				durationSeconds,
			}: {
				prompt: string;
				durationSeconds?: number;
			}) => {
				const explicitName = prompt
					.match(/MG asset name:\s*([^\n]+)/)?.[1]
					?.trim();
				return {
					...shotlyxBattleCardFixture,
					name: explicitName ?? "自定义 MG",
					durationSeconds: durationSeconds ?? 8,
					sourcePrompt: prompt,
				};
			},
		);
		const progressEvents: Array<{
			label?: string;
			status?: string;
			detail?: string;
		}> = [];

		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
					upsertShotlyxMGAsset,
				},
				scenes: {
					getActiveSceneOrNull: () => scene,
				},
				selection: {
					getSelectedElements: () => selectedElements,
				},
				playback: {
					getCurrentTime: () => 0,
				},
				timeline: {
					insertElement,
				},
			}),
			deps: {
				generateShotlyxMGComponentFn: generateShotlyxMGComponent,
			},
		});

		const generateTool = tools.find(
			(tool) => tool.name === "shotlyx_generate_mg_composition",
		);
		const result = await generateTool?.handler(
			{
				prompt: "做一个中国人口近十年变化折线图 MG",
				durationSeconds: 8,
				aspectRatio: "16:9",
				componentCount: 3,
			},
			{
				onProgress: (event) => {
					progressEvents.push(event);
				},
			},
		);

		expect(generateShotlyxMGComponent).toHaveBeenCalledTimes(3);
		expect(generateShotlyxMGComponent.mock.calls[0]?.[0]).toMatchObject({
			durationSeconds: 2.6667,
			transparentBackground: true,
		});
		expect(generateShotlyxMGComponent.mock.calls[0]?.[0]?.prompt).toContain(
			"不要从固定模板类型中选择",
		);
		expect(
			generateShotlyxMGComponent.mock.calls.map(
				(call) => call[0]?.durationSeconds,
			),
		).toEqual([2.6667, 2.6667, 2.6667]);
		expect(upsertShotlyxMGAsset).toHaveBeenCalledTimes(3);
		expect(insertElement).toHaveBeenCalledTimes(0);
		expect(result).toMatchObject({
			runtime: "shotlyx-mg-composition-v1",
			inserted: false,
			remotionSkill: {
				source: {
					repository: "https://github.com/remotion-dev/skills",
				},
				selectedRules: expect.arrayContaining([
					expect.objectContaining({ id: "animations" }),
				]),
			},
			directorPlan: {
				components: [
					expect.objectContaining({
						sceneId: "custom-segment-1",
						durationSeconds: 2.6667,
					}),
					expect.objectContaining({
						sceneId: "custom-segment-2",
						durationSeconds: 2.6667,
					}),
					expect.objectContaining({
						sceneId: "custom-segment-3",
						durationSeconds: 2.6667,
					}),
				],
			},
			components: [
				expect.objectContaining({
					componentId: "custom-segment-1",
					label: "自定义片段 1/3",
					name: expect.stringContaining("自定义片段 1/3"),
					durationSeconds: 2.6667,
				}),
				expect.objectContaining({
					componentId: "custom-segment-2",
					label: "自定义片段 2/3",
					name: expect.stringContaining("自定义片段 2/3"),
					durationSeconds: 2.6667,
				}),
				expect.objectContaining({
					componentId: "custom-segment-3",
					label: "自定义片段 3/3",
					name: expect.stringContaining("自定义片段 3/3"),
					durationSeconds: 2.6667,
				}),
			],
		});
		expect(
			progressEvents.some((event) => event.label === "已加载 Remotion Skill"),
		).toBe(true);
		expect(
			progressEvents.some((event) => event.label === "已规划 MG Director 分镜"),
		).toBe(true);
		expect(
			progressEvents.some((event) => event.label === "生成自定义片段 1/3"),
		).toBe(true);
		expect(
			progressEvents.some((event) =>
				event.label?.includes("已生成自定义片段 1/3"),
			),
		).toBe(true);
		expect(
			progressEvents.some((event) =>
				event.label?.includes("已生成自定义片段 3/3"),
			),
		).toBe(true);
		expect(scene.tracks.overlay[0]!.elements).toHaveLength(0);
		expect(insertElement).not.toHaveBeenCalled();
	});

	test("creative_update_mg_animation patches selected MG params", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		let element = {
			id: "mg-el-1",
			type: "graphic",
			name: "Battle",
			definitionId: "mg-battle-card",
			startTime: 0,
			duration: 10,
			trimStart: 0,
			trimEnd: 0,
			params: {
				title: "Old title",
				accentColor: "#f5b83d",
			},
		} as unknown as TimelineElement;
		const updateElements = mock(
			({
				updates,
			}: {
				updates: Array<{
					patch: { params?: Record<string, unknown> };
				}>;
			}) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				element = {
					...element,
					params: {
						...element.params,
						...(updates[0]?.patch.params ?? {}),
					},
				} as unknown as TimelineElement;
			},
		);
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveBrandKit: () => null,
				},
				scenes: {
					getActiveSceneOrNull: () => ({
						tracks: {
							main: { id: "main", type: "video", elements: [] },
							overlay: [
								{
									id: "graphic-track",
									type: "graphic",
									elements: [element],
								},
							],
							audio: [],
						},
					}),
				},
				selection: {
					getSelectedElements: () => [
						{ trackId: "graphic-track", elementId: "mg-el-1" },
					],
				},
				timeline: {
					updateElements,
				},
			}),
		});

		const updateTool = tools.find(
			(tool) => tool.name === "creative_update_mg_animation",
		);
		const result = updateTool?.handler({
			props: { title: "New title", accentColor: "#76b900" },
		});

		expect(result).toMatchObject({
			updated: true,
			trackId: "graphic-track",
			elementId: "mg-el-1",
		});
		expect(element.params.title).toBe("New title");
		expect(element.params.accentColor).toBe("#76b900");
		expect(updateElements).toHaveBeenCalledTimes(1);
	});

	test("creative_update_mg_animation patches selected Shotlyx Remotion params", () => {
		const shotlyxAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component" as const,
			name: "Shotlyx Title",
			runtime: "shotlyx-remotion-component-v1" as const,
			document: shotlyxBattleCardFixture,
			sourcePrompt: "title card",
			createdAt: "",
			updatedAt: "",
		};
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		let element = {
			id: "shotlyx-el-1",
			type: "graphic",
			name: "Shotlyx Title",
			definitionId: "shotlyx-remotion-component",
			motionGraphicAssetId: shotlyxAsset.id,
			motionGraphicBaseParams: {
				shotlyxMGAssetId: shotlyxAsset.id,
				progress: 1,
			},
			startTime: 0,
			duration: 10,
			trimStart: 0,
			trimEnd: 0,
			params: {
				"transform.positionX": 0,
				"transform.positionY": 0,
				title: "Old title",
			},
		} as unknown as TimelineElement;
		const updateElements = mock(
			({
				updates,
			}: {
				updates: Array<{
					patch: { params?: Record<string, unknown> };
				}>;
			}) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				element = {
					...element,
					params: {
						...element.params,
						...(updates[0]?.patch.params ?? {}),
					},
				} as unknown as TimelineElement;
			},
		);
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getActiveBrandKit: () => null,
					getShotlyxMGAsset: ({ id }: { id: string }) =>
						id === shotlyxAsset.id ? shotlyxAsset : null,
				},
				scenes: {
					getActiveSceneOrNull: () => ({
						tracks: {
							main: { id: "main", type: "video", elements: [] },
							overlay: [
								{
									id: "graphic-track",
									type: "graphic",
									elements: [element],
								},
							],
							audio: [],
						},
					}),
				},
				selection: {
					getSelectedElements: () => [
						{ trackId: "graphic-track", elementId: "shotlyx-el-1" },
					],
				},
				timeline: {
					updateElements,
				},
			}),
		});

		const updateTool = tools.find(
			(tool) => tool.name === "creative_update_mg_animation",
		);
		const result = updateTool?.handler({
			props: { title: "New title", accentColor: "#76b900" },
		});

		expect(result).toMatchObject({
			updated: true,
			trackId: "graphic-track",
			elementId: "shotlyx-el-1",
			renderer: "shotlyx-remotion-component-v1",
			motionGraphicAssetId: shotlyxAsset.id,
			props: { title: "New title", accentColor: "#76b900" },
		});
		expect(element.params.title).toBe("New title");
		expect(element.params.accentColor).toBe("#76b900");
		expect(updateElements).toHaveBeenCalledTimes(1);
	});

	test("creative_update_mg_animation toggles selected Shotlyx Remotion background transparency", () => {
		const shotlyxAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component" as const,
			name: "Shotlyx Title",
			runtime: "shotlyx-remotion-component-v1" as const,
			document: shotlyxBattleCardFixture,
			sourcePrompt: "title card",
			createdAt: "",
			updatedAt: "",
		};
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		let element = {
			id: "shotlyx-el-1",
			type: "graphic",
			name: "Shotlyx Title",
			definitionId: "shotlyx-remotion-component",
			motionGraphicAssetId: shotlyxAsset.id,
			startTime: 0,
			duration: 10,
			trimStart: 0,
			trimEnd: 0,
			params: {
				backgroundColor: "#0f172a",
			},
		} as unknown as TimelineElement;
		const updateElements = mock(
			({
				updates,
			}: {
				updates: Array<{
					patch: { params?: Record<string, unknown> };
				}>;
			}) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				element = {
					...element,
					params: {
						...element.params,
						...(updates[0]?.patch.params ?? {}),
					},
				} as unknown as TimelineElement;
			},
		);
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getShotlyxMGAsset: ({ id }: { id: string }) =>
						id === shotlyxAsset.id ? shotlyxAsset : null,
				},
				scenes: {
					getActiveSceneOrNull: () => ({
						tracks: {
							main: { id: "main", type: "video", elements: [] },
							overlay: [
								{
									id: "graphic-track",
									type: "graphic",
									elements: [element],
								},
							],
							audio: [],
						},
					}),
				},
				selection: {
					getSelectedElements: () => [
						{ trackId: "graphic-track", elementId: "shotlyx-el-1" },
					],
				},
				timeline: {
					updateElements,
				},
			}),
		});

		const updateTool = tools.find(
			(tool) => tool.name === "creative_update_mg_animation",
		);
		const result = updateTool?.handler({
			transparentBackground: true,
		});

		expect(result).toMatchObject({
			updated: true,
			transparentBackground: true,
			backgroundPropKeys: ["backgroundColor"],
			props: { backgroundColor: "transparent" },
		});
		expect(element.params.backgroundColor).toBe("transparent");
		expect(updateElements).toHaveBeenCalledTimes(1);
	});

	test("creative_update_mg_animation patches selected Shotlyx Remotion opacity", () => {
		const shotlyxAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component" as const,
			name: "Shotlyx Title",
			runtime: "shotlyx-remotion-component-v1" as const,
			document: shotlyxBattleCardFixture,
			sourcePrompt: "title card",
			createdAt: "",
			updatedAt: "",
		};
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		let element = {
			id: "shotlyx-el-1",
			type: "graphic",
			name: "Shotlyx Title",
			definitionId: "shotlyx-remotion-component",
			motionGraphicAssetId: shotlyxAsset.id,
			startTime: 0,
			duration: 10,
			trimStart: 0,
			trimEnd: 0,
			params: {
				title: "Old title",
				opacity: 1,
			},
		} as unknown as TimelineElement;
		const updateElements = mock(
			({
				updates,
			}: {
				updates: Array<{
					patch: { params?: Record<string, unknown> };
				}>;
			}) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				element = {
					...element,
					params: {
						...element.params,
						...(updates[0]?.patch.params ?? {}),
					},
				} as unknown as TimelineElement;
			},
		);
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getShotlyxMGAsset: ({ id }: { id: string }) =>
						id === shotlyxAsset.id ? shotlyxAsset : null,
				},
				scenes: {
					getActiveSceneOrNull: () => ({
						tracks: {
							main: { id: "main", type: "video", elements: [] },
							overlay: [
								{
									id: "graphic-track",
									type: "graphic",
									elements: [element],
								},
							],
							audio: [],
						},
					}),
				},
				selection: {
					getSelectedElements: () => [
						{ trackId: "graphic-track", elementId: "shotlyx-el-1" },
					],
				},
				timeline: {
					updateElements,
				},
			}),
		});

		const updateTool = tools.find(
			(tool) => tool.name === "creative_update_mg_animation",
		);
		const result = updateTool?.handler({
			props: { opacity: 0.45 },
		});

		expect(result).toMatchObject({
			updated: true,
			trackId: "graphic-track",
			elementId: "shotlyx-el-1",
			props: {},
			instanceParams: { opacity: 0.45 },
			renderer: "shotlyx-remotion-component-v1",
		});
		expect(element.params.opacity).toBe(0.45);
		expect(updateElements).toHaveBeenCalledTimes(1);
	});

	test("creative_update_mg_animation rejects invalid Shotlyx Remotion opacity", () => {
		const shotlyxAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component" as const,
			name: "Shotlyx Title",
			runtime: "shotlyx-remotion-component-v1" as const,
			document: shotlyxBattleCardFixture,
			sourcePrompt: "title card",
			createdAt: "",
			updatedAt: "",
		};
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const element = {
			id: "shotlyx-el-1",
			type: "graphic",
			name: "Shotlyx Title",
			definitionId: "shotlyx-remotion-component",
			motionGraphicAssetId: shotlyxAsset.id,
			startTime: 0,
			duration: 10,
			trimStart: 0,
			trimEnd: 0,
			params: { opacity: 1 },
		} as unknown as TimelineElement;
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getShotlyxMGAsset: ({ id }: { id: string }) =>
						id === shotlyxAsset.id ? shotlyxAsset : null,
				},
				scenes: {
					getActiveSceneOrNull: () => ({
						tracks: {
							main: { id: "main", type: "video", elements: [] },
							overlay: [
								{
									id: "graphic-track",
									type: "graphic",
									elements: [element],
								},
							],
							audio: [],
						},
					}),
				},
				selection: {
					getSelectedElements: () => [
						{ trackId: "graphic-track", elementId: "shotlyx-el-1" },
					],
				},
			}),
		});

		const updateTool = tools.find(
			(tool) => tool.name === "creative_update_mg_animation",
		);

		expect(() =>
			updateTool?.handler({
				props: { opacity: 2 },
			}),
		).toThrow('"opacity" 必须在 0 到 1 之间');
	});

	test("creative_update_mg_asset patches a Shotlyx Remotion asset", () => {
		let asset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component" as const,
			name: "Shotlyx Title",
			runtime: "shotlyx-remotion-component-v1" as const,
			document: shotlyxBattleCardFixture,
			sourcePrompt: "title card",
			createdAt: "2026-05-16T00:00:00.000Z",
			updatedAt: "2026-05-16T00:00:00.000Z",
		};
		const upsertShotlyxMGAsset = mock(
			({ asset: nextAsset }: { asset: typeof asset }) => {
				asset = nextAsset;
			},
		);
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getShotlyxMGAsset: ({ id }: { id: string }) =>
						id === asset.id ? asset : null,
					getShotlyxMGAssets: () => [asset],
					upsertShotlyxMGAsset,
				},
			}),
		});

		const updateTool = tools.find(
			(tool) => tool.name === "creative_update_mg_asset",
		);
		const result = updateTool?.handler({
			motionGraphicAssetId: "shotlyx-asset-1",
			newName: "Updated Shotlyx Title",
			durationSeconds: 4,
			transparentBackground: true,
			props: { title: "New title", accentColor: "#76b900" },
		});

		expect(result).toMatchObject({
			updated: true,
			shotlyxMGAssetId: "shotlyx-asset-1",
			motionGraphicAssetId: "shotlyx-asset-1",
			name: "Updated Shotlyx Title",
			durationSeconds: 4,
			transparentBackground: true,
			renderer: "shotlyx-remotion-component-v1",
			props: {
				title: "New title",
				accentColor: "#76b900",
				backgroundColor: "transparent",
			},
		});
		expect(asset.name).toBe("Updated Shotlyx Title");
		expect(asset.document.name).toBe("Updated Shotlyx Title");
		expect(asset.document.durationSeconds).toBe(4);
		expect(asset.document.defaultProps.title).toBe("New title");
		expect(asset.document.defaultProps.accentColor).toBe("#76b900");
		expect(asset.document.defaultProps.backgroundColor).toBe("transparent");
		expect(asset.document.transparentBackground).toBe(true);
		expect(upsertShotlyxMGAsset).toHaveBeenCalledTimes(1);
	});

	test("creative_get_mg_animation_schema returns Shotlyx Remotion schema", () => {
		const shotlyxAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component" as const,
			name: "Shotlyx Title",
			runtime: "shotlyx-remotion-component-v1" as const,
			document: shotlyxBattleCardFixture,
			sourcePrompt: "title card",
			createdAt: "",
			updatedAt: "",
		};
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const element = {
			id: "shotlyx-el-1",
			type: "graphic",
			name: "Shotlyx Title",
			definitionId: "shotlyx-remotion-component",
			motionGraphicAssetId: shotlyxAsset.id,
			startTime: 0,
			duration: 10,
			trimStart: 0,
			trimEnd: 0,
			params: {
				title: "Instance title",
				opacity: 0.7,
			},
		} as unknown as TimelineElement;
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getShotlyxMGAsset: ({ id }: { id: string }) =>
						id === shotlyxAsset.id ? shotlyxAsset : null,
				},
				scenes: {
					getActiveSceneOrNull: () => ({
						tracks: {
							main: { id: "main", type: "video", elements: [] },
							overlay: [
								{
									id: "graphic-track",
									type: "graphic",
									elements: [element],
								},
							],
							audio: [],
						},
					}),
				},
				selection: {
					getSelectedElements: () => [
						{ trackId: "graphic-track", elementId: "shotlyx-el-1" },
					],
				},
			}),
		});

		const schemaTool = tools.find(
			(tool) => tool.name === "creative_get_mg_animation_schema",
		);
		const result = schemaTool?.handler({});

		expect(result).toMatchObject({
			trackId: "graphic-track",
			elementId: "shotlyx-el-1",
			shotlyxMGAssetId: "shotlyx-asset-1",
			definitionId: "shotlyx-remotion-component",
			renderer: "shotlyx-remotion-component-v1",
			params: {
				title: "Instance title",
				subtitle: "Editable Remotion component",
			},
			instanceParams: {
				opacity: 0.7,
			},
			editableInstanceParams: [
				expect.objectContaining({
					key: "opacity",
					type: "number",
					min: 0,
					max: 1,
				}),
			],
		});
	});

	test("creative_update_mg_asset patches a reusable MG asset", () => {
		let asset: {
			id: string;
			name: string;
			engine: "opencut-graphic-v1";
			definitionId: string;
			kind: "battle-card";
			duration: number;
			params: Record<string, string | number | boolean>;
			sourcePrompt?: string;
			createdAt: string;
			updatedAt: string;
			manifest?: {
				definitionId?: string;
				editableParams?: Array<{ key: string; value: unknown }>;
			};
		} = {
			id: "mg-asset-1",
			name: "Battle Asset",
			engine: "opencut-graphic-v1",
			definitionId: "mg-battle-card",
			kind: "battle-card",
			duration: 1_200_000,
			sourcePrompt: "NVIDIA vs AMD",
			params: {
				title: "Old title",
				rightColor: "#5f7f24",
				progress: 1,
			},
			createdAt: "",
			updatedAt: "",
		};
		const upsertMotionGraphicAsset = mock(
			({ asset: nextAsset }: { asset: typeof asset }) => {
				asset = nextAsset;
			},
		);
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getMotionGraphicAsset: ({ id }: { id: string }) =>
						id === asset.id ? asset : null,
					getMotionGraphicAssets: () => [asset],
					upsertMotionGraphicAsset,
				},
			}),
		});

		const updateTool = tools.find(
			(tool) => tool.name === "creative_update_mg_asset",
		);
		const result = updateTool?.handler({
			motionGraphicAssetId: "mg-asset-1",
			newName: "Updated Battle",
			durationSeconds: 4,
			props: { title: "New title", rightColor: "#76b900" },
		});

		expect(result).toMatchObject({
			updated: true,
			motionGraphicAssetId: "mg-asset-1",
			name: "Updated Battle",
			durationSeconds: 4,
			props: { title: "New title", rightColor: "#76b900" },
		});
		expect(asset.name).toBe("Updated Battle");
		expect(asset.duration).toBe(480_000);
		expect(asset.params.title).toBe("New title");
		expect(asset.params.rightColor).toBe("#76b900");
		expect(asset.params.progress).toBe(1);
		expect(asset.manifest?.definitionId).toBe("mg-battle-card");
		expect(
			asset.manifest?.editableParams?.find(
				(param) => param.key === "rightColor",
			)?.value,
		).toBe("#76b900");
		expect(upsertMotionGraphicAsset).toHaveBeenCalledTimes(1);
	});

	test("creative_get_mg_asset_schema returns reusable MG manifest", () => {
		const asset = {
			id: "mg-asset-1",
			name: "Battle Asset",
			engine: "opencut-graphic-v1",
			definitionId: "mg-battle-card",
			kind: "battle-card",
			duration: 1_200_000,
			sourcePrompt: "NVIDIA vs AMD",
			params: {
				title: "NVIDIA vs AMD",
				rightColor: "#76b900",
				progress: 1,
			},
			createdAt: "2026-05-16T00:00:00.000Z",
			updatedAt: "2026-05-16T00:00:00.000Z",
		};
		const tools = buildCreativeTools({
			editor: asEditorCore({
				project: {
					getMotionGraphicAsset: ({ id }: { id: string }) =>
						id === asset.id ? asset : null,
					getMotionGraphicAssets: () => [asset],
				},
			}),
		});

		const schemaTool = tools.find(
			(tool) => tool.name === "creative_get_mg_asset_schema",
		);
		const result = schemaTool?.handler({
			assetName: "battle",
		});

		expect(result).toMatchObject({
			motionGraphicAssetId: "mg-asset-1",
			name: "Battle Asset",
			definitionId: "mg-battle-card",
			durationSeconds: 10,
			manifest: {
				version: 1,
				definitionId: "mg-battle-card",
			},
		});
	});

	test("creative_import_asset imports a stored image asset", async () => {
		const asset = registerCreativeAsset({
			type: "image",
			provider: "openai-compatible",
			title: "Generated",
			url: "data:image/png;base64,ZmFrZQ==",
			previewUrl: "data:image/png;base64,ZmFrZQ==",
			prompt: "Generated",
			model: "test-model",
		});

		const addMediaAsset = mock(async () => ({
			id: "media-1",
			name: "generated.png",
			type: "image" as const,
			file: new File(["fake image"], "generated.png", {
				type: "image/png",
			}),
			url: "blob:generated",
		}));
		const editor = {
			project: {
				getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
			},
			media: {
				addMediaAsset,
			},
		};

		const tools = buildCreativeTools({
			editor: asEditorCore(editor),
			deps: {
				fetchFn: async () =>
					new Response(new Blob(["fake image"], { type: "image/png" })),
				processMediaAssetsFn: async () => [
					{
						name: "generated.png",
						type: "image",
						file: new File(["fake image"], "generated.png", {
							type: "image/png",
						}),
						url: "blob:generated",
						width: 1024,
						height: 1024,
					},
				],
			},
		});

		const importTool = tools.find(
			(tool) => tool.name === "creative_import_asset",
		);
		const result = await importTool?.handler({ assetId: asset.id });

		expect(addMediaAsset).toHaveBeenCalledTimes(1);
		expect(addMediaAsset.mock.calls[0]?.[0]).toMatchObject({
			projectId: "project-1",
			asset: {
				ephemeral: false,
			},
		});
		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			name: "generated.png",
			type: "image",
			title: "Generated",
			sizeBytes: 10,
			previewUrl: "blob:generated",
		});
	});
});
