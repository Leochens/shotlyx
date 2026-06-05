import { describe, expect, test } from "bun:test";
import { createAuthService } from "./auth";
import { createBillingService } from "./billing";
import type { NewApiGateway } from "./new-api";
import { InMemoryShotlyxStore } from "./store";

function createFakeNewApi(): NewApiGateway & {
	createdCount: number;
	quotaUpdates: Array<{ userId: string; tokenId: string; quota: number }>;
} {
	return {
		createdCount: 0,
		quotaUpdates: [],
		async createUserKey({ email, initialQuota }) {
			this.createdCount += 1;
			return {
				userId: `newapi:${email}`,
				tokenId: `token:${this.createdCount}`,
				key: `sk-from-new-api-${this.createdCount}`,
				quota: initialQuota,
			};
		},
		async updateTokenQuota(input) {
			this.quotaUpdates.push(input);
			return { quota: input.quota };
		},
	};
}

describe("Shotlyx billing service", () => {
	test("tops up credits once per idempotency key and syncs New API quota", async () => {
		const store = new InMemoryShotlyxStore();
		const newApi = createFakeNewApi();
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
			email: "payer@example.com",
			password: "123456",
			name: "Payer",
		});

		const first = await billing.topUpUserCredits({
			email: "payer@example.com",
			amount: 2_500,
			idempotencyKey: "stripe:event:evt_1",
			externalPaymentId: "pi_1",
			note: "Stripe payment",
		});
		const duplicate = await billing.topUpUserCredits({
			userId: registered.user.id,
			amount: 2_500,
			idempotencyKey: "stripe:event:evt_1",
			externalPaymentId: "pi_1",
			note: "Stripe retry",
		});

		expect(first.entry.status).toBe("applied");
		expect(first.entry.balanceBefore).toBe(1_000);
		expect(first.entry.balanceAfter).toBe(3_500);
		expect(first.newApiKey.quota).toBe(3_500);
		expect(duplicate.entry.id).toBe(first.entry.id);
		expect(newApi.quotaUpdates).toEqual([
			{
				userId: "newapi:payer@example.com",
				tokenId: "token:1",
				quota: 3_500,
			},
		]);
		expect(await store.findNewApiKeyByShotlyxUserId(registered.user.id)).toEqual({
			userId: "newapi:payer@example.com",
			tokenId: "token:1",
			key: "sk-from-new-api-1",
			quota: 3_500,
		});
		expect(
			(await store.listCreditLedgerEntriesByUserId(registered.user.id)).map(
				(entry) => entry.id,
			),
		).toEqual([first.entry.id]);
	});
});
