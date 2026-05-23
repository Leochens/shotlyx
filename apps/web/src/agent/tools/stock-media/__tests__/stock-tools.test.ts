import { afterEach, describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import {
	clearStockAssets,
	registerStockAsset,
} from "@/agent/tools/stock-media/stock-asset-store";
import { buildStockMediaTools } from "@/agent/tools/stock-media/stock-tools";

afterEach(() => {
	clearStockAssets();
	mock.restore();
});

function asEditorCore(value: unknown): EditorCore {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return value as EditorCore;
}

function requireSearchResult(value: unknown): {
	candidates: Array<{
		id: string;
		provider: string;
		type: string;
		sourceUrl: string;
	}>;
} {
	if (
		typeof value !== "object" ||
		value === null ||
		!("candidates" in value) ||
		!Array.isArray(value.candidates)
	) {
		throw new Error("Expected stock search result");
	}

	return {
		candidates: value.candidates.map((item) => {
			if (typeof item !== "object" || item === null) {
				throw new Error("Expected stock candidate");
			}
			const id = "id" in item ? item.id : undefined;
			const provider = "provider" in item ? item.provider : undefined;
			const type = "type" in item ? item.type : undefined;
			const sourceUrl = "sourceUrl" in item ? item.sourceUrl : undefined;
			if (
				typeof id !== "string" ||
				typeof provider !== "string" ||
				typeof type !== "string" ||
				typeof sourceUrl !== "string"
			) {
				throw new Error("Expected stock candidate shape");
			}
			return { id, provider, type, sourceUrl };
		}),
	};
}

describe("stock media tools", () => {
	test("stock_search_media stores returned candidates", async () => {
		const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/agent/stock/search");
			expect(init?.method).toBe("POST");
			expect(JSON.parse(String(init?.body))).toMatchObject({
				query: "office work",
				type: "video",
				orientation: "landscape",
				count: 2,
			});

			return new Response(
				JSON.stringify({
					candidates: [
						{
							provider: "pexels",
							providerAssetId: "123",
							type: "video",
							title: "Office work",
							previewUrl: "https://cdn.example.com/office-preview.mp4",
							downloadUrl: "https://cdn.example.com/office.mp4",
							sourceUrl: "https://www.pexels.com/video/office-123/",
							width: 1920,
							height: 1080,
							durationSeconds: 8,
							license: {
								name: "Pexels License",
								attributionRequired: false,
								commercialUse: true,
								sourceProvider: "pexels",
								sourceUrl: "https://www.pexels.com/video/office-123/",
								verifiedAt: "2026-05-18T00:00:00.000Z",
							},
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});
		const tools = buildStockMediaTools({
			editor: asEditorCore({}),
			deps: { fetchFn: fetchMock },
		});
		const searchTool = tools.find((tool) => tool.name === "stock_search_media");

		const result = requireSearchResult(
			await searchTool?.handler({
				query: "office work",
				type: "video",
				orientation: "landscape",
				count: 2,
			}),
		);

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]?.id).toStartWith("stock_");
		expect(result.candidates[0]?.provider).toBe("pexels");
		expect(result.candidates[0]?.sourceUrl).toBe(
			"https://www.pexels.com/video/office-123/",
		);
	});

	test("stock_search_media can request public-domain audio candidates", async () => {
		const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/agent/stock/search");
			expect(JSON.parse(String(init?.body))).toMatchObject({
				query: "camera click",
				type: "audio",
				licensePolicy: "public-domain-only",
				providers: ["freesound"],
			});

			return new Response(
				JSON.stringify({
					candidates: [
						{
							provider: "freesound",
							providerAssetId: "789",
							type: "audio",
							title: "Camera click.wav",
							previewUrl: "https://cdn.freesound.org/previews/789.mp3",
							downloadUrl: "https://cdn.freesound.org/previews/789.mp3",
							sourceUrl: "https://freesound.org/people/jane/sounds/789/",
							durationSeconds: 1.2,
							license: {
								name: "Creative Commons 0",
								attributionRequired: false,
								commercialUse: true,
								sourceProvider: "freesound",
								sourceUrl: "https://freesound.org/people/jane/sounds/789/",
								verifiedAt: "2026-05-18T00:00:00.000Z",
							},
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});
		const tools = buildStockMediaTools({
			editor: asEditorCore({}),
			deps: { fetchFn: fetchMock },
		});
		const searchTool = tools.find((tool) => tool.name === "stock_search_media");

		const result = requireSearchResult(
			await searchTool?.handler({
				query: "camera click",
				type: "audio",
				licensePolicy: "public-domain-only",
				providers: ["freesound"],
			}),
		);

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]?.provider).toBe("freesound");
		expect(result.candidates[0]?.type).toBe("audio");
	});

	test("stock_import_media downloads and saves a stored stock candidate", async () => {
		const candidate = registerStockAsset({
			provider: "pixabay",
			providerAssetId: "456",
			type: "video",
			title: "City night",
			previewUrl: "https://cdn.example.com/city-preview.mp4",
			downloadUrl: "https://cdn.example.com/city.mp4",
			sourceUrl: "https://pixabay.com/videos/city-456/",
			width: 1280,
			height: 720,
			durationSeconds: 6,
			author: {
				name: "City Shooter",
				url: "https://pixabay.com/users/city-78/",
			},
			license: {
				name: "Pixabay Content License",
				attributionRequired: false,
				commercialUse: true,
				sourceProvider: "pixabay",
				sourceUrl: "https://pixabay.com/videos/city-456/",
				verifiedAt: "2026-05-18T00:00:00.000Z",
			},
		});
		const addMediaAsset = mock(
			async ({ asset }: { asset: Omit<MediaAsset, "id"> }) => ({
				...asset,
				id: "media-1",
			}),
		);
		const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/agent/stock/download");
			expect(init?.method).toBe("POST");
			expect(JSON.parse(String(init?.body))).toMatchObject({
				candidate: {
					id: candidate.id,
					provider: "pixabay",
					providerAssetId: "456",
				},
			});
			return new Response(new Blob(["fake video"], { type: "video/mp4" }), {
				status: 200,
				headers: { "Content-Type": "video/mp4" },
			});
		});
		const tools = buildStockMediaTools({
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
				processMediaAssetsFn: async ({ files }) => [
					{
						name: files[0]?.name ?? "downloaded.mp4",
						type: "video",
						file: files[0],
						width: 1280,
						height: 720,
						duration: 6,
					},
				],
			},
		});
		const importTool = tools.find((tool) => tool.name === "stock_import_media");

		const result = await importTool?.handler({ candidateId: candidate.id });

		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			name: "City night.mp4",
			type: "video",
			title: "City night",
			width: 1280,
			height: 720,
			sourceUrl: "https://pixabay.com/videos/city-456/",
			license: {
				name: "Pixabay Content License",
				attributionRequired: false,
			},
		});
		expect(addMediaAsset).toHaveBeenCalledTimes(1);
		expect(addMediaAsset.mock.calls[0]?.[0]).toMatchObject({
			projectId: "project-1",
			asset: {
				externalSource: {
					provider: "pixabay",
					providerAssetId: "456",
					sourceUrl: "https://pixabay.com/videos/city-456/",
					license: {
						name: "Pixabay Content License",
					},
				},
			},
		});
	});

	test("autocut_insert_broll searches, imports, and inserts top stock candidates", async () => {
		const insertElement = mock(() => {});
		const addTrack = mock(() => "broll-track");
		const addMediaAsset = mock(
			async ({ asset }: { asset: Omit<MediaAsset, "id"> }) => ({
				...asset,
				id: "media-broll-1",
			}),
		);
		const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input) === "/api/agent/stock/search") {
				expect(init?.method).toBe("POST");
				expect(JSON.parse(String(init?.body))).toMatchObject({
					query: "people editing videos",
					type: "video",
					count: 3,
				});
				return new Response(
					JSON.stringify({
						candidates: [
							{
								provider: "pexels",
								providerAssetId: "123",
								type: "video",
								title: "People editing videos",
								previewUrl: "https://cdn.example.com/preview.mp4",
								downloadUrl: "https://cdn.example.com/video.mp4",
								sourceUrl: "https://www.pexels.com/video/editing-123/",
								width: 1920,
								height: 1080,
								durationSeconds: 8,
								license: {
									name: "Pexels License",
									attributionRequired: false,
									commercialUse: true,
									sourceProvider: "pexels",
									sourceUrl: "https://www.pexels.com/video/editing-123/",
									verifiedAt: "2026-05-18T00:00:00.000Z",
								},
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}

			expect(String(input)).toBe("/api/agent/stock/download");
			return new Response(new Blob(["fake broll"], { type: "video/mp4" }), {
				status: 200,
				headers: { "Content-Type": "video/mp4" },
			});
		});
		const tools = buildStockMediaTools({
			editor: asEditorCore({
				project: {
					getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
				},
				scenes: {
					getActiveSceneOrNull: () => ({
						tracks: {
							main: { id: "main-track", type: "video", elements: [] },
							overlay: [],
							audio: [],
						},
					}),
				},
				timeline: {
					addTrack,
					insertElement,
				},
				media: {
					addMediaAsset,
				},
			}),
			deps: {
				fetchFn: fetchMock,
				processMediaAssetsFn: async ({ files }) => [
					{
						name: files[0]?.name ?? "downloaded.mp4",
						type: "video",
						file: files[0],
						width: 1920,
						height: 1080,
						duration: 8,
					},
				],
			},
		});
		const tool = tools.find((item) => item.name === "autocut_insert_broll");

		const result = await tool?.handler({
			segments: [
				{
					query: "people editing videos",
					startTimeSeconds: 5,
					durationSeconds: 4,
				},
			],
			countPerSegment: 3,
			orientation: "landscape",
		});

		expect(result).toMatchObject({
			trackId: "broll-track",
			insertedCount: 1,
			insertedSegments: [
				{
					query: "people editing videos",
					mediaAssetId: "media-broll-1",
					sourceUrl: "https://www.pexels.com/video/editing-123/",
					startTimeSeconds: 5,
					durationSeconds: 4,
				},
			],
		});
		expect(addTrack).toHaveBeenCalledWith({ type: "video" });
		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			placement: { mode: "explicit", trackId: "broll-track" },
			element: {
				name: "People editing videos.mp4",
				type: "video",
				mediaId: "media-broll-1",
				startTime: Math.round(5 * 90_000),
				duration: Math.round(4 * 90_000),
			},
		});
	});
});
