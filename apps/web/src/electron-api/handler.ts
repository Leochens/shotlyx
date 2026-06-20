import * as agentChatRoute from "@/api/agent/chat/route";
import * as agentChatToolResultRoute from "@/api/agent/chat/[sessionId]/tool-result/route";
import * as creativeImageRoute from "@/api/agent/creative/image/route";
import * as creativeMgComponentRoute from "@/api/agent/creative/mg-component/route";
import * as creativeMgJobRoute from "@/api/agent/creative/mg-jobs/[jobId]/route";
import * as creativeMgJobEventsRoute from "@/api/agent/creative/mg-jobs/[jobId]/events/route";
import * as creativeMgJobsRoute from "@/api/agent/creative/mg-jobs/route";
import * as seedanceVideoTaskRoute from "@/api/agent/creative/video/seedance/[taskId]/route";
import * as seedanceVideoDownloadRoute from "@/api/agent/creative/video/seedance/download/route";
import * as seedanceVideoRoute from "@/api/agent/creative/video/seedance/route";
import * as stockDownloadRoute from "@/api/agent/stock/download/route";
import * as stockSearchRoute from "@/api/agent/stock/search/route";
import * as subtitleTranslationRoute from "@/api/agent/subtitle-translation/route";
import * as transcriptionRoute from "@/api/agent/transcription/route";
import * as visionAnalyzeRoute from "@/api/agent/vision/analyze/route";
import * as webFetchRoute from "@/api/agent/web/fetch/route";
import * as webSearchRoute from "@/api/agent/web/search/route";
import * as voiceoverRoute from "@/api/agent/voiceover/route";
import * as voiceoverVoicesRoute from "@/api/agent/voiceover/voices/route";
import * as authRoute from "@/api/auth/[...all]/route";
import * as desktopAgentsRoute from "@/api/desktop/agents/route";
import * as desktopConfigRoute from "@/api/desktop/config/route";
import * as desktopConfigRevealRoute from "@/api/desktop/config/reveal/route";
import * as desktopExportFileRoute from "@/api/desktop/export/file/route";
import * as desktopExportSelectRoute from "@/api/desktop/export/select/route";
import * as desktopMediaLibraryRoute from "@/api/desktop/media-library/route";
import * as desktopMediaLibraryFilesRoute from "@/api/desktop/media-library/files/route";
import * as desktopMediaLibraryOpenRoute from "@/api/desktop/media-library/open/route";
import * as desktopMediaLibrarySelectRoute from "@/api/desktop/media-library/select/route";
import * as desktopMediaAnalyzeRoute from "@/api/desktop/media/analyze/route";
import * as desktopMediaKeyframeRoute from "@/api/desktop/media/keyframe/route";
import * as desktopMediaTranscriptRoute from "@/api/desktop/media/transcript/route";
import * as desktopModelsRoute from "@/api/desktop/models/route";
import * as desktopRemotionMgRenderRoute from "@/api/desktop/remotion/mg-render/route";
import * as feedbackRoute from "@/api/feedback/route";
import * as healthRoute from "@/api/health/route";
import * as soundsBuiltinRoute from "@/api/sounds/builtin/route";
import * as soundsSearchRoute from "@/api/sounds/search/route";
import { ApiRequest } from "@/platform/http";
import { FileShotlyxStore } from "../../../../server/src/file-store";
import { createServerApp } from "../../../../server/src/http";

type RouteModule = Partial<
	Record<
		"DELETE" | "GET" | "PATCH" | "POST" | "PUT",
		(
			request: ApiRequest,
			context?: RouteContext,
		) => Response | Promise<Response>
	>
>;

type RouteContext = {
	params: Promise<Record<string, string>>;
};

type MatchedRoute = {
	module: RouteModule;
	params?: Record<string, string>;
};

let accountServerApp: ReturnType<typeof createServerApp> | null = null;

function getAccountServerApp() {
	if (!accountServerApp) {
		accountServerApp = createServerApp({
			store: new FileShotlyxStore(
				process.env.SHOTLYX_DESKTOP_SERVER_DATA_PATH ??
					"/tmp/shotlyx-desktop-server-store.json",
			),
			storeMode: "custom",
			adminToken: process.env.SHOTLYX_ADMIN_TOKEN ?? "shotlyx-desktop-admin",
		});
	}
	return accountServerApp;
}

function shouldUseAccountServer(pathname: string): boolean {
	return (
		pathname === "/admin" ||
		pathname.startsWith("/admin/") ||
		pathname === "/api/health" ||
		pathname.startsWith("/api/account/") ||
		pathname.startsWith("/api/admin/") ||
		pathname.startsWith("/api/callbacks/") ||
		pathname === "/api/auth/login" ||
		pathname === "/api/auth/register"
	);
}

const staticRoutes = new Map<string, RouteModule>([
	["/api/agent/chat", agentChatRoute],
	["/api/agent/creative/image", creativeImageRoute],
	["/api/agent/creative/mg-component", creativeMgComponentRoute],
	["/api/agent/creative/mg-jobs", creativeMgJobsRoute],
	["/api/agent/creative/video/seedance", seedanceVideoRoute],
	["/api/agent/creative/video/seedance/download", seedanceVideoDownloadRoute],
	["/api/agent/stock/download", stockDownloadRoute],
	["/api/agent/stock/search", stockSearchRoute],
	["/api/agent/subtitle-translation", subtitleTranslationRoute],
	["/api/agent/transcription", transcriptionRoute],
	["/api/agent/vision/analyze", visionAnalyzeRoute],
	["/api/agent/web/fetch", webFetchRoute],
	["/api/agent/web/search", webSearchRoute],
	["/api/agent/voiceover", voiceoverRoute],
	["/api/agent/voiceover/voices", voiceoverVoicesRoute],
	["/api/desktop/agents", desktopAgentsRoute],
	["/api/desktop/config", desktopConfigRoute],
	["/api/desktop/config/reveal", desktopConfigRevealRoute],
	["/api/desktop/export/file", desktopExportFileRoute],
	["/api/desktop/export/select", desktopExportSelectRoute],
	["/api/desktop/media-library", desktopMediaLibraryRoute],
	["/api/desktop/media-library/files", desktopMediaLibraryFilesRoute],
	["/api/desktop/media-library/open", desktopMediaLibraryOpenRoute],
	["/api/desktop/media-library/select", desktopMediaLibrarySelectRoute],
	["/api/desktop/media/analyze", desktopMediaAnalyzeRoute],
	["/api/desktop/media/keyframe", desktopMediaKeyframeRoute],
	["/api/desktop/media/transcript", desktopMediaTranscriptRoute],
	["/api/desktop/models", desktopModelsRoute],
	["/api/desktop/remotion/mg-render", desktopRemotionMgRenderRoute],
	["/api/feedback", feedbackRoute],
	["/api/health", healthRoute],
	["/api/sounds/builtin", soundsBuiltinRoute],
	["/api/sounds/search", soundsSearchRoute],
]);

function matchDynamicRoute(pathname: string): MatchedRoute | null {
	if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
		return { module: authRoute };
	}

	let match = pathname.match(/^\/api\/agent\/chat\/([^/]+)\/tool-result$/);
	if (match?.[1]) {
		return {
			module: agentChatToolResultRoute,
			params: { sessionId: decodeURIComponent(match[1]) },
		};
	}

	match = pathname.match(/^\/api\/agent\/creative\/mg-jobs\/([^/]+)\/events$/);
	if (match?.[1]) {
		return {
			module: creativeMgJobEventsRoute,
			params: { jobId: decodeURIComponent(match[1]) },
		};
	}

	match = pathname.match(/^\/api\/agent\/creative\/mg-jobs\/([^/]+)$/);
	if (match?.[1]) {
		return {
			module: creativeMgJobRoute,
			params: { jobId: decodeURIComponent(match[1]) },
		};
	}

	match = pathname.match(/^\/api\/agent\/creative\/video\/seedance\/([^/]+)$/);
	if (match?.[1]) {
		return {
			module: seedanceVideoTaskRoute,
			params: { taskId: decodeURIComponent(match[1]) },
		};
	}

	return null;
}

function matchRoute(pathname: string): MatchedRoute | null {
	const staticRoute = staticRoutes.get(pathname);
	if (staticRoute) return { module: staticRoute };
	return matchDynamicRoute(pathname);
}

function isRouteMethod(method: string): method is keyof RouteModule {
	return (
		method === "DELETE" ||
		method === "GET" ||
		method === "PATCH" ||
		method === "POST" ||
		method === "PUT"
	);
}

function jsonResponse({ body, init }: { body: unknown; init?: ResponseInit }) {
	return Response.json(body, init);
}

function withCors(response: Response) {
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set(
		"Access-Control-Allow-Methods",
		"DELETE, GET, OPTIONS, POST, PUT",
	);
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export async function handleElectronApiRequest(request: Request) {
	const url = new URL(request.url);
	const shouldLogMGRender = url.pathname === "/api/desktop/remotion/mg-render";
	const startedAt = shouldLogMGRender ? Date.now() : 0;

	if (request.method === "OPTIONS") {
		if (shouldLogMGRender) {
			console.info(`[shotlyx-mg-export] desktop API preflight ${url.pathname}`);
		}
		return withCors(new Response(null, { status: 204 }));
	}

	if (shouldUseAccountServer(url.pathname)) {
		return withCors(await getAccountServerApp().fetch(request));
	}

	if (shouldLogMGRender) {
		console.info(
			`[shotlyx-mg-export] desktop API ${request.method} ${url.pathname} received`,
		);
	}
	const route = matchRoute(url.pathname);
	if (!route) {
		return withCors(
			jsonResponse({ body: { error: "Not found" }, init: { status: 404 } }),
		);
	}

	const method = request.method.toUpperCase();
	if (!isRouteMethod(method)) {
		return withCors(
			jsonResponse({
				body: { error: "Method not allowed" },
				init: { status: 405 },
			}),
		);
	}

	const handler = route.module[method];
	if (!handler) {
		return withCors(
			jsonResponse({
				body: { error: "Method not allowed" },
				init: { status: 405 },
			}),
		);
	}

	try {
		const nextRequest = new ApiRequest(request);
		const context = route.params
			? { params: Promise.resolve(route.params) }
			: undefined;
		const response = await handler(nextRequest, context);
		if (shouldLogMGRender) {
			console.info(
				`[shotlyx-mg-export] desktop API ${request.method} ${url.pathname} ` +
					`responded status=${response.status} elapsedMs=${Date.now() - startedAt}`,
			);
		}
		return withCors(response);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[desktop-api] ${request.method} ${url.pathname}: ${message}`,
		);
		return withCors(
			jsonResponse({
				body: { error: "desktop_api_error", message },
				init: { status: 500 },
			}),
		);
	}
}
