import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
	createDesktopEnv,
	getDesktopRuntime,
	getElectronCommand,
} from "./desktop-runtime.mjs";
import { prepareDesktopApiBundle } from "./prepare-desktop-api.mjs";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const electronCommand = getElectronCommand();
const hasExplicitWebUrl = Boolean(process.env.SHOTLYX_WEB_URL);
let runtime = getDesktopRuntime();
let desktopEnv = createDesktopEnv(runtime);
let webProcessExitCode = null;

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
	const nextUrl = new URL(runtime.webUrl);
	nextUrl.port = String(port);
	return getDesktopRuntime(nextUrl.toString());
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
	if (electronProcess && !electronProcess.killed) electronProcess.kill();
	if (webProcess && !webProcess.killed) webProcess.kill();
}

function runApiBuild() {
	return new Promise((resolve, reject) => {
		const buildProcess = spawn(
			"bun",
			["run", "--cwd", "apps/web", "build:desktop-api"],
			{
				cwd: repoRoot,
				env: {
					...desktopEnv,
					SHOTLYX_RENDERER_ORIGIN: "app://shotlyx",
					NEXT_PUBLIC_SHOTLYX_API_ORIGIN: "app://shotlyx",
					NEXT_PUBLIC_SITE_URL: "app://shotlyx",
					NEXT_PUBLIC_MARBLE_API_URL: "app://shotlyx",
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

await runApiBuild();
await prepareDesktopApiBundle();

if (shouldStartServer) {
	webProcess = spawn(
		"bun",
		[
			"run",
			"dev",
			"--",
			"--host",
			runtime.hostname,
			"--port",
			runtime.port,
			"--strictPort",
		],
		{
			cwd: path.join(repoRoot, "apps/web"),
			env: desktopEnv,
			stdio: "inherit",
		},
	);
	webProcess.on("error", (error) => {
		console.error(`Failed to start Vite dev server: ${error.message}`);
		shutdown();
		process.exit(1);
	});
	webProcess.on("exit", (code) => {
		webProcessExitCode = code ?? 0;
		if (code && electronProcess && !electronProcess.killed) {
			electronProcess.kill();
			process.exit(code);
		}
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
	if (webProcess && !webProcess.killed) webProcess.kill();
	process.exit(code ?? 0);
});
