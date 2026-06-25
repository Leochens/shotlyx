import {
	getBillingCatalog,
	getUsagePricingRules,
	type BillingPlan,
} from "./product-catalog";
import type { AuthResult } from "./auth";
import type {
	CreditLedgerEntry,
	NewApiKeyBinding,
	ShotlyxStore,
} from "./types";

export type CreditBreakdown = {
	subscriptionCredits: number;
	creditPackageCredits: number;
	adminCredits: number;
	promoCredits: number;
	refundAdjustmentCredits: number;
	totalActiveCredits: number;
};

export type AccountSubscriptionState = {
	status: "none" | "active";
	planCode?: string;
	planName?: string;
	includedCredits?: number;
	latestGrantedAt?: string;
};

function isApplied(entry: CreditLedgerEntry): boolean {
	return entry.status === "applied";
}

function getProductType(entry: CreditLedgerEntry): string {
	const value = entry.meta?.productType;
	return typeof value === "string" ? value : "";
}

function getPlanCode(entry: CreditLedgerEntry): string {
	const value = entry.meta?.productCode;
	return typeof value === "string" ? value : "";
}

function buildCreditBreakdown({
	entries,
	total,
}: {
	entries: CreditLedgerEntry[];
	total: number;
}): CreditBreakdown {
	const applied = entries.filter(isApplied);
	const subscriptionCredits = applied
		.filter((entry) => getProductType(entry) === "plan")
		.reduce((sum, entry) => sum + entry.amount, 0);
	const creditPackageCredits = applied
		.filter((entry) => getProductType(entry) === "credit_package")
		.reduce((sum, entry) => sum + entry.amount, 0);
	const knownCredits = subscriptionCredits + creditPackageCredits;
	return {
		subscriptionCredits,
		creditPackageCredits,
		adminCredits: Math.max(0, total - knownCredits),
		promoCredits: 0,
		refundAdjustmentCredits: 0,
		totalActiveCredits: total,
	};
}

function findPlan(code: string): BillingPlan | null {
	return getBillingCatalog().plans.find((plan) => plan.code === code) ?? null;
}

function buildSubscriptionState(
	entries: CreditLedgerEntry[],
): AccountSubscriptionState {
	const latestPlanEntry = entries
		.filter((entry) => isApplied(entry) && getProductType(entry) === "plan")
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
	if (!latestPlanEntry) return { status: "none" };
	const plan = findPlan(getPlanCode(latestPlanEntry));
	return {
		status: "active",
		planCode: plan?.code ?? getPlanCode(latestPlanEntry),
		planName: plan?.name ?? "已购套餐",
		includedCredits: plan?.includedCredits ?? latestPlanEntry.amount,
		latestGrantedAt: latestPlanEntry.createdAt,
	};
}

export async function buildAccountBillingState({
	store,
	account,
}: {
	store: ShotlyxStore;
	account: AuthResult;
}) {
	const ledgerEntries = await store.listCreditLedgerEntriesByUserId(
		account.user.id,
	);
	const totalActiveCredits = account.newApiKey?.quota ?? 0;
	return {
		user: account.user,
		wallet: {
			availableCredits: totalActiveCredits,
			heldCredits: 0,
		},
		creditBreakdown: buildCreditBreakdown({
			entries: ledgerEntries,
			total: totalActiveCredits,
		}),
		subscription: buildSubscriptionState(ledgerEntries),
		catalog: getBillingCatalog(),
		usagePricingRules: getUsagePricingRules(),
		newApiKey: toPublicNewApiKey(account.newApiKey),
		ledgerEntries,
	};
}

export function toPublicNewApiKey(binding: NewApiKeyBinding | null) {
	if (!binding) return null;
	return {
		userId: binding.userId,
		tokenId: binding.tokenId,
		quota: binding.quota,
	};
}
