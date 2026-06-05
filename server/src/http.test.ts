import { describe, expect, test } from "bun:test";
import { createServerApp } from "./http";
import type { NewApiGateway } from "./new-api";
import { InMemoryShotlyxStore } from "./store";

function createFakeNewApi(): NewApiGateway & { createdCount: number } {
	return {
		createdCount: 0,
		async createUserKey({ email, initialQuota }) {
			this.createdCount += 1;
			return {
				userId: `newapi:${email}`,
				tokenId: `token:${this.createdCount}`,
				key: `sk-from-new-api-${this.createdCount}`,
				quota: initialQuota,
			};
		},
	};
}

describe("Shotlyx server HTTP app", () => {
	test("reports health and the configured store mode", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
			storeMode: "memory",
		});

		const response = await app.fetch(
			new Request("http://shotlyx.test/api/health"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			store: "memory",
		});
	});

	test("supports register, login, current account, and admin pages", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
		});

		const registerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/auth/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "maker@example.com",
					password: "123456",
					name: "Maker",
				}),
			}),
		);
		expect(registerResponse.status).toBe(201);
		const registered = await registerResponse.json();
		expect(registered.user.email).toBe("maker@example.com");
		expect(registered.newApiKey.key).toBe("sk-from-new-api-1");

		const loginResponse = await app.fetch(
			new Request("http://shotlyx.test/api/auth/login", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "maker@example.com",
					password: "123456",
				}),
			}),
		);
		expect(loginResponse.status).toBe(200);
		const login = await loginResponse.json();

		const meResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/me", {
				headers: { authorization: `Bearer ${login.session.token}` },
			}),
		);
		expect(meResponse.status).toBe(200);
		const me = await meResponse.json();
		expect(me.user.email).toBe("maker@example.com");
		expect(me.newApiKey.quota).toBe(500);
		expect(me.newApiKey.key).toBe("sk-fro...pi-1");

		const adminResponse = await app.fetch(
			new Request("http://shotlyx.test/admin"),
		);
		expect(adminResponse.status).toBe(200);
		const html = await adminResponse.text();
		expect(html).toContain("用户管理");
		expect(html).toContain("日志管理");
		expect(html).toContain("API Key 设置");
		expect(html).toContain("回调管理");
	});

	test("lets an authenticated user reveal and rotate their New API key", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
		});
		const registerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/auth/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "key-owner@example.com",
					password: "password-1234",
					name: "Key Owner",
				}),
			}),
		);
		const registered = await registerResponse.json();
		const authorization = `Bearer ${registered.session.token}`;

		const revealResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/api-key", {
				headers: { authorization },
			}),
		);
		expect(revealResponse.status).toBe(200);
		expect(await revealResponse.json()).toEqual({
			newApiKey: {
				userId: "newapi:key-owner@example.com",
				tokenId: "token:1",
				key: "sk-from-new-api-1",
				quota: 500,
			},
		});

		const rotateResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/api-key/rotate", {
				method: "POST",
				headers: { authorization },
			}),
		);
		expect(rotateResponse.status).toBe(200);
		expect(await rotateResponse.json()).toEqual({
			newApiKey: {
				userId: "newapi:key-owner@example.com",
				tokenId: "token:2",
				key: "sk-from-new-api-2",
				quota: 500,
			},
		});
	});

	test("requires a valid bearer token for account APIs", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
		});

		const response = await app.fetch(
			new Request("http://shotlyx.test/api/account/me"),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "unauthorized" });
	});
});
