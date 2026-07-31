import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
	createDesktopEnv,
	getDesktopRuntime,
	getElectronCommand,
} from "./desktop-runtime.mjs";
import { prepareDesktopApiBundle } from "./prepare-desktop-api.mjs";
import { runWasmBuild } from "./wasm-build.mjs";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const electronCommand = getElectronCommand();
const hasExplicitWebUrl = Boolean(process.env.SHOTLYX_WEB_URL);
let runtime = getDesktopRuntime();
let desktopEnv = createDesktopEnv(runtime);
const desktopSiteUrl = "https://shotlyx.ai";
let webProcessExitCode = null;
let isShuttingDown = false;

function getLocalBinCommand(command) {
	const binaryName = process.platform === "win32" ? `${command}.cmd` : command;
	for (const rootDir of [repoRoot, path.join(repoRoot, "apps/renderer")]) {
		const candidate = path.join(rootDir, "node_modules", ".bin", binaryName);
		if (fs.existsSync(candidate)) return candidate;
	}
	return command;
}

function exitCodeFromSignal(signal) {
	if (!signal) return 0;
	const signalNumbers = {
		SIGINT: 2,
		SIGTERM: 15,
	};
	return 128 + (signalNumbers[signal] ?? 0);
}

function isPortAvailable(targetRuntime) {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close(() => resolve(true));
		});
		server.listen(Number(targetRuntime.port), targetRuntime.hostname);
	});
}

function runtimeWithPort(port) {
	const runtimeUrl = new URL(runtime.webUrl);
	runtimeUrl.port = String(port);
	return getDesktopRuntime(runtimeUrl.toString());
}

async function resolveRuntime() {
	if (hasExplicitWebUrl) {
		return { shouldStartServer: false };
	}

	if (await isPortAvailable(runtime)) {
		return { shouldStartServer: true };
	}

	const firstPort = Number(runtime.port);
	for (let port = firstPort + 1; port <= firstPort + 20; port += 1) {
		const candidate = runtimeWithPort(port);
		if (await isPortAvailable(candidate)) {
			console.log(
				`${runtime.origin} is already in use; starting Shotlyx Desktop on ${candidate.origin}`,
			);
			runtime = candidate;
			desktopEnv = createDesktopEnv(runtime);
			return { shouldStartServer: true };
		}
	}

	throw new Error(
		`No free desktop dev port found near ${runtime.origin}. Stop the server using port ${runtime.port} or set SHOTLYX_WEB_URL=http://127.0.0.1:PORT/desktop.`,
	);
}

async function waitForRenderer() {
	const started = Date.now();
	while (Date.now() - started < 120_000) {
		if (webProcessExitCode !== null) {
			throw new Error(
				`Vite dev server exited before Shotlyx Desktop became ready (code ${webProcessExitCode}).`,
			);
		}

		try {
			const response = await fetch(runtime.webUrl, {
				cache: "no-store",
				signal: AbortSignal.timeout(2_000),
			});
			if (response.ok) return;
		} catch {
			// Keep waiting for Vite to start.
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Timed out waiting for ${runtime.webUrl}`);
}

let webProcess = null;
let electronProcess = null;

function shutdown() {
	isShuttingDown = true;
	if (electronProcess && !electronProcess.killed) electronProcess.kill();
	if (webProcess && !webProcess.killed) webProcess.kill();
}

function exitAfterWebProcessStops(exitCode) {
	if (!webProcess || webProcess.killed) {
		process.exit(exitCode);
	}

	webProcess.once("exit", () => process.exit(exitCode));
	webProcess.kill();
	setTimeout(() => process.exit(exitCode), 2_000).unref();
}

function runApiBuild() {
	return new Promise((resolve, reject) => {
		const buildProcess = spawn(
			"bun",
			["run", "--cwd", "apps/renderer", "build:desktop-api"],
			{
				cwd: repoRoot,
				env: {
					...desktopEnv,
					SHOTLYX_RENDERER_ORIGIN: "app://shotlyx",
					VITE_SHOTLYX_API_ORIGIN: "app://shotlyx",
					VITE_SITE_URL: desktopSiteUrl,
					VITE_MARBLE_API_URL: "app://shotlyx",
				},
				stdio: "inherit",
			},
		);

		buildProcess.on("error", reject);
		buildProcess.on("exit", (code) => {
			if (code === 0 || code === null) {
				resolve();
			} else {
				reject(new Error(`Desktop API build exited with code ${code}`));
			}
		});
	});
}

const { shouldStartServer } = await resolveRuntime();

if (shouldStartServer) {
	await runWasmBuild({ repoRoot });
}
await runApiBuild();
await prepareDesktopApiBundle();

if (shouldStartServer) {
	webProcess = spawn(
		getLocalBinCommand("vite"),
		[
			"--host",
			runtime.hostname,
			"--port",
			runtime.port,
			"--strictPort",
		],
		{
			cwd: path.join(repoRoot, "apps/renderer"),
			env: desktopEnv,
			stdio: "inherit",
		},
	);
	webProcess.on("error", (error) => {
		console.error(`Failed to start Vite dev server: ${error.message}`);
		shutdown();
		process.exit(1);
	});
	webProcess.on("exit", (code, signal) => {
		const exitCode = code ?? exitCodeFromSignal(signal);
		webProcessExitCode = exitCode;
		webProcess = null;
		if (isShuttingDown) return;

		if (electronProcess && !electronProcess.killed) {
			console.error(
				`Vite dev server stopped; closing Shotlyx Desktop (code ${exitCode}).`,
			);
			isShuttingDown = true;
			electronProcess.kill();
		}
		process.exit(exitCode || 1);
	});
}

await waitForRenderer();

electronProcess = spawn(
	electronCommand.command,
	[...electronCommand.args, clientDir],
	{
		cwd: repoRoot,
		env: {
			...desktopEnv,
			SHOTLYX_DESKTOP_DEV: "1",
			SHOTLYX_DISABLE_SINGLE_INSTANCE_LOCK: "1",
			SHOTLYX_WEB_URL: runtime.webUrl,
		},
		stdio: "inherit",
	},
);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

electronProcess.on("error", (error) => {
	console.error(`Failed to start Electron: ${error.message}`);
	shutdown();
	process.exit(1);
});

electronProcess.on("exit", (code) => {
	const exitCode = code ?? 0;
	isShuttingDown = true;
	exitAfterWebProcessStops(exitCode);
});
