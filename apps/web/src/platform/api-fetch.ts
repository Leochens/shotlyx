/* eslint-disable shotlyx/prefer-object-params -- This file wraps the native Fetch signature so existing /api calls keep working in Electron. */
const DESKTOP_API_ORIGIN = process.env.VITE_SHOTLYX_API_ORIGIN;
const APP_SCHEME_PREFIX = "app://";

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

function isElectronUserAgent(userAgent: string): boolean {
	return /\bElectron\//.test(userAgent);
}

export function shouldInstallDesktopApiFetchForRuntime({
	alreadyInstalled,
	desktopApiOrigin,
	hasWindow,
	userAgent,
}: {
	alreadyInstalled: boolean;
	desktopApiOrigin: string | undefined;
	hasWindow: boolean;
	userAgent: string;
}): boolean {
	if (!desktopApiOrigin || !hasWindow || alreadyInstalled) return false;
	if (
		desktopApiOrigin.startsWith(APP_SCHEME_PREFIX) &&
		!isElectronUserAgent(userAgent)
	) {
		return false;
	}
	return true;
}

export function installDesktopApiFetch() {
	if (
		!shouldInstallDesktopApiFetchForRuntime({
			alreadyInstalled:
				typeof window !== "undefined" &&
				Boolean(window.__SHOTLYX_DESKTOP_API_FETCH__),
			desktopApiOrigin: DESKTOP_API_ORIGIN,
			hasWindow: typeof window !== "undefined",
			userAgent:
				typeof navigator === "undefined" ? "" : navigator.userAgent,
		})
	) {
		return;
	}
	window.__SHOTLYX_DESKTOP_API_FETCH__ = true;

	const nativeFetch = window.fetch.bind(window);
	window.fetch = (input, init) => nativeFetch(rewriteFetchInput(input), init);
}
