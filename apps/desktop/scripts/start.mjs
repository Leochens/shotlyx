import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDesktopEnv, getElectronCommand } from "./desktop-runtime.mjs";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const electronCommand = getElectronCommand();
const rendererDir = path.join(clientDir, ".desktop-web");

const electronProcess = spawn(
	electronCommand.command,
	[...electronCommand.args, clientDir],
	{
		cwd: repoRoot,
		env: {
			...createDesktopEnv(),
			SHOTLYX_RENDERER_DIR: rendererDir,
		},
		stdio: "inherit",
	},
);

function shutdown() {
	if (!electronProcess.killed) electronProcess.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

electronProcess.on("error", (error) => {
	console.error(`Failed to start Electron: ${error.message}`);
	process.exit(1);
});

electronProcess.on("exit", (code) => {
	process.exit(code ?? 0);
});
