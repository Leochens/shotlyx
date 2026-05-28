import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDesktopEnv } from "./desktop-runtime.mjs";
import { prepareDesktopApiBundle } from "./prepare-desktop-api.mjs";
import { prepareDesktopWebBundle } from "./prepare-desktop-web.mjs";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const desktopSiteUrl = "https://shotlyx.ai";

function runWebBuild() {
	return new Promise((resolve, reject) => {
		const buildProcess = spawn("bun", ["run", "--cwd", "apps/web", "build"], {
			cwd: repoRoot,
			env: {
				...createDesktopEnv(),
				NODE_ENV: "production",
				SHOTLYX_RENDERER_ORIGIN: "app://shotlyx",
				VITE_SHOTLYX_API_ORIGIN: "app://shotlyx",
				VITE_SITE_URL: desktopSiteUrl,
				VITE_MARBLE_API_URL: "app://shotlyx",
			},
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

function runApiBuild() {
	return new Promise((resolve, reject) => {
		const buildProcess = spawn(
			"bun",
			["run", "--cwd", "apps/web", "build:desktop-api"],
			{
				cwd: repoRoot,
				env: {
					...createDesktopEnv(),
					NODE_ENV: "production",
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

try {
	await runWebBuild();
	await runApiBuild();
	const preparedRendererPath = await prepareDesktopWebBundle();
	const preparedApiPath = await prepareDesktopApiBundle();
	console.log(`Prepared desktop renderer bundle at ${preparedRendererPath}`);
	console.log(`Prepared desktop API bundle at ${preparedApiPath}`);
} catch (error) {
	console.error(error);
	process.exit(1);
}
