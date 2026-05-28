import { expect, test } from "@playwright/test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const isRunningUnderBunTest = Boolean(process.versions.bun);

if (!isRunningUnderBunTest) {
	test.describe.configure({ mode: "serial" });

	test("desktop welcome setup defaults to local Agent and folds optional APIs", async ({
		page,
	}) => {
		if (process.env.SHOTLYX_DESKTOP_CONFIG_PATH) {
			rmSync(process.env.SHOTLYX_DESKTOP_CONFIG_PATH, { force: true });
		}

		await page.goto("/desktop");
		await expect(page).toHaveURL(/\/settings\/api$/);
		await expect(
			page.getByRole("heading", { name: "Welcome to Shotlyx Desktop" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /Local Agent/ }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: /API BYOK/ })).toBeVisible();
		await expect(page.getByText("Local Agent selected")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /Rescan local CLIs/ }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Optional API integrations" }),
		).toBeVisible();

		await expect(page.getByText("Ark API key")).not.toBeVisible();
		await page.getByRole("button", { name: /Video generation/ }).click();
		await expect(page.getByText("Ark API key")).toBeVisible();
	});

	test("desktop launch skips setup when Agent LLM API config exists", async ({
		page,
	}) => {
		if (!process.env.SHOTLYX_DESKTOP_CONFIG_PATH) {
			throw new Error("SHOTLYX_DESKTOP_CONFIG_PATH is required");
		}
		writeFileSync(
			process.env.SHOTLYX_DESKTOP_CONFIG_PATH,
			JSON.stringify(
				{
					version: 1,
					updatedAt: new Date().toISOString(),
					values: {
						AGENT_RUNTIME: "api",
						AGENT_LLM_PROVIDER: "openai",
						AGENT_LLM_KEY: "e2e-agent-key",
						AGENT_LLM_MODEL: "gpt-4o-mini",
					},
				},
				null,
				2,
			),
		);

		await page.goto("/desktop");
		await expect(page).toHaveURL(/\/projects$/);
		await expect(
			page.getByRole("button", { name: "Create your first project" }),
		).toBeVisible();
	});

	test("desktop welcome setup saves and reveals API BYOK config", async ({
		page,
	}) => {
		if (process.env.SHOTLYX_DESKTOP_CONFIG_PATH) {
			rmSync(process.env.SHOTLYX_DESKTOP_CONFIG_PATH, { force: true });
		}

		await page.goto("/settings/api");
		await page.getByRole("button", { name: /API BYOK/ }).click();
		await expect(
			page.getByRole("heading", { name: "Bring your own model API" }),
		).toBeVisible();
		await page.getByRole("combobox", { name: "Quick provider preset" }).click();
		await page.getByRole("option", { name: "DeepSeek - OpenAI" }).click();
		await expect(page.locator("#AGENT_LLM_PROVIDER")).toHaveValue(
			"openai-compatible",
		);
		await expect(page.locator("#AGENT_LLM_HOST")).toHaveValue(
			"https://api.deepseek.com",
		);
		await expect(page.locator("#AGENT_LLM_MODEL")).toContainText(
			"deepseek-chat",
		);
		await expect(
			page.getByRole("link", { name: /Get key from DeepSeek/ }),
		).toBeVisible();

		await page.locator("#AGENT_LLM_KEY").fill("e2e-agent-key");
		await page.locator("#AGENT_LLM_MODEL").click();
		await page.getByRole("option", { name: "deepseek-reasoner" }).click();
		await page.getByRole("button", { name: /Web search \/ fetch/ }).click();
		await page.locator("#TAVILY_API_KEY").fill("e2e-tavily-key");
		await page.getByRole("button", { name: /^Save setup$/ }).click();

		await expect(page.getByText("Setup saved")).toBeVisible();
		await expect(page.getByText("Ready").first()).toBeVisible();
		await expect(page.locator("#AGENT_LLM_KEY")).toHaveAttribute(
			"placeholder",
			/^\*+$/,
		);
		await page.getByRole("button", { name: "Show AGENT_LLM_KEY" }).click();
		await expect(page.locator("#AGENT_LLM_KEY")).toHaveValue("e2e-agent-key");
		await page.getByRole("button", { name: "Hide AGENT_LLM_KEY" }).click();
		await expect(page.locator("#AGENT_LLM_KEY")).toHaveAttribute(
			"type",
			"password",
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

	test("desktop settings can use a scanned local Claude Code CLI runtime", async ({
		page,
	}) => {
		if (process.env.SHOTLYX_DESKTOP_CONFIG_PATH) {
			rmSync(process.env.SHOTLYX_DESKTOP_CONFIG_PATH, { force: true });
		}
		const tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-e2e-cli-"));
		const fakeClaude = path.join(tempDir, "claude");
		writeFileSync(
			fakeClaude,
			`#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "1.0.63 (Claude Code)"; exit 0; fi
exit 0
`,
			"utf8",
		);
		chmodSync(fakeClaude, 0o755);

		try {
			await page.goto("/settings/api");
			await expect(page.getByText("Local Agent selected")).toBeVisible();
			await page.locator("#AGENT_CLI_MODEL").fill("sonnet");
			await page.locator("#AGENT_CLI_PATH").fill(fakeClaude);
			await page.getByRole("button", { name: /^Save setup$/ }).click();

			await expect(page.getByText("Setup saved")).toBeVisible();
			await expect(page.getByText("Ready").first()).toBeVisible();

			const status = await page.evaluate(async () => {
				const response = await fetch("/api/desktop/config");
				return response.json();
			});
			expect(status.values.AGENT_RUNTIME).toBe("local-cli");
			expect(status.values.AGENT_CLI_ID).toBe("claude");
			expect(
				status.status.find(
					(group: { id: string }) => group.id === "agent-runtime",
				)?.configured,
			).toBe(true);
			expect(
				status.status.find((group: { id: string }) => group.id === "agent-llm")
					?.required,
			).toBe(false);

			const agents = await page.evaluate(async () => {
				const response = await fetch("/api/desktop/agents");
				return response.json();
			});
			expect(
				agents.agents.find((agent: { id: string }) => agent.id === "claude"),
			).toMatchObject({
				available: true,
				version: "1.0.63 (Claude Code)",
			});
			expect(
				agents.agents.find((agent: { id: string }) => agent.id === "codex")
					?.binPath,
			).not.toBe(fakeClaude);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test("editor settings separates Agent config from advanced API config", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			window.localStorage.setItem("hasSeenOnboarding", "true");
		});

		await page.goto("/projects");
		await page
			.getByRole("button", { name: "Create your first project" })
			.click();
		await page.waitForURL(/\/editor\//);
		const editorUrl = page.url();

		await page.locator('header button[aria-label="设置"]').click();
		await expect(
			page.getByRole("menuitem", { name: "Agent配置" }),
		).toBeVisible();
		await expect(
			page.getByRole("menuitem", { name: "高级 API 配置" }),
		).toBeVisible();
		await expect(
			page.getByRole("menuitem", { name: "Agent Page" }),
		).not.toBeVisible();

		await page.getByRole("menuitem", { name: "Agent配置" }).click();
		await expect(page).toHaveURL(editorUrl);
		await page.waitForSelector('div[role="dialog"] iframe[title="Agent配置"]');
		const agentFrame = page.frameLocator('iframe[title="Agent配置"]');
		await expect(
			agentFrame.getByRole("heading", { name: "Agent配置" }),
		).toBeVisible();
		await agentFrame.getByRole("button", { name: /API BYOK/ }).click();
		await expect(
			agentFrame.getByRole("heading", {
				name: /Bring your own model API|使用自己的模型 API/,
			}),
		).toBeVisible();
		await expect(
			agentFrame.getByRole("heading", {
				name: /Optional API integrations|可选 API 集成/,
			}),
		).not.toBeVisible();

		await page.getByRole("button", { name: "高级 API 配置" }).click();
		await page.waitForSelector(
			'div[role="dialog"] iframe[title="高级 API 配置"]',
		);
		const advancedFrame = page.frameLocator('iframe[title="高级 API 配置"]');
		await expect(
			advancedFrame.getByRole("heading", { name: "高级 API 配置" }),
		).toBeVisible();
		await expect(
			advancedFrame.getByRole("heading", {
				name: /Optional API integrations|可选 API 集成/,
			}),
		).toBeVisible();
	});
}
