import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
	createDesktopEnv,
	getDesktopRuntime,
	getElectronCommand,
} from "./desktop-runtime.mjs";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const runtime = getDesktopRuntime();
const desktopEnv = createDesktopEnv(runtime);
const electronCommand = getElectronCommand();

async function waitForServer() {
	const started = Date.now();
	while (Date.now() - started < 120_000) {
		try {
			const response = await fetch(runtime.configUrl, { cache: "no-store" });
			if (response.ok) return;
		} catch {
			// Keep waiting for Next to start.
		}
		await new Promise((resolve) => setTimeout(resolve, 800));
	}
	throw new Error(`Timed out waiting for ${runtime.configUrl}`);
}

let electronProcess = null;

const webProcess = spawn(
	"bun",
	[
		"run",
		"--cwd",
		"apps/web",
		"start",
		"--",
		"--hostname",
		runtime.hostname,
		"--port",
		runtime.port,
	],
	{
		cwd: repoRoot,
		env: desktopEnv,
		stdio: "inherit",
	},
);

function shutdown() {
	if (electronProcess && !electronProcess.killed) electronProcess.kill();
	if (!webProcess.killed) webProcess.kill();
}

webProcess.on("error", (error) => {
	console.error(`Failed to start Next.js server: ${error.message}`);
	shutdown();
	process.exit(1);
});

await waitForServer();

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
	if (!webProcess.killed) webProcess.kill();
	process.exit(code ?? 0);
});

webProcess.on("exit", (code) => {
	if (code && electronProcess && !electronProcess.killed) {
		electronProcess.kill();
		process.exit(code);
	}
});
