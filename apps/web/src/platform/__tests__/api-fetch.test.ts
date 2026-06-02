import { describe, expect, test } from "bun:test";
import { shouldInstallDesktopApiFetchForRuntime } from "../api-fetch";

describe("desktop API fetch rewrite", () => {
	test("does not install app-scheme API rewrite in ordinary browsers", () => {
		expect(
			shouldInstallDesktopApiFetchForRuntime({
				alreadyInstalled: false,
				desktopApiOrigin: "app://shotlyx",
				hasWindow: true,
				userAgent:
					"Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/148 Safari/537.36",
			}),
		).toBe(false);
	});

	test("installs app-scheme API rewrite inside Electron", () => {
		expect(
			shouldInstallDesktopApiFetchForRuntime({
				alreadyInstalled: false,
				desktopApiOrigin: "app://shotlyx",
				hasWindow: true,
				userAgent:
					"Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Electron/42.3.0 Safari/537.36",
			}),
		).toBe(true);
	});
});
