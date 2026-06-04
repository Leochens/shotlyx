import type { ExportFormat } from "./index";

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
