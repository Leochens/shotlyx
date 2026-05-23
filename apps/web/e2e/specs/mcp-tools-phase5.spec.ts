import { test, expect } from "@playwright/test";
import { createMockPlan, mockLLMResponse } from "../fixtures/mock-llm";

const CHAT_PANEL = '[data-testid="chat-panel"]';
const CHAT_INPUT = '[data-testid="chat-input"]';
const CHAT_SEND_BUTTON = '[data-testid="chat-send-button"]';
const CHAT_MESSAGE_ASSISTANT = '[data-testid="chat-message-assistant"]';

async function setupLocalStorage(page: import("@playwright/test").Page): Promise<void> {
	await page.evaluate(() => {
		localStorage.setItem("hasSeenOnboarding", JSON.stringify({ value: true }));
		localStorage.setItem(
			"panel-sizes",
			JSON.stringify({
				state: {
					panels: {
						chat: 20,
						tools: 25,
						preview: 50,
						properties: 25,
						mainContent: 50,
						timeline: 50,
					},
				},
				version: 2,
			}),
		);
	});
}

async function createSession(page: import("@playwright/test").Page): Promise<void> {
	const newSessionButton = page.locator("button:has-text('新建会话')").first();
	if (await newSessionButton.isVisible().catch(() => false)) {
		await newSessionButton.click();
	}
}

async function setupPage(
	page: import("@playwright/test").Page,
	plan: ReturnType<typeof createMockPlan>,
): Promise<void> {
	await mockLLMResponse(page, plan);
	await page.goto("/editor/test-project");
	await setupLocalStorage(page);
	await page.reload();
	await page.waitForSelector(CHAT_PANEL);
	await createSession(page);
}

async function sendMessage(
	page: import("@playwright/test").Page,
	message: string,
): Promise<void> {
	await page.fill(CHAT_INPUT, message);
	await page.click(CHAT_SEND_BUTTON);
}

test.describe("Phase 5 MCP tools — E2E via chat panel", () => {
	test("insert_media executes and shows result", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_insert_media",
					params: {
						trackId: "track-main",
						mediaId: "media-1",
						startTimeSeconds: 0,
					},
					description: "插入媒体到时间线",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "插入媒体到时间线");

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });
		await page.waitForSelector('[data-testid="action-confirm"]', {
			timeout: 15000,
		});

		await page.click('[data-testid="action-confirm"]');
		await page.waitForTimeout(2000);

		const messages = page.locator(CHAT_MESSAGE_ASSISTANT);
		await expect(messages.last()).toContainText("timeline_insert_media");
	});

	test("update_element_params executes and shows result", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_update_element_params",
					params: {
						trackId: "track-main",
						elementId: "elem-1",
						params: { opacity: 0.5 },
					},
					description: "修改元素透明度",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "修改元素透明度");

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });
		await page.waitForSelector('[data-testid="action-confirm"]', {
			timeout: 15000,
		});

		await page.click('[data-testid="action-confirm"]');
		await page.waitForTimeout(2000);

		const messages = page.locator(CHAT_MESSAGE_ASSISTANT);
		await expect(messages.last()).toContainText("timeline_update_element_params");
	});

	test("update_text_content executes and shows result", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_update_text_content",
					params: {
						trackId: "track-main",
						elementId: "text-1",
						content: "Hello Shotlyx",
						fontSize: 24,
					},
					description: "更新文字内容",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "更新文字内容");

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });
		await page.waitForSelector('[data-testid="action-confirm"]', {
			timeout: 15000,
		});

		await page.click('[data-testid="action-confirm"]');
		await page.waitForTimeout(2000);

		const messages = page.locator(CHAT_MESSAGE_ASSISTANT);
		await expect(messages.last()).toContainText("timeline_update_text_content");
	});

	test("toggle_track_mute executes and shows result", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_toggle_track_mute",
					params: { trackId: "audio-track-1" },
					description: "切换轨道静音",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "切换轨道静音");

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });
		await page.waitForSelector('[data-testid="action-confirm"]', {
			timeout: 15000,
		});

		await page.click('[data-testid="action-confirm"]');
		await page.waitForTimeout(2000);

		const messages = page.locator(CHAT_MESSAGE_ASSISTANT);
		await expect(messages.last()).toContainText("timeline_toggle_track_mute");
	});

	test("error display — invalid params show error in UI", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_insert_media",
					params: {
						trackId: "track-main",
						mediaId: "missing-media",
						startTimeSeconds: 0,
					},
					description: "插入不存在的媒体",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "插入不存在的媒体");

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });
		await page.waitForSelector('[data-testid="action-confirm"]', {
			timeout: 15000,
		});

		await page.click('[data-testid="action-confirm"]');
		await page.waitForTimeout(2000);

		const messages = page.locator(CHAT_MESSAGE_ASSISTANT);
		const lastMessage = messages.last();
		await expect(lastMessage).toContainText("error");
	});
});
