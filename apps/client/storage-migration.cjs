const fs = require("node:fs");
const path = require("node:path");

const TARGET_DESKTOP_ORIGIN_PREFIX = "app_shotlyx_0";
const MIGRATION_MARKER_FILE = "desktop-storage-migration.json";
const LEGACY_PRODUCT_NAMES = [
	"Shotlyx Desktop",
	"Shotlyx",
	"Shotlyx Desktop Dev",
];
const LEGACY_ORIGIN_PREFIXES = [
	"http_127.0.0.1_3100",
	"http_127.0.0.1_3101",
	"http_127.0.0.1_5173",
	"http_localhost_3100",
	"http_localhost_3101",
	"http_localhost_5173",
	TARGET_DESKTOP_ORIGIN_PREFIX,
];
const PROJECT_DB_SIGNATURE = Buffer.from("video-editor-projects");
const PROJECT_RECORD_SIGNATURE = Buffer.from("currentSceneId");

function sanitizeOriginPart(value) {
	return value.replace(/[^a-zA-Z0-9.-]/g, "_");
}

function getStorageOriginPrefix(url) {
	const parsedUrl = new URL(url);
	const scheme = sanitizeOriginPart(parsedUrl.protocol.replace(/:$/, ""));
	const host = sanitizeOriginPart(parsedUrl.hostname);
	const port = parsedUrl.port || "0";
	return `${scheme}_${host}_${port}`;
}

function getIndexedDBOriginPaths({ userDataPath, originPrefix }) {
	const indexedDBDir = path.join(userDataPath, "IndexedDB");
	return {
		blobDir: path.join(indexedDBDir, `${originPrefix}.indexeddb.blob`),
		leveldbDir: path.join(indexedDBDir, `${originPrefix}.indexeddb.leveldb`),
	};
}

function pathsAreSame(a, b) {
	return path.resolve(a) === path.resolve(b);
}

function readFileSignatureFlags(filePath) {
	try {
		const stat = fs.statSync(filePath);
		if (!stat.isFile()) {
			return { hasProjectDb: false, hasProjectRecord: false };
		}
		const file = fs.readFileSync(filePath);
		return {
			hasProjectDb: file.includes(PROJECT_DB_SIGNATURE),
			hasProjectRecord: file.includes(PROJECT_RECORD_SIGNATURE),
		};
	} catch {
		return { hasProjectDb: false, hasProjectRecord: false };
	}
}

function readProjectSignatureScore(leveldbDir) {
	if (!fs.existsSync(leveldbDir)) return 0;
	let score = 0;
	let hasProjectDb = false;
	for (const fileName of fs.readdirSync(leveldbDir)) {
		if (!/\.(?:ldb|log)$/.test(fileName)) continue;
		const filePath = path.join(leveldbDir, fileName);
		const flags = readFileSignatureFlags(filePath);
		hasProjectDb = hasProjectDb || flags.hasProjectDb;
		if (flags.hasProjectRecord) score += 1;
	}
	return hasProjectDb ? score : 0;
}

function hasProjectData({ leveldbDir }) {
	return readProjectSignatureScore(leveldbDir) > 0;
}

function getLatestMtimeMs(targetPath) {
	if (!fs.existsSync(targetPath)) return 0;
	let latest = 0;
	const entries = fs.readdirSync(targetPath, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(targetPath, entry.name);
		try {
			const stat = fs.statSync(entryPath);
			latest = Math.max(latest, stat.mtimeMs);
			if (entry.isDirectory()) {
				latest = Math.max(latest, getLatestMtimeMs(entryPath));
			}
		} catch {
			// Ignore files that disappear while scanning Chromium storage.
		}
	}
	return latest;
}

function getUniqueExistingPaths(paths) {
	const seen = new Set();
	const result = [];
	for (const candidate of paths) {
		const resolved = path.resolve(candidate);
		if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
		seen.add(resolved);
		result.push(resolved);
	}
	return result;
}

function getLegacyUserDataPaths({ appDataPath, currentUserDataPath }) {
	return getUniqueExistingPaths([
		currentUserDataPath,
		...LEGACY_PRODUCT_NAMES.map((productName) =>
			path.join(appDataPath, productName),
		),
	]);
}

function listLegacyIndexedDBSources({
	appDataPath,
	currentUserDataPath,
	targetOriginPrefix = TARGET_DESKTOP_ORIGIN_PREFIX,
}) {
	const roots = getLegacyUserDataPaths({ appDataPath, currentUserDataPath });
	const sources = [];
	for (const userDataPath of roots) {
		for (const originPrefix of LEGACY_ORIGIN_PREFIXES) {
			if (
				pathsAreSame(userDataPath, currentUserDataPath) &&
				originPrefix === targetOriginPrefix
			) {
				continue;
			}
			const paths = getIndexedDBOriginPaths({ userDataPath, originPrefix });
			const score = readProjectSignatureScore(paths.leveldbDir);
			if (score === 0) continue;
			sources.push({
				...paths,
				originPrefix,
				score,
				userDataPath,
				updatedAt: getLatestMtimeMs(paths.leveldbDir),
			});
		}
	}
	return sources.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
}

function copyDirectory({ from, to }) {
	if (!fs.existsSync(from)) return;
	fs.rmSync(to, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(to), { recursive: true });
	fs.cpSync(from, to, {
		recursive: true,
		errorOnExist: false,
		force: true,
	});
}

function backupTargetDirectory({ targetPaths }) {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupRoot = path.join(
		path.dirname(path.dirname(targetPaths.leveldbDir)),
		`shotlyx-migration-backup-${timestamp}`,
	);
	const backup = {
		blobDir: path.join(backupRoot, path.basename(targetPaths.blobDir)),
		leveldbDir: path.join(backupRoot, path.basename(targetPaths.leveldbDir)),
		root: backupRoot,
	};
	copyDirectory({ from: targetPaths.leveldbDir, to: backup.leveldbDir });
	copyDirectory({ from: targetPaths.blobDir, to: backup.blobDir });
	return backup;
}

function getMigrationMarkerPath({ currentUserDataPath, targetOriginPrefix }) {
	return path.join(
		currentUserDataPath,
		`desktop-storage-migration-${targetOriginPrefix}.json`,
	);
}

function writeMigrationMarker({
	currentUserDataPath,
	source,
	targetOriginPrefix,
}) {
	fs.mkdirSync(currentUserDataPath, { recursive: true });
	fs.writeFileSync(
		getMigrationMarkerPath({ currentUserDataPath, targetOriginPrefix }),
		JSON.stringify(
			{
				migratedAt: new Date().toISOString(),
				source: {
					originPrefix: source.originPrefix,
					userDataPath: source.userDataPath,
				},
				target: {
					originPrefix: targetOriginPrefix,
					userDataPath: currentUserDataPath,
				},
				version: 1,
			},
			null,
			2,
		) + "\n",
	);
}

function migrateLegacyDesktopStorage({
	appDataPath,
	currentUserDataPath,
	targetOriginPrefix = TARGET_DESKTOP_ORIGIN_PREFIX,
}) {
	if (process.env.SHOTLYX_DISABLE_STORAGE_MIGRATION === "1") {
		return { status: "skipped", reason: "disabled" };
	}

	const markerPath = getMigrationMarkerPath({
		currentUserDataPath,
		targetOriginPrefix,
	});
	if (fs.existsSync(markerPath)) {
		return { status: "skipped", reason: "already_migrated" };
	}

	const targetPaths = getIndexedDBOriginPaths({
		userDataPath: currentUserDataPath,
		originPrefix: targetOriginPrefix,
	});
	const targetScore = readProjectSignatureScore(targetPaths.leveldbDir);

	const source = listLegacyIndexedDBSources({
		appDataPath,
		currentUserDataPath,
		targetOriginPrefix,
	})[0];
	if (!source) {
		return { status: "skipped", reason: "no_legacy_projects" };
	}
	if (targetScore > 0 && source.score <= targetScore) {
		return {
			status: "skipped",
			reason: "target_has_projects",
			sourceScore: source.score,
			targetScore,
		};
	}

	const backup = hasProjectData(targetPaths)
		? backupTargetDirectory({ targetPaths })
		: null;
	copyDirectory({ from: source.leveldbDir, to: targetPaths.leveldbDir });
	copyDirectory({ from: source.blobDir, to: targetPaths.blobDir });
	writeMigrationMarker({ currentUserDataPath, source, targetOriginPrefix });

	return {
		...(backup && { backup }),
		status: "migrated",
		source: {
			originPrefix: source.originPrefix,
			score: source.score,
			userDataPath: source.userDataPath,
		},
		target: {
			originPrefix: targetOriginPrefix,
			previousScore: targetScore,
			userDataPath: currentUserDataPath,
		},
	};
}

module.exports = {
	TARGET_DESKTOP_ORIGIN_PREFIX,
	getIndexedDBOriginPaths,
	getStorageOriginPrefix,
	listLegacyIndexedDBSources,
	migrateLegacyDesktopStorage,
};
