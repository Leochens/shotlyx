import { test, expect } from "@playwright/test";

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

test.describe("Real LLM chat — timeline/playback tool plans", () => {
	test("播放 returns a plan with action buttons", async ({ page }) => {
		await page.goto("/editor/test-project");
		await setupLocalStorage(page);
		await page.reload();
		await page.waitForSelector(CHAT_PANEL);

		// Create a session first — messages require an active session
		const newSessionButton = page.locator("button:has-text('新建会话')").first();
		if (await newSessionButton.isVisible().catch(() => false)) {
			await newSessionButton.click();
		}

		await page.fill(CHAT_INPUT, "播放");
		await page.click(CHAT_SEND_BUTTON);

		// Wait for assistant message
		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });

		// The response should contain action buttons (confirm/modify),
		// NOT just plain text. Plain text = empty steps = bug.
		await page.waitForSelector('[data-testid="action-confirm"]', { timeout: 15000 });
		const confirmButton = page.locator('[data-testid="action-confirm"]').first();
		await expect(confirmButton).toBeVisible();
		await expect(confirmButton).toContainText("确认");
	});

	test("时间线上现在有哪些轨道 returns a plan with action buttons", async ({ page }) => {
		await page.goto("/editor/test-project");
		await setupLocalStorage(page);
		await page.reload();
		await page.waitForSelector(CHAT_PANEL);

		// Create a session first — messages require an active session
		const newSessionButton = page.locator("button:has-text('新建会话')").first();
		if (await newSessionButton.isVisible().catch(() => false)) {
			await newSessionButton.click();
		}

		await page.fill(CHAT_INPUT, "时间线上现在有哪些轨道");
		await page.click(CHAT_SEND_BUTTON);

		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });
		await page.waitForSelector('[data-testid="action-confirm"]', { timeout: 15000 });

		const confirmButton = page.locator('[data-testid="action-confirm"]').first();
		await expect(confirmButton).toBeVisible();
	});

	test("添加文字轨道 executes and shows the track on timeline", async ({ page }) => {
		await page.goto("/editor/test-project");
		await setupLocalStorage(page);
		await page.reload();
		await page.waitForSelector(CHAT_PANEL);

		// Create a session first
		const newSessionButton = page.locator("button:has-text('新建会话')").first();
		if (await newSessionButton.isVisible().catch(() => false)) {
			await newSessionButton.click();
		}

		await page.fill(CHAT_INPUT, "添加文字轨道");
		await page.click(CHAT_SEND_BUTTON);

		// Wait for plan with confirm button
		await page.waitForSelector(CHAT_MESSAGE_ASSISTANT, { timeout: 15000 });
		await page.waitForSelector('[data-testid="action-confirm"]', { timeout: 15000 });

		// Confirm execution
		await page.click('[data-testid="action-confirm"]');

		// Wait for execution result message
		await page.waitForTimeout(2000);
		const messages = page.locator(CHAT_MESSAGE_ASSISTANT);
		await expect(messages.last()).toContainText("timeline_add_track");

		// Verify the text track appears on the timeline
		const textTrack = page.locator('button[aria-label="Select Text track track"]').first();
		await expect(textTrack).toBeVisible();
	});
});
