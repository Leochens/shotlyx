import { spawn } from "node:child_process";
import path from "node:path";

const PASSTHROUGH_ENV_KEYS = [
	"HOME",
	"PATH",
	"USER",
	"LOGNAME",
	"SHELL",
	"TMPDIR",
	"TEMP",
	"TMP",
	"USERPROFILE",
	"APPDATA",
	"LOCALAPPDATA",
	"SystemRoot",
	"WINDIR",
	"COMSPEC",
	"PATHEXT",
	"PROCESSOR_ARCHITECTURE",
	"CARGO_HOME",
	"CARGO_NET_OFFLINE",
	"RUSTUP_HOME",
	"RUSTFLAGS",
	"RUSTC_WRAPPER",
	"CC",
	"CXX",
	"AR",
	"MACOSX_DEPLOYMENT_TARGET",
];

export function resolveWasmPackCommand() {
	return process.platform === "win32" ? "wasm-pack.cmd" : "wasm-pack";
}

export function createWasmBuildEnv(baseEnv = process.env) {
	const env = {};
	for (const key of PASSTHROUGH_ENV_KEYS) {
		const value = baseEnv[key];
		if (typeof value === "string" && value.length > 0) {
			env[key] = value;
		}
	}

	const homeDir = env.HOME ?? env.USERPROFILE;
	if (!env.CARGO_HOME && homeDir) {
		env.CARGO_HOME = path.join(homeDir, ".cargo");
	}
	if (!env.RUSTUP_HOME && homeDir) {
		env.RUSTUP_HOME = path.join(homeDir, ".rustup");
	}

	return env;
}

export function runWasmBuild({ repoRoot }) {
	return new Promise((resolve, reject) => {
		console.log("Building local opencut-wasm package...");
		const buildProcess = spawn(
			resolveWasmPackCommand(),
			["build", "rust/wasm", "--target", "bundler", "--out-dir", "pkg"],
			{
				cwd: repoRoot,
				env: createWasmBuildEnv(),
				stdio: "inherit",
			},
		);

		buildProcess.on("error", reject);
		buildProcess.on("exit", (code) => {
			if (code === 0 || code === null) {
				resolve();
			} else {
				reject(new Error(`WASM build exited with code ${code}`));
			}
		});
	});
}
