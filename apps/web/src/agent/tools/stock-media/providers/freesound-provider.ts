import type {
	LicensePolicy,
	StockAssetInput,
	StockMediaProvider,
	StockSearchInput,
} from "../types";
import {
	assertConfiguredApiKey,
	type FetchFn,
	isRecord,
	matchesDuration,
	normalizeCount,
	normalizePage,
} from "./helpers";

interface FreesoundResult {
	id?: number;
	name?: string;
	url?: string;
	duration?: number;
	username?: string;
	license?: string;
	type?: string;
	filesize?: number;
	previews?: Record<string, string | undefined>;
	images?: Record<string, string | undefined>;
}

interface FreesoundResponse {
	results?: FreesoundResult[];
}

function parseStringRecord(
	value: unknown,
): Record<string, string | undefined> | undefined {
	if (!isRecord(value)) return undefined;
	const output: Record<string, string | undefined> = {};
	for (const [key, rawValue] of Object.entries(value)) {
		output[key] = typeof rawValue === "string" ? rawValue : undefined;
	}
	return output;
}

function parseFreesoundResult(value: unknown): FreesoundResult | null {
	if (!isRecord(value)) return null;
	return {
		id: typeof value.id === "number" ? value.id : undefined,
		name: typeof value.name === "string" ? value.name : undefined,
		url: typeof value.url === "string" ? value.url : undefined,
		duration: typeof value.duration === "number" ? value.duration : undefined,
		username: typeof value.username === "string" ? value.username : undefined,
		license: typeof value.license === "string" ? value.license : undefined,
		type: typeof value.type === "string" ? value.type : undefined,
		filesize: typeof value.filesize === "number" ? value.filesize : undefined,
		previews: parseStringRecord(value.previews),
		images: parseStringRecord(value.images),
	};
}

function parseFreesoundResponse(value: unknown): FreesoundResponse {
	if (!isRecord(value) || !Array.isArray(value.results)) {
		return { results: [] };
	}
	return {
		results: value.results
			.map(parseFreesoundResult)
			.filter((item): item is FreesoundResult => item !== null),
	};
}

function licenseFilterForPolicy(policy?: LicensePolicy): string {
	if (policy === "public-domain-only") {
		return 'license:"Creative Commons 0"';
	}
	return '(license:"Creative Commons 0" OR license:"Attribution")';
}

function normalizeLicense({
	license,
	sourceUrl,
	now,
}: {
	license?: string;
	sourceUrl: string;
	now: string;
}): StockAssetInput["license"] {
	const normalizedLicense = license?.toLowerCase() ?? "";
	const isCc0 =
		normalizedLicense.includes("creative commons 0") ||
		normalizedLicense.includes("publicdomain/zero") ||
		normalizedLicense.includes("cc0");
	const name = isCc0
		? "Creative Commons Zero (CC0)"
		: license || "Freesound License";
	return {
		name,
		url: isCc0
			? "https://creativecommons.org/publicdomain/zero/1.0/"
			: "https://creativecommons.org/licenses/by/4.0/",
		attributionRequired: !isCc0,
		commercialUse: true,
		derivativesAllowed: true,
		sourceProvider: "freesound",
		sourceUrl,
		attributionText: isCc0 ? undefined : "Audio from Freesound",
		verifiedAt: now,
	};
}

function normalizeFreesoundResult({
	result,
	input,
	now,
}: {
	result: FreesoundResult;
	input: StockSearchInput;
	now: string;
}): StockAssetInput | null {
	if (typeof result.id !== "number" || !result.url || !result.name) {
		return null;
	}
	const previewUrl =
		result.previews?.["preview-hq-mp3"] ??
		result.previews?.["preview-lq-mp3"] ??
		result.previews?.["preview-hq-ogg"] ??
		result.previews?.["preview-lq-ogg"];
	if (!previewUrl) return null;
	if (
		!matchesDuration({
			durationSeconds: result.duration,
			min: input.durationSeconds?.min,
			max: input.durationSeconds?.max,
		})
	) {
		return null;
	}

	return {
		provider: "freesound",
		providerAssetId: String(result.id),
		type: "audio",
		title: result.name,
		previewUrl,
		downloadUrl: previewUrl,
		thumbnailUrl: result.images?.waveform_m ?? result.images?.waveform_l,
		sourceUrl: result.url,
		durationSeconds: result.duration,
		sizeBytes: result.filesize,
		author: {
			name: result.username,
			url: result.username
				? `https://freesound.org/people/${encodeURIComponent(result.username)}/`
				: undefined,
		},
		license: normalizeLicense({
			license: result.license,
			sourceUrl: result.url,
			now,
		}),
	};
}

export class FreesoundProvider implements StockMediaProvider {
	readonly id = "freesound" as const;
	private readonly apiKey: string;
	private readonly fetchFn: FetchFn;

	constructor({
		apiKey,
		fetchFn = fetch,
	}: {
		apiKey?: string;
		fetchFn?: FetchFn;
	}) {
		this.apiKey = assertConfiguredApiKey({ apiKey, provider: "FREESOUND" });
		this.fetchFn = fetchFn;
	}

	async search(input: StockSearchInput): Promise<StockAssetInput[]> {
		if (input.type !== "audio") return [];

		const url = new URL("https://freesound.org/apiv2/search/text/");
		url.searchParams.set("token", this.apiKey);
		url.searchParams.set("query", input.query);
		url.searchParams.set("page_size", String(normalizeCount(input.count)));
		url.searchParams.set("page", String(normalizePage(input.page)));
		url.searchParams.set("fields", [
			"id",
			"name",
			"url",
			"duration",
			"username",
			"license",
			"type",
			"filesize",
			"previews",
			"images",
		].join(","));
		url.searchParams.set("filter", licenseFilterForPolicy(input.licensePolicy));
		url.searchParams.set("sort", "score");

		const response = await this.fetchFn(url);
		if (!response.ok) {
			throw new Error(
				`provider_error: Freesound search failed (${response.status})`,
			);
		}

		const data = parseFreesoundResponse(await response.json());
		const now = new Date().toISOString();
		return (data.results ?? [])
			.map((result) => normalizeFreesoundResult({ result, input, now }))
			.filter((asset): asset is StockAssetInput => asset !== null);
	}
}
