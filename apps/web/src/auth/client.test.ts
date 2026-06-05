import { describe, expect, test } from "bun:test";
import {
	loginWithEmail,
	mapAuthErrorMessage,
	subscribeAuthSessionChanges,
} from "./client";

describe("auth client errors", () => {
	test("maps server error codes to readable messages", () => {
		expect(mapAuthErrorMessage("password_too_short")).toBe("密码至少需要 6 位");
		expect(mapAuthErrorMessage("invalid_email_or_password")).toBe(
			"邮箱或密码不正确",
		);
		expect(mapAuthErrorMessage("email_already_registered")).toBe(
			"这个邮箱已经注册过了",
		);
	});

	test("keeps unknown errors readable", () => {
		expect(mapAuthErrorMessage("upstream_down")).toBe("upstream_down");
		expect(mapAuthErrorMessage("", "认证失败")).toBe("认证失败");
	});

	test("notifies listeners with the authenticated account after login succeeds", async () => {
		const storage = new Map<string, string>();
		const previousWindow = globalThis.window;
		const previousFetch = globalThis.fetch;
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				localStorage: {
					getItem: (key: string) => storage.get(key) ?? null,
					removeItem: (key: string) => storage.delete(key),
					setItem: (key: string, value: string) => storage.set(key, value),
				},
			},
		});
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					user: { id: "user-1", email: "user@example.com", name: "User" },
					session: {
						token: "shotlyx_session_test",
						userId: "user-1",
						createdAt: "2026-06-05T00:00:00.000Z",
						expiresAt: "2026-07-05T00:00:00.000Z",
					},
					newApiKey: null,
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);

		const notifications: string[] = [];
		const unsubscribe = subscribeAuthSessionChanges((account) => {
			if (account) notifications.push(account.user.email);
		});

		try {
			await loginWithEmail({
				email: "user@example.com",
				password: "123456",
			});
			expect(notifications).toEqual(["user@example.com"]);
		} finally {
			unsubscribe();
			globalThis.fetch = previousFetch;
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: previousWindow,
			});
		}
	});
});
