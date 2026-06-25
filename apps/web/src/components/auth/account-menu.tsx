"use client";

import { useState } from "react";
import { Coins, KeyRound, Loader2, LogOut, ReceiptText } from "lucide-react";
import {
	clearAuthSession,
	createBillingCheckout,
	getAccountBillingState,
	type AuthAccount,
	type AuthUser,
	type AccountBillingState,
	type BillingCreditPackage,
	type BillingPlan,
	type CreditLedgerEntry,
} from "@/auth/client";
import { useRouter } from "@/platform/router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/ui";
import { toast } from "sonner";

type AccountIdentity = Pick<AuthUser, "email" | "name">;

function takeInitials(value: string): string {
	const parts = value
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
	}
	return (parts[0] ?? value.trim()).slice(0, 2).toUpperCase();
}

export function getAccountInitials(user: AccountIdentity): string {
	const nameInitials = takeInitials(user.name);
	if (nameInitials) return nameInitials;
	const emailLocalPart = user.email.split("@")[0] ?? "";
	return takeInitials(emailLocalPart) || "U";
}

export function formatCreditAmount(value: number | null | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return "未绑定";
	return new Intl.NumberFormat("en-US").format(Math.max(0, Math.trunc(value)));
}

export function formatCreditPackageLabel(value: number): string {
	if (Number.isInteger(value) && value >= 10_000 && value % 10_000 === 0) {
		return `${value / 10_000}万`;
	}
	return formatCreditAmount(value);
}

export function getCreditLedgerStatusLabel(
	status: CreditLedgerEntry["status"],
): string {
	if (status === "applied") return "已入账";
	if (status === "failed") return "失败";
	return "处理中";
}

export function formatLedgerTimestamp(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

export function getRecentCreditLedgerEntries(
	entries: CreditLedgerEntry[],
): CreditLedgerEntry[] {
	return [...entries]
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, 3);
}

export function formatProductPrice(cents: number): string {
	return `¥${(cents / 100).toFixed(2)}`;
}

export function getCreditPackageGrantedCredits(
	product: BillingCreditPackage,
): number {
	return product.credits + product.bonusCredits;
}

function getLatestBalance({
	account,
	billingState,
}: {
	account: AuthAccount;
	billingState: AccountBillingState | null;
}): number | null {
	return (
		billingState?.wallet.availableCredits ?? account.newApiKey?.quota ?? null
	);
}

export function AccountCreditBadge({ account }: { account: AuthAccount }) {
	return (
		<div className="hidden h-9 items-center gap-2 rounded-full border border-border/70 bg-background px-3 text-muted-foreground text-xs sm:flex">
			<Coins className="size-3.5 text-cyan-600 dark:text-cyan-200" />
			<span className="font-medium text-foreground">
				{formatCreditAmount(account.newApiKey?.quota)}
			</span>
			<span>credits</span>
		</div>
	);
}

export function AccountMenu({ account }: { account: AuthAccount }) {
	const router = useRouter();
	const { user } = account;
	const displayName =
		user.name.trim() || user.email.split("@")[0] || user.email;
	const [billingState, setBillingState] = useState<AccountBillingState | null>(
		null,
	);
	const [ledgerState, setLedgerState] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [creatingProductCode, setCreatingProductCode] = useState<string | null>(
		null,
	);
	const latestBalance = getLatestBalance({ account, billingState });
	const ledgerEntries = billingState?.ledgerEntries ?? [];
	const recentEntries = getRecentCreditLedgerEntries(ledgerEntries);
	const creditPackages = billingState?.catalog.creditPackages ?? [];
	const plans = billingState?.catalog.plans ?? [];

	const loadBillingState = async () => {
		if (ledgerState === "loading") return;
		setLedgerState("loading");
		try {
			setBillingState(await getAccountBillingState());
			setLedgerState("ready");
		} catch {
			setLedgerState("error");
		}
	};

	const handleLogout = () => {
		clearAuthSession();
		router.replace("/login");
	};

	const handleCreateCheckout = async (
		product: BillingPlan | BillingCreditPackage,
	) => {
		if (creatingProductCode !== null) return;
		setCreatingProductCode(product.code);
		try {
			const payment = await createBillingCheckout({
				productType: product.type,
				productCode: product.code,
				type: "alipay",
			});
			window.location.assign(payment.checkoutUrl);
		} catch (error) {
			toast.error("充值订单创建失败", {
				description:
					error instanceof Error ? error.message : "请稍后再试或联系管理员",
			});
		} finally {
			setCreatingProductCode(null);
		}
	};

	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (open && ledgerState === "idle") void loadBillingState();
			}}
		>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="size-9 rounded-full border-border/70 bg-background p-0 hover:bg-accent"
					aria-label="账户菜单"
					title="账户菜单"
				>
					<Avatar className="size-8">
						<AvatarFallback className="bg-cyan-500/10 font-medium text-cyan-700 text-xs dark:bg-cyan-300/10 dark:text-cyan-100">
							{getAccountInitials(user)}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[360px]">
				<div className="px-2 py-1.5">
					<p className="truncate font-medium text-sm">{displayName}</p>
					<p className="truncate text-muted-foreground text-xs">{user.email}</p>
				</div>
				<DropdownMenuSeparator />
				<div className="mx-1 rounded-sm border bg-muted/25 p-3">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-muted-foreground text-xs">API 余额</p>
							<p className="mt-1 font-semibold text-lg leading-none">
								{formatCreditAmount(latestBalance)}
							</p>
						</div>
						<Coins className="size-4 text-cyan-600 dark:text-cyan-200" />
					</div>
					<div className="mt-3 flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
						<KeyRound className="size-3.5 shrink-0" />
						<span className="truncate">
							{account.newApiKey
								? `Token ${account.newApiKey.tokenId}`
								: "尚未绑定 New API Key"}
						</span>
					</div>
					{billingState?.subscription.status === "active" ? (
						<div className="mt-3 rounded-sm bg-emerald-500/10 px-2 py-1.5 text-emerald-700 text-xs dark:text-emerald-300">
							{billingState.subscription.planName} · 每月{" "}
							{formatCreditPackageLabel(
								billingState.subscription.includedCredits ?? 0,
							)}{" "}
							积分
						</div>
					) : null}
					<div className="mt-3 grid grid-cols-3 gap-1 text-xs">
						<div>
							<p className="text-muted-foreground">套餐</p>
							<p className="font-medium">
								{formatCreditAmount(
									billingState?.creditBreakdown.subscriptionCredits ?? 0,
								)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground">积分包</p>
							<p className="font-medium">
								{formatCreditAmount(
									billingState?.creditBreakdown.creditPackageCredits ?? 0,
								)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground">手动</p>
							<p className="font-medium">
								{formatCreditAmount(
									billingState?.creditBreakdown.adminCredits ?? 0,
								)}
							</p>
						</div>
					</div>
					<div className="mt-3 space-y-1.5">
						<p className="font-medium text-xs">订阅套餐</p>
						{plans.length === 0 && ledgerState === "loading" ? (
							<div className="h-8 rounded-sm bg-background" />
						) : (
							plans.map((plan) => (
								<button
									key={plan.code}
									type="button"
									disabled={creatingProductCode !== null}
									onClick={() => void handleCreateCheckout(plan)}
									className="flex min-h-10 w-full items-center justify-between gap-3 rounded-sm border border-border/70 bg-background px-2 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
								>
									<span className="min-w-0">
										<span className="block truncate font-medium">
											{plan.name}
										</span>
										<span className="block truncate text-muted-foreground">
											{formatCreditPackageLabel(plan.includedCredits)} 积分
										</span>
									</span>
									<span className="shrink-0 font-semibold">
										{creatingProductCode === plan.code ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : (
											formatProductPrice(plan.priceCents)
										)}
									</span>
								</button>
							))
						)}
					</div>
					<div className="mt-3 space-y-1.5">
						<p className="font-medium text-xs">积分包</p>
						<div className="grid grid-cols-3 gap-1">
							{creditPackages.map((product) => (
								<button
									key={product.code}
									type="button"
									disabled={creatingProductCode !== null}
									onClick={() => void handleCreateCheckout(product)}
									className="flex min-h-12 flex-col items-center justify-center rounded-sm border border-border/70 bg-background px-2 font-medium text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
								>
									{creatingProductCode === product.code ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<>
											<span>
												{formatCreditPackageLabel(
													getCreditPackageGrantedCredits(product),
												)}
											</span>
											<span className="font-normal text-muted-foreground">
												{formatProductPrice(product.priceCents)}
											</span>
										</>
									)}
								</button>
							))}
						</div>
					</div>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="flex items-center gap-2">
					<ReceiptText className="size-3.5" />
					最近流水
				</DropdownMenuLabel>
				<div className="mx-1 min-h-12 rounded-sm bg-muted/20 p-2">
					{ledgerState === "loading" ? (
						<div className="flex h-12 items-center justify-center text-muted-foreground text-xs">
							<Loader2 className="mr-2 size-3.5 animate-spin" />
							读取中
						</div>
					) : ledgerState === "error" ? (
						<div className="flex h-12 items-center justify-center text-muted-foreground text-xs">
							暂时无法读取流水
						</div>
					) : recentEntries.length === 0 ? (
						<div className="flex h-12 items-center justify-center text-muted-foreground text-xs">
							暂无充值流水
						</div>
					) : (
						<div className="space-y-1">
							{recentEntries.map((entry) => (
								<div
									key={entry.id}
									className="flex items-center justify-between gap-3 rounded-sm px-1.5 py-1 text-xs"
								>
									<div className="min-w-0">
										<p className="truncate text-foreground">
											+{formatCreditAmount(entry.amount)}
										</p>
										<p className="truncate text-muted-foreground">
											{formatLedgerTimestamp(entry.createdAt)}
										</p>
									</div>
									<span
										className={cn(
											"shrink-0 rounded-full px-2 py-0.5 font-medium",
											entry.status === "applied" &&
												"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
											entry.status === "pending" &&
												"bg-amber-500/10 text-amber-700 dark:text-amber-300",
											entry.status === "failed" &&
												"bg-destructive/10 text-destructive",
										)}
									>
										{getCreditLedgerStatusLabel(entry.status)}
									</span>
								</div>
							))}
						</div>
					)}
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					icon={<LogOut />}
					onSelect={handleLogout}
				>
					退出登录
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
