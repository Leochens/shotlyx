import { type ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";

function isAllowedDownloadUrl(url: URL): boolean {
	return (
		(url.protocol === "https:" || url.protocol === "http:") &&
		(url.hostname === "volces.com" ||
			url.hostname.endsWith(".volces.com") ||
			url.hostname === "volcengine.com" ||
			url.hostname.endsWith(".volcengine.com"))
	);
}

export async function GET(request: ApiRequest) {
	const rawUrl = request.requestUrl.searchParams.get("url");
	if (!rawUrl) {
		return ApiResponse.json({ error: "Missing url" }, { status: 400 });
	}

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return ApiResponse.json({ error: "Invalid url" }, { status: 400 });
	}

	if (!isAllowedDownloadUrl(url)) {
		return ApiResponse.json({ error: "Unsupported download host" }, { status: 400 });
	}

	const response = await fetch(url);
	if (!response.ok || !response.body) {
		return ApiResponse.json(
			{ error: `Download failed with ${response.status}` },
			{ status: 502 },
		);
	}

	return new Response(response.body, {
		status: 200,
		headers: {
			"Content-Type": response.headers.get("content-type") ?? "video/mp4",
			"Cache-Control": "no-store",
		},
	});
}
