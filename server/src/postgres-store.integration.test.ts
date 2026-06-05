import { describe, expect, test } from "bun:test";
import postgres from "postgres";
import { createAuthService } from "./auth";
import { createBillingService } from "./billing";
import type { NewApiGateway } from "./new-api";
import { PostgresShotlyxStore, type QueryableSql } from "./postgres-store";

const databaseUrl = process.env.SHOTLYX_TEST_DATABASE_URL;
const testWithDatabase = databaseUrl ? test : test.skip;

function createFakeNewApi(): NewApiGateway & {
	quotaUpdates: Array<{ userId: string; tokenId: string; quota: number }>;
} {
	return {
		quotaUpdates: [],
		async createUserKey({ email, initialQuota }) {
			return {
				userId: `newapi:${email}`,
				tokenId: "123",
				key: `sk-live-postgres-${Date.now()}`,
				quota: initialQuota,
			};
		},
		async updateTokenQuota(input) {
			this.quotaUpdates.push(input);
			return { quota: input.quota };
		},
	};
}

function createTestStore(): PostgresShotlyxStore {
	return new PostgresShotlyxStore({
		sql: postgres(databaseUrl as string, {
			onnotice: () => {},
		}) as QueryableSql,
	});
}

describe("PostgresShotlyxStore integration", () => {
	testWithDatabase(
		"persists auth, New API bindings, and idempotent credit ledger entries",
		async () => {
			const store = createTestStore();
			const reader = createTestStore();
			const newApi = createFakeNewApi();
			const email = `postgres-${crypto.randomUUID()}@example.com`;
			const idempotencyKey = `postgres:test:${crypto.randomUUID()}`;

			try {
				const auth = createAuthService({
					store,
					newApi,
					initialQuota: 1_000,
					now: () => new Date("2026-06-05T08:00:00.000Z"),
				});
				const billing = createBillingService({
					store,
					newApi,
					now: () => new Date("2026-06-05T09:00:00.000Z"),
				});

				const registered = await auth.register({
					email,
					password: "123456",
					name: "Postgres User",
				});
				const firstTopUp = await billing.topUpUserCredits({
					userId: registered.user.id,
					amount: 2_000,
					idempotencyKey,
				});
				const duplicateTopUp = await billing.topUpUserCredits({
					userId: registered.user.id,
					amount: 2_000,
					idempotencyKey,
				});

				const persistedUser = await reader.findUserByEmail(email);
				expect(persistedUser?.id).toBe(registered.user.id);
				expect(
					await reader.findNewApiKeyByShotlyxUserId(registered.user.id),
				).toMatchObject({
					userId: `newapi:${email}`,
					tokenId: "123",
					quota: 3_000,
				});
				expect(
					await reader.listCreditLedgerEntriesByUserId(registered.user.id),
				).toMatchObject([
					{
						id: firstTopUp.entry.id,
						status: "applied",
						amount: 2_000,
						balanceBefore: 1_000,
						balanceAfter: 3_000,
					},
				]);
				expect(duplicateTopUp.entry.id).toBe(firstTopUp.entry.id);
				expect(newApi.quotaUpdates).toEqual([
					{
						userId: `newapi:${email}`,
						tokenId: "123",
						quota: 3_000,
					},
				]);
			} finally {
				await store.close();
				await reader.close();
			}
		},
	);
});
