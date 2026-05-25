import { type NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
	const rawUrl = request.nextUrl.searchParams.get("url");
	if (!rawUrl) {
		return NextResponse.json({ error: "Missing url" }, { status: 400 });
	}

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return NextResponse.json({ error: "Invalid url" }, { status: 400 });
	}

	if (!isAllowedDownloadUrl(url)) {
		return NextResponse.json({ error: "Unsupported download host" }, { status: 400 });
	}

	const response = await fetch(url);
	if (!response.ok || !response.body) {
		return NextResponse.json(
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
