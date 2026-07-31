import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	changeDesktopProjectLibraryDirectory,
	findDesktopProjectDirectory,
	getDesktopManagedMediaDirectory,
	getDesktopProjectLibraryDirectory,
	getDesktopProjectLibraryStatus,
	getDesktopProjectMediaMetadata,
	readDesktopProjectLibraryConfig,
	saveDesktopProjectMediaMetadata,
} from "@/desktop/project-library/server";

export interface DesktopMediaLibraryFileInfo {
	filePath: string;
	name: string;
	size: number;
	storageMode: "linked" | "managed";
	sourcePath?: string;
	type: string;
}

export interface SelectedDesktopMediaFile {
	id: string;
	lastModified: number;
	name: string;
	size: number;
	sourcePath: string;
	type: string;
}

const MAX_SAFE_FILE_NAME_LENGTH = 160;
const selectedMediaFiles = new Map<string, string>();

function safeSegment({
	fallback,
	value,
}: {
	fallback: string;
	value: string;
}): string {
	const sanitized = value
		.split("")
		.map((character) =>
			isUnsafePathCharacter({ character }) ? "_" : character,
		)
		.join("")
		.replace(/^\.+$/, "")
		.trim();
	return sanitized || fallback;
}

function safeFileName({
	fallback,
	value,
}: {
	fallback: string;
	value: string;
}): string {
	const baseName = path.basename(value.trim()) || fallback;
	const sanitized = safeSegment({ fallback, value: baseName }).replace(
		/^\.+/,
		"",
	);
	return (sanitized || fallback).slice(0, MAX_SAFE_FILE_NAME_LENGTH);
}

function isUnsafePathCharacter({ character }: { character: string }): boolean {
	return (
		character.charCodeAt(0) < 32 ||
		character === "<" ||
		character === ">" ||
		character === ":" ||
		character === '"' ||
		character === "/" ||
		character === "\\" ||
		character === "|" ||
		character === "?" ||
		character === "*"
	);
}

function getErrorCode(error: unknown): string | null {
	if (typeof error !== "object" || error === null) return null;
	const code = Reflect.get(error, "code");
	return typeof code === "string" ? code : null;
}

function assertInsideDirectory({
	childPath,
	parentPath,
}: {
	childPath: string;
	parentPath: string;
}) {
	const relativePath = path.relative(parentPath, childPath);
	if (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	) {
		return;
	}
	throw new Error("desktop_media_library_path_escape");
}

function readStorageSource(
	value: unknown,
): { mode: "linked"; sourcePath: string } | { mode: "managed" } | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const mode = Reflect.get(value, "mode");
	const sourcePath = Reflect.get(value, "sourcePath");
	if (mode === "linked" && typeof sourcePath === "string" && sourcePath) {
		return { mode, sourcePath: path.resolve(sourcePath) };
	}
	if (mode === "managed") return { mode };
	return null;
}

export function buildStoredMediaFileName({
	assetId,
	name,
}: {
	assetId: string;
	name: string;
}): string {
	return `${safeSegment({ fallback: "asset", value: assetId })}--${safeFileName(
		{
			fallback: "media",
			value: name,
		},
	)}`;
}

async function findManagedMediaAssetFile({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<DesktopMediaLibraryFileInfo | null> {
	const mediaDirectory = await getDesktopManagedMediaDirectory({ projectId });
	const safeAssetId = safeSegment({ fallback: "asset", value: assetId });
	const fileNames = await fs.readdir(mediaDirectory).catch((error: unknown) => {
		if (getErrorCode(error) === "ENOENT") return [];
		throw error;
	});
	const fileName =
		fileNames.find((item) => item.startsWith(`${safeAssetId}--`)) ??
		fileNames.find((item) => item === safeAssetId);
	if (!fileName) return null;
	const filePath = path.join(mediaDirectory, fileName);
	assertInsideDirectory({ childPath: filePath, parentPath: mediaDirectory });
	const stat = await fs.stat(filePath);
	if (!stat.isFile()) return null;
	return {
		filePath,
		name: fileName,
		size: stat.size,
		storageMode: "managed",
		type: getMimeTypeFromFileName(fileName),
	};
}

export async function findDesktopMediaAssetFile({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<DesktopMediaLibraryFileInfo | null> {
	const metadata = await getDesktopProjectMediaMetadata({ assetId, projectId });
	const storage = readStorageSource(metadata?.storage);
	if (storage?.mode === "linked") {
		try {
			const stat = await fs.stat(storage.sourcePath);
			if (!stat.isFile()) return null;
			return {
				filePath: storage.sourcePath,
				name:
					typeof metadata?.name === "string"
						? metadata.name
						: path.basename(storage.sourcePath),
				size: stat.size,
				sourcePath: storage.sourcePath,
				storageMode: "linked",
				type:
					typeof metadata?.type === "string"
						? getMimeTypeFromFileName(storage.sourcePath)
						: getMimeTypeFromFileName(storage.sourcePath),
			};
		} catch (error) {
			if (getErrorCode(error) === "ENOENT") return null;
			throw error;
		}
	}
	return findManagedMediaAssetFile({ assetId, projectId });
}

export async function saveDesktopLinkedMediaAsset({
	assetId,
	projectId,
	sourcePath,
}: {
	assetId: string;
	projectId: string;
	sourcePath: string;
}): Promise<DesktopMediaLibraryFileInfo> {
	const normalizedSourcePath = path.resolve(sourcePath);
	const stat = await fs.stat(normalizedSourcePath);
	if (!stat.isFile() || stat.size <= 0) {
		throw new Error("desktop_linked_media_invalid");
	}
	await deleteDesktopManagedMediaAssetFile({ assetId, projectId });
	return {
		filePath: normalizedSourcePath,
		name: path.basename(normalizedSourcePath),
		size: stat.size,
		sourcePath: normalizedSourcePath,
		storageMode: "linked",
		type: getMimeTypeFromFileName(normalizedSourcePath),
	};
}

export async function saveDesktopMediaAssetStream({
	assetId,
	contentType,
	name,
	projectId,
	stream,
}: {
	assetId: string;
	contentType?: string;
	name: string;
	projectId: string;
	stream: ReadableStream<Uint8Array<ArrayBufferLike>>;
}): Promise<DesktopMediaLibraryFileInfo> {
	const mediaDirectory = await getDesktopManagedMediaDirectory({ projectId });
	const fileName = buildStoredMediaFileName({ assetId, name });
	const filePath = path.join(mediaDirectory, fileName);
	const temporaryPath = path.join(
		mediaDirectory,
		`.${fileName}.${process.pid}.${Date.now()}.tmp`,
	);
	assertInsideDirectory({ childPath: filePath, parentPath: mediaDirectory });
	assertInsideDirectory({
		childPath: temporaryPath,
		parentPath: mediaDirectory,
	});

	try {
		await writeWebStreamToFile({ filePath: temporaryPath, stream });
		await deleteDesktopManagedMediaAssetFile({ assetId, projectId });
		await fs.rename(temporaryPath, filePath);
		const stat = await fs.stat(filePath);
		return {
			filePath,
			name: fileName,
			size: stat.size,
			storageMode: "managed",
			type: contentType || getMimeTypeFromFileName(fileName),
		};
	} catch (error) {
		await fs.rm(temporaryPath, { force: true }).catch(() => {});
		throw error;
	}
}

export async function writeWebStreamToFile({
	filePath,
	stream,
}: {
	filePath: string;
	stream: ReadableStream<Uint8Array<ArrayBufferLike>>;
}): Promise<void> {
	await pipeline(
		Readable.fromWeb(stream),
		createWriteStream(filePath, { flags: "wx" }),
	);
}

async function deleteDesktopManagedMediaAssetFile({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<void> {
	const existing = await findManagedMediaAssetFile({ assetId, projectId });
	if (existing) await fs.rm(existing.filePath, { force: true });
}

export async function deleteDesktopMediaAssetFile({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<void> {
	await deleteDesktopManagedMediaAssetFile({ assetId, projectId });
}

export async function clearDesktopProjectMediaFiles({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	const projectDirectory = await findDesktopProjectDirectory({ projectId });
	if (!projectDirectory) return;
	const mediaDirectory = path.join(projectDirectory, "media", "managed");
	assertInsideDirectory({
		childPath: mediaDirectory,
		parentPath: projectDirectory,
	});
	await fs.rm(mediaDirectory, { recursive: true, force: true });
}

export const changeDesktopMediaLibraryDirectory =
	changeDesktopProjectLibraryDirectory;
export const getDesktopMediaLibraryStatus = getDesktopProjectLibraryStatus;

export async function openDesktopMediaLibraryDirectory({
	projectId,
}: {
	projectId?: string;
} = {}): Promise<{
	directory: string;
	error?: string;
}> {
	const directory =
		(projectId
			? await findDesktopProjectDirectory({ projectId })
			: getDesktopProjectLibraryDirectory()) ??
		getDesktopProjectLibraryDirectory();
	if (process.env.SHOTLYX_DESKTOP_MEDIA_LIBRARY_TEST_OPEN === "1") {
		return { directory };
	}
	const electron = await import("electron");
	const openPath = getElectronOpenPath({ electron });
	const error = await openPath({ target: directory });
	return error ? { directory, error } : { directory };
}

export async function selectDesktopMediaLibraryDirectory(): Promise<{
	cancelled: boolean;
	directory: string | null;
}> {
	const testDirectory =
		process.env.SHOTLYX_DESKTOP_MEDIA_LIBRARY_TEST_SELECT_DIR;
	if (testDirectory) {
		const config = await changeDesktopProjectLibraryDirectory({
			directory: testDirectory,
		});
		return { cancelled: false, directory: config.directory };
	}
	const electron = await import("electron");
	const showOpenDialog = getElectronShowOpenDialog({ electron });
	const result = await showOpenDialog({
		buttonLabel: "Use Folder",
		defaultPath: readDesktopProjectLibraryConfig().directory,
		message: "Choose where Shotlyx stores project folders.",
		properties: ["openDirectory", "createDirectory"],
		title: "Choose Shotlyx Projects Folder",
	});
	const directory = result.filePaths[0];
	if (result.canceled || !directory) {
		return { cancelled: true, directory: null };
	}
	const config = await changeDesktopProjectLibraryDirectory({ directory });
	return { cancelled: false, directory: config.directory };
}

export async function selectDesktopMediaFiles(): Promise<{
	cancelled: boolean;
	files: SelectedDesktopMediaFile[];
}> {
	const electron = await import("electron");
	const showOpenDialog = getElectronShowOpenDialog({ electron });
	const result = await showOpenDialog({
		buttonLabel: "Link Files",
		message: "Choose media to link to this project.",
		properties: ["openFile", "multiSelections"],
		title: "Import Media",
	});
	if (result.canceled) return { cancelled: true, files: [] };
	const files: SelectedDesktopMediaFile[] = [];
	for (const filePath of result.filePaths) {
		const stat = await fs.stat(filePath).catch(() => null);
		if (!stat?.isFile()) continue;
		const id = randomUUID();
		selectedMediaFiles.set(id, filePath);
		files.push({
			id,
			lastModified: stat.mtimeMs,
			name: path.basename(filePath),
			size: stat.size,
			sourcePath: filePath,
			type: getMimeTypeFromFileName(filePath),
		});
	}
	return { cancelled: false, files };
}

export async function getSelectedDesktopMediaFile({
	id,
}: {
	id: string;
}): Promise<DesktopMediaLibraryFileInfo | null> {
	const filePath = selectedMediaFiles.get(id);
	if (!filePath) return null;
	try {
		const stat = await fs.stat(filePath);
		if (!stat.isFile()) return null;
		return {
			filePath,
			name: path.basename(filePath),
			size: stat.size,
			sourcePath: filePath,
			storageMode: "linked",
			type: getMimeTypeFromFileName(filePath),
		};
	} catch {
		return null;
	}
}

export async function relinkDesktopMediaAsset({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<{ cancelled: boolean; sourcePath: string | null }> {
	const metadata = await getDesktopProjectMediaMetadata({ assetId, projectId });
	if (!metadata) throw new Error("desktop_media_not_found");
	const currentStorage = readStorageSource(metadata.storage);
	const electron = await import("electron");
	const showOpenDialog = getElectronShowOpenDialog({ electron });
	const result = await showOpenDialog({
		buttonLabel: "Relink",
		defaultPath:
			currentStorage?.mode === "linked"
				? path.dirname(currentStorage.sourcePath)
				: undefined,
		message: "Choose the replacement file.",
		properties: ["openFile"],
		title: "Relink Media",
	});
	const sourcePath = result.filePaths[0];
	if (result.canceled || !sourcePath) {
		return { cancelled: true, sourcePath: null };
	}
	const stat = await fs.stat(sourcePath);
	if (!stat.isFile()) throw new Error("desktop_linked_media_invalid");
	await saveDesktopProjectMediaMetadata({
		asset: {
			...metadata,
			lastModified: stat.mtimeMs,
			size: stat.size,
			storage: { mode: "linked", sourcePath: path.resolve(sourcePath) },
		},
		projectId,
	});
	await deleteDesktopManagedMediaAssetFile({ assetId, projectId });
	return { cancelled: false, sourcePath: path.resolve(sourcePath) };
}

export async function consolidateDesktopMediaAsset({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<{ consolidated: boolean }> {
	const metadata = await getDesktopProjectMediaMetadata({ assetId, projectId });
	if (!metadata) throw new Error("desktop_media_not_found");
	const storage = readStorageSource(metadata.storage);
	if (storage?.mode !== "linked") return { consolidated: false };
	const source = await fs.open(storage.sourcePath, "r");
	try {
		const stream = Readable.toWeb(source.createReadStream());
		await saveDesktopMediaAssetStream({
			assetId,
			name:
				typeof metadata.name === "string"
					? metadata.name
					: path.basename(storage.sourcePath),
			projectId,
			stream,
		});
	} finally {
		await source.close().catch(() => {});
	}
	await saveDesktopProjectMediaMetadata({
		asset: { ...metadata, storage: { mode: "managed" } },
		projectId,
	});
	return { consolidated: true };
}

function getElectronOpenPath({ electron }: { electron: unknown }) {
	if (typeof electron !== "object" || electron === null) {
		throw new Error("electron_shell_unavailable");
	}
	const shell = Reflect.get(electron, "shell");
	if (typeof shell !== "object" || shell === null) {
		throw new Error("electron_shell_unavailable");
	}
	const openPath = Reflect.get(shell, "openPath");
	if (typeof openPath !== "function") {
		throw new Error("electron_open_path_unavailable");
	}
	return async ({ target }: { target: string }): Promise<string> => {
		const result = await Promise.resolve(openPath(target));
		return typeof result === "string" ? result : "";
	};
}

function getElectronShowOpenDialog({ electron }: { electron: unknown }) {
	if (typeof electron !== "object" || electron === null) {
		throw new Error("electron_dialog_unavailable");
	}
	const dialog = Reflect.get(electron, "dialog");
	if (typeof dialog !== "object" || dialog === null) {
		throw new Error("electron_dialog_unavailable");
	}
	const showOpenDialog = Reflect.get(dialog, "showOpenDialog");
	if (typeof showOpenDialog !== "function") {
		throw new Error("electron_show_open_dialog_unavailable");
	}
	return async (options: {
		buttonLabel?: string;
		defaultPath?: string;
		message?: string;
		properties: Array<
			"openDirectory" | "createDirectory" | "openFile" | "multiSelections"
		>;
		title?: string;
	}): Promise<{ canceled: boolean; filePaths: string[] }> => {
		const result = await Promise.resolve(showOpenDialog(options));
		if (typeof result !== "object" || result === null) {
			return { canceled: true, filePaths: [] };
		}
		const canceled = Reflect.get(result, "canceled");
		const filePaths = Reflect.get(result, "filePaths");
		return {
			canceled: canceled === true,
			filePaths: Array.isArray(filePaths)
				? filePaths.filter((item): item is string => typeof item === "string")
				: [],
		};
	};
}

export function getMimeTypeFromFileName(fileName: string): string {
	const extension = path.extname(fileName).toLowerCase();
	if (extension === ".mp4") return "video/mp4";
	if (extension === ".webm") return "video/webm";
	if (extension === ".mov") return "video/quicktime";
	if (extension === ".mkv") return "video/x-matroska";
	if (extension === ".mp3") return "audio/mpeg";
	if (extension === ".wav") return "audio/wav";
	if (extension === ".m4a") return "audio/mp4";
	if (extension === ".aac") return "audio/aac";
	if (extension === ".ogg") return "audio/ogg";
	if (extension === ".png") return "image/png";
	if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
	if (extension === ".gif") return "image/gif";
	if (extension === ".webp") return "image/webp";
	if (extension === ".svg") return "image/svg+xml";
	if (extension === ".srt") return "application/x-subrip";
	if (extension === ".vtt") return "text/vtt";
	if (extension === ".txt") return "text/plain";
	return "application/octet-stream";
}
