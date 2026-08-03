export const WEB_SEARCH_PROVIDERS = [
	"local-cli",
	"tavily",
	"firecrawl",
	"brave",
] as const;
export type WebSearchProviderId = (typeof WEB_SEARCH_PROVIDERS)[number];

export const WEB_FETCH_PROVIDERS = ["jina", "firecrawl"] as const;
export type WebFetchProviderId = (typeof WEB_FETCH_PROVIDERS)[number];

export interface WebSearchInput {
	query: string;
	count?: number;
	provider?: WebSearchProviderId;
	includeAnswer?: boolean;
	includeImages?: boolean;
	includeContent?: boolean;
}

export interface WebSearchResultItem {
	title: string;
	url: string;
	snippet?: string;
	publishedDate?: string;
	score?: number;
	source: WebSearchProviderId;
}

export interface WebSearchResult {
	provider: WebSearchProviderId;
	query: string;
	results: WebSearchResultItem[];
	answer?: string;
	images?: unknown[];
	message?: string;
}

export interface WebFetchInput {
	url: string;
	provider?: WebFetchProviderId;
	maxCharacters?: number;
}

export interface WebFetchResult {
	provider: WebFetchProviderId;
	url: string;
	title?: string;
	content: string;
	contentType?: string;
	truncated: boolean;
	contentLength: number;
	fetchedAt: string;
	metadata?: Record<string, unknown>;
}
