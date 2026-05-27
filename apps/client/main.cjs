const { app, BrowserWindow, shell } = require("electron");

const DEFAULT_URL = "http://127.0.0.1:3100/desktop";

function getStartUrl() {
	return process.env.SHOTLYX_WEB_URL || DEFAULT_URL;
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 920,
		minWidth: 1180,
		minHeight: 760,
		backgroundColor: "#050607",
		title: "Shotlyx",
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
