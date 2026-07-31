const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
	app,
	BrowserWindow,
	dialog,
	net,
	protocol,
	safeStorage,
	shell,
} = require("electron");
const {
	getStorageOriginPrefix,
	migrateLegacyDesktopStorage,
} = require("./storage-migration.cjs");

const PRODUCT_NAME = "Shotlyx Desktop";
const DEV_PRODUCT_NAME = `${PRODUCT_NAME} Dev`;
const LOCAL_PROTOCOL = "app";
const LOCAL_PROTOCOL_HOST = "shotlyx";
const LOCAL_RENDERER_URL = "app://shotlyx/desktop";
const RENDERER_EXIT_TIMEOUT_MS = 8_000;
const RENDERER_CRASH_RELOAD_WINDOW_MS = 60_000;
const RENDERER_CRASH_AUTO_RELOAD_LIMIT = 1;
let apiHandlerPromise = null;
let isQuitting = false;
let rendererCrashTimestamps = [];

function isHardwareAccelerationDisabled() {
	return process.env.SHOTLYX_DISABLE_HARDWARE_ACCELERATION === "1";
}

function configureRenderingMode() {
	if (!isHardwareAccelerationDisabled()) return;

	app.disableHardwareAcceleration();
	console.warn(
		"Shotlyx Desktop hardware acceleration is disabled for this run.",
	);
}

protocol.registerSchemesAsPrivileged([
	{
		scheme: LOCAL_PROTOCOL,
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
			stream: true,
		},
	},
]);

function getStartUrl() {
	return process.env.SHOTLYX_WEB_URL || LOCAL_RENDERER_URL;
}

function isDevelopmentRuntime() {
	return !app.isPackaged || process.env.SHOTLYX_DESKTOP_DEV === "1";
}

function configureAppIdentity() {
	const productName = isDevelopmentRuntime() ? DEV_PRODUCT_NAME : PRODUCT_NAME;
	app.setName(productName);

	if (process.env.SHOTLYX_USER_DATA_DIR) {
		app.setPath("userData", process.env.SHOTLYX_USER_DATA_DIR);
		return;
	}

	if (isDevelopmentRuntime()) {
		app.setPath(
			"userData",
			path.join(app.getPath("appData"), DEV_PRODUCT_NAME),
		);
	}
}

function configureLocalDataPaths() {
	if (!process.env.SHOTLYX_PROJECTS_ROOT) {
		process.env.SHOTLYX_PROJECTS_ROOT = path.join(
			app.getPath("documents"),
			"Shotlyx Projects",
		);
	}
	if (!process.env.SHOTLYX_PROJECTS_CONFIG_PATH) {
		process.env.SHOTLYX_PROJECTS_CONFIG_PATH = path.join(
			app.getPath("userData"),
			"project-library.json",
		);
	}
	if (!process.env.SHOTLYX_DESKTOP_CONFIG_PATH) {
		process.env.SHOTLYX_DESKTOP_CONFIG_PATH = path.join(
			app.getPath("userData"),
			"desktop-api-config.json",
		);
	}
	if (!process.env.SHOTLYX_DESKTOP_SECRETS_PATH) {
		process.env.SHOTLYX_DESKTOP_SECRETS_PATH = path.join(
			app.getPath("userData"),
			"desktop-api-secrets.json",
		);
	}
}

function installSafeStorageBridge() {
	globalThis.__SHOTLYX_SAFE_STORAGE__ = Object.freeze({
		isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
		encryptString: (value) =>
			safeStorage.encryptString(value).toString("base64"),
		decryptString: (value) =>
			safeStorage.decryptString(Buffer.from(value, "base64")),
	});
}

function migrateLegacyStorageIfNeeded() {
	try {
		const targetOriginPrefix = getStorageOriginPrefix(getStartUrl());
		const result = migrateLegacyDesktopStorage({
			appDataPath: app.getPath("appData"),
			currentUserDataPath: app.getPath("userData"),
			targetOriginPrefix,
		});
		if (result.status === "migrated") {
			console.log(
				`Migrated Shotlyx desktop projects from ${result.source.userDataPath} (${result.source.originPrefix}) to ${result.target.originPrefix}.`,
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`Shotlyx desktop storage migration skipped: ${message}`);
	}
}

function shouldUseLocalRenderer() {
	return getStartUrl().startsWith(`${LOCAL_PROTOCOL}://`);
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRendererRoot() {
	if (process.env.SHOTLYX_RENDERER_DIR) {
		return process.env.SHOTLYX_RENDERER_DIR;
	}
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "desktop-web");
	}
	return path.join(__dirname, ".desktop-web");
}

function getApiBundlePath() {
	if (process.env.SHOTLYX_API_BUNDLE) {
		return process.env.SHOTLYX_API_BUNDLE;
	}
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "desktop-api", "desktop-api.mjs");
	}
	return path.join(__dirname, ".desktop-api", "desktop-api.mjs");
}

function responseWithStatus(message, status) {
	return new Response(message, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

function isInsideDirectory({ filePath, directory }) {
	const relativePath = path.relative(directory, filePath);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	);
}

function isStaticAssetPath(pathname) {
	return (
		pathname.startsWith("/assets/") ||
		pathname.startsWith("/fonts/") ||
		pathname.startsWith("/images/") ||
		pathname.startsWith("/videos/") ||
		pathname === "/favicon.ico" ||
		pathname === "/robots.txt" ||
		pathname === "/sitemap.xml"
	);
}

async function serveRendererFile(filePath) {
	return net.fetch(pathToFileURL(filePath).toString());
}

async function loadApiHandler() {
	if (!apiHandlerPromise) {
		const apiBundlePath = getApiBundlePath();
		if (!fs.existsSync(apiBundlePath)) {
			throw new Error(
				`Shotlyx desktop API bundle is missing: ${apiBundlePath}`,
			);
		}
		apiHandlerPromise = import(pathToFileURL(apiBundlePath).toString()).then(
			(module) => {
				if (typeof module.handleElectronApiRequest !== "function") {
					throw new Error("Desktop API bundle does not export a handler.");
				}
				return module.handleElectronApiRequest;
			},
		);
	}
	return apiHandlerPromise;
}

async function handleLocalApiRequest(request) {
	try {
		const handler = await loadApiHandler();
		return await handler(request);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Shotlyx desktop API failed: ${message}`);
		return Response.json(
			{ error: "desktop_api_unavailable", message },
			{ status: 500 },
		);
	}
}

function registerLocalRendererProtocol() {
	protocol.handle(LOCAL_PROTOCOL, async (request) => {
		const rendererRoot = getRendererRoot();
		const url = new URL(request.url);
		if (url.host !== LOCAL_PROTOCOL_HOST) {
			return responseWithStatus("Not found", 404);
		}

		let pathname;
		try {
			pathname = decodeURIComponent(url.pathname);
		} catch {
			return responseWithStatus("Bad request", 400);
		}

		if (pathname.startsWith("/api/")) {
			return handleLocalApiRequest(request);
		}

		const indexPath = path.join(rendererRoot, "index.html");
		if (!fs.existsSync(indexPath)) {
			return responseWithStatus(
				`Shotlyx renderer bundle is missing: ${indexPath}`,
				500,
			);
		}

		if (pathname === "/" || pathname === "") {
			return serveRendererFile(indexPath);
		}

		const requestedPath = path.resolve(rendererRoot, pathname.slice(1));
		if (
			!isInsideDirectory({ filePath: requestedPath, directory: rendererRoot })
		) {
			return responseWithStatus("Forbidden", 403);
		}

		const stat = fs.existsSync(requestedPath)
			? fs.statSync(requestedPath)
			: null;
		if (stat?.isFile()) {
			return serveRendererFile(requestedPath);
		}

		if (isStaticAssetPath(pathname)) {
			return responseWithStatus("Not found", 404);
		}

		return serveRendererFile(indexPath);
	});
}

function assertLocalRendererAvailable() {
	const indexPath = path.join(getRendererRoot(), "index.html");
	if (!fs.existsSync(indexPath)) {
		throw new Error(`Shotlyx renderer bundle is missing: ${indexPath}`);
	}
}

function prepareRendererForClose(win) {
	if (win.webContents.isDestroyed()) return Promise.resolve();

	const prepareScript = `
		(() => {
			const prepare = globalThis.__SHOTLYX_PREPARE_EXIT__;
			return typeof prepare === "function" ? prepare() : undefined;
		})()
	`;

	return Promise.race([
		win.webContents.executeJavaScript(prepareScript, true),
		delay(RENDERER_EXIT_TIMEOUT_MS),
	]).catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`Shotlyx renderer prepare-exit failed: ${message}`);
	});
}

function installGracefulClose(win) {
	let didPrepareClose = false;

	win.on("close", (event) => {
		if (didPrepareClose || win.webContents.isDestroyed()) return;

		event.preventDefault();
		prepareRendererForClose(win).finally(() => {
			didPrepareClose = true;
			win.close();
		});
	});
}

function syncWindowState(win) {
	const state = win.isFullScreen() || win.isMaximized() ? "full" : "windowed";
	if (win.webContents.isDestroyed()) return;
	win.webContents
		.executeJavaScript(
			`document.documentElement.dataset.shotlyxWindowState = ${JSON.stringify(
				state,
			)};`,
		)
		.catch(() => {
			// The page can be between navigations while the native window is changing.
		});
}

function pruneRendererCrashTimestamps({ now }) {
	rendererCrashTimestamps = rendererCrashTimestamps.filter(
		(timestamp) => now - timestamp < RENDERER_CRASH_RELOAD_WINDOW_MS,
	);
}

function recordRendererCrash() {
	const now = Date.now();
	pruneRendererCrashTimestamps({ now });
	rendererCrashTimestamps.push(now);
	return rendererCrashTimestamps.length;
}

function getRendererSafeModeHint() {
	if (isHardwareAccelerationDisabled()) {
		return "Hardware acceleration is already disabled for this run.";
	}
	return "If this repeats, restart with `bun run dev:desktop:safe` or set SHOTLYX_DISABLE_HARDWARE_ACCELERATION=1.";
}

function shouldRecoverRenderer({ reason }) {
	return reason === "crashed" || reason === "oom" || reason === "killed";
}

function recoverRendererAfterCrash({ win, details, crashCount }) {
	if (isQuitting || win.isDestroyed()) return;
	if (!shouldRecoverRenderer({ reason: details.reason })) return;

	if (crashCount > RENDERER_CRASH_AUTO_RELOAD_LIMIT) {
		console.warn(
			`Shotlyx renderer crashed repeatedly; automatic reload is paused. ${getRendererSafeModeHint()}`,
		);
		return;
	}

	console.warn(
		`Shotlyx renderer crashed; reloading the window once. ${getRendererSafeModeHint()}`,
	);
	setTimeout(() => {
		if (isQuitting || win.isDestroyed() || win.webContents.isDestroyed()) {
			return;
		}
		win.webContents.reload();
	}, 1_000);
}

function installRendererDiagnostics(win) {
	win.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			if (errorCode === -3) return;
			console.error(
				`Shotlyx renderer failed to load ${validatedURL}: ${errorDescription} (${errorCode})`,
			);
		},
	);

	win.webContents.on("render-process-gone", (_event, details) => {
		const crashCount = recordRendererCrash();
		const currentUrl = win.webContents.isDestroyed()
			? "destroyed"
			: win.webContents.getURL();
		const gpuStatus = app.getGPUFeatureStatus();
		console.error(
			`Shotlyx renderer process gone: ${details.reason} (${details.exitCode}); url=${currentUrl}; crashCount=${crashCount}; gpu=${JSON.stringify(gpuStatus)}`,
		);
		recoverRendererAfterCrash({ win, details, crashCount });
	});

	win.webContents.on("unresponsive", () => {
		console.warn("Shotlyx renderer became unresponsive.");
	});

	win.webContents.on(
		"console-message",
		(_event, level, message, line, sourceId) => {
			if (level < 2) return;
			const label = level >= 3 ? "error" : "warn";
			console[label](
				`Shotlyx renderer console ${label}: ${message} (${sourceId}:${line})`,
			);
		},
	);
}

function createWindow() {
	const isMac = process.platform === "darwin";
	const win = new BrowserWindow({
		width: 1440,
		height: 920,
		minWidth: 1180,
		minHeight: 760,
		backgroundColor: "#050607",
		title: PRODUCT_NAME,
		titleBarStyle: isMac ? "hiddenInset" : undefined,
		trafficLightPosition: isMac ? { x: 12, y: 11 } : undefined,
		...(isMac ? {} : { icon: path.join(__dirname, "build", "icon.png") }),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) {
			shell.openExternal(url);
			return { action: "deny" };
		}
		return { action: "allow" };
	});

	installRendererDiagnostics(win);
	win.webContents.on("dom-ready", () => syncWindowState(win));
	for (const eventName of [
		"enter-full-screen",
		"leave-full-screen",
		"maximize",
		"unmaximize",
		"resize",
	]) {
		win.on(eventName, () => syncWindowState(win));
	}

	win.loadURL(getStartUrl());
	installGracefulClose(win);
}

configureRenderingMode();
configureAppIdentity();
configureLocalDataPaths();
installSafeStorageBridge();

app.on("before-quit", () => {
	isQuitting = true;
});

const shouldUseSingleInstanceLock =
	process.env.SHOTLYX_DISABLE_SINGLE_INSTANCE_LOCK !== "1";
const hasSingleInstanceLock =
	!shouldUseSingleInstanceLock || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	if (shouldUseSingleInstanceLock) {
		app.on("second-instance", () => {
			const win = BrowserWindow.getAllWindows()[0];
			if (!win) return;
			if (win.isMinimized()) win.restore();
			win.focus();
		});
	}

	app.whenReady().then(() => {
		try {
			registerLocalRendererProtocol();
			if (shouldUseLocalRenderer()) {
				assertLocalRendererAvailable();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			dialog.showErrorBox(`${PRODUCT_NAME} failed to start`, message);
			app.quit();
			return;
		}

		migrateLegacyStorageIfNeeded();
		createWindow();

		app.on("activate", () => {
			if (isQuitting) return;
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
			}
		});
	});
}

app.on("window-all-closed", () => {
	if (isQuitting || process.platform !== "darwin") {
		app.quit();
	}
});
