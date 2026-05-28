const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { app, BrowserWindow, dialog, shell, utilityProcess } = require("electron");

let autoUpdater = null;
try {
	({ autoUpdater } = require("electron-updater"));
} catch {
	// electron-updater is only required for packaged desktop releases.
}

const PRODUCT_NAME = "Shotlyx Desktop";
const DEFAULT_URL = "http://127.0.0.1:3100/desktop";
const PACKAGED_SERVER_PORT = 3100;
const SERVER_READY_TIMEOUT_MS = 120_000;
const RENDERER_EXIT_TIMEOUT_MS = 8_000;

let packagedWebUrl = null;
let packagedServerProcess = null;
let packagedServerExit = null;
let isQuitting = false;

function getStartUrl() {
	return packagedWebUrl || process.env.SHOTLYX_WEB_URL || DEFAULT_URL;
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close(() => resolve(true));
		});
		server.listen(port, "127.0.0.1");
	});
}

function getPackagedServerPath() {
	return path.join(
		process.resourcesPath,
		"desktop-web",
		"apps",
		"web",
		"server.js",
	);
}

function getDesktopConfigPath() {
	return (
		process.env.SHOTLYX_DESKTOP_CONFIG_PATH ||
		path.join(app.getPath("userData"), "desktop-api-config.json")
	);
}

function createPackagedServerEnv(port) {
	const origin = `http://127.0.0.1:${port}`;
	return {
		...process.env,
		NODE_ENV: "production",
		HOSTNAME: "127.0.0.1",
		PORT: String(port),
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_CONFIG_PATH: getDesktopConfigPath(),
		NEXT_PUBLIC_SHOTLYX_DESKTOP: "1",
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || origin,
		NEXT_PUBLIC_MARBLE_API_URL:
			process.env.NEXT_PUBLIC_MARBLE_API_URL || origin,
		BETTER_AUTH_SECRET:
			process.env.BETTER_AUTH_SECRET || "shotlyx-desktop-local-secret",
		UPSTASH_REDIS_REST_URL:
			process.env.UPSTASH_REDIS_REST_URL || "http://127.0.0.1:8079",
		UPSTASH_REDIS_REST_TOKEN:
			process.env.UPSTASH_REDIS_REST_TOKEN || "shotlyx-desktop",
		MARBLE_WORKSPACE_KEY:
			process.env.MARBLE_WORKSPACE_KEY || "shotlyx-desktop",
	};
}

async function waitForPackagedServer(configUrl) {
	const started = Date.now();
	while (Date.now() - started < SERVER_READY_TIMEOUT_MS) {
		if (packagedServerExit) {
			throw new Error(
				`Desktop web server exited before it became ready (code ${packagedServerExit.code ?? "unknown"}).`,
			);
		}

		try {
			const response = await fetch(configUrl, {
				cache: "no-store",
				signal: AbortSignal.timeout(2_000),
			});
			if (response.ok) return;
		} catch {
			// Keep waiting until the standalone Next server is ready.
		}

		await delay(800);
	}

	throw new Error(`Timed out waiting for ${configUrl}`);
}

async function startPackagedServer() {
	if (!app.isPackaged) return process.env.SHOTLYX_WEB_URL || DEFAULT_URL;

	const serverPath = getPackagedServerPath();
	if (!fs.existsSync(serverPath)) {
		throw new Error(`Packaged web server is missing: ${serverPath}`);
	}

	const port = PACKAGED_SERVER_PORT;
	if (!(await isPortAvailable(port))) {
		throw new Error(
			`Port ${port} is already in use. Shotlyx keeps this port stable so local projects and media stay on the same browser storage origin. Close the other process and restart Shotlyx.`,
		);
	}
	const origin = `http://127.0.0.1:${port}`;
	const configUrl = `${origin}/api/desktop/config`;

	packagedServerProcess = utilityProcess.fork(serverPath, [], {
		cwd: path.dirname(serverPath),
		env: createPackagedServerEnv(port),
		stdio: "ignore",
		serviceName: "Shotlyx Desktop Web Server",
	});

	packagedServerProcess.on("exit", (code) => {
		packagedServerExit = { code, signal: null };
		if (!isQuitting) {
			console.error(
				`Shotlyx desktop web server exited with code ${code ?? "unknown"}`,
			);
		}
	});

	packagedServerProcess.on("error", (type, location) => {
		packagedServerExit = { code: null, signal: null };
		console.error(
			`Failed to start Shotlyx desktop web server: ${type}${location ? ` at ${location}` : ""}`,
		);
	});

	await waitForPackagedServer(configUrl);
	return `${origin}/desktop`;
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

function configureAutoUpdater() {
	if (!app.isPackaged || !autoUpdater) return;
	if (process.env.SHOTLYX_DISABLE_AUTO_UPDATE === "1") return;

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.on("error", (error) => {
		console.warn(`Shotlyx updater error: ${error.message}`);
	});

	setTimeout(() => {
		autoUpdater.checkForUpdatesAndNotify().catch((error) => {
			console.warn(`Shotlyx updater check failed: ${error.message}`);
		});
	}, 5_000);
}

app.setName(PRODUCT_NAME);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		const win = BrowserWindow.getAllWindows()[0];
		if (!win) return;
		if (win.isMinimized()) win.restore();
		win.focus();
	});

	app.whenReady().then(async () => {
		try {
			packagedWebUrl = await startPackagedServer();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			dialog.showErrorBox(`${PRODUCT_NAME} failed to start`, message);
			app.quit();
			return;
		}

		createWindow();
		configureAutoUpdater();

		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
			}
		});
	});
}

app.on("before-quit", () => {
	isQuitting = true;
});

app.on("will-quit", () => {
	if (packagedServerProcess?.pid) {
		packagedServerProcess.kill();
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
