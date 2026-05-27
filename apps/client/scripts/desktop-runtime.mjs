import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const DEFAULT_WEB_URL = "http://127.0.0.1:3100/desktop";
const DEFAULT_DESKTOP_PORT = new URL(DEFAULT_WEB_URL).port;

export function getDesktopRuntime(
	webUrl = process.env.SHOTLYX_WEB_URL ?? DEFAULT_WEB_URL,
) {
	const parsedUrl = new URL(webUrl);
	const origin = parsedUrl.origin;
	const port =
		parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80");
	const hostname = parsedUrl.hostname || "127.0.0.1";

	return {
		webUrl,
		origin,
		port,
		hostname,
		configUrl: new URL("/api/desktop/config", webUrl).toString(),
	};
}

export function createDesktopEnv(runtime = getDesktopRuntime()) {
	const defaultDistDir =
		runtime.port === DEFAULT_DESKTOP_PORT
			? ".next-desktop"
			: ".next-desktop-alt";

	return {
		...process.env,
		PORT: process.env.PORT ?? runtime.port,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_DIST_DIR:
			process.env.SHOTLYX_DESKTOP_DIST_DIR ?? defaultDistDir,
		NEXT_PUBLIC_SHOTLYX_DESKTOP: "1",
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? runtime.origin,
		NEXT_PUBLIC_MARBLE_API_URL:
			process.env.NEXT_PUBLIC_MARBLE_API_URL ?? runtime.origin,
		BETTER_AUTH_SECRET:
			process.env.BETTER_AUTH_SECRET ?? "shotlyx-desktop-local-secret",
		UPSTASH_REDIS_REST_URL:
			process.env.UPSTASH_REDIS_REST_URL ?? "http://127.0.0.1:8079",
		UPSTASH_REDIS_REST_TOKEN:
			process.env.UPSTASH_REDIS_REST_TOKEN ?? "shotlyx-desktop",
		MARBLE_WORKSPACE_KEY: process.env.MARBLE_WORKSPACE_KEY ?? "shotlyx-desktop",
	};
}

export function getElectronCommand() {
	const electronPath = require("electron");
	if (typeof electronPath === "string" && electronPath.length > 0) {
		return {
			command: electronPath,
			args: [],
		};
	}

	return {
		command: process.execPath,
		args: [require.resolve("electron/cli.js")],
	};
}
