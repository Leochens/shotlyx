import { randomUUID } from "node:crypto";
import type { NewApiGateway } from "./new-api";
import type {
	CreditLedgerEntry,
	NewApiKeyBinding,
	ShotlyxLogEntry,
	ShotlyxStore,
	ShotlyxUser,
} from "./types";

type BillingServiceConfig = {
	store: ShotlyxStore;
	newApi: NewApiGateway;
	now?: () => Date;
};

export type TopUpUserCreditsInput = {
	userId?: string;
	email?: string;
	amount: number;
	idempotencyKey: string;
	externalPaymentId?: string;
	note?: string;
	meta?: Record<string, unknown>;
};

export type TopUpUserCreditsResult = {
	entry: CreditLedgerEntry;
	newApiKey: NewApiKeyBinding;
};

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function assertValidTopUpInput(input: TopUpUserCreditsInput): void {
	if (!input.userId?.trim() && !input.email?.trim()) {
		throw new Error("user_identifier_required");
	}
	if (!Number.isInteger(input.amount) || input.amount <= 0) {
		throw new Error("invalid_credit_amount");
	}
	if (!input.idempotencyKey.trim()) {
		throw new Error("idempotency_key_required");
	}
}

function createLedgerEntry({
	input,
	user,
	binding,
	now,
}: {
	input: TopUpUserCreditsInput;
	user: ShotlyxUser;
	binding: NewApiKeyBinding;
	now: Date;
}): CreditLedgerEntry {
	const timestamp = now.toISOString();
	const balanceAfter = binding.quota + input.amount;
	return {
		id: `credit_${randomUUID()}`,
		userId: user.id,
		idempotencyKey: input.idempotencyKey.trim(),
		type: "top_up",
		amount: input.amount,
		balanceBefore: binding.quota,
		balanceAfter,
		status: "pending",
		createdAt: timestamp,
		updatedAt: timestamp,
		externalPaymentId: input.externalPaymentId?.trim() || undefined,
		note: input.note?.trim() || undefined,
		meta: input.meta,
	};
}

function createLog({
	type,
	userId,
	message,
	now,
	meta,
}: {
	type: string;
	userId: string;
	message: string;
	now: Date;
	meta?: Record<string, unknown>;
}): ShotlyxLogEntry {
	return {
		id: `log_${randomUUID()}`,
		type,
		userId,
		message,
		createdAt: now.toISOString(),
		meta,
	};
}

export function createBillingService({
	store,
	newApi,
	now = () => new Date(),
}: BillingServiceConfig) {
	async function findTargetUser({
		userId,
		email,
	}: Pick<TopUpUserCreditsInput, "userId" | "email">) {
		if (userId?.trim()) return store.findUserById(userId.trim());
		if (email?.trim()) return store.findUserByEmail(normalizeEmail(email));
		return null;
	}

	return {
		async topUpUserCredits(
			input: TopUpUserCreditsInput,
		): Promise<TopUpUserCreditsResult> {
			assertValidTopUpInput(input);

			const user = await findTargetUser(input);
			if (!user) throw new Error("user_not_found");

			const binding = await store.findNewApiKeyByShotlyxUserId(user.id);
			if (!binding) throw new Error("newapi_key_not_bound");

			const pendingEntry = createLedgerEntry({
				input,
				user,
				binding,
				now: now(),
			});
			const { entry, inserted } =
				await store.insertCreditLedgerEntryIfAbsent(pendingEntry);
			if (!inserted) {
				return {
					entry,
					newApiKey:
						(await store.findNewApiKeyByShotlyxUserId(user.id)) ?? binding,
				};
			}

			try {
				const quotaUpdate = await newApi.updateTokenQuota({
					userId: binding.userId,
					tokenId: binding.tokenId,
					quota: pendingEntry.balanceAfter,
				});
				const updatedBinding = {
					...binding,
					quota: quotaUpdate.quota,
				};
				await store.saveNewApiKeyBinding({
					shotlyxUserId: user.id,
					binding: updatedBinding,
				});

				const appliedEntry = await store.updateCreditLedgerEntry({
					...entry,
					status: "applied",
					balanceAfter: quotaUpdate.quota,
					updatedAt: now().toISOString(),
				});
				await store.addLog(
					createLog({
						type: "credits.top_up.applied",
						userId: user.id,
						message: `Applied ${input.amount} credits to ${user.email}`,
						now: now(),
						meta: {
							ledgerEntryId: appliedEntry.id,
							idempotencyKey: appliedEntry.idempotencyKey,
							balanceAfter: appliedEntry.balanceAfter,
						},
					}),
				);

				return { entry: appliedEntry, newApiKey: updatedBinding };
			} catch (error) {
				await store.updateCreditLedgerEntry({
					...entry,
					status: "failed",
					updatedAt: now().toISOString(),
					meta: {
						...entry.meta,
						error: error instanceof Error ? error.message : "unknown_error",
					},
				});
				await store.addLog(
					createLog({
						type: "credits.top_up.failed",
						userId: user.id,
						message: `Failed to apply ${input.amount} credits to ${user.email}`,
						now: now(),
						meta: {
							ledgerEntryId: entry.id,
							idempotencyKey: entry.idempotencyKey,
							error: error instanceof Error ? error.message : "unknown_error",
						},
					}),
				);
				throw error;
			}
		},
	};
}
