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

	test("exposes commercial config and lets users buy catalog products", async () => {
		const app = createServerApp({
			store: new InMemoryShotlyxStore(),
			newApi: createFakeNewApi(),
			initialQuota: 500,
			adminToken: "admin-secret",
			zpay: {
				pid: "zpay-pid",
				key: "zpay-secret",
				publicBaseUrl: "https://shotlyx.example.com",
				submitUrl: "https://zpayz.cn/submit.php",
			},
		});
		const registerResponse = await app.fetch(
			new Request("http://shotlyx.test/api/auth/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "catalog-buyer@example.com",
					password: "123456",
					name: "Catalog Buyer",
				}),
			}),
		);
		const registered = await registerResponse.json();
		const authorization = `Bearer ${registered.session.token}`;

		const commercialConfigResponse = await app.fetch(
			new Request("http://shotlyx.test/api/admin/commercial-config", {
				headers: { "x-shotlyx-admin-token": "admin-secret" },
			}),
		);
		expect(commercialConfigResponse.status).toBe(200);
		const commercialConfig = await commercialConfigResponse.json();
		expect(commercialConfig.catalog.plans[0].code).toBe("creator_monthly");
		expect(commercialConfig.objectStorage.driver).toBe("local");

		const storageResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/storage/config", {
				headers: { authorization },
			}),
		);
		expect(storageResponse.status).toBe(200);
		expect((await storageResponse.json()).storage.localPreviewRecommended).toBe(
			true,
		);

		const uploadResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/uploads/initiate", {
				method: "POST",
				headers: {
					authorization,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					fileName: "demo video.mp4",
					mimeType: "video/mp4",
					sizeBytes: 1024,
				}),
			}),
		);
		expect(uploadResponse.status).toBe(200);
		const upload = await uploadResponse.json();
		expect(upload.upload.mode).toBe("local-preview");
		expect(upload.upload.objectKey).toContain("/users/");

		const checkoutResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/billing/checkout", {
				method: "POST",
				headers: {
					authorization,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					productType: "credit_package",
					productCode: "points_3000",
					type: "alipay",
				}),
			}),
		);
		expect(checkoutResponse.status).toBe(201);
		const checkout = await checkoutResponse.json();
		expect(checkout.order.credits).toBe(3_000);
		expect(checkout.order.money).toBe("30.00");
		expect(checkout.order.product).toEqual({
			type: "credit_package",
			code: "points_3000",
			name: "3000 点数包",
		});

		const notifyParams = {
			pid: "zpay-pid",
			type: "alipay",
			out_trade_no: checkout.order.outTradeNo,
			trade_no: "zpay-catalog-trade-1",
			name: "3000 点数包",
			money: "30.00",
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
		expect(notifyResponse.status).toBe(200);

		const billingStateResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/billing-state", {
				headers: { authorization },
			}),
		);
		expect(billingStateResponse.status).toBe(200);
		const billingState = await billingStateResponse.json();
		expect(billingState.wallet.availableCredits).toBe(3_500);
		expect(billingState.creditBreakdown.creditPackageCredits).toBe(3_000);
		expect(billingState.creditBreakdown.adminCredits).toBe(500);
		expect(billingState.catalog.creditPackages).toHaveLength(5);
	});

	test("syncs account projects and local-preview media assets", async () => {
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
					email: "project-sync@example.com",
					password: "123456",
					name: "Project Sync",
				}),
			}),
		);
		const registered = await registerResponse.json();
		const authorization = `Bearer ${registered.session.token}`;
		const project = {
			metadata: {
				id: "project-1",
				name: "Cloud Project",
				createdAt: "2026-06-25T00:00:00.000Z",
				updatedAt: "2026-06-25T00:01:00.000Z",
			},
			scenes: [],
			currentSceneId: "",
			settings: {},
			version: 31,
		};

		const saveResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/projects", {
				method: "POST",
				headers: {
					authorization,
					"content-type": "application/json",
				},
				body: JSON.stringify({ project }),
			}),
		);
		expect(saveResponse.status).toBe(201);
		expect((await saveResponse.json()).project.id).toBe("project-1");

		const listResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/projects", {
				headers: { authorization },
			}),
		);
		expect(listResponse.status).toBe(200);
		expect((await listResponse.json()).projects[0].name).toBe("Cloud Project");

		const initiateResponse = await app.fetch(
			new Request(
				"http://shotlyx.test/api/account/projects/project-1/assets/initiate",
				{
					method: "POST",
					headers: {
						authorization,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						assetId: "asset-1",
						fileName: "demo.mp4",
						mimeType: "video/mp4",
						mediaType: "video",
						sizeBytes: 1024,
						metadata: {
							width: 1920,
							height: 1080,
							duration: 12.5,
							fps: 30,
							hasAudio: true,
							thumbnailUrl: "data:image/jpeg;base64,thumb",
						},
					}),
				},
			),
		);
		expect(initiateResponse.status).toBe(200);
		const initiated = await initiateResponse.json();
		expect(initiated.upload.mode).toBe("local-preview");
		expect(initiated.asset.uploadStatus).toBe("local-only");
		expect(initiated.asset.objectKey).toContain(
			"shotlyx/users/",
		);
		expect(initiated.asset.metadata).toMatchObject({
			width: 1920,
			height: 1080,
			duration: 12.5,
			fps: 30,
			hasAudio: true,
			thumbnailUrl: "data:image/jpeg;base64,thumb",
		});

		const metadataResponse = await app.fetch(
			new Request(
				"http://shotlyx.test/api/account/projects/project-1/assets/asset-1/metadata",
				{
					method: "PUT",
					headers: {
						authorization,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						metadata: {
							duration: 13,
							thumbnailUrl: "data:image/jpeg;base64,new-thumb",
						},
					}),
				},
			),
		);
		expect(metadataResponse.status).toBe(200);
		const updatedMetadata = await metadataResponse.json();
		expect(updatedMetadata.asset.metadata).toMatchObject({
			width: 1920,
			height: 1080,
			duration: 13,
			fps: 30,
			hasAudio: true,
			thumbnailUrl: "data:image/jpeg;base64,new-thumb",
		});

		const completeResponse = await app.fetch(
			new Request(
				"http://shotlyx.test/api/account/projects/project-1/assets/asset-1/complete",
				{
					method: "POST",
					headers: {
						authorization,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						uploadToken: initiated.upload.uploadToken,
					}),
				},
			),
		);
		expect(completeResponse.status).toBe(200);
		const completed = await completeResponse.json();
		expect(completed.asset.uploadStatus).toBe("uploaded");
		expect(completed.readUrl).toBe(null);

		const readUrlResponse = await app.fetch(
			new Request(
				"http://shotlyx.test/api/account/projects/project-1/assets/asset-1/read-url",
				{ headers: { authorization } },
			),
		);
		expect(readUrlResponse.status).toBe(200);

		const deleteResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/projects/project-1", {
				method: "DELETE",
				headers: { authorization },
			}),
		);
		expect(deleteResponse.status).toBe(200);

		const missingResponse = await app.fetch(
			new Request("http://shotlyx.test/api/account/projects/project-1", {
				headers: { authorization },
			}),
		);
		expect(missingResponse.status).toBe(404);
	});
});
