const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	TARGET_DESKTOP_ORIGIN_PREFIX,
	getIndexedDBOriginPaths,
	getStorageOriginPrefix,
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
					path.join(
						currentUserDataPath,
						"desktop-storage-migration-app_shotlyx_0.json",
					),
					"utf8",
				),
			).source.originPrefix,
			"http_127.0.0.1_3100",
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("migrates legacy projects into the current localhost dev origin", () => {
	const tempRoot = createTempRoot();
	try {
		const appDataPath = path.join(tempRoot, "Application Support");
		const currentUserDataPath = path.join(appDataPath, "Shotlyx Desktop Dev");
		writeIndexedDBFixture({
			userDataPath: path.join(appDataPath, "Shotlyx"),
			originPrefix: "http_127.0.0.1_3100",
			content:
				"video-editor-projects metadata currentSceneId project-one brandKits",
		});

		const result = migrateLegacyDesktopStorage({
			appDataPath,
			currentUserDataPath,
			targetOriginPrefix: getStorageOriginPrefix(
				"http://127.0.0.1:5173/desktop",
			),
		});

		const targetPaths = getIndexedDBOriginPaths({
			userDataPath: currentUserDataPath,
			originPrefix: "http_127.0.0.1_5173",
		});
		assert.equal(result.status, "migrated");
		assert.equal(
			fs.readFileSync(path.join(targetPaths.leveldbDir, "000003.log"), "utf8"),
			"video-editor-projects metadata currentSceneId project-one brandKits",
		);
		assert.equal(
			JSON.parse(
				fs.readFileSync(
					path.join(
						currentUserDataPath,
						"desktop-storage-migration-http_127.0.0.1_5173.json",
					),
					"utf8",
				),
			).target.originPrefix,
			"http_127.0.0.1_5173",
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("does not let an app-origin marker block localhost dev migration", () => {
	const tempRoot = createTempRoot();
	try {
		const appDataPath = path.join(tempRoot, "Application Support");
		const currentUserDataPath = path.join(appDataPath, "Shotlyx Desktop");
		fs.mkdirSync(currentUserDataPath, { recursive: true });
		fs.writeFileSync(
			path.join(
				currentUserDataPath,
				"desktop-storage-migration-app_shotlyx_0.json",
			),
			"{}\n",
		);
		writeIndexedDBFixture({
			userDataPath: path.join(appDataPath, "Shotlyx"),
			originPrefix: "http_127.0.0.1_3100",
			content:
				"video-editor-projects metadata currentSceneId project-one brandKits",
		});

		const result = migrateLegacyDesktopStorage({
			appDataPath,
			currentUserDataPath,
			targetOriginPrefix: "http_127.0.0.1_5173",
		});

		assert.equal(result.status, "migrated");
		assert.equal(result.target.originPrefix, "http_127.0.0.1_5173");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("replaces weaker localhost target data after backing it up", () => {
	const tempRoot = createTempRoot();
	try {
		const appDataPath = path.join(tempRoot, "Application Support");
		const currentUserDataPath = path.join(appDataPath, "Shotlyx Desktop Dev");
		writeIndexedDBFixture({
			userDataPath: currentUserDataPath,
			originPrefix: "http_127.0.0.1_5173",
			content: "video-editor-projects metadata currentSceneId weak-project",
		});
		const legacyPaths = getIndexedDBOriginPaths({
			userDataPath: path.join(appDataPath, "Shotlyx"),
			originPrefix: "http_127.0.0.1_3100",
		});
		fs.mkdirSync(legacyPaths.leveldbDir, { recursive: true });
		fs.writeFileSync(
			path.join(legacyPaths.leveldbDir, "000003.log"),
			"video-editor-projects metadata currentSceneId project-one",
		);
		fs.writeFileSync(
			path.join(legacyPaths.leveldbDir, "000004.ldb"),
			"metadata currentSceneId project-two",
		);

		const result = migrateLegacyDesktopStorage({
			appDataPath,
			currentUserDataPath,
			targetOriginPrefix: "http_127.0.0.1_5173",
		});

		const targetPaths = getIndexedDBOriginPaths({
			userDataPath: currentUserDataPath,
			originPrefix: "http_127.0.0.1_5173",
		});
		assert.equal(result.status, "migrated");
		assert.equal(result.target.previousScore, 1);
		assert.equal(result.source.score, 2);
		assert.equal(
			fs.readFileSync(path.join(targetPaths.leveldbDir, "000003.log"), "utf8"),
			"video-editor-projects metadata currentSceneId project-one",
		);
		assert.ok(fs.existsSync(result.backup.leveldbDir));
		assert.equal(
			fs.readFileSync(path.join(result.backup.leveldbDir, "000003.log"), "utf8"),
			"video-editor-projects metadata currentSceneId weak-project",
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
