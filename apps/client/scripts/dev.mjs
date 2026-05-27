import { spawn } from "node:child_process";
import net from "node:net";
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
const electronCommand = getElectronCommand();
const hasExplicitWebUrl = Boolean(process.env.SHOTLYX_WEB_URL);
let runtime = getDesktopRuntime();
let desktopEnv = createDesktopEnv(runtime);
let webProcessExitCode = null;

async function readServerStatus(targetRuntime = runtime) {
	try {
		const response = await fetch(targetRuntime.configUrl, {
			cache: "no-store",
			signal: AbortSignal.timeout(2_000),
		});
		if (response.ok) return "ready";

		try {
			const data = await response.json();
			if (
				typeof data === "object" &&
				data !== null &&
				"error" in data &&
				typeof data.error === "string" &&
				data.error.includes("desktop_config_disabled")
			) {
				return "wrong-mode";
			}
		} catch {
			// The endpoint exists but did not return the desktop config payload.
		}
		return "not-ready";
	} catch {
		return "offline";
	}
}

async function isServerReady() {
	return (await readServerStatus()) === "ready";
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
	const nextUrl = new URL(runtime.webUrl);
	nextUrl.port = String(port);
	return getDesktopRuntime(nextUrl.toString());
}

async function resolveRuntime() {
	const status = await readServerStatus(runtime);
	if (status === "ready") {
		return { shouldStartServer: false };
	}

	if (hasExplicitWebUrl) {
		if (status === "wrong-mode") {
			throw new Error(
				`${runtime.origin} is running, but not in Shotlyx desktop mode. Stop that server or set SHOTLYX_WEB_URL to a free port.`,
			);
		}
		return { shouldStartServer: true };
	}

	if (status === "offline" && (await isPortAvailable(runtime))) {
		return { shouldStartServer: true };
	}

	const firstPort = Number(runtime.port);
	for (let port = firstPort + 1; port <= firstPort + 20; port += 1) {
		const candidate = runtimeWithPort(port);
		const candidateStatus = await readServerStatus(candidate);
		if (candidateStatus === "ready") {
			runtime = candidate;
			desktopEnv = createDesktopEnv(runtime);
			console.log(`Using existing desktop server at ${runtime.origin}`);
			return { shouldStartServer: false };
		}
		if (
			candidateStatus === "offline" &&
			(await isPortAvailable(candidate))
		) {
			console.log(
				`${runtime.origin} is already in use; starting Shotlyx Desktop on ${candidate.origin}`,
			);
			runtime = candidate;
			desktopEnv = createDesktopEnv(runtime);
			return { shouldStartServer: true };
		}
	}

	throw new Error(
		`No free desktop dev port found near ${runtime.origin}. Stop the server using port ${runtime.port} or set SHOTLYX_WEB_URL=http://127.0.0.1:PORT/settings/api.`,
	);
}

async function waitForServer() {
	const started = Date.now();
	while (Date.now() - started < 120_000) {
		if (webProcessExitCode !== null) {
			throw new Error(
				`Next.js dev server exited before desktop mode became ready (code ${webProcessExitCode}).`,
			);
		}
		if (await isServerReady()) return;
		await new Promise((resolve) => setTimeout(resolve, 800));
	}
	throw new Error(`Timed out waiting for ${runtime.configUrl}`);
}

let webProcess = null;
let electronProcess = null;

function shutdown() {
	if (electronProcess && !electronProcess.killed) electronProcess.kill();
	if (webProcess && !webProcess.killed) webProcess.kill();
}

const { shouldStartServer } = await resolveRuntime();

if (shouldStartServer) {
	webProcess = spawn(
		"bun",
		["run", "dev", "--", "--hostname", runtime.hostname, "--port", runtime.port],
		{
			cwd: path.join(repoRoot, "apps/web"),
			env: desktopEnv,
			stdio: "inherit",
		},
	);
	webProcess.on("error", (error) => {
		console.error(`Failed to start Next.js dev server: ${error.message}`);
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
	if (webProcess && !webProcess.killed) webProcess.kill();
	process.exit(code ?? 0);
});
