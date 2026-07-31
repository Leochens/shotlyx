import {
	chmodSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface DesktopMediaLibraryConfigFile {
	version: 1;
	directory: string;
	updatedAt: string;
}

export interface DesktopMediaLibraryFileInfo {
	filePath: string;
	name: string;
	size: number;
	type: string;
}

const CONFIG_VERSION = 1;
const MAX_SAFE_FILE_NAME_LENGTH = 160;

export function getDesktopMediaLibraryConfigPath(): string {
	return (
		process.env.SHOTLYX_DESKTOP_MEDIA_LIBRARY_CONFIG_PATH ??
		path.join(homedir(), ".shotlyx", "desktop-media-library.json")
	);
}

export function getDefaultDesktopMediaLibraryDirectory({
	homeDir = homedir(),
	platform = process.platform,
}: {
	homeDir?: string;
	platform?: NodeJS.Platform;
} = {}): string {
	const mediaFolder = platform === "win32" ? "Videos" : "Movies";
	return path.join(homeDir, mediaFolder, "Shotlyx Library");
}

function normalizeLibraryDirectory(directory: string): string {
	const trimmed = directory.trim();
	if (!trimmed) {
		throw new Error("desktop_media_library_empty_directory");
	}
	return path.resolve(trimmed);
}

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

function getErrorCode({ error }: { error: unknown }): string | null {
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

export function readDesktopMediaLibraryConfig(): DesktopMediaLibraryConfigFile {
	const configPath = getDesktopMediaLibraryConfigPath();
	const defaultDirectory = getDefaultDesktopMediaLibraryDirectory();
	if (!existsSync(configPath)) {
		return {
			version: CONFIG_VERSION,
			directory: defaultDirectory,
			updatedAt: new Date(0).toISOString(),
		};
	}

	try {
		const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			throw new Error("Invalid desktop media library config");
		}
		const maybeConfig = raw as Partial<DesktopMediaLibraryConfigFile>;
		return {
			version: CONFIG_VERSION,
			directory:
				typeof maybeConfig.directory === "string"
					? normalizeLibraryDirectory(maybeConfig.directory)
					: defaultDirectory,
			updatedAt:
				typeof maybeConfig.updatedAt === "string"
					? maybeConfig.updatedAt
					: new Date(0).toISOString(),
		};
	} catch {
		return {
			version: CONFIG_VERSION,
			directory: defaultDirectory,
			updatedAt: new Date(0).toISOString(),
		};
	}
}

export function writeDesktopMediaLibraryConfig({
	directory,
}: {
	directory: string;
}): DesktopMediaLibraryConfigFile {
	const configPath = getDesktopMediaLibraryConfigPath();
	const normalizedDirectory = normalizeLibraryDirectory(directory);
	mkdirSync(path.dirname(configPath), { recursive: true });
	mkdirSync(normalizedDirectory, { recursive: true });

	const config = {
		version: CONFIG_VERSION,
		directory: normalizedDirectory,
		updatedAt: new Date().toISOString(),
	} satisfies DesktopMediaLibraryConfigFile;

	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
		mode: 0o600,
	});
	try {
		chmodSync(configPath, 0o600);
	} catch {
		// Best effort on filesystems without POSIX permissions.
	}
	return config;
}

export async function changeDesktopMediaLibraryDirectory({
	directory,
}: {
	directory: string;
}): Promise<DesktopMediaLibraryConfigFile> {
	const current = readDesktopMediaLibraryConfig();
	const nextDirectory = normalizeLibraryDirectory(directory);
	if (path.resolve(current.directory) !== nextDirectory && existsSync(current.directory)) {
		await fs.mkdir(nextDirectory, { recursive: true });
		await fs.cp(current.directory, nextDirectory, {
			errorOnExist: false,
			force: false,
			recursive: true,
		});
	}
	return writeDesktopMediaLibraryConfig({ directory: nextDirectory });
}

export function getDesktopMediaLibraryDirectory(): string {
	const config = readDesktopMediaLibraryConfig();
	mkdirSync(config.directory, { recursive: true });
	return config.directory;
}

function getProjectMediaDirectory({
	libraryDirectory = getDesktopMediaLibraryDirectory(),
	projectId,
}: {
	libraryDirectory?: string;
	projectId: string;
}): string {
	const safeProjectId = safeSegment({ fallback: "project", value: projectId });
	const directory = path.join(libraryDirectory, "projects", safeProjectId, "media");
	assertInsideDirectory({ childPath: directory, parentPath: libraryDirectory });
	return directory;
}

export function buildStoredMediaFileName({
	assetId,
	name,
}: {
	assetId: string;
	name: string;
}): string {
	return `${safeSegment({ fallback: "asset", value: assetId })}--${safeFileName({
		fallback: "media",
		value: name,
	})}`;
}

export async function findDesktopMediaAssetFile({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<DesktopMediaLibraryFileInfo | null> {
	const libraryDirectory = getDesktopMediaLibraryDirectory();
	const mediaDirectory = getProjectMediaDirectory({ libraryDirectory, projectId });
	const safeAssetId = safeSegment({ fallback: "asset", value: assetId });
	const fileNames = await fs.readdir(mediaDirectory).catch((error: unknown) => {
		if (getErrorCode({ error }) === "ENOENT") return [];
		throw error;
	});
	const fileName =
		fileNames.find((item) => item.startsWith(`${safeAssetId}--`)) ??
		fileNames.find((item) => item === safeAssetId);
	if (!fileName) return null;

	const filePath = path.join(mediaDirectory, fileName);
	assertInsideDirectory({ childPath: filePath, parentPath: libraryDirectory });
	const stat = await fs.stat(filePath);
	if (!stat.isFile()) return null;
	return {
		filePath,
		name: fileName,
		size: stat.size,
		type: getMimeTypeFromFileName(fileName),
	};
}

export async function saveDesktopMediaAssetFile({
	assetId,
	blob,
	name,
	projectId,
}: {
	assetId: string;
	blob: Blob;
	name: string;
	projectId: string;
}): Promise<DesktopMediaLibraryFileInfo> {
	const libraryDirectory = getDesktopMediaLibraryDirectory();
	const mediaDirectory = getProjectMediaDirectory({ libraryDirectory, projectId });
	await fs.mkdir(mediaDirectory, { recursive: true });
	await deleteDesktopMediaAssetFile({ assetId, projectId });

	const fileName = buildStoredMediaFileName({ assetId, name });
	const filePath = path.join(mediaDirectory, fileName);
	assertInsideDirectory({ childPath: filePath, parentPath: libraryDirectory });
	await writeBlobToFile({ blob, filePath });
	const stat = await fs.stat(filePath);
	return {
		filePath,
		name: fileName,
		size: stat.size,
		type: blob.type || getMimeTypeFromFileName(fileName),
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
	stream: ReadableStream<Uint8Array>;
}): Promise<DesktopMediaLibraryFileInfo> {
	const libraryDirectory = getDesktopMediaLibraryDirectory();
	const mediaDirectory = getProjectMediaDirectory({ libraryDirectory, projectId });
	await fs.mkdir(mediaDirectory, { recursive: true });

	const fileName = buildStoredMediaFileName({ assetId, name });
	const filePath = path.join(mediaDirectory, fileName);
	const tempPath = path.join(
		mediaDirectory,
		`.${fileName}.${process.pid}.${Date.now()}.tmp`,
	);
	assertInsideDirectory({ childPath: filePath, parentPath: libraryDirectory });
	assertInsideDirectory({ childPath: tempPath, parentPath: libraryDirectory });

	try {
		await writeWebStreamToFile({ filePath: tempPath, stream });
		await deleteDesktopMediaAssetFile({ assetId, projectId });
		await fs.rename(tempPath, filePath);
		const stat = await fs.stat(filePath);
		return {
			filePath,
			name: fileName,
			size: stat.size,
			type: contentType || getMimeTypeFromFileName(fileName),
		};
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => {});
		throw error;
	}
}

async function writeBlobToFile({
	blob,
	filePath,
}: {
	blob: Blob;
	filePath: string;
}): Promise<void> {
	await writeWebStreamToFile({
		filePath,
		stream: blob.stream() as ReadableStream<Uint8Array>,
	});
}

export async function writeWebStreamToFile({
	filePath,
	stream,
}: {
	filePath: string;
	stream: ReadableStream<Uint8Array>;
}): Promise<void> {
	await pipeline(
		Readable.fromWeb(stream),
		createWriteStream(filePath, { flags: "wx" }),
	);
}

export async function deleteDesktopMediaAssetFile({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<void> {
	const existing = await findDesktopMediaAssetFile({ assetId, projectId });
	if (!existing) return;
	await fs.rm(existing.filePath, { force: true });
}

export async function clearDesktopProjectMediaFiles({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	const libraryDirectory = getDesktopMediaLibraryDirectory();
	const mediaDirectory = getProjectMediaDirectory({ libraryDirectory, projectId });
	assertInsideDirectory({ childPath: mediaDirectory, parentPath: libraryDirectory });
	await fs.rm(mediaDirectory, { recursive: true, force: true });
}

async function getDirectorySizeBytes(directory: string): Promise<number> {
	const entries = await fs.readdir(directory, { withFileTypes: true }).catch(
		(error: unknown) => {
			if (getErrorCode({ error }) === "ENOENT") return [];
			throw error;
		},
	);
	let total = 0;
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			total += await getDirectorySizeBytes(entryPath);
		} else if (entry.isFile()) {
			total += (await fs.stat(entryPath)).size;
		}
	}
	return total;
}

export async function getDesktopMediaLibraryStatus({
	projectId,
}: {
	projectId?: string;
} = {}) {
	const config = readDesktopMediaLibraryConfig();
	mkdirSync(config.directory, { recursive: true });
	const projectDirectory = projectId
		? getProjectMediaDirectory({
				libraryDirectory: config.directory,
				projectId,
			})
		: null;
	return {
		configPath: getDesktopMediaLibraryConfigPath(),
		directory: config.directory,
		exists: existsSync(config.directory),
		projectId,
		projectSizeBytes: projectDirectory
			? await getDirectorySizeBytes(projectDirectory)
			: null,
		sizeBytes: await getDirectorySizeBytes(config.directory),
		updatedAt: config.updatedAt,
	};
}

export async function openDesktopMediaLibraryDirectory(): Promise<{
	directory: string;
	error?: string;
}> {
	const directory = getDesktopMediaLibraryDirectory();
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
	const testDirectory = process.env.SHOTLYX_DESKTOP_MEDIA_LIBRARY_TEST_SELECT_DIR;
	if (testDirectory) {
		const config = await changeDesktopMediaLibraryDirectory({
			directory: testDirectory,
		});
		return { cancelled: false, directory: config.directory };
	}

	const electron = await import("electron");
	const showOpenDialog = getElectronShowOpenDialog({ electron });
	const result = await showOpenDialog({
		buttonLabel: "Use Folder",
		defaultPath: readDesktopMediaLibraryConfig().directory,
		message: "Choose where Shotlyx stores imported media files.",
		properties: ["openDirectory", "createDirectory"],
		title: "Choose Shotlyx Media Library",
	});
	const directory = result.filePaths[0];
	if (result.canceled || !directory) {
		return { cancelled: true, directory: null };
	}
	const config = await changeDesktopMediaLibraryDirectory({ directory });
	return { cancelled: false, directory: config.directory };
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
		properties: Array<"openDirectory" | "createDirectory">;
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

function getMimeTypeFromFileName(fileName: string): string {
	const extension = path.extname(fileName).toLowerCase();
	if (extension === ".mp4") return "video/mp4";
	if (extension === ".webm") return "video/webm";
	if (extension === ".mov") return "video/quicktime";
	if (extension === ".mp3") return "audio/mpeg";
	if (extension === ".wav") return "audio/wav";
	if (extension === ".m4a") return "audio/mp4";
	if (extension === ".png") return "image/png";
	if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
	if (extension === ".gif") return "image/gif";
	if (extension === ".svg") return "image/svg+xml";
	return "application/octet-stream";
}
