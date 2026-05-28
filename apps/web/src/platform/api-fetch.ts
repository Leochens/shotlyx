/* eslint-disable shotlyx/prefer-object-params -- This file wraps the native Fetch signature so existing /api calls keep working in Electron. */
const DESKTOP_API_ORIGIN = process.env.NEXT_PUBLIC_SHOTLYX_API_ORIGIN;

declare global {
	interface Window {
		__SHOTLYX_DESKTOP_API_FETCH__?: boolean;
	}
}

function rewriteApiUrl(url: string): string {
	if (!DESKTOP_API_ORIGIN || !url.startsWith("/api/")) return url;
	return `${DESKTOP_API_ORIGIN}${url}`;
}

function rewriteFetchInput(input: RequestInfo | URL): RequestInfo | URL {
	if (typeof input === "string") {
		return rewriteApiUrl(input);
	}

	if (input instanceof URL) {
		if (input.origin !== window.location.origin) return input;
		return rewriteApiUrl(`${input.pathname}${input.search}`);
	}

	const requestUrl = new URL(input.url);
	if (requestUrl.origin !== window.location.origin) return input;
	const rewrittenUrl = rewriteApiUrl(`${requestUrl.pathname}${requestUrl.search}`);
	if (rewrittenUrl === input.url) return input;
	return new Request(rewrittenUrl, input);
}

export function installDesktopApiFetch() {
	if (!DESKTOP_API_ORIGIN || typeof window === "undefined") return;

	if (window.__SHOTLYX_DESKTOP_API_FETCH__) return;
	window.__SHOTLYX_DESKTOP_API_FETCH__ = true;

	const nativeFetch = window.fetch.bind(window);
	window.fetch = (input, init) => nativeFetch(rewriteFetchInput(input), init);
}
