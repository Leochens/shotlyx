import { expect, test } from "@playwright/test";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const isRunningUnderBunTest = Boolean(process.versions.bun);
const desktopConfigPath = process.env.SHOTLYX_DESKTOP_CONFIG_PATH;
const desktopSecretsPath = process.env.SHOTLYX_DESKTOP_SECRETS_PATH;
const desktopProjectsRoot = process.env.SHOTLYX_PROJECTS_ROOT;
const desktopProjectsConfigPath = process.env.SHOTLYX_PROJECTS_CONFIG_PATH;

if (!isRunningUnderBunTest) {
	test.describe.configure({ mode: "serial" });

	test.beforeEach(async ({ page }) => {
		if (desktopProjectsRoot) {
			rmSync(desktopProjectsRoot, { force: true, recursive: true });
		}
		if (desktopProjectsConfigPath) {
			rmSync(desktopProjectsConfigPath, { force: true });
		}
		if (desktopConfigPath) {
			rmSync(desktopConfigPath, { force: true });
		}
		if (desktopSecretsPath) {
			rmSync(desktopSecretsPath, { force: true });
		}
		await page.addInitScript(() => {
			window.localStorage.setItem("shotlyx:locale", "en");
		});
	});

	test("desktop opens the offline editor without requiring provider setup", async ({
		page,
	}) => {
		await page.goto("/desktop");
		await expect(page).toHaveURL(/\/projects$/);
		await expect(
			page.getByRole("button", { name: "创建第一个项目" }),
		).toBeVisible();

		await page.goto("/settings/api");
		await expect(page).toHaveURL(/\/settings\/api$/);
		await expect(
			page.getByRole("heading", {
				name: "AI integrations",
				exact: true,
			}),
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
		await expect(page.getByText("Kimi / Moonshot API key")).not.toBeVisible();
		await page.getByRole("button", { name: /Video generation/ }).click();
		await expect(page.getByText("Ark API key")).toBeVisible();
		await page.getByRole("button", { name: /Visual understanding/ }).click();
		await expect(page.getByText("Kimi / Moonshot API key")).toBeVisible();
	});

	test("desktop rejects BYOK secrets when secure storage is unavailable", async ({
		page,
	}) => {
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
		const saveResponsePromise = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === "/api/desktop/config" &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: /^Save setup$/ }).click();

		const saveResponse = await saveResponsePromise;
		expect(saveResponse.status()).toBe(503);
		await expect(saveResponse.json()).resolves.toEqual({
			error:
				"Secure credential storage is unavailable on this operating system.",
		});
		await expect(
			page.getByText(
				"Secure credential storage is unavailable on this operating system.",
			),
		).toBeVisible();
		await expect(page.locator("#AGENT_LLM_KEY")).toHaveValue("e2e-agent-key");
		await expect(page.locator("#TAVILY_API_KEY")).toHaveValue("e2e-tavily-key");

		const status = await page.evaluate(async () => {
			const response = await fetch("/api/desktop/config");
			return response.json();
		});

		expect(status.values.AGENT_LLM_KEY).toBe("");
		expect(
			status.status.find((group: { id: string }) => group.id === "agent-llm")
				?.configured,
		).toBe(false);
		await expect
			.poll(() =>
				page.evaluate(() => window.localStorage.getItem("AGENT_LLM_KEY")),
			)
			.toBeNull();
		for (const filePath of [desktopConfigPath, desktopSecretsPath]) {
			if (!filePath || !existsSync(filePath)) continue;
			const persisted = readFileSync(filePath, "utf8");
			expect(persisted).not.toContain("e2e-agent-key");
			expect(persisted).not.toContain("e2e-tavily-key");
		}
	});

	test("desktop settings can use a scanned local Claude Code CLI runtime", async ({
		page,
	}) => {
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
		await page.getByRole("button", { name: "创建第一个项目" }).click();
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
