import { test, expect } from "@playwright/test";
import { createMockPlan, mockLLMResponse } from "../fixtures/mock-llm";

const CHAT_PANEL = '[data-testid="chat-panel"]';
const CHAT_INPUT = '[data-testid="chat-input"]';
const CHAT_SEND_BUTTON = '[data-testid="chat-send-button"]';
const CHAT_MESSAGE_USER = '[data-testid="chat-message-user"]';
const CHAT_MESSAGE_ASSISTANT = '[data-testid="chat-message-assistant"]';
const CHAT_MORE_MENU_BUTTON = '[data-testid="chat-more-menu-button"]';
const CLEAR_SESSION_BUTTON = '[data-testid="clear-session-button"]';
const CLEAR_CONFIRM_BUTTON = '[data-testid="clear-confirm-button"]';

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

async function sendMessage(
	page: import("@playwright/test").Page,
	message: string,
): Promise<void> {
	await page.fill(CHAT_INPUT, message);
	await page.click(CHAT_SEND_BUTTON);
}

async function openChatMoreMenu(
	page: import("@playwright/test").Page,
): Promise<void> {
	await page.click(CHAT_MORE_MENU_BUTTON);
	await page.locator(CLEAR_SESSION_BUTTON).waitFor({ state: "visible" });
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

test.describe("ChatPanel 基础对话与工具执行", () => {
	test("user can send a message and receive a plan", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_add_track",
					params: { type: "video" },
					description: "添加一条视频轨道",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "添加一条视频轨道");

		await page.waitForSelector(CHAT_MESSAGE_USER);
		const userMessage = page.locator(CHAT_MESSAGE_USER).first();
		await expect(userMessage).toContainText("添加一条视频轨道");

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT);
		const assistantMessage = page.locator(CHAT_MESSAGE_ASSISTANT).last();
		await expect(assistantMessage).toContainText("添加一条视频轨道");
	});

	test("user can confirm plan execution", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "playback_play",
					params: {},
					description: "播放视频",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "播放视频");

		await page.waitForSelector('[data-testid="action-confirm"]');
		await page.click('[data-testid="action-confirm"]');

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT);
		const resultMessage = page.locator(CHAT_MESSAGE_ASSISTANT).last();
		await expect(resultMessage).toContainText("已执行");
	});

	test("user can clear session messages", async ({ page }) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_add_track",
					params: { type: "audio" },
					description: "添加一条音频轨道",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "添加一条音频轨道");

		await page.waitForSelector(CHAT_MESSAGE_USER);
		await expect(page.locator(CHAT_MESSAGE_USER)).toHaveCount(1);

		await openChatMoreMenu(page);
		await page.click(CLEAR_SESSION_BUTTON);
		await page.click(CLEAR_CONFIRM_BUTTON);

		await expect(page.locator(CHAT_MESSAGE_USER)).toHaveCount(0);
	});

	test("tool execution results are shown after confirmation", async ({
		page,
	}) => {
		const plan = createMockPlan(
			[
				{
					tool: "timeline_add_track",
					params: { type: "video" },
					description: "添加一条视频轨道",
				},
			],
			"simple",
		);

		await setupPage(page, plan);
		await sendMessage(page, "添加一条视频轨道");

		await page.waitForSelector('[data-testid="action-confirm"]');
		await page.click('[data-testid="action-confirm"]');

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT);
		const resultMessage = page.locator(CHAT_MESSAGE_ASSISTANT).last();
		await expect(resultMessage).toContainText("timeline_add_track");
	});
});
