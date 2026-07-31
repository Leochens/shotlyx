import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DESKTOP_PROJECT_FORMAT_VERSION = 1;
export const DESKTOP_PROJECT_EXTENSION = ".shotlyx";
const projectWriteQueues = new Map<string, Promise<void>>();

export interface DesktopProjectLibraryConfig {
	version: 1;
	directory: string;
	updatedAt: string;
}

export interface DesktopProjectDocument {
	formatVersion: typeof DESKTOP_PROJECT_FORMAT_VERSION;
	savedAt: string;
	project: Record<string, unknown>;
	media: {
		assets: Array<Record<string, unknown>>;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorCode(error: unknown): string | null {
	if (!isRecord(error)) return null;
	const code = Reflect.get(error, "code");
	return typeof code === "string" ? code : null;
}

async function serializeProjectWrite<T>({
	operation,
	projectId,
}: {
	operation: () => Promise<T>;
	projectId: string;
}): Promise<T> {
	const previous = projectWriteQueues.get(projectId) ?? Promise.resolve();
	const result = previous.catch(() => {}).then(operation);
	const queueMarker = result.then(
		() => undefined,
		() => undefined,
	);
	projectWriteQueues.set(projectId, queueMarker);
	try {
		return await result;
	} finally {
		if (projectWriteQueues.get(projectId) === queueMarker) {
			projectWriteQueues.delete(projectId);
		}
	}
}

function normalizeDirectory(directory: string): string {
	const trimmed = directory.trim();
	if (!trimmed) throw new Error("desktop_project_library_empty_directory");
	return path.resolve(trimmed);
}

function getDefaultDocumentsDirectory(): string {
	const configured = process.env.SHOTLYX_PROJECTS_ROOT?.trim();
	if (configured) return normalizeDirectory(configured);
	return path.join(homedir(), "Documents", "Shotlyx Projects");
}

export function getDesktopProjectLibraryConfigPath(): string {
	return (
		process.env.SHOTLYX_PROJECTS_CONFIG_PATH ??
		path.join(homedir(), ".shotlyx", "project-library.json")
	);
}

export function readDesktopProjectLibraryConfig(): DesktopProjectLibraryConfig {
	const configPath = getDesktopProjectLibraryConfigPath();
	const fallbackDirectory = getDefaultDocumentsDirectory();
	if (!existsSync(configPath)) {
		return {
			version: DESKTOP_PROJECT_FORMAT_VERSION,
			directory: fallbackDirectory,
			updatedAt: new Date(0).toISOString(),
		};
	}

	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
		if (!isRecord(parsed)) throw new Error("Invalid project library config");
		return {
			version: DESKTOP_PROJECT_FORMAT_VERSION,
			directory:
				typeof parsed.directory === "string"
					? normalizeDirectory(parsed.directory)
					: fallbackDirectory,
			updatedAt:
				typeof parsed.updatedAt === "string"
					? parsed.updatedAt
					: new Date(0).toISOString(),
		};
	} catch {
		return {
			version: DESKTOP_PROJECT_FORMAT_VERSION,
			directory: fallbackDirectory,
			updatedAt: new Date(0).toISOString(),
		};
	}
}

export function writeDesktopProjectLibraryConfig({
	directory,
}: {
	directory: string;
}): DesktopProjectLibraryConfig {
	const configPath = getDesktopProjectLibraryConfigPath();
	const normalizedDirectory = normalizeDirectory(directory);
	mkdirSync(path.dirname(configPath), { recursive: true });
	mkdirSync(normalizedDirectory, { recursive: true });
	const config = {
		version: DESKTOP_PROJECT_FORMAT_VERSION,
		directory: normalizedDirectory,
		updatedAt: new Date().toISOString(),
	} satisfies DesktopProjectLibraryConfig;
	writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
		mode: 0o600,
	});
	try {
		chmodSync(configPath, 0o600);
	} catch {
		// Some filesystems do not expose POSIX permissions.
	}
	return config;
}

export function getDesktopProjectLibraryDirectory(): string {
	const config = readDesktopProjectLibraryConfig();
	mkdirSync(config.directory, { recursive: true });
	return config.directory;
}

function safeSlug(value: string): string {
	const normalized = value
		.normalize("NFKD")
		.split("")
		.map((character) =>
			character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character)
				? "-"
				: character,
		)
		.join("")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[.-]+|[.-]+$/g, "")
		.toLowerCase();
	return (normalized || "untitled").slice(0, 64);
}

function assertInsideDirectory({
	childPath,
	parentPath,
}: {
	childPath: string;
	parentPath: string;
}): void {
	const relative = path.relative(parentPath, childPath);
	if (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	) {
		return;
	}
	throw new Error("desktop_project_library_path_escape");
}

function getProjectIdentity(project: Record<string, unknown>): {
	id: string;
	name: string;
} {
	const metadata = Reflect.get(project, "metadata");
	if (!isRecord(metadata)) throw new Error("desktop_project_missing_metadata");
	const id = Reflect.get(metadata, "id");
	const name = Reflect.get(metadata, "name");
	if (typeof id !== "string" || !id.trim()) {
		throw new Error("desktop_project_missing_id");
	}
	if (typeof name !== "string" || !name.trim()) {
		throw new Error("desktop_project_missing_name");
	}
	return { id, name };
}

function parseProjectDocument(value: unknown): DesktopProjectDocument | null {
	if (!isRecord(value)) return null;
	if (value.formatVersion !== DESKTOP_PROJECT_FORMAT_VERSION) return null;
	if (!isRecord(value.project)) return null;
	try {
		getProjectIdentity(value.project);
	} catch {
		return null;
	}
	const rawMedia = isRecord(value.media) ? value.media.assets : [];
	return {
		formatVersion: DESKTOP_PROJECT_FORMAT_VERSION,
		savedAt:
			typeof value.savedAt === "string"
				? value.savedAt
				: new Date(0).toISOString(),
		project: value.project,
		media: {
			assets: Array.isArray(rawMedia)
				? rawMedia.filter(isRecord).map((asset) => ({ ...asset }))
				: [],
		},
	};
}

async function readProjectDocumentFromDirectory(
	directory: string,
): Promise<DesktopProjectDocument | null> {
	try {
		const text = await fs.readFile(
			path.join(directory, "project.json"),
			"utf8",
		);
		return parseProjectDocument(JSON.parse(text) as unknown);
	} catch (error) {
		if (getErrorCode(error) === "ENOENT" || error instanceof SyntaxError) {
			return null;
		}
		throw error;
	}
}

async function listProjectDirectories(): Promise<string[]> {
	const root = getDesktopProjectLibraryDirectory();
	const entries = await fs.readdir(root, { withFileTypes: true });
	return entries
		.filter(
			(entry) =>
				entry.isDirectory() && entry.name.endsWith(DESKTOP_PROJECT_EXTENSION),
		)
		.map((entry) => path.join(root, entry.name));
}

export async function findDesktopProjectDirectory({
	projectId,
}: {
	projectId: string;
}): Promise<string | null> {
	for (const directory of await listProjectDirectories()) {
		const document = await readProjectDocumentFromDirectory(directory);
		if (!document) continue;
		if (getProjectIdentity(document.project).id === projectId) return directory;
	}
	return null;
}

async function writeProjectDocument({
	directory,
	document,
}: {
	directory: string;
	document: DesktopProjectDocument;
}): Promise<void> {
	await fs.mkdir(path.join(directory, "media", "managed"), { recursive: true });
	const targetPath = path.join(directory, "project.json");
	const temporaryPath = path.join(
		directory,
		`.project.${process.pid}.${Date.now()}.tmp`,
	);
	const backupPath = path.join(
		directory,
		`.project.${process.pid}.${Date.now()}.bak`,
	);
	await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});

	let hasBackup = false;
	try {
		try {
			await fs.rename(targetPath, backupPath);
			hasBackup = true;
		} catch (error) {
			if (getErrorCode(error) !== "ENOENT") throw error;
		}
		await fs.rename(temporaryPath, targetPath);
		if (hasBackup) await fs.rm(backupPath, { force: true });
	} catch (error) {
		await fs.rm(temporaryPath, { force: true }).catch(() => {});
		if (hasBackup) {
			await fs.rename(backupPath, targetPath).catch(() => {});
		}
		throw error;
	}
}

export async function saveDesktopProject({
	project,
}: {
	project: Record<string, unknown>;
}): Promise<DesktopProjectDocument> {
	const identity = getProjectIdentity(project);
	return serializeProjectWrite({
		projectId: identity.id,
		operation: async () => {
			const root = getDesktopProjectLibraryDirectory();
			let directory = await findDesktopProjectDirectory({
				projectId: identity.id,
			});
			let current: DesktopProjectDocument | null = null;
			if (directory)
				current = await readProjectDocumentFromDirectory(directory);
			if (!directory) {
				const directoryName = `${safeSlug(identity.name)}-${safeSlug(
					identity.id,
				)}${DESKTOP_PROJECT_EXTENSION}`;
				directory = path.join(root, directoryName);
				assertInsideDirectory({ childPath: directory, parentPath: root });
			}
			const document: DesktopProjectDocument = {
				formatVersion: DESKTOP_PROJECT_FORMAT_VERSION,
				savedAt: new Date().toISOString(),
				project,
				media: current?.media ?? { assets: [] },
			};
			await writeProjectDocument({ directory, document });
			return document;
		},
	});
}

export async function loadDesktopProject({
	projectId,
}: {
	projectId: string;
}): Promise<DesktopProjectDocument | null> {
	const directory = await findDesktopProjectDirectory({ projectId });
	return directory ? readProjectDocumentFromDirectory(directory) : null;
}

export async function listDesktopProjects(): Promise<DesktopProjectDocument[]> {
	const projects: DesktopProjectDocument[] = [];
	for (const directory of await listProjectDirectories()) {
		const document = await readProjectDocumentFromDirectory(directory);
		if (document) projects.push(document);
	}
	return projects.sort((left, right) => {
		const leftMetadata = Reflect.get(left.project, "metadata");
		const rightMetadata = Reflect.get(right.project, "metadata");
		const leftUpdated = isRecord(leftMetadata)
			? Reflect.get(leftMetadata, "updatedAt")
			: null;
		const rightUpdated = isRecord(rightMetadata)
			? Reflect.get(rightMetadata, "updatedAt")
			: null;
		return (
			new Date(typeof rightUpdated === "string" ? rightUpdated : 0).getTime() -
			new Date(typeof leftUpdated === "string" ? leftUpdated : 0).getTime()
		);
	});
}

export async function deleteDesktopProject({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	await serializeProjectWrite({
		projectId,
		operation: async () => {
			const root = getDesktopProjectLibraryDirectory();
			const directory = await findDesktopProjectDirectory({ projectId });
			if (!directory) return;
			assertInsideDirectory({ childPath: directory, parentPath: root });
			await fs.rm(directory, { recursive: true, force: true });
		},
	});
}

export async function listDesktopProjectMediaMetadata({
	projectId,
}: {
	projectId: string;
}): Promise<Array<Record<string, unknown>>> {
	const document = await loadDesktopProject({ projectId });
	return document?.media.assets ?? [];
}

export async function getDesktopProjectMediaMetadata({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<Record<string, unknown> | null> {
	const assets = await listDesktopProjectMediaMetadata({ projectId });
	return assets.find((asset) => asset.id === assetId) ?? null;
}

export async function saveDesktopProjectMediaMetadata({
	asset,
	projectId,
}: {
	asset: Record<string, unknown>;
	projectId: string;
}): Promise<void> {
	const assetId = asset.id;
	if (typeof assetId !== "string" || !assetId) {
		throw new Error("desktop_media_missing_id");
	}
	await serializeProjectWrite({
		projectId,
		operation: async () => {
			const document = await loadDesktopProject({ projectId });
			const directory = await findDesktopProjectDirectory({ projectId });
			if (!document || !directory) throw new Error("desktop_project_not_found");
			const assets = document.media.assets.filter(
				(item) => item.id !== assetId,
			);
			assets.push(asset);
			await writeProjectDocument({
				directory,
				document: {
					...document,
					savedAt: new Date().toISOString(),
					media: { assets },
				},
			});
		},
	});
}

export async function deleteDesktopProjectMediaMetadata({
	assetId,
	projectId,
}: {
	assetId: string;
	projectId: string;
}): Promise<void> {
	await serializeProjectWrite({
		projectId,
		operation: async () => {
			const document = await loadDesktopProject({ projectId });
			const directory = await findDesktopProjectDirectory({ projectId });
			if (!document || !directory) return;
			await writeProjectDocument({
				directory,
				document: {
					...document,
					savedAt: new Date().toISOString(),
					media: {
						assets: document.media.assets.filter(
							(asset) => asset.id !== assetId,
						),
					},
				},
			});
		},
	});
}

export async function clearDesktopProjectMediaMetadata({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	await serializeProjectWrite({
		projectId,
		operation: async () => {
			const document = await loadDesktopProject({ projectId });
			const directory = await findDesktopProjectDirectory({ projectId });
			if (!document || !directory) return;
			await writeProjectDocument({
				directory,
				document: {
					...document,
					savedAt: new Date().toISOString(),
					media: { assets: [] },
				},
			});
		},
	});
}

export async function getDesktopManagedMediaDirectory({
	projectId,
}: {
	projectId: string;
}): Promise<string> {
	const projectDirectory = await findDesktopProjectDirectory({ projectId });
	if (!projectDirectory) throw new Error("desktop_project_not_found");
	const directory = path.join(projectDirectory, "media", "managed");
	assertInsideDirectory({ childPath: directory, parentPath: projectDirectory });
	await fs.mkdir(directory, { recursive: true });
	return directory;
}

export async function changeDesktopProjectLibraryDirectory({
	directory,
}: {
	directory: string;
}): Promise<DesktopProjectLibraryConfig> {
	const current = readDesktopProjectLibraryConfig();
	const nextDirectory = normalizeDirectory(directory);
	if (
		path.resolve(current.directory) !== nextDirectory &&
		existsSync(current.directory)
	) {
		await fs.mkdir(nextDirectory, { recursive: true });
		await fs.cp(current.directory, nextDirectory, {
			errorOnExist: false,
			force: false,
			recursive: true,
		});
	}
	return writeDesktopProjectLibraryConfig({ directory: nextDirectory });
}

async function getDirectorySizeBytes(directory: string): Promise<number> {
	const entries = await fs
		.readdir(directory, { withFileTypes: true })
		.catch((error: unknown) => {
			if (getErrorCode(error) === "ENOENT") return [];
			throw error;
		});
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

export async function getDesktopProjectLibraryStatus({
	projectId,
}: {
	projectId?: string;
} = {}) {
	const config = readDesktopProjectLibraryConfig();
	mkdirSync(config.directory, { recursive: true });
	const projectDirectory = projectId
		? await findDesktopProjectDirectory({ projectId })
		: null;
	return {
		configPath: getDesktopProjectLibraryConfigPath(),
		directory: config.directory,
		exists: existsSync(config.directory),
		projectDirectory,
		projectId,
		projectSizeBytes: projectDirectory
			? await getDirectorySizeBytes(projectDirectory)
			: null,
		sizeBytes: await getDirectorySizeBytes(config.directory),
		updatedAt: config.updatedAt,
	};
}
