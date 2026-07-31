import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ExportFormat } from "@/export";

type DesktopExportTarget = {
	createdAt: number;
	filePath: string;
	id: string;
	initialized: boolean;
};

export type DesktopExportTargetSelection =
	| {
			cancelled: true;
			target: null;
	  }
	| {
			cancelled: false;
			target: {
				fileName: string;
				filePath: string;
				id: string;
			};
	  };

const EXPORT_TARGET_TTL_MS = 2 * 60 * 60 * 1000;
const INVALID_FILE_NAME_CHARS = new Set([
	"<",
	">",
	":",
	"\"",
	"/",
	"\\",
	"|",
	"?",
	"*",
]);
const exportTargets = new Map<string, DesktopExportTarget>();

function purgeExpiredExportTargets({ now = Date.now() }: { now?: number } = {}) {
	for (const [id, target] of exportTargets) {
		if (now - target.createdAt > EXPORT_TARGET_TTL_MS) {
			exportTargets.delete(id);
		}
	}
}

function getExportExtension({ format }: { format: ExportFormat }): string {
	return `.${format}`;
}

function sanitizeExportBaseName({
	format,
	suggestedName,
}: {
	format: ExportFormat;
	suggestedName: string;
}): string {
	const trimmed = suggestedName.trim();
	const extension = getExportExtension({ format });
	const withoutKnownExtension =
		path.extname(trimmed).toLowerCase() === extension
			? path.basename(trimmed, path.extname(trimmed))
			: trimmed;
	const safeName = withoutKnownExtension
		.split("")
		.map((char) =>
			char.charCodeAt(0) < 32 || INVALID_FILE_NAME_CHARS.has(char)
				? "-"
				: char,
		)
		.join("")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "")
		.trim();
	return safeName || "Shotlyx Export";
}

function buildExportFileName({
	format,
	suggestedName,
}: {
	format: ExportFormat;
	suggestedName: string;
}): string {
	return `${sanitizeExportBaseName({ format, suggestedName })}${getExportExtension({
		format,
	})}`;
}

function ensureExportFileExtension({
	filePath,
	format,
}: {
	filePath: string;
	format: ExportFormat;
}): string {
	const extension = getExportExtension({ format });
	return path.extname(filePath).toLowerCase() === extension
		? filePath
		: `${filePath}${extension}`;
}

function registerDesktopExportTarget({
	filePath,
}: {
	filePath: string;
}): DesktopExportTargetSelection {
	purgeExpiredExportTargets();
	const id = randomUUID();
	const target = {
		createdAt: Date.now(),
		filePath,
		id,
		initialized: false,
	} satisfies DesktopExportTarget;
	exportTargets.set(id, target);
	return {
		cancelled: false,
		target: {
			fileName: path.basename(filePath),
			filePath,
			id,
		},
	};
}

function getElectronDefaultExportDirectory({
	electron,
}: {
	electron: unknown;
}): string {
	if (typeof electron !== "object" || electron === null) return homedir();
	const app = Reflect.get(electron, "app");
	if (typeof app !== "object" || app === null) return homedir();
	const getPath = Reflect.get(app, "getPath");
	if (typeof getPath !== "function") return homedir();
	try {
		const downloadsPath = getPath("downloads");
		return typeof downloadsPath === "string" && downloadsPath
			? downloadsPath
			: homedir();
	} catch {
		return homedir();
	}
}

function getElectronShowSaveDialog({ electron }: { electron: unknown }) {
	if (typeof electron !== "object" || electron === null) {
		throw new Error("electron_dialog_unavailable");
	}
	const dialog = Reflect.get(electron, "dialog");
	if (typeof dialog !== "object" || dialog === null) {
		throw new Error("electron_dialog_unavailable");
	}
	const showSaveDialog = Reflect.get(dialog, "showSaveDialog");
	if (typeof showSaveDialog !== "function") {
		throw new Error("electron_show_save_dialog_unavailable");
	}
	return async (options: {
		buttonLabel?: string;
		defaultPath?: string;
		filters?: Array<{ extensions: string[]; name: string }>;
		properties?: Array<"createDirectory" | "showOverwriteConfirmation">;
		title?: string;
	}): Promise<{ canceled: boolean; filePath?: string }> => {
		const result = await Promise.resolve(showSaveDialog(options));
		if (typeof result !== "object" || result === null) {
			return { canceled: true };
		}
		const canceled = Reflect.get(result, "canceled");
		const filePath = Reflect.get(result, "filePath");
		return {
			canceled: canceled === true,
			filePath: typeof filePath === "string" ? filePath : undefined,
		};
	};
}

export async function selectDesktopExportTarget({
	format,
	suggestedName,
}: {
	format: ExportFormat;
	suggestedName: string;
}): Promise<DesktopExportTargetSelection> {
	if (process.env.SHOTLYX_DESKTOP_EXPORT_TEST_CANCEL === "1") {
		return { cancelled: true, target: null };
	}

	const fileName = buildExportFileName({ format, suggestedName });
	const testFilePath = process.env.SHOTLYX_DESKTOP_EXPORT_TEST_PATH;
	if (testFilePath) {
		return registerDesktopExportTarget({
			filePath: ensureExportFileExtension({ filePath: testFilePath, format }),
		});
	}

	const electron = await import("electron");
	const showSaveDialog = getElectronShowSaveDialog({ electron });
	const result = await showSaveDialog({
		buttonLabel: "Export",
		defaultPath: path.join(
			getElectronDefaultExportDirectory({ electron }),
			fileName,
		),
		filters: [
			{
				extensions: [format],
				name: format === "mp4" ? "MP4 Video" : "WebM Video",
			},
		],
		properties: ["createDirectory", "showOverwriteConfirmation"],
		title: "Export Shotlyx Video",
	});

	if (result.canceled || !result.filePath) {
		return { cancelled: true, target: null };
	}

	return registerDesktopExportTarget({
		filePath: ensureExportFileExtension({ filePath: result.filePath, format }),
	});
}

export async function writeDesktopExportTarget({
	blob,
	targetId,
}: {
	blob: Blob;
	targetId: string;
}): Promise<{ filePath: string; sizeBytes: number }> {
	purgeExpiredExportTargets();
	const target = exportTargets.get(targetId);
	if (!target) {
		throw new Error("desktop_export_target_not_found");
	}
	if (blob.size <= 0) {
		throw new Error("desktop_export_empty_file");
	}

	await fs.mkdir(path.dirname(target.filePath), { recursive: true });
	await fs.writeFile(
		target.filePath,
		Buffer.from(await blob.arrayBuffer()),
	);
	exportTargets.delete(targetId);

	return {
		filePath: target.filePath,
		sizeBytes: blob.size,
	};
}

export async function writeDesktopExportTargetChunk({
	chunk,
	position,
	targetId,
}: {
	chunk: ArrayBuffer;
	position: number;
	targetId: string;
}): Promise<{ filePath: string; sizeBytes: number }> {
	purgeExpiredExportTargets();
	const target = exportTargets.get(targetId);
	if (!target) {
		throw new Error("desktop_export_target_not_found");
	}
	if (!Number.isSafeInteger(position) || position < 0) {
		throw new Error("desktop_export_invalid_position");
	}
	if (chunk.byteLength <= 0) {
		throw new Error("desktop_export_empty_chunk");
	}

	await fs.mkdir(path.dirname(target.filePath), { recursive: true });
	const handle = await fs.open(target.filePath, target.initialized ? "r+" : "w+");
	try {
		target.initialized = true;
		const buffer = Buffer.from(chunk);
		await handle.write(buffer, 0, buffer.byteLength, position);
	} finally {
		await handle.close();
	}

	const stat = await fs.stat(target.filePath);
	return {
		filePath: target.filePath,
		sizeBytes: stat.size,
	};
}

export async function completeDesktopExportTarget({
	targetId,
}: {
	targetId: string;
}): Promise<{ filePath: string; sizeBytes: number }> {
	purgeExpiredExportTargets();
	const target = exportTargets.get(targetId);
	if (!target) {
		throw new Error("desktop_export_target_not_found");
	}
	if (!target.initialized) {
		throw new Error("desktop_export_empty_file");
	}

	const stat = await fs.stat(target.filePath);
	if (stat.size <= 0) {
		throw new Error("desktop_export_empty_file");
	}

	exportTargets.delete(targetId);
	return {
		filePath: target.filePath,
		sizeBytes: stat.size,
	};
}

export async function abortDesktopExportTarget({
	targetId,
}: {
	targetId: string;
}): Promise<void> {
	purgeExpiredExportTargets();
	const target = exportTargets.get(targetId);
	if (!target) return;
	exportTargets.delete(targetId);
	await fs.rm(target.filePath, { force: true });
}

export function clearDesktopExportTargetsForTests(): void {
	exportTargets.clear();
}
