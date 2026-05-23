import { test, expect } from "@playwright/test";
import { createMockPlan, mockLLMResponse } from "../fixtures/mock-llm";

const CHAT_PANEL = '[data-testid="chat-panel"]';
const CHAT_INPUT = '[data-testid="chat-input"]';
const CHAT_SEND_BUTTON = '[data-testid="chat-send-button"]';
const CHAT_MESSAGE_USER = '[data-testid="chat-message-user"]';
const CLEAR_SESSION_BUTTON = '[data-testid="clear-session-button"]';
const CLEAR_CONFIRM_BUTTON = '[data-testid="clear-confirm-button"]';
const TOGGLE_SIDEBAR_BUTTON = '[data-testid="toggle-sidebar-button"]';
const RENAME_SESSION_BUTTON = '[data-testid="rename-session-button"]';
const DELETE_SESSION_BUTTON = '[data-testid="delete-session-button"]';

async function setupLocalStorage(
	page: import("@playwright/test").Page,
): Promise<void> {
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

async function sendMessage(
	page: import("@playwright/test").Page,
	message: string,
): Promise<void> {
	await page.fill(CHAT_INPUT, message);
	await page.click(CHAT_SEND_BUTTON);
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

async function createSession(page: import("@playwright/test").Page): Promise<void> {
	const newSessionButton = page.locator("button:has-text('新建会话')").first();
	if (await newSessionButton.isVisible().catch(() => false)) {
		await newSessionButton.click();
	}
}

async function openSidebar(page: import("@playwright/test").Page): Promise<void> {
	const toggle = page.locator(TOGGLE_SIDEBAR_BUTTON).first();
	const ariaLabel = await toggle.getAttribute("aria-label");
	if (ariaLabel === "展开会话列表") {
		await toggle.click();
	}
}

test.describe("Session management", () => {
	test("can create a new session", async ({ page }) => {
		const plan = createMockPlan([], "simple");
		await setupPage(page, plan);
		await openSidebar(page);

		const initialCount = await page
			.locator('[data-testid="chat-panel"] div.cursor-pointer')
			.count();

		await page.getByRole("button", { name: "新建会话" }).click();

		await expect(
			page.locator('[data-testid="chat-panel"] div.cursor-pointer'),
		).toHaveCount(initialCount + 1);
	});

	test("messages are isolated between sessions", async ({ page }) => {
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
		await sendMessage(page, "Session 1 message");
		await page.waitForSelector(CHAT_MESSAGE_USER);
		await expect(page.locator(CHAT_MESSAGE_USER)).toHaveCount(1);

		await openSidebar(page);
		await page.getByRole("button", { name: "新建会话" }).click();

		await expect(page.locator(CHAT_MESSAGE_USER)).toHaveCount(0);
	});

	test("can rename a session", async ({ page }) => {
		const plan = createMockPlan([], "simple");
		await setupPage(page, plan);
		await openSidebar(page);

		const sessionItem = page
			.locator('[data-testid="chat-panel"] div.cursor-pointer')
			.first();
		await sessionItem.hover();
		await sessionItem.locator(RENAME_SESSION_BUTTON).click();

		const input = sessionItem.locator('input[type="text"]');
		await input.fill("Renamed Session");
		await input.press("Enter");

		await expect(
			page.locator("text=Renamed Session").first(),
		).toBeVisible();
	});

	test("can delete a session", async ({ page }) => {
		const plan = createMockPlan([], "simple");
		await setupPage(page, plan);
		await openSidebar(page);
		await page.getByRole("button", { name: "新建会话" }).click();

		const initialCount = await page
			.locator('[data-testid="chat-panel"] div.cursor-pointer')
			.count();
		expect(initialCount).toBeGreaterThanOrEqual(2);

		const firstSession = page
			.locator('[data-testid="chat-panel"] div.cursor-pointer')
			.first();
		await firstSession.hover();
		await firstSession.locator(DELETE_SESSION_BUTTON).click();

		await page.waitForTimeout(500);
		await firstSession.locator(DELETE_SESSION_BUTTON).click();

		await expect(
			page.locator('[data-testid="chat-panel"] div.cursor-pointer'),
		).toHaveCount(initialCount - 1);
	});

	test("can clear session messages", async ({ page }) => {
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

		await page.click(CLEAR_SESSION_BUTTON);
		await page.click(CLEAR_CONFIRM_BUTTON);

		await expect(page.locator(CHAT_MESSAGE_USER)).toHaveCount(0);
	});
});
