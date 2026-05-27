import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDesktopEnv } from "./desktop-runtime.mjs";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");

const buildProcess = spawn("bun", ["run", "--cwd", "apps/web", "build"], {
	cwd: repoRoot,
	env: createDesktopEnv(),
	stdio: "inherit",
});

buildProcess.on("exit", (code) => {
	process.exit(code ?? 0);
});
