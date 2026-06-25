import { describe, expect, test } from "bun:test";
import {
	clearAuthSession,
	createBillingCheckout,
	createCreditTopUpPayment,
	getAccountBillingState,
	getObjectStorageConfigStatus,
	getCreditLedgerEntries,
	loginWithEmail,
	mapAuthErrorMessage,
	subscribeAuthSessionChanges,
} from "./client";

describe("auth client errors", () => {
	test("keeps auth requests relative when a desktop API origin is configured", async () => {
		const storage = new Map<string, string>();
		const previousWindow = globalThis.window;
		const previousFetch = globalThis.fetch;
		const previousApiOrigin = process.env.VITE_SHOTLYX_API_ORIGIN;
		const previousServerUrl = process.env.VITE_SHOTLYX_SERVER_URL;
		process.env.VITE_SHOTLYX_API_ORIGIN = "app://shotlyx";
		process.env.VITE_SHOTLYX_SERVER_URL = "http://127.0.0.1:8787";
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
		const requests: string[] = [];
		globalThis.fetch = async (input) => {
			requests.push(String(input));
			return new Response(
				JSON.stringify({
					user: { id: "user-1", email: "user@example.com", name: "User" },
					session: {
						token: "shotlyx_session_desktop",
						userId: "user-1",
						createdAt: "2026-06-20T00:00:00.000Z",
						expiresAt: "2026-07-20T00:00:00.000Z",
					},
					newApiKey: null,
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		};

		try {
			await loginWithEmail({
				email: "user@example.com",
				password: "123456",
			});

			expect(requests).toEqual(["/api/auth/login"]);
		} finally {
			clearAuthSession();
			if (previousApiOrigin === undefined) {
				delete process.env.VITE_SHOTLYX_API_ORIGIN;
			} else {
				process.env.VITE_SHOTLYX_API_ORIGIN = previousApiOrigin;
			}
			if (previousServerUrl === undefined) {
				delete process.env.VITE_SHOTLYX_SERVER_URL;
			} else {
				process.env.VITE_SHOTLYX_SERVER_URL = previousServerUrl;
			}
			globalThis.fetch = previousFetch;
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: previousWindow,
			});
		}
	});

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

	test("loads credit ledger entries with the stored bearer session", async () => {
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
		storage.set(
			"shotlyx.auth.session.v1",
			JSON.stringify({
				token: "shotlyx_session_ledger",
				expiresAt: "2026-07-05T00:00:00.000Z",
			}),
		);
		const requests: Array<{ url: string; authorization: string | null }> = [];
		globalThis.fetch = async (input, init) => {
			const headers = new Headers(init?.headers);
			requests.push({
				url: String(input),
				authorization: headers.get("authorization"),
			});
			return new Response(
				JSON.stringify({
					entries: [
						{
							id: "credit-1",
							userId: "user-1",
							idempotencyKey: "manual:1",
							type: "top_up",
							amount: 2500,
							balanceBefore: 1000,
							balanceAfter: 3500,
							status: "applied",
							createdAt: "2026-06-05T09:00:00.000Z",
							updatedAt: "2026-06-05T09:00:00.000Z",
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		};

		try {
			const entries = await getCreditLedgerEntries();

			expect(entries).toHaveLength(1);
			expect(entries[0]?.balanceAfter).toBe(3500);
			expect(requests).toEqual([
				{
					url: "/api/account/credits/ledger",
					authorization: "Bearer shotlyx_session_ledger",
				},
			]);
		} finally {
			globalThis.fetch = previousFetch;
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: previousWindow,
			});
		}
	});

	test("creates a credit top-up payment with the stored bearer session", async () => {
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
		storage.set(
			"shotlyx.auth.session.v1",
			JSON.stringify({
				token: "shotlyx_session_payment",
				expiresAt: "2026-07-05T00:00:00.000Z",
			}),
		);
		const requests: Array<{
			url: string;
			authorization: string | null;
			body: unknown;
		}> = [];
		globalThis.fetch = async (input, init) => {
			const headers = new Headers(init?.headers);
			requests.push({
				url: String(input),
				authorization: headers.get("authorization"),
				body: JSON.parse(String(init?.body ?? "{}")),
			});
			return new Response(
				JSON.stringify({
					order: {
						id: "pay-1",
						outTradeNo: "sx_order",
						credits: 100_000,
						money: "10.00",
						type: "alipay",
						status: "pending",
					},
					checkoutUrl: "/api/account/credits/payments/sx_order/checkout",
				}),
				{ status: 201, headers: { "content-type": "application/json" } },
			);
		};

		try {
			const payment = await createCreditTopUpPayment({
				credits: 100_000,
				type: "alipay",
			});

			expect(payment.checkoutUrl).toContain("/sx_order/checkout");
			expect(requests).toEqual([
				{
					url: "/api/account/credits/payments",
					authorization: "Bearer shotlyx_session_payment",
					body: { credits: 100_000, type: "alipay" },
				},
			]);
		} finally {
			globalThis.fetch = previousFetch;
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: previousWindow,
			});
		}
	});

	test("loads billing state, creates product checkout, and reads storage config", async () => {
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
		storage.set(
			"shotlyx.auth.session.v1",
			JSON.stringify({
				token: "shotlyx_session_billing",
				expiresAt: "2026-07-05T00:00:00.000Z",
			}),
		);
		const requests: Array<{
			url: string;
			authorization: string | null;
			body?: unknown;
		}> = [];
		globalThis.fetch = async (input, init) => {
			const headers = new Headers(init?.headers);
			const url = String(input);
			requests.push({
				url,
				authorization: headers.get("authorization"),
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
			});
			if (url === "/api/account/billing-state") {
				return new Response(
					JSON.stringify({
						user: { id: "user-1", email: "buyer@example.com", name: "Buyer" },
						wallet: { availableCredits: 3_000, heldCredits: 0 },
						creditBreakdown: {
							subscriptionCredits: 0,
							creditPackageCredits: 3_000,
							adminCredits: 0,
							promoCredits: 0,
							refundAdjustmentCredits: 0,
							totalActiveCredits: 3_000,
						},
						subscription: { status: "none" },
						catalog: { plans: [], creditPackages: [] },
						usagePricingRules: [],
						newApiKey: null,
						ledgerEntries: [],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url === "/api/account/storage/config") {
				return new Response(
					JSON.stringify({
						storage: {
							driver: "local",
							configured: true,
							productionReady: true,
							keyPrefix: "shotlyx",
							missing: [],
							maxUploadSizeMb: 512,
							localPreviewRecommended: true,
						},
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return new Response(
				JSON.stringify({
					order: {
						id: "pay-1",
						outTradeNo: "sx_catalog_order",
						credits: 3_000,
						money: "30.00",
						type: "alipay",
						status: "pending",
						product: {
							type: "credit_package",
							code: "points_3000",
							name: "3000 点数包",
						},
					},
					checkoutUrl:
						"/api/account/credits/payments/sx_catalog_order/checkout",
				}),
				{ status: 201, headers: { "content-type": "application/json" } },
			);
		};

		try {
			const billingState = await getAccountBillingState();
			const storageConfig = await getObjectStorageConfigStatus();
			const checkout = await createBillingCheckout({
				productType: "credit_package",
				productCode: "points_3000",
				type: "alipay",
			});

			expect(billingState.wallet.availableCredits).toBe(3_000);
			expect(storageConfig.driver).toBe("local");
			expect(checkout.order.product?.code).toBe("points_3000");
			expect(requests).toEqual([
				{
					url: "/api/account/billing-state",
					authorization: "Bearer shotlyx_session_billing",
					body: undefined,
				},
				{
					url: "/api/account/storage/config",
					authorization: "Bearer shotlyx_session_billing",
					body: undefined,
				},
				{
					url: "/api/account/billing/checkout",
					authorization: "Bearer shotlyx_session_billing",
					body: {
						productType: "credit_package",
						productCode: "points_3000",
						type: "alipay",
					},
				},
			]);
		} finally {
			globalThis.fetch = previousFetch;
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: previousWindow,
			});
		}
	});
});
