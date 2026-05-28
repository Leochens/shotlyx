const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	TARGET_DESKTOP_ORIGIN_PREFIX,
	getIndexedDBOriginPaths,
	migrateLegacyDesktopStorage,
} = require("./storage-migration.cjs");

function createTempRoot() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "shotlyx-storage-migration-"));
}

function writeIndexedDBFixture({ userDataPath, originPrefix, content }) {
	const paths = getIndexedDBOriginPaths({ userDataPath, originPrefix });
	fs.mkdirSync(paths.leveldbDir, { recursive: true });
	fs.writeFileSync(path.join(paths.leveldbDir, "000003.log"), content);
	fs.mkdirSync(paths.blobDir, { recursive: true });
	fs.writeFileSync(path.join(paths.blobDir, "blob"), "blob-data");
}

test("migrates legacy localhost IndexedDB projects into the desktop app origin", () => {
	const tempRoot = createTempRoot();
	try {
		const appDataPath = path.join(tempRoot, "Application Support");
		const currentUserDataPath = path.join(appDataPath, "Shotlyx Desktop");
		const legacyUserDataPath = path.join(appDataPath, "Shotlyx");
		writeIndexedDBFixture({
			userDataPath: legacyUserDataPath,
			originPrefix: "http_127.0.0.1_3100",
			content:
				"video-editor-projects metadata currentSceneId project-one brandKits",
		});

		const result = migrateLegacyDesktopStorage({
			appDataPath,
			currentUserDataPath,
		});

		const targetPaths = getIndexedDBOriginPaths({
			userDataPath: currentUserDataPath,
			originPrefix: TARGET_DESKTOP_ORIGIN_PREFIX,
		});
		assert.equal(result.status, "migrated");
		assert.equal(
			fs.readFileSync(path.join(targetPaths.leveldbDir, "000003.log"), "utf8"),
			"video-editor-projects metadata currentSceneId project-one brandKits",
		);
		assert.equal(
			fs.readFileSync(path.join(targetPaths.blobDir, "blob"), "utf8"),
			"blob-data",
		);
		assert.equal(
			JSON.parse(
				fs.readFileSync(
					path.join(currentUserDataPath, "desktop-storage-migration.json"),
					"utf8",
				),
			).source.originPrefix,
			"http_127.0.0.1_3100",
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("does not overwrite an existing desktop app origin with project data", () => {
	const tempRoot = createTempRoot();
	try {
		const appDataPath = path.join(tempRoot, "Application Support");
		const currentUserDataPath = path.join(appDataPath, "Shotlyx Desktop");
		writeIndexedDBFixture({
			userDataPath: currentUserDataPath,
			originPrefix: TARGET_DESKTOP_ORIGIN_PREFIX,
			content: "video-editor-projects metadata currentSceneId current-project",
		});
		writeIndexedDBFixture({
			userDataPath: path.join(appDataPath, "Shotlyx"),
			originPrefix: "http_127.0.0.1_3100",
			content: "video-editor-projects metadata currentSceneId old-project",
		});

		const result = migrateLegacyDesktopStorage({
			appDataPath,
			currentUserDataPath,
		});

		const targetPaths = getIndexedDBOriginPaths({
			userDataPath: currentUserDataPath,
			originPrefix: TARGET_DESKTOP_ORIGIN_PREFIX,
		});
		assert.equal(result.status, "skipped");
		assert.equal(result.reason, "target_has_projects");
		assert.equal(
			fs.readFileSync(path.join(targetPaths.leveldbDir, "000003.log"), "utf8"),
			"video-editor-projects metadata currentSceneId current-project",
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});
