import path from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const contentTypes = new Map([
	[".css", "text/css; charset=utf-8"],
	[".gif", "image/gif"],
	[".html", "text/html; charset=utf-8"],
	[".ico", "image/x-icon"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".js", "text/javascript; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".map", "application/json; charset=utf-8"],
	[".png", "image/png"],
	[".svg", "image/svg+xml"],
	[".wasm", "application/wasm"],
	[".webp", "image/webp"],
]);

function responseForStatus(status, message) {
	return new Response(message, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

function getSafeFilePath(pathname) {
	const decodedPathname = decodeURIComponent(pathname);
	const normalizedPathname = path.normalize(decodedPathname).replace(/^(\.\.[/\\])+/, "");
	const filePath = path.join(distDir, normalizedPathname);

	if (!filePath.startsWith(distDir)) {
		return null;
	}

	return filePath;
}

async function fileResponse(filePath, fallbackToIndex) {
	const file = Bun.file(filePath);
	if (await file.exists()) {
		const contentType = contentTypes.get(path.extname(filePath));
		return new Response(file, {
			headers: contentType ? { "content-type": contentType } : undefined,
		});
	}

	if (!fallbackToIndex) {
		return responseForStatus(404, "Not found");
	}

	const indexPath = path.join(distDir, "index.html");
	return new Response(Bun.file(indexPath), {
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

Bun.serve({
	hostname,
	port,
	async fetch(request) {
		const url = new URL(request.url);
		const filePath = getSafeFilePath(url.pathname);

		if (!filePath) {
			return responseForStatus(403, "Forbidden");
		}

		const isAssetRequest =
			url.pathname.startsWith("/assets/") || path.extname(url.pathname) !== "";
		return fileResponse(filePath, !isAssetRequest);
	},
});

console.log(`Shotlyx web preview listening on http://${hostname}:${port}`);
