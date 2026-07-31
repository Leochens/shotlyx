import { describe, expect, test } from "bun:test";
import {
	createWasmBuildEnv,
	resolveWasmPackCommand,
} from "./wasm-build.mjs";

describe("wasm-build helpers", () => {
	test("keeps wasm build environment focused on toolchain variables", () => {
		const env = createWasmBuildEnv({
			HOME: "/Users/example",
			PATH: "/usr/bin:/bin",
			SCRCPY_SERVER_PATH: "/tmp/invalid-env-value",
			CARGO_HOME: "/custom/cargo",
			CARGO_NET_OFFLINE: "true",
			RUSTUP_HOME: "/custom/rustup",
			TMPDIR: "/tmp/example",
		});

		expect(env).toEqual({
			HOME: "/Users/example",
			PATH: "/usr/bin:/bin",
			CARGO_HOME: "/custom/cargo",
			CARGO_NET_OFFLINE: "true",
			RUSTUP_HOME: "/custom/rustup",
			TMPDIR: "/tmp/example",
		});
	});

	test("defaults cargo and rustup homes from HOME", () => {
		const env = createWasmBuildEnv({
			HOME: "/Users/example",
			PATH: "/usr/bin:/bin",
		});

		expect(env.CARGO_HOME).toBe("/Users/example/.cargo");
		expect(env.RUSTUP_HOME).toBe("/Users/example/.rustup");
	});

	test("resolves wasm-pack command for the current platform", () => {
		const command = resolveWasmPackCommand();

		expect(command === "wasm-pack" || command === "wasm-pack.cmd").toBe(true);
	});
});
