const { app, BrowserWindow, shell } = require("electron");

const DEFAULT_URL = "http://127.0.0.1:3100/desktop";

function getStartUrl() {
	return process.env.SHOTLYX_WEB_URL || DEFAULT_URL;
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
		title: "Shotlyx",
		titleBarStyle: isMac ? "hiddenInset" : undefined,
		trafficLightPosition: isMac ? { x: 12, y: 11 } : undefined,
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
}

app.setName("Shotlyx");

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
