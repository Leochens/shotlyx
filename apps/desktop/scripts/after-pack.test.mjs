import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
	buildResourceBundles,
	resolveFfmpegBundleKey,
} = require("./after-pack.cjs");

function buildContext() {
	return {
		appOutDir: "/repo/apps/desktop/release/mac-arm64",
		arch: "arm64",
		electronPlatformName: "darwin",
		packager: {
			appInfo: {
				productFilename: "Shotlyx Desktop",
			},
			projectDir: "/repo/apps/desktop",
		},
	};
}

test("after-pack resolves ffmpeg from the repo-level resources directory", () => {
	const bundles = buildResourceBundles(buildContext());

	expect(resolveFfmpegBundleKey(buildContext())).toBe("darwin-arm64");
	expect(bundles).toContainEqual({
		name: path.join("ffmpeg", "darwin-arm64"),
		source: path.join("/repo", "resources", "ffmpeg", "darwin-arm64"),
	});
});
