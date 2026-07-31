import {
	WEB_FETCH_PROVIDERS,
	WEB_SEARCH_PROVIDERS,
	type WebFetchInput,
	type WebFetchProviderId,
	type WebFetchResult,
	type WebSearchInput,
	type WebSearchProviderId,
	type WebSearchResult,
	type WebSearchResultItem,
} from "./types";
import { getRuntimeEnv } from "@/desktop/config/server";

export interface WebProviderApiKeys {
	tavily?: string;
	firecrawl?: string;
	brave?: string;
	jina?: string;
}

export type WebFetchFn = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export interface WebProviderRegistryDeps {
	apiKeys?: WebProviderApiKeys;
	fetchFn?: WebFetchFn;
	env?: Record<string, string | undefined>;
}

const DEFAULT_SEARCH_PROVIDER: WebSearchProviderId = "tavily";
const DEFAULT_FETCH_PROVIDER: WebFetchProviderId = "jina";
const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;
const DEFAULT_FETCH_MAX_CHARACTERS = 6000;
const MAX_FETCH_MAX_CHARACTERS = 20000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCount(count?: number): number {
	if (count === undefined) return DEFAULT_SEARCH_COUNT;
	if (!Number.isInteger(count) || count < 1 || count > MAX_SEARCH_COUNT) {
		throw new Error(
			`param_error: count must be an integer from 1 to ${MAX_SEARCH_COUNT}`,
		);
	}
	return count;
}

function normalizeMaxCharacters(maxCharacters?: number): number {
	if (maxCharacters === undefined) return DEFAULT_FETCH_MAX_CHARACTERS;
	if (
		!Number.isInteger(maxCharacters) ||
		maxCharacters < 1 ||
		maxCharacters > MAX_FETCH_MAX_CHARACTERS
	) {
		throw new Error(
			`param_error: maxCharacters must be an integer from 1 to ${MAX_FETCH_MAX_CHARACTERS}`,
		);
	}
	return maxCharacters;
}

function requireApiKey({
	value,
	name,
}: {
	value?: string;
	name: string;
}): string {
	if (!value) {
		throw new Error(`configuration_error: missing ${name}`);
	}
	return value;
}

function apiKeysFromEnv(
	env: Record<string, string | undefined>,
): WebProviderApiKeys {
	return {
		tavily: env.TAVILY_API_KEY,
		firecrawl: env.FIRECRAWL_API_KEY,
		brave: env.BRAVE_SEARCH_API_KEY,
		jina: env.JINA_API_KEY,
	};
}

function mergeApiKeys({
	env,
	apiKeys,
}: {
	env: Record<string, string | undefined>;
	apiKeys?: WebProviderApiKeys;
}): WebProviderApiKeys {
	return {
		...apiKeysFromEnv(env),
		...apiKeys,
	};
}

function isWebSearchProviderId(value: string): value is WebSearchProviderId {
	return WEB_SEARCH_PROVIDERS.some((item) => item === value);
}

function isWebFetchProviderId(value: string): value is WebFetchProviderId {
	return WEB_FETCH_PROVIDERS.some((item) => item === value);
}

function resolveSearchProvider({
	input,
	env,
}: {
	input: WebSearchInput;
	env: Record<string, string | undefined>;
}): WebSearchProviderId {
	if (input.provider) return input.provider;
	const provider = env.AGENT_WEB_SEARCH_PROVIDER;
	if (!provider) return DEFAULT_SEARCH_PROVIDER;
	if (isWebSearchProviderId(provider)) {
		return provider;
	}
	throw new Error(
		`provider_unsupported: unknown web search provider "${provider}"`,
	);
}

function resolveFetchProvider({
	input,
	env,
}: {
	input: WebFetchInput;
	env: Record<string, string | undefined>;
}): WebFetchProviderId {
	if (input.provider) return input.provider;
	const provider = env.AGENT_WEB_FETCH_PROVIDER;
	if (!provider) return DEFAULT_FETCH_PROVIDER;
	if (isWebFetchProviderId(provider)) {
		return provider;
	}
	throw new Error(
		`provider_unsupported: unknown web fetch provider "${provider}"`,
	);
}

async function readProviderError(response: Response): Promise<string> {
	try {
		const data: unknown = await response.json();
		if (isRecord(data)) {
			if (typeof data.error === "string") return data.error;
			if (isRecord(data.error) && typeof data.error.message === "string") {
				return data.error.message;
			}
			if (typeof data.message === "string") return data.message;
		}
	} catch {
		// Fall through.
	}
	return `${response.status} ${response.statusText}`;
}

async function assertProviderOk({
	response,
	provider,
	action,
}: {
	response: Response;
	provider: string;
	action: string;
}): Promise<void> {
	if (response.ok) return;
	throw new Error(
		`provider_error: ${provider} ${action} failed (${await readProviderError(response)})`,
	);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function parseResultArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function truncateContent({
	content,
	maxCharacters,
}: {
	content: string;
	maxCharacters: number;
}): {
	content: string;
	truncated: boolean;
	contentLength: number;
} {
	return {
		content: content.slice(0, maxCharacters),
		truncated: content.length > maxCharacters,
		contentLength: content.length,
	};
}

function parseJinaReaderText(raw: string): { title?: string; content: string } {
	const lines = raw.split(/\r?\n/);
	const title = lines
		.find((line) => line.toLowerCase().startsWith("title:"))
		?.replace(/^title:\s*/i, "")
		.trim();
	const contentStart = lines.findIndex((line) =>
		line.toLowerCase().startsWith("markdown content:"),
	);
	const content =
		contentStart >= 0
			? lines
					.slice(contentStart + 1)
					.join("\n")
					.trim()
			: raw;
	return { title: title || undefined, content };
}

function normalizeHttpUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("param_error: url must be a valid URL");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("param_error: url must use http or https");
	}
	return url;
}

async function searchWithTavily({
	input,
	apiKey,
	fetchFn,
}: {
	input: WebSearchInput;
	apiKey: string;
	fetchFn: WebFetchFn;
}): Promise<WebSearchResult> {
	const count = normalizeCount(input.count);
	const response = await fetchFn("https://api.tavily.com/search", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: input.query,
			max_results: count,
			search_depth: "basic",
			include_answer: input.includeAnswer ?? false,
			include_images: input.includeImages ?? false,
			include_raw_content: input.includeContent ?? false,
		}),
	});
	await assertProviderOk({
		response,
		provider: "Tavily",
		action: "search",
	});

	const data: unknown = await response.json();
	const record = isRecord(data) ? data : {};
	const results: WebSearchResultItem[] = parseResultArray(
		record.results,
	).flatMap((item): WebSearchResultItem[] => {
		if (!isRecord(item)) return [];
		const title = stringValue(item.title);
		const url = stringValue(item.url);
		if (!title || !url) return [];
		return [
			{
				title,
				url,
				snippet:
					stringValue(item.content) ??
					stringValue(item.raw_content) ??
					stringValue(item.description),
				publishedDate:
					stringValue(item.published_date) ?? stringValue(item.publishedDate),
				score: numberValue(item.score),
				source: "tavily",
			},
		];
	});

	return {
		provider: "tavily",
		query: input.query,
		answer: stringValue(record.answer),
		images: Array.isArray(record.images) ? record.images : undefined,
		results: results.slice(0, count),
	};
}

async function searchWithFirecrawl({
	input,
	apiKey,
	fetchFn,
}: {
	input: WebSearchInput;
	apiKey: string;
	fetchFn: WebFetchFn;
}): Promise<WebSearchResult> {
	const count = normalizeCount(input.count);
	const response = await fetchFn("https://api.firecrawl.dev/v2/search", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: input.query,
			limit: count,
			sources: ["web"],
			scrapeOptions: input.includeContent
				? {
						formats: ["markdown"],
						onlyMainContent: true,
					}
				: undefined,
		}),
	});
	await assertProviderOk({
		response,
		provider: "Firecrawl",
		action: "search",
	});

	const data: unknown = await response.json();
	const record = isRecord(data) ? data : {};
	const payload = isRecord(record.data) ? record.data : record;
	const rawResults = Array.isArray(payload.web)
		? payload.web
		: parseResultArray(record.data);
	const results: WebSearchResultItem[] = rawResults.flatMap(
		(item): WebSearchResultItem[] => {
			if (!isRecord(item)) return [];
			const title = stringValue(item.title);
			const url = stringValue(item.url);
			if (!title || !url) return [];
			return [
				{
					title,
					url,
					snippet:
						stringValue(item.description) ??
						stringValue(item.markdown) ??
						stringValue(item.content),
					source: "firecrawl",
				},
			];
		},
	);

	return {
		provider: "firecrawl",
		query: input.query,
		results: results.slice(0, count),
	};
}

async function searchWithBrave({
	input,
	apiKey,
	fetchFn,
}: {
	input: WebSearchInput;
	apiKey: string;
	fetchFn: WebFetchFn;
}): Promise<WebSearchResult> {
	const count = normalizeCount(input.count);
	const url = new URL("https://api.search.brave.com/res/v1/web/search");
	url.searchParams.set("q", input.query);
	url.searchParams.set("count", String(count));

	const response = await fetchFn(url, {
		headers: {
			Accept: "application/json",
			"X-Subscription-Token": apiKey,
		},
	});
	await assertProviderOk({
		response,
		provider: "Brave",
		action: "search",
	});

	const data: unknown = await response.json();
	const record = isRecord(data) ? data : {};
	const web = isRecord(record.web) ? record.web : {};
	const results: WebSearchResultItem[] = parseResultArray(web.results).flatMap(
		(item): WebSearchResultItem[] => {
			if (!isRecord(item)) return [];
			const title = stringValue(item.title);
			const resultUrl = stringValue(item.url);
			if (!title || !resultUrl) return [];
			return [
				{
					title,
					url: resultUrl,
					snippet: stringValue(item.description),
					publishedDate: stringValue(item.age),
					source: "brave",
				},
			];
		},
	);

	return {
		provider: "brave",
		query: input.query,
		results: results.slice(0, count),
	};
}

async function fetchWithJina({
	input,
	apiKey,
	fetchFn,
}: {
	input: WebFetchInput;
	apiKey?: string;
	fetchFn: WebFetchFn;
}): Promise<WebFetchResult> {
	const targetUrl = normalizeHttpUrl(input.url);
	const maxCharacters = normalizeMaxCharacters(input.maxCharacters);
	const headers: Record<string, string> = { Accept: "text/plain" };
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	const response = await fetchFn(`https://r.jina.ai/${targetUrl.href}`, {
		headers,
	});
	await assertProviderOk({
		response,
		provider: "Jina Reader",
		action: "fetch",
	});

	const raw = await response.text();
	const parsed = parseJinaReaderText(raw);
	const content = truncateContent({
		content: parsed.content,
		maxCharacters,
	});
	return {
		provider: "jina",
		url: targetUrl.href,
		title: parsed.title,
		content: content.content,
		truncated: content.truncated,
		contentLength: content.contentLength,
		contentType: response.headers.get("content-type") ?? undefined,
		fetchedAt: new Date().toISOString(),
	};
}

async function fetchWithFirecrawl({
	input,
	apiKey,
	fetchFn,
}: {
	input: WebFetchInput;
	apiKey: string;
	fetchFn: WebFetchFn;
}): Promise<WebFetchResult> {
	const targetUrl = normalizeHttpUrl(input.url);
	const maxCharacters = normalizeMaxCharacters(input.maxCharacters);
	const response = await fetchFn("https://api.firecrawl.dev/v2/scrape", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			url: targetUrl.href,
			formats: ["markdown"],
			onlyMainContent: true,
			removeBase64Images: true,
			blockAds: true,
		}),
	});
	await assertProviderOk({
		response,
		provider: "Firecrawl",
		action: "fetch",
	});

	const data: unknown = await response.json();
	const record = isRecord(data) ? data : {};
	const payload = isRecord(record.data) ? record.data : record;
	const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
	const rawContent =
		stringValue(payload.markdown) ??
		stringValue(payload.html) ??
		stringValue(payload.rawHtml) ??
		"";
	const content = truncateContent({
		content: rawContent,
		maxCharacters,
	});
	return {
		provider: "firecrawl",
		url: targetUrl.href,
		title:
			(metadata ? stringValue(metadata.title) : undefined) ??
			stringValue(payload.title),
		content: content.content,
		truncated: content.truncated,
		contentLength: content.contentLength,
		contentType: "text/markdown",
		fetchedAt: new Date().toISOString(),
		metadata,
	};
}

export async function searchWeb({
	input,
	deps = {},
}: {
	input: WebSearchInput;
	deps?: WebProviderRegistryDeps;
}): Promise<WebSearchResult> {
	const env = deps.env ?? getRuntimeEnv();
	const apiKeys = mergeApiKeys({ env, apiKeys: deps.apiKeys });
	const fetchFn = deps.fetchFn ?? fetch;
	const provider = resolveSearchProvider({ input, env });

	if (provider === "tavily") {
		return searchWithTavily({
			input,
			apiKey: requireApiKey({
				value: apiKeys.tavily,
				name: "TAVILY_API_KEY",
			}),
			fetchFn,
		});
	}
	if (provider === "firecrawl") {
		return searchWithFirecrawl({
			input,
			apiKey: requireApiKey({
				value: apiKeys.firecrawl,
				name: "FIRECRAWL_API_KEY",
			}),
			fetchFn,
		});
	}
	if (provider === "brave") {
		return searchWithBrave({
			input,
			apiKey: requireApiKey({
				value: apiKeys.brave,
				name: "BRAVE_SEARCH_API_KEY",
			}),
			fetchFn,
		});
	}

	throw new Error(
		`provider_unsupported: unknown web search provider "${provider}"`,
	);
}

export async function fetchWebPage({
	input,
	deps = {},
}: {
	input: WebFetchInput;
	deps?: WebProviderRegistryDeps;
}): Promise<WebFetchResult> {
	const env = deps.env ?? getRuntimeEnv();
	const apiKeys = mergeApiKeys({ env, apiKeys: deps.apiKeys });
	const fetchFn = deps.fetchFn ?? fetch;
	const provider = resolveFetchProvider({ input, env });

	if (provider === "jina") {
		return fetchWithJina({
			input,
			apiKey: apiKeys.jina,
			fetchFn,
		});
	}
	if (provider === "firecrawl") {
		return fetchWithFirecrawl({
			input,
			apiKey: requireApiKey({
				value: apiKeys.firecrawl,
				name: "FIRECRAWL_API_KEY",
			}),
			fetchFn,
		});
	}

	throw new Error(
		`provider_unsupported: unknown web fetch provider "${provider}"`,
	);
}
