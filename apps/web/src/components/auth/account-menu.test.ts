import { describe, expect, test } from "bun:test";
import {
	formatCreditAmount,
	formatCreditPackageLabel,
	formatLedgerTimestamp,
	getAccountInitials,
	getCreditLedgerStatusLabel,
	getRecentCreditLedgerEntries,
} from "./account-menu";

describe("account menu", () => {
	test("uses the first letters from a display name", () => {
		expect(
			getAccountInitials({
				name: "Zhang Long",
				email: "zhl@example.com",
			}),
		).toBe("ZL");
	});

	test("falls back to the email local part", () => {
		expect(
			getAccountInitials({
				name: "",
				email: "zhl@example.com",
			}),
		).toBe("ZH");
	});

	test("formats credit balances for compact account surfaces", () => {
		expect(formatCreditAmount(null)).toBe("未绑定");
		expect(formatCreditAmount(1000)).toBe("1,000");
		expect(formatCreditAmount(1250000)).toBe("1,250,000");
	});

	test("formats top-up packages for compact buttons", () => {
		expect(formatCreditPackageLabel(100_000)).toBe("10万");
		expect(formatCreditPackageLabel(1_000_000)).toBe("100万");
		expect(formatCreditPackageLabel(12_500)).toBe("12,500");
	});

	test("labels ledger statuses in Chinese", () => {
		expect(getCreditLedgerStatusLabel("applied")).toBe("已入账");
		expect(getCreditLedgerStatusLabel("pending")).toBe("处理中");
		expect(getCreditLedgerStatusLabel("failed")).toBe("失败");
	});

	test("formats ledger timestamps compactly for dropdown rows", () => {
		expect(formatLedgerTimestamp("2026-06-05T16:07:34.000Z")).toContain(
			"06/05",
		);
		expect(formatLedgerTimestamp("not-a-date")).toBe("");
	});

	test("shows the latest ledger entries first", () => {
		expect(
			getRecentCreditLedgerEntries([
				{
					id: "old",
					userId: "user-1",
					idempotencyKey: "manual:old",
					type: "top_up",
					amount: 100,
					balanceBefore: 0,
					balanceAfter: 100,
					status: "applied",
					createdAt: "2026-06-05T08:00:00.000Z",
					updatedAt: "2026-06-05T08:00:00.000Z",
				},
				{
					id: "new",
					userId: "user-1",
					idempotencyKey: "manual:new",
					type: "top_up",
					amount: 200,
					balanceBefore: 100,
					balanceAfter: 300,
					status: "applied",
					createdAt: "2026-06-05T09:00:00.000Z",
					updatedAt: "2026-06-05T09:00:00.000Z",
				},
			]).map((entry) => entry.id),
		).toEqual(["new", "old"]);
	});
});
