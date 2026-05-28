import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDesktopEnv } from "./desktop-runtime.mjs";
import { prepareDesktopWebBundle } from "./prepare-desktop-web.mjs";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");

function runWebBuild() {
	return new Promise((resolve, reject) => {
		const buildProcess = spawn("bun", ["run", "--cwd", "apps/web", "build"], {
			cwd: repoRoot,
			env: createDesktopEnv(),
			stdio: "inherit",
		});

		buildProcess.on("error", reject);
		buildProcess.on("exit", (code) => {
			if (code === 0 || code === null) {
				resolve();
			} else {
				reject(new Error(`Desktop web build exited with code ${code}`));
			}
		});
	});
}

try {
	await runWebBuild();
	const preparedPath = await prepareDesktopWebBundle();
	console.log(`Prepared desktop web bundle at ${preparedPath}`);
} catch (error) {
	console.error(error);
	process.exit(1);
}
