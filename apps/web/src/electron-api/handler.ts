import * as agentChatRoute from "@/app/api/agent/chat/route";
import * as agentChatToolResultRoute from "@/app/api/agent/chat/[sessionId]/tool-result/route";
import * as creativeImageRoute from "@/app/api/agent/creative/image/route";
import * as creativeMgComponentRoute from "@/app/api/agent/creative/mg-component/route";
import * as creativeMgJobRoute from "@/app/api/agent/creative/mg-jobs/[jobId]/route";
import * as creativeMgJobEventsRoute from "@/app/api/agent/creative/mg-jobs/[jobId]/events/route";
import * as creativeMgJobsRoute from "@/app/api/agent/creative/mg-jobs/route";
import * as seedanceVideoTaskRoute from "@/app/api/agent/creative/video/seedance/[taskId]/route";
import * as seedanceVideoDownloadRoute from "@/app/api/agent/creative/video/seedance/download/route";
import * as seedanceVideoRoute from "@/app/api/agent/creative/video/seedance/route";
import * as stockDownloadRoute from "@/app/api/agent/stock/download/route";
import * as stockSearchRoute from "@/app/api/agent/stock/search/route";
import * as subtitleTranslationRoute from "@/app/api/agent/subtitle-translation/route";
import * as transcriptionRoute from "@/app/api/agent/transcription/route";
import * as webFetchRoute from "@/app/api/agent/web/fetch/route";
import * as webSearchRoute from "@/app/api/agent/web/search/route";
import * as voiceoverRoute from "@/app/api/agent/voiceover/route";
import * as voiceoverVoicesRoute from "@/app/api/agent/voiceover/voices/route";
import * as desktopAgentsRoute from "@/app/api/desktop/agents/route";
import * as desktopConfigRoute from "@/app/api/desktop/config/route";
import * as desktopConfigRevealRoute from "@/app/api/desktop/config/reveal/route";
import * as desktopModelsRoute from "@/app/api/desktop/models/route";
import * as feedbackRoute from "@/app/api/feedback/route";
import * as healthRoute from "@/app/api/health/route";
import * as soundsSearchRoute from "@/app/api/sounds/search/route";
import { NextRequest } from "@/platform/next-server";

type RouteModule = Partial<
	Record<
		"DELETE" | "GET" | "PATCH" | "POST" | "PUT",
		(request: NextRequest, context?: RouteContext) => Response | Promise<Response>
	>
>;

type RouteContext = {
	params: Promise<Record<string, string>>;
};

type MatchedRoute = {
	module: RouteModule;
	params?: Record<string, string>;
};

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
	["/api/agent/web/fetch", webFetchRoute],
	["/api/agent/web/search", webSearchRoute],
	["/api/agent/voiceover", voiceoverRoute],
	["/api/agent/voiceover/voices", voiceoverVoicesRoute],
	["/api/desktop/agents", desktopAgentsRoute],
	["/api/desktop/config", desktopConfigRoute],
	["/api/desktop/config/reveal", desktopConfigRevealRoute],
	["/api/desktop/models", desktopModelsRoute],
	["/api/feedback", feedbackRoute],
	["/api/health", healthRoute],
	["/api/sounds/search", soundsSearchRoute],
]);

function matchDynamicRoute(pathname: string): MatchedRoute | null {
	let match = pathname.match(
		/^\/api\/agent\/chat\/([^/]+)\/tool-result$/,
	);
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

	match = pathname.match(
		/^\/api\/agent\/creative\/video\/seedance\/([^/]+)$/,
	);
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

function jsonResponse({
	body,
	init,
}: {
	body: unknown;
	init?: ResponseInit;
}) {
	return Response.json(body, init);
}

function withCors(response: Response) {
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "DELETE, GET, OPTIONS, POST, PUT");
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export async function handleElectronApiRequest(request: Request) {
	if (request.method === "OPTIONS") {
		return withCors(new Response(null, { status: 204 }));
	}

	const url = new URL(request.url);
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
		const nextRequest = new NextRequest(request);
		const context = route.params
			? { params: Promise.resolve(route.params) }
			: undefined;
		const response = await handler(nextRequest, context);
		return withCors(response);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[desktop-api] ${request.method} ${url.pathname}: ${message}`);
		return withCors(
			jsonResponse({
				body: { error: "desktop_api_error", message },
				init: { status: 500 },
			}),
		);
	}
}
