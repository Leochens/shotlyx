import type { ExportFormat } from "./index";
import { StreamTarget, type StreamTargetChunk } from "mediabunny";

export type DesktopExportTarget = {
	fileName: string;
	filePath: string;
	id: string;
};

type DesktopExportWriteResponse = {
	desktop?: boolean;
	filePath?: string;
	sizeBytes?: number;
};

export type DesktopExportStreamTarget = {
	abort: () => Promise<void>;
	complete: () => Promise<DesktopExportWriteResponse>;
	target: StreamTarget;
};

export function isDesktopExportAvailable(): boolean {
	return process.env.VITE_SHOTLYX_DESKTOP === "1";
}

export async function selectDesktopExportTarget({
	format,
	suggestedName,
}: {
	format: ExportFormat;
	suggestedName: string;
}): Promise<DesktopExportTarget | null> {
	const response = await fetch("/api/desktop/export/select", {
		body: JSON.stringify({ format, suggestedName }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const body = await readJsonResponse({ response });
	if (!isRecord(body)) {
		throw new Error("Desktop export returned an invalid response.");
	}
	if (Reflect.get(body, "cancelled") === true) return null;
	const target = Reflect.get(body, "target");
	if (!isDesktopExportTarget(target)) {
		throw new Error("Desktop export did not return a save target.");
	}
	return target;
}

export async function writeDesktopExportFile({
	buffer,
	mimeType,
	targetId,
}: {
	buffer: ArrayBuffer;
	mimeType: string;
	targetId: string;
}): Promise<DesktopExportWriteResponse> {
	const response = await fetch("/api/desktop/export/file", {
		body: buffer,
		headers: {
			"Content-Type": mimeType,
			"X-Shotlyx-Export-Target": targetId,
		},
		method: "POST",
	});
	const body = await readJsonResponse({ response });
	if (!isRecord(body)) return {};
	const filePath = Reflect.get(body, "filePath");
	const sizeBytes = Reflect.get(body, "sizeBytes");
	return {
		desktop: Reflect.get(body, "desktop") === true ? true : undefined,
		filePath: typeof filePath === "string" ? filePath : undefined,
		sizeBytes: typeof sizeBytes === "number" ? sizeBytes : undefined,
	};
}

export function createDesktopExportStreamTarget({
	targetId,
}: {
	targetId: string;
}): DesktopExportStreamTarget {
	let closed = false;
	const target = new StreamTarget(
		new WritableStream<StreamTargetChunk>({
			async write(chunk) {
				await writeDesktopExportChunk({
					data: chunk.data,
					position: chunk.position,
					targetId,
				});
			},
			close() {
				closed = true;
			},
		}),
		{ chunked: true },
	);

	return {
		target,
		complete: async () => {
			if (!closed) {
				throw new Error("Desktop export stream has not been finalized.");
			}
			return completeDesktopExportFile({ targetId });
		},
		abort: () => abortDesktopExportFile({ targetId }),
	};
}

async function writeDesktopExportChunk({
	data,
	position,
	targetId,
}: {
	data: Uint8Array;
	position: number;
	targetId: string;
}): Promise<void> {
	const response = await fetch("/api/desktop/export/chunk", {
		body: data,
		headers: {
			"Content-Type": "application/octet-stream",
			"X-Shotlyx-Export-Position": String(position),
			"X-Shotlyx-Export-Target": targetId,
		},
		method: "POST",
	});
	await readJsonResponse({ response });
}

async function completeDesktopExportFile({
	targetId,
}: {
	targetId: string;
}): Promise<DesktopExportWriteResponse> {
	const response = await fetch("/api/desktop/export/complete", {
		headers: { "X-Shotlyx-Export-Target": targetId },
		method: "POST",
	});
	const body = await readJsonResponse({ response });
	if (!isRecord(body)) return {};
	const filePath = Reflect.get(body, "filePath");
	const sizeBytes = Reflect.get(body, "sizeBytes");
	return {
		desktop: Reflect.get(body, "desktop") === true ? true : undefined,
		filePath: typeof filePath === "string" ? filePath : undefined,
		sizeBytes: typeof sizeBytes === "number" ? sizeBytes : undefined,
	};
}

async function abortDesktopExportFile({
	targetId,
}: {
	targetId: string;
}): Promise<void> {
	const response = await fetch("/api/desktop/export/abort", {
		headers: { "X-Shotlyx-Export-Target": targetId },
		method: "POST",
	});
	await readJsonResponse({ response });
}

async function readJsonResponse({ response }: { response: Response }) {
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		// Preserve the status-based fallback below.
	}

	if (response.ok) return body;

	let message = `Desktop export request failed: ${response.status}`;
	if (typeof body === "object" && body !== null) {
		const bodyMessage = Reflect.get(body, "message");
		const bodyError = Reflect.get(body, "error");
		message =
			(typeof bodyMessage === "string" && bodyMessage) ||
			(typeof bodyError === "string" && bodyError) ||
			message;
	}
	if (
		response.status === 404 &&
		response.url.includes("/api/desktop/export/")
	) {
		message =
			"Desktop export API route was not found. Restart Shotlyx Desktop after rebuilding the desktop API bundle.";
	}
	throw new Error(message);
}

function isDesktopExportTarget(value: unknown): value is DesktopExportTarget {
	if (!isRecord(value)) return false;
	return (
		typeof Reflect.get(value, "fileName") === "string" &&
		typeof Reflect.get(value, "filePath") === "string" &&
		typeof Reflect.get(value, "id") === "string"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
