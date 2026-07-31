import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { rmSync } from "node:fs";

const isDesktopE2E = process.env.SHOTLYX_DESKTOP === "1";
const desktopProjectsRoot = process.env.SHOTLYX_PROJECTS_ROOT;
const desktopProjectsConfigPath = process.env.SHOTLYX_PROJECTS_CONFIG_PATH;

async function captureOneImage({
	page,
	testInfo,
	name,
}: {
	page: Page;
	testInfo: TestInfo;
	name: string;
}) {
	await page.evaluate(() => document.fonts.ready);
	const buffer = await page.screenshot({
		path: testInfo.outputPath(`${name}.png`),
		fullPage: true,
	});
	await testInfo.attach(name, { body: buffer, contentType: "image/png" });
	expect(buffer.byteLength).toBeGreaterThan(20_000);
}

test.describe("desktop visual smoke", () => {
	test.skip(!isDesktopE2E, "desktop visuals require the local API bridge");
	test.use({
		colorScheme: "light",
		viewport: { width: 1440, height: 900 },
	});

	test.beforeEach(async ({ page }) => {
		if (process.env.SHOTLYX_DESKTOP_CONFIG_PATH) {
			rmSync(process.env.SHOTLYX_DESKTOP_CONFIG_PATH, { force: true });
		}
		if (process.env.SHOTLYX_DESKTOP_SECRETS_PATH) {
			rmSync(process.env.SHOTLYX_DESKTOP_SECRETS_PATH, { force: true });
		}
		if (desktopProjectsRoot) {
			rmSync(desktopProjectsRoot, { force: true, recursive: true });
		}
		if (desktopProjectsConfigPath) {
			rmSync(desktopProjectsConfigPath, { force: true });
		}
		await page.addInitScript(() => {
			window.localStorage.setItem("hasSeenOnboarding", "true");
			window.localStorage.setItem("shotlyx:locale", "en");
		});
	});

	test("captures desktop setup as one image", async ({ page }, testInfo) => {
		await page.goto("/settings/api");
		await expect(
			page.getByRole("heading", {
				name: "AI integrations",
				exact: true,
			}),
		).toBeVisible();

		await captureOneImage({ page, testInfo, name: "desktop-setup" });
	});

	test("captures empty projects as one image", async ({ page }, testInfo) => {
		await page.goto("/projects");
		await expect(
			page.getByRole("button", { name: "创建第一个项目" }),
		).toBeVisible();

		await captureOneImage({ page, testInfo, name: "projects-empty" });
	});

	test("captures editor workbench as one image", async ({ page }, testInfo) => {
		await page.goto("/projects");
		await page.getByRole("button", { name: "创建第一个项目" }).click();
		await page.waitForURL(/\/editor\//);
		await expect(page.locator(".editor-workbench")).toBeVisible();
		await expect(
			page.locator('header button[aria-label="设置"]'),
		).toBeVisible();

		await captureOneImage({ page, testInfo, name: "editor-workbench" });
	});
});
