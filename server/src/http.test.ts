import { describe, expect, test } from "bun:test";
import { createServerApp } from "./http";
import type { NewApiGateway } from "./new-api";
import { InMemoryShotlyxStore } from "./store";
import { signZpayParams } from "./zpay";

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
		async updateTokenQuota({ quota }) {
			return { quota };
		},
	};
}

describe("Shotlyx server HTTP app", () => {
	test("requires an admin token in production", () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			expect(() =>
				createServerApp({
					store: new InMemoryShotlyxStore(),
					newApi: createFakeNewApi(),
					adminToken: "",
				}),
			).toThrow("SHOTLYX_ADMIN_TOKEN is required");
		} finally {
			if (previousNodeEnv === undefined) {
				delete process.env.NODE_ENV;
			} else {
				process.env.NODE_ENV = previousNodeEnv;
			}
		}
	});

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

	test("lets admins top up user credits and users list their credit ledger", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
			adminToken: "admin-secret",
		});
		const registerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/auth/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "billing@example.com",
					password: "123456",
					name: "Billing",
				}),
			}),
		);
		const registered = await registerResponse.json();
		const authorization = `Bearer ${registered.session.token}`;

		const topUpResponse = await app.fetch(
			new Request("http://shotlyx.test/api/admin/credits/top-up", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-shotlyx-admin-token": "admin-secret",
				},
				body: JSON.stringify({
					email: "billing@example.com",
					amount: 1_250,
					idempotencyKey: "manual:topup:1",
					note: "Manual recharge",
				}),
			}),
		);

		expect(topUpResponse.status).toBe(200);
		const topUp = await topUpResponse.json();
		expect(topUp.entry.status).toBe("applied");
		expect(topUp.entry.balanceAfter).toBe(1_750);
		expect(topUp.newApiKey.quota).toBe(1_750);

		const meResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/me", {
				headers: { authorization },
			}),
		);
		const me = await meResponse.json();
		expect(me.newApiKey.quota).toBe(1_750);

		const ledgerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/credits/ledger", {
				headers: { authorization },
			}),
		);
		expect(ledgerResponse.status).toBe(200);
		const ledger = await ledgerResponse.json();
		expect(ledger.entries).toHaveLength(1);
		expect(ledger.entries[0].idempotencyKey).toBe("manual:topup:1");
	});

	test("serves a browser admin login and manual top-up form", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
			adminToken: "admin-secret",
		});
		const registerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/auth/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "admin-topup@example.com",
					password: "123456",
					name: "Admin Topup",
				}),
			}),
		);
		const registered = await registerResponse.json();

		const anonymousAdminResponse = await app.fetch(
			new Request("http://shotlyx.test/admin"),
		);
		expect(anonymousAdminResponse.status).toBe(200);
		expect(await anonymousAdminResponse.text()).toContain("管理员登录");

		const loginResponse = await app.fetch(
			new Request("http://shotlyx.test/admin/login", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ token: "admin-secret" }),
			}),
		);
		expect(loginResponse.status).toBe(303);
		const cookie = loginResponse.headers.get("set-cookie") ?? "";
		expect(cookie).toContain("shotlyx_admin_token=admin-secret");

		const authedAdminResponse = await app.fetch(
			new Request("http://shotlyx.test/admin", {
				headers: { cookie },
			}),
		);
		const adminHtml = await authedAdminResponse.text();
		expect(adminHtml).toContain("手动充值");
		expect(adminHtml).toContain("admin-topup@example.com");

		const topUpResponse = await app.fetch(
			new Request("http://shotlyx.test/admin/credits/top-up", {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					cookie,
				},
				body: new URLSearchParams({
					email: "admin-topup@example.com",
					amount: "2250",
					note: "Manual admin top-up",
				}),
			}),
		);
		expect(topUpResponse.status).toBe(303);
		expect(topUpResponse.headers.get("location")).toContain(
			"/admin?topup=success",
		);

		const ledgerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/credits/ledger", {
				headers: { authorization: `Bearer ${registered.session.token}` },
			}),
		);
		const ledger = await ledgerResponse.json();
		expect(ledger.entries).toHaveLength(1);
		expect(ledger.entries[0].balanceAfter).toBe(2750);

		const logoutResponse = await app.fetch(
			new Request("http://shotlyx.test/admin/logout", {
				method: "POST",
				headers: { cookie },
			}),
		);
		expect(logoutResponse.status).toBe(303);
		expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
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

	test("lets users create a ZPAY checkout and applies the verified payment callback once", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
			zpay: {
				pid: "zpay-pid",
				key: "zpay-secret",
				submitUrl: "https://zpayz.cn/submit.php",
				publicBaseUrl: "https://shotlyx.example.com",
				creditsPerCny: 10_000,
			},
		});
		const registerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/auth/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "self-topup@example.com",
					password: "123456",
					name: "Self Topup",
				}),
			}),
		);
		const registered = await registerResponse.json();
		const authorization = `Bearer ${registered.session.token}`;

		const paymentResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/credits/payments", {
				method: "POST",
				headers: {
					authorization,
					"content-type": "application/json",
				},
				body: JSON.stringify({ credits: 20_000, type: "alipay" }),
			}),
		);

		expect(paymentResponse.status).toBe(201);
		const payment = await paymentResponse.json();
		expect(payment.order.credits).toBe(20_000);
		expect(payment.order.money).toBe("2.00");
		expect(payment.checkoutUrl).toContain(
			`/api/account/credits/payments/${payment.order.outTradeNo}/checkout`,
		);

		const checkoutResponse = await app.fetch(
			new Request(`http://shotlyx.test${payment.checkoutUrl}`),
		);
		expect(checkoutResponse.status).toBe(200);
		const checkoutHtml = await checkoutResponse.text();
		expect(checkoutHtml).toContain("https://zpayz.cn/submit.php");
		expect(checkoutHtml).toContain('name="notify_url"');
		expect(checkoutHtml).toContain('name="sign"');

		const notifyParams = {
			pid: "zpay-pid",
			type: "alipay",
			out_trade_no: payment.order.outTradeNo,
			trade_no: "zpay-trade-1",
			name: "Shotlyx API 额度充值 20,000 credits",
			money: "2.00",
			trade_status: "TRADE_SUCCESS",
		};
		const signedNotifyParams = new URLSearchParams({
			...notifyParams,
			sign: signZpayParams(notifyParams, "zpay-secret"),
			sign_type: "MD5",
		});
		const notifyResponse = await app.fetch(
			new Request(
				`http://shotlyx.test/api/callbacks/zpay?${signedNotifyParams}`,
			),
		);
		const duplicateNotifyResponse = await app.fetch(
			new Request(
				`http://shotlyx.test/api/callbacks/zpay?${signedNotifyParams}`,
			),
		);

		expect(notifyResponse.status).toBe(200);
		expect(await notifyResponse.text()).toBe("success");
		expect(duplicateNotifyResponse.status).toBe(200);
		expect(await duplicateNotifyResponse.text()).toBe("success");

		const ledgerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/credits/ledger", {
				headers: { authorization },
			}),
		);
		const ledger = await ledgerResponse.json();
		expect(ledger.entries).toHaveLength(1);
		expect(ledger.entries[0].idempotencyKey).toBe(
			`zpay:${payment.order.outTradeNo}`,
		);
		expect(ledger.entries[0].externalPaymentId).toBe("zpay-trade-1");
		expect(ledger.entries[0].balanceAfter).toBe(20_500);
	});
});
