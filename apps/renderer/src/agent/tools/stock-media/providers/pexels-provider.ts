import type {
	StockAssetInput,
	StockMediaProvider,
	StockSearchInput,
} from "../types";
import {
	assertConfiguredApiKey,
	type FetchFn,
	isRecord,
	matchesDuration,
	matchesOrientation,
	maxWidthForResolution,
	normalizeCount,
	normalizePage,
} from "./helpers";

interface PexelsVideoFile {
	id?: number;
	quality?: string;
	file_type?: string;
	width?: number;
	height?: number;
	link?: string;
}

interface PexelsVideo {
	id?: number;
	width?: number;
	height?: number;
	url?: string;
	image?: string;
	duration?: number;
	user?: {
		name?: string;
		url?: string;
	};
	video_files?: PexelsVideoFile[];
}

interface PexelsVideoResponse {
	videos?: PexelsVideo[];
}

function parsePexelsVideoFile(value: unknown): PexelsVideoFile | null {
	if (!isRecord(value)) return null;
	return {
		id: typeof value.id === "number" ? value.id : undefined,
		quality: typeof value.quality === "string" ? value.quality : undefined,
		file_type: typeof value.file_type === "string" ? value.file_type : undefined,
		width: typeof value.width === "number" ? value.width : undefined,
		height: typeof value.height === "number" ? value.height : undefined,
		link: typeof value.link === "string" ? value.link : undefined,
	};
}

function parsePexelsVideo(value: unknown): PexelsVideo | null {
	if (!isRecord(value)) return null;
	const user = isRecord(value.user)
		? {
				name: typeof value.user.name === "string" ? value.user.name : undefined,
				url: typeof value.user.url === "string" ? value.user.url : undefined,
			}
		: undefined;
	const rawFiles = Array.isArray(value.video_files) ? value.video_files : [];
	return {
		id: typeof value.id === "number" ? value.id : undefined,
		width: typeof value.width === "number" ? value.width : undefined,
		height: typeof value.height === "number" ? value.height : undefined,
		url: typeof value.url === "string" ? value.url : undefined,
		image: typeof value.image === "string" ? value.image : undefined,
		duration: typeof value.duration === "number" ? value.duration : undefined,
		user,
		video_files: rawFiles
			.map(parsePexelsVideoFile)
			.filter((file): file is PexelsVideoFile => file !== null),
	};
}

function parsePexelsVideoResponse(value: unknown): PexelsVideoResponse {
	if (!isRecord(value) || !Array.isArray(value.videos)) return { videos: [] };
	return {
		videos: value.videos
			.map(parsePexelsVideo)
			.filter((video): video is PexelsVideo => video !== null),
	};
}

function choosePexelsVideoFile({
	files,
	resolution,
}: {
	files?: PexelsVideoFile[];
	resolution?: StockSearchInput["resolution"];
}): PexelsVideoFile | null {
	const mp4Files = (files ?? []).filter(
		(file) => file.file_type === "video/mp4" && typeof file.link === "string",
	);
	if (mp4Files.length === 0) return null;

	const maxWidth = maxWidthForResolution(resolution);
	const eligible =
		maxWidth === null
			? mp4Files
			: mp4Files.filter((file) => (file.width ?? Number.POSITIVE_INFINITY) <= maxWidth);
	const pool = eligible.length > 0 ? eligible : mp4Files;

	return [...pool].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0] ?? null;
}

function normalizePexelsVideo({
	video,
	input,
	now,
}: {
	video: PexelsVideo;
	input: StockSearchInput;
	now: string;
}): StockAssetInput | null {
	if (typeof video.id !== "number" || !video.url) return null;
	const selectedFile = choosePexelsVideoFile({
		files: video.video_files,
		resolution: input.resolution,
	});
	if (!selectedFile?.link) return null;

	const asset: StockAssetInput = {
		provider: "pexels",
		providerAssetId: String(video.id),
		type: "video",
		title: `Pexels video ${video.id}`,
		previewUrl: selectedFile.link,
		thumbnailUrl: video.image,
		downloadUrl: selectedFile.link,
		sourceUrl: video.url,
		width: selectedFile.width ?? video.width,
		height: selectedFile.height ?? video.height,
		durationSeconds: video.duration,
		author: {
			name: video.user?.name,
			url: video.user?.url,
		},
		license: {
			name: "Pexels License",
			url: "https://www.pexels.com/license/",
			attributionRequired: false,
			commercialUse: true,
			derivativesAllowed: true,
			sourceProvider: "pexels",
			sourceUrl: video.url,
			attributionText: video.user?.name
				? `Video by ${video.user.name} on Pexels`
				: "Video from Pexels",
			verifiedAt: now,
		},
	};

	if (
		!matchesOrientation({ asset, orientation: input.orientation }) ||
		!matchesDuration({
			durationSeconds: asset.durationSeconds,
			min: input.durationSeconds?.min,
			max: input.durationSeconds?.max,
		})
	) {
		return null;
	}

	return asset;
}

export class PexelsProvider implements StockMediaProvider {
	readonly id = "pexels" as const;
	private readonly apiKey: string;
	private readonly fetchFn: FetchFn;

	constructor({
		apiKey,
		fetchFn = fetch,
	}: {
		apiKey?: string;
		fetchFn?: FetchFn;
	}) {
		this.apiKey = assertConfiguredApiKey({ apiKey, provider: "PEXELS" });
		this.fetchFn = fetchFn;
	}

	async search(input: StockSearchInput): Promise<StockAssetInput[]> {
		if (input.type !== "video") return [];

		const url = new URL("https://api.pexels.com/v1/videos/search");
		url.searchParams.set("query", input.query);
		url.searchParams.set("per_page", String(normalizeCount(input.count)));
		url.searchParams.set("page", String(normalizePage(input.page)));
		if (input.orientation) url.searchParams.set("orientation", input.orientation);
		if (input.resolution) url.searchParams.set("size", input.resolution);
		if (input.locale) url.searchParams.set("locale", input.locale);

		const response = await this.fetchFn(url, {
			headers: { Authorization: this.apiKey },
		});
		if (!response.ok) {
			throw new Error(`provider_error: Pexels search failed (${response.status})`);
		}

		const data = parsePexelsVideoResponse(await response.json());
		const now = new Date().toISOString();
		return (data.videos ?? [])
			.map((video) => normalizePexelsVideo({ video, input, now }))
			.filter((asset): asset is StockAssetInput => asset !== null);
	}
}
