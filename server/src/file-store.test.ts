import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { createAuthService } from "./auth";
import { FileShotlyxStore } from "./file-store";

describe("FileShotlyxStore", () => {
	test("persists registered users and sessions across store instances", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "shotlyx-file-store-"));
		const filePath = path.join(dir, "server-store.json");
		const newApi = {
			async createUserKey({
				email,
				initialQuota,
			}: {
				email: string;
				name: string;
				initialQuota: number;
			}) {
				return {
					userId: `local:${email}`,
					tokenId: `local-token:${email}`,
					key: "sk-local-test",
					quota: initialQuota,
				};
			},
			async updateTokenQuota({ quota }: { tokenId: string; quota: number }) {
				return { quota };
			},
		};

		try {
			const firstAuth = createAuthService({
				store: new FileShotlyxStore(filePath),
				newApi,
				initialQuota: 1234,
			});
			const registered = await firstAuth.register({
				email: "desktop@example.com",
				password: "123456",
				name: "Desktop User",
			});

			const secondAuth = createAuthService({
				store: new FileShotlyxStore(filePath),
				newApi,
				initialQuota: 1234,
			});
			const sessionAccount = await secondAuth.getSessionAccount(
				registered.session.token,
			);
			const login = await secondAuth.login({
				email: "desktop@example.com",
				password: "123456",
			});

			expect(sessionAccount?.user.email).toBe("desktop@example.com");
			expect(login.newApiKey?.key).toBe("sk-local-test");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
