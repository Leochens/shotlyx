import { defineConfig, devices } from "@playwright/test";

const isDesktopE2E = process.env.SHOTLYX_DESKTOP === "1";
const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://127.0.0.1:${e2ePort}`;
const webServerCommand = `bun run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`;

export default defineConfig({
	testDir: "./e2e/specs",
	fullyParallel: !isDesktopE2E,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: isDesktopE2E ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: webServerCommand,
		url: baseURL,
		reuseExistingServer: !process.env.CI && !isDesktopE2E,
		timeout: 120_000,
	},
});
