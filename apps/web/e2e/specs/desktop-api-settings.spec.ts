import { expect, test } from "@playwright/test";
import { rmSync } from "node:fs";

const isRunningUnderBunTest = Boolean(process.versions.bun);

if (!isRunningUnderBunTest) {
	test("desktop API setup page explains and saves local provider config", async ({
		page,
	}) => {
		if (process.env.SHOTLYX_DESKTOP_CONFIG_PATH) {
			rmSync(process.env.SHOTLYX_DESKTOP_CONFIG_PATH, { force: true });
		}

		await page.goto("/desktop");
		await expect(
			page.getByRole("heading", { name: "Local API setup" }),
		).toBeVisible();
		await expect(page.getByText("API setup required")).toBeVisible();
		await expect(
			page.getByRole("link", { name: /Configure APIs/ }),
		).toBeVisible();

		await page.goto("/settings/api");
		await expect(
			page.getByRole("heading", { name: "API settings" }),
		).toBeVisible();
		await expect(page.getByText("Why this is required")).toBeVisible();
		await expect(
			page.getByText("How to configure: choose a provider"),
		).toBeVisible();
		await expect(page.getByText("Storage: keys are written")).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Agent LLM" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Video generation" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Transcription / ASR" }),
		).toBeVisible();

		await page.locator("#AGENT_LLM_KEY").fill("e2e-agent-key");
		await page.locator("#AGENT_LLM_MODEL").fill("gpt-4o-mini");
		await page.locator("#TAVILY_API_KEY").fill("e2e-tavily-key");
		await page.getByRole("button", { name: /^Save$/ }).click();

		await expect(page.getByText("API settings saved")).toBeVisible();
		await expect(page.getByText("Ready").first()).toBeVisible();
		await expect(page.locator("#AGENT_LLM_KEY")).toHaveAttribute(
			"placeholder",
			/Saved locally/,
		);

		const status = await page.evaluate(async () => {
			const response = await fetch("/api/desktop/config");
			return response.json();
		});

		expect(status.values.AGENT_LLM_KEY).toBe("");
		expect(
			status.status.find((group: { id: string }) => group.id === "agent-llm")
				?.configured,
		).toBe(true);
		await expect
			.poll(() =>
				page.evaluate(() => window.localStorage.getItem("AGENT_LLM_KEY")),
			)
			.toBeNull();
	});
}
