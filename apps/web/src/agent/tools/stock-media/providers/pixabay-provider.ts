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

interface PixabayVideoVariant {
	url?: string;
	width?: number;
	height?: number;
	size?: number;
}

interface PixabayVideoHit {
	id?: number;
	pageURL?: string;
	tags?: string;
	duration?: number;
	user?: string;
	user_id?: number;
	videos?: Record<string, PixabayVideoVariant | undefined>;
}

interface PixabayVideoResponse {
	hits?: PixabayVideoHit[];
}

function parsePixabayVariant(value: unknown): PixabayVideoVariant | null {
	if (!isRecord(value)) return null;
	return {
		url: typeof value.url === "string" ? value.url : undefined,
		width: typeof value.width === "number" ? value.width : undefined,
		height: typeof value.height === "number" ? value.height : undefined,
		size: typeof value.size === "number" ? value.size : undefined,
	};
}

function parsePixabayVideos(
	value: unknown,
): Record<string, PixabayVideoVariant | undefined> | undefined {
	if (!isRecord(value)) return undefined;
	const variants: Record<string, PixabayVideoVariant | undefined> = {};
	for (const [key, rawVariant] of Object.entries(value)) {
		variants[key] = parsePixabayVariant(rawVariant) ?? undefined;
	}
	return variants;
}

function parsePixabayHit(value: unknown): PixabayVideoHit | null {
	if (!isRecord(value)) return null;
	return {
		id: typeof value.id === "number" ? value.id : undefined,
		pageURL: typeof value.pageURL === "string" ? value.pageURL : undefined,
		tags: typeof value.tags === "string" ? value.tags : undefined,
		duration: typeof value.duration === "number" ? value.duration : undefined,
		user: typeof value.user === "string" ? value.user : undefined,
		user_id: typeof value.user_id === "number" ? value.user_id : undefined,
		videos: parsePixabayVideos(value.videos),
	};
}

function parsePixabayVideoResponse(value: unknown): PixabayVideoResponse {
	if (!isRecord(value) || !Array.isArray(value.hits)) return { hits: [] };
	return {
		hits: value.hits
			.map(parsePixabayHit)
			.filter((hit): hit is PixabayVideoHit => hit !== null),
	};
}

function choosePixabayVariant({
	videos,
	resolution,
}: {
	videos?: Record<string, PixabayVideoVariant | undefined>;
	resolution?: StockSearchInput["resolution"];
}): PixabayVideoVariant | null {
	if (!videos) return null;
	const variants = ["large", "medium", "small", "tiny"]
		.map((key) => videos[key])
		.filter(
			(variant): variant is PixabayVideoVariant =>
				Boolean(variant?.url) && typeof variant?.width === "number",
		);
	if (variants.length === 0) return null;

	const maxWidth = maxWidthForResolution(resolution);
	const eligible =
		maxWidth === null
			? variants
			: variants.filter(
					(variant) => (variant.width ?? Number.POSITIVE_INFINITY) <= maxWidth,
				);
	const pool = eligible.length > 0 ? eligible : variants;
	return [...pool].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0] ?? null;
}

function normalizePixabayVideo({
	hit,
	input,
	now,
}: {
	hit: PixabayVideoHit;
	input: StockSearchInput;
	now: string;
}): StockAssetInput | null {
	if (typeof hit.id !== "number" || !hit.pageURL) return null;
	const selectedVariant = choosePixabayVariant({
		videos: hit.videos,
		resolution: input.resolution,
	});
	if (!selectedVariant?.url) return null;

	const authorUrl =
		hit.user && typeof hit.user_id === "number"
			? `https://pixabay.com/users/${encodeURIComponent(hit.user)}-${hit.user_id}/`
			: undefined;
	const title = hit.tags?.trim() || `Pixabay video ${hit.id}`;
	const asset: StockAssetInput = {
		provider: "pixabay",
		providerAssetId: String(hit.id),
		type: "video",
		title,
		previewUrl: selectedVariant.url,
		downloadUrl: selectedVariant.url,
		sourceUrl: hit.pageURL,
		width: selectedVariant.width,
		height: selectedVariant.height,
		durationSeconds: hit.duration,
		author: {
			name: hit.user,
			url: authorUrl,
		},
		license: {
			name: "Pixabay Content License",
			url: "https://pixabay.com/service/license-summary/",
			attributionRequired: false,
			commercialUse: true,
			derivativesAllowed: true,
			sourceProvider: "pixabay",
			sourceUrl: hit.pageURL,
			attributionText: hit.user
				? `Video by ${hit.user} on Pixabay`
				: "Video from Pixabay",
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

export class PixabayProvider implements StockMediaProvider {
	readonly id = "pixabay" as const;
	private readonly apiKey: string;
	private readonly fetchFn: FetchFn;

	constructor({
		apiKey,
		fetchFn = fetch,
	}: {
		apiKey?: string;
		fetchFn?: FetchFn;
	}) {
		this.apiKey = assertConfiguredApiKey({ apiKey, provider: "PIXABAY" });
		this.fetchFn = fetchFn;
	}

	async search(input: StockSearchInput): Promise<StockAssetInput[]> {
		if (input.type !== "video") return [];

		const url = new URL("https://pixabay.com/api/videos/");
		url.searchParams.set("key", this.apiKey);
		url.searchParams.set("q", input.query);
		url.searchParams.set("video_type", "film");
		url.searchParams.set("safesearch", "true");
		url.searchParams.set("per_page", String(normalizeCount(input.count)));
		url.searchParams.set("page", String(normalizePage(input.page)));
		if (input.locale) url.searchParams.set("lang", input.locale.slice(0, 2));

		const response = await this.fetchFn(url);
		if (!response.ok) {
			throw new Error(`provider_error: Pixabay search failed (${response.status})`);
		}

		const data = parsePixabayVideoResponse(await response.json());
		const now = new Date().toISOString();
		return (data.hits ?? [])
			.map((hit) => normalizePixabayVideo({ hit, input, now }))
			.filter((asset): asset is StockAssetInput => asset !== null);
	}
}
