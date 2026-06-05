import { describe, expect, test } from "bun:test";
import { createAuthService } from "./auth";
import { InMemoryShotlyxStore } from "./store";
import type { NewApiGateway } from "./new-api";

function createFakeNewApi(): NewApiGateway & {
	created: Array<{ email: string; name: string; initialQuota: number }>;
} {
	return {
		created: [],
		async createUserKey({ email, name, initialQuota }) {
			this.created.push({ email, name, initialQuota });
			return {
				userId: `newapi-user-${this.created.length}`,
				tokenId: `token-${this.created.length}`,
				key: `sk-shotlyx-${this.created.length}`,
				quota: initialQuota,
			};
		},
		async updateTokenQuota({ quota }) {
			return { quota };
		},
	};
}

describe("Shotlyx auth service", () => {
	test("registers an email user and provisions a New API key with initial quota", async () => {
		const store = new InMemoryShotlyxStore();
		const newApi = createFakeNewApi();
		const auth = createAuthService({
			store,
			newApi,
			initialQuota: 120_000,
			now: () => new Date("2026-06-05T08:00:00.000Z"),
		});

		const result = await auth.register({
			email: "  Leo@Example.COM ",
			password: "correct horse battery staple",
			name: "Leo",
		});

		expect(result.user.email).toBe("leo@example.com");
		expect(result.session.token).toStartWith("shotlyx_session_");
		expect(result.newApiKey).toEqual({
			userId: "newapi-user-1",
			tokenId: "token-1",
			key: "sk-shotlyx-1",
			quota: 120_000,
		});
		expect(newApi.created).toEqual([
			{ email: "leo@example.com", name: "Leo", initialQuota: 120_000 },
		]);
		expect((await store.listLogs()).map((log) => log.type)).toEqual([
			"user.registered",
			"newapi.key.provisioned",
		]);
	});

	test("logs in with email and password and exposes the current session user", async () => {
		const store = new InMemoryShotlyxStore();
		const auth = createAuthService({
			store,
			newApi: createFakeNewApi(),
			initialQuota: 1_000,
		});

		await auth.register({
			email: "user@example.com",
			password: "password-1234",
			name: "User",
		});

		const login = await auth.login({
			email: "USER@example.com",
			password: "password-1234",
		});
		const sessionUser = await auth.getSessionUser(login.session.token);

		expect(sessionUser?.email).toBe("user@example.com");
		expect(login.newApiKey?.key).toBe("sk-shotlyx-1");
	});

	test("accepts a six character password", async () => {
		const auth = createAuthService({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 1_000,
		});

		const result = await auth.register({
			email: "six@example.com",
			password: "123456",
			name: "Six",
		});

		expect(result.user.email).toBe("six@example.com");
	});

	test("rejects duplicate registration and invalid passwords", async () => {
		const auth = createAuthService({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 1_000,
		});

		await auth.register({
			email: "dupe@example.com",
			password: "password-1234",
			name: "First",
		});

		await expect(
			auth.register({
				email: "DUPE@example.com",
				password: "password-1234",
				name: "Second",
			}),
		).rejects.toThrow("email_already_registered");

		await expect(
			auth.login({
				email: "dupe@example.com",
				password: "wrong-password",
			}),
		).rejects.toThrow("invalid_email_or_password");
	});
});
