import { createAuthService } from "./auth";
import { createBillingService } from "./billing";
import type { NewApiGateway } from "./new-api";
import { createNewApiGateway } from "./new-api";
import {
	createDefaultShotlyxStore,
	resolveDefaultStoreMode,
	type DefaultStoreMode,
} from "./store-factory";
import type { ServerSettings, ShotlyxStore } from "./types";

export type ServerApp = {
	fetch(request: Request): Promise<Response>;
};

export type ServerAppConfig = {
	store?: ShotlyxStore;
	storeMode?: DefaultStoreMode | "custom";
	newApi?: NewApiGateway;
	initialQuota?: number;
	adminToken?: string;
};

const DEFAULT_INITIAL_QUOTA = 100_000;
const ADMIN_COOKIE_NAME = "shotlyx_admin_token";

function json(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	headers.set("access-control-allow-origin", "*");
	headers.set("access-control-allow-headers", "content-type, authorization");
	headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
	return new Response(JSON.stringify(data), { ...init, headers });
}

function html(body: string, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("content-type", "text/html; charset=utf-8");
	return new Response(body, { ...init, headers });
}

function redirect(location: string, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("location", location);
	return new Response(null, { ...init, status: init.status ?? 303, headers });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
	const value = await request.json().catch(() => ({}));
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

async function readForm(request: Request): Promise<Record<string, string>> {
	const params = new URLSearchParams(await request.text());
	return Object.fromEntries(params.entries());
}

function readString(
	body: Record<string, unknown>,
	key: string,
	fallback = "",
): string {
	const value = body[key];
	return typeof value === "string" ? value : fallback;
}

function getBearerToken(request: Request): string | null {
	const header = request.headers.get("authorization") ?? "";
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return match?.[1] ?? null;
}

function parseCookies(request: Request): Record<string, string> {
	const cookies: Record<string, string> = {};
	const header = request.headers.get("cookie") ?? "";
	for (const part of header.split(";")) {
		const [rawName, ...rawValue] = part.trim().split("=");
		if (!rawName) continue;
		const value = rawValue.join("=");
		try {
			cookies[rawName] = decodeURIComponent(value);
		} catch {
			cookies[rawName] = value;
		}
	}
	return cookies;
}

function maskKey(key: string): string {
	if (key.length <= 10) return key ? "***" : "";
	return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function toAccountResponse(
	account: Awaited<
		ReturnType<ReturnType<typeof createAuthService>["getSessionAccount"]>
	>,
) {
	if (!account) return null;
	return {
		user: account.user,
		session: account.session,
		newApiKey: account.newApiKey
			? {
					...account.newApiKey,
					key: maskKey(account.newApiKey.key),
				}
			: null,
	};
}

function adminLoginPage({ error }: { error?: string } = {}): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shotlyx 管理员登录</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #081013; color: #f8fafc; }
    main { width: min(420px, calc(100vw - 32px)); border: 1px solid rgba(148, 163, 184, .24); padding: 28px; background: rgba(15, 23, 42, .72); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 20px; color: #aebdcc; line-height: 1.6; }
    label { display: block; margin: 0 0 8px; color: #cbd5e1; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; min-height: 42px; border: 1px solid rgba(148, 163, 184, .3); background: rgba(2, 6, 23, .72); color: #f8fafc; padding: 0 12px; font: inherit; }
    button { width: 100%; min-height: 42px; margin-top: 16px; border: 0; background: #2dd4bf; color: #042f2e; font-weight: 700; cursor: pointer; }
    .error { margin: 0 0 16px; padding: 10px 12px; border: 1px solid rgba(248, 113, 113, .36); background: rgba(127, 29, 29, .32); color: #fecaca; }
  </style>
</head>
<body>
  <main>
    <h1>管理员登录</h1>
    <p>输入服务端配置的管理 Token 后进入 Shotlyx 管理端。</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="post" action="/admin/login">
      <label for="token">Admin Token</label>
      <input id="token" name="token" type="password" autocomplete="current-password" required autofocus />
      <button type="submit">进入管理端</button>
    </form>
  </main>
</body>
</html>`;
}

function adminPage({
	users,
	logs,
	settings,
	flash,
	error,
}: {
	users: Array<{ email: string; name: string; createdAt: string }>;
	logs: Array<{ type: string; message: string; createdAt: string }>;
	settings: ServerSettings;
	flash?: string;
	error?: string;
}): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shotlyx Server Admin</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #081013; color: #f8fafc; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px; }
    header { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin: 0 0 24px; }
    h1 { margin: 0; }
    section { border: 1px solid rgba(148, 163, 184, .24); margin: 16px 0; padding: 18px; background: rgba(15, 23, 42, .72); }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 10px; border-bottom: 1px solid rgba(148, 163, 184, .16); text-align: left; }
    code { color: #67e8f9; }
    .top-up-form { display: grid; grid-template-columns: minmax(220px, 1.4fr) minmax(120px, .6fr) minmax(180px, 1fr) auto; gap: 12px; align-items: end; }
    label { display: grid; gap: 6px; color: #cbd5e1; font-size: 14px; }
    input { min-height: 40px; border: 1px solid rgba(148, 163, 184, .3); background: rgba(2, 6, 23, .72); color: #f8fafc; padding: 0 12px; font: inherit; }
    button, .button { min-height: 40px; border: 0; background: #2dd4bf; color: #042f2e; padding: 0 14px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
    .logout-form { margin: 0; }
    .ghost { border: 1px solid rgba(148, 163, 184, .3); background: transparent; color: #e2e8f0; }
    .flash { margin: 0 0 16px; padding: 10px 12px; border: 1px solid rgba(45, 212, 191, .36); background: rgba(20, 184, 166, .16); color: #ccfbf1; }
    .error { margin: 0 0 16px; padding: 10px 12px; border: 1px solid rgba(248, 113, 113, .36); background: rgba(127, 29, 29, .32); color: #fecaca; }
    @media (max-width: 760px) {
      main { padding: 20px; }
      header { align-items: flex-start; flex-direction: column; }
      .top-up-form { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Shotlyx Server Admin</h1>
      <form class="logout-form" method="post" action="/admin/logout">
        <button class="ghost" type="submit">退出登录</button>
      </form>
    </header>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ""}
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <section>
      <h2>手动充值</h2>
      <form class="top-up-form" method="post" action="/admin/credits/top-up">
        <label>Email
          <input name="email" type="email" placeholder="user@example.com" required />
        </label>
        <label>额度
          <input name="amount" type="number" min="1" step="1" placeholder="1000" required />
        </label>
        <label>备注
          <input name="note" type="text" placeholder="人工充值" />
        </label>
        <button type="submit">确认充值</button>
      </form>
    </section>
    <section>
      <h2>用户管理</h2>
      <table><thead><tr><th>Email</th><th>Name</th><th>Created</th></tr></thead><tbody>
        ${users.map((user) => `<tr><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.createdAt)}</td></tr>`).join("")}
      </tbody></table>
    </section>
    <section>
      <h2>日志管理</h2>
      <table><thead><tr><th>Type</th><th>Message</th><th>Created</th></tr></thead><tbody>
        ${logs.map((log) => `<tr><td>${escapeHtml(log.type)}</td><td>${escapeHtml(log.message)}</td><td>${escapeHtml(log.createdAt)}</td></tr>`).join("")}
      </tbody></table>
    </section>
    <section>
      <h2>API Key 设置</h2>
      <p>New API Base URL: <code>${escapeHtml(settings.newApiBaseUrl || "未配置")}</code></p>
      <p>Initial Quota: <code>${settings.initialQuota}</code></p>
    </section>
    <section>
      <h2>回调管理</h2>
      <p>Callback Secret: <code>${settings.callbackSecretSet ? "已配置" : "未配置"}</code></p>
    </section>
  </main>
</body>
</html>`;
}

function createDefaultNewApiGateway(): NewApiGateway {
	const baseUrl = process.env.SHOTLYX_NEW_API_BASE_URL;
	const adminToken = process.env.SHOTLYX_NEW_API_ADMIN_TOKEN;
	if (baseUrl && adminToken) {
		return createNewApiGateway({
			baseUrl,
			adminToken,
			defaultGroup: process.env.SHOTLYX_NEW_API_DEFAULT_GROUP,
		});
	}

	return {
		async createUserKey({ email, initialQuota }) {
			return {
				userId: `local:${email}`,
				tokenId: `local-token:${email}`,
				key: `sk-local-${crypto.randomUUID()}`,
				quota: initialQuota,
			};
		},
		async updateTokenQuota({ quota }) {
			return { quota };
		},
	};
}

export function createServerApp(config: ServerAppConfig = {}): ServerApp {
	const storeMode =
		config.storeMode ?? (config.store ? "custom" : resolveDefaultStoreMode());
	const store = config.store ?? createDefaultShotlyxStore();
	const newApi = config.newApi ?? createDefaultNewApiGateway();
	const configuredInitialQuota =
		config.initialQuota ?? Number(process.env.SHOTLYX_INITIAL_QUOTA);
	const initialQuota = configuredInitialQuota || DEFAULT_INITIAL_QUOTA;
	const adminToken = (
		config.adminToken ?? process.env.SHOTLYX_ADMIN_TOKEN
	)?.trim();
	if (process.env.NODE_ENV === "production" && !adminToken) {
		throw new Error("SHOTLYX_ADMIN_TOKEN is required in production");
	}
	const auth = createAuthService({ store, newApi, initialQuota });
	const billing = createBillingService({ store, newApi });

	async function requireAccount(request: Request) {
		const token = getBearerToken(request);
		if (!token) return null;
		return auth.getSessionAccount(token);
	}

	function requireAdmin(request: Request): boolean {
		if (!adminToken) return true;
		return (
			request.headers.get("x-shotlyx-admin-token") === adminToken ||
			parseCookies(request)[ADMIN_COOKIE_NAME] === adminToken
		);
	}

	function createAdminCookie(value: string, maxAge?: number): string {
		const parts = [
			`${ADMIN_COOKIE_NAME}=${encodeURIComponent(value)}`,
			"HttpOnly",
			"SameSite=Lax",
			"Path=/",
		];
		if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
		return parts.join("; ");
	}

	async function renderAdminDashboard({
		flash,
		error,
	}: { flash?: string; error?: string } = {}): Promise<Response> {
		const [users, logs, settings] = await Promise.all([
			store.listUsers(),
			store.listLogs(),
			store.getSettings(),
		]);
		return html(
			adminPage({
				users,
				logs,
				settings,
				flash,
				error,
			}),
		);
	}

	return {
		async fetch(request: Request): Promise<Response> {
			if (request.method === "OPTIONS") {
				return json({}, { status: 204 });
			}

			const url = new URL(request.url);

			try {
				if (url.pathname === "/api/health" && request.method === "GET") {
					return json({ ok: true, store: storeMode });
				}

				if (url.pathname === "/admin/login" && request.method === "POST") {
					if (!adminToken) return redirect("/admin");
					const form = await readForm(request);
					if ((form.token ?? "").trim() !== adminToken) {
						return html(
							adminLoginPage({ error: "Admin Token 不正确，请重新输入。" }),
							{ status: 403 },
						);
					}
					return redirect("/admin", {
						headers: { "set-cookie": createAdminCookie(adminToken) },
					});
				}

				if (url.pathname === "/admin/logout" && request.method === "POST") {
					return redirect("/admin", {
						headers: { "set-cookie": createAdminCookie("", 0) },
					});
				}

				if (
					url.pathname === "/admin/credits/top-up" &&
					request.method === "POST"
				) {
					if (!requireAdmin(request)) {
						return html(adminLoginPage({ error: "请先登录管理端。" }), {
							status: 403,
						});
					}
					const form = await readForm(request);
					try {
						await billing.topUpUserCredits({
							email: form.email || undefined,
							amount: Number(form.amount),
							idempotencyKey: `admin-manual:${crypto.randomUUID()}`,
							note: form.note || undefined,
						});
						return redirect("/admin?topup=success");
					} catch (error) {
						return renderAdminDashboard({
							error:
								error instanceof Error
									? error.message
									: "充值失败，请稍后重试。",
						});
					}
				}

				if (
					url.pathname === "/api/auth/register" &&
					request.method === "POST"
				) {
					const body = await readJson(request);
					const result = await auth.register({
						email: readString(body, "email"),
						password: readString(body, "password"),
						name: readString(body, "name"),
					});
					return json(result, { status: 201 });
				}

				if (url.pathname === "/api/auth/login" && request.method === "POST") {
					const body = await readJson(request);
					return json(
						await auth.login({
							email: readString(body, "email"),
							password: readString(body, "password"),
						}),
					);
				}

				if (url.pathname === "/api/account/me" && request.method === "GET") {
					const account = await requireAccount(request);
					if (!account) return json({ error: "unauthorized" }, { status: 401 });
					return json(toAccountResponse(account));
				}

				if (
					url.pathname === "/api/account/api-key" &&
					request.method === "GET"
				) {
					const account = await requireAccount(request);
					if (!account) return json({ error: "unauthorized" }, { status: 401 });
					return json({ newApiKey: account.newApiKey });
				}

				if (
					url.pathname === "/api/account/api-key/rotate" &&
					request.method === "POST"
				) {
					const token = getBearerToken(request);
					if (!token) return json({ error: "unauthorized" }, { status: 401 });
					const newApiKey = await auth.rotateNewApiKey(token);
					if (!newApiKey) {
						return json({ error: "unauthorized" }, { status: 401 });
					}
					return json({ newApiKey });
				}

				if (
					url.pathname === "/api/account/credits/ledger" &&
					request.method === "GET"
				) {
					const account = await requireAccount(request);
					if (!account) return json({ error: "unauthorized" }, { status: 401 });
					return json({
						entries: await store.listCreditLedgerEntriesByUserId(
							account.user.id,
						),
					});
				}

				if (url.pathname === "/api/admin/users" && request.method === "GET") {
					if (!requireAdmin(request)) {
						return json({ error: "forbidden" }, { status: 403 });
					}
					const users = await store.listUsers();
					return json({
						users: users.map(({ passwordHash: _hash, ...user }) => user),
					});
				}

				if (url.pathname === "/api/admin/logs" && request.method === "GET") {
					if (!requireAdmin(request)) {
						return json({ error: "forbidden" }, { status: 403 });
					}
					return json({ logs: await store.listLogs() });
				}

				if (
					url.pathname === "/api/admin/credits/top-up" &&
					request.method === "POST"
				) {
					if (!requireAdmin(request)) {
						return json({ error: "forbidden" }, { status: 403 });
					}
					const body = await readJson(request);
					const amount =
						typeof body.amount === "number"
							? body.amount
							: Number(readString(body, "amount"));
					const result = await billing.topUpUserCredits({
						userId: readString(body, "userId") || undefined,
						email: readString(body, "email") || undefined,
						amount,
						idempotencyKey: readString(body, "idempotencyKey"),
						externalPaymentId:
							readString(body, "externalPaymentId") || undefined,
						note: readString(body, "note") || undefined,
					});
					return json({
						entry: result.entry,
						newApiKey: {
							...result.newApiKey,
							key: maskKey(result.newApiKey.key),
						},
					});
				}

				if (
					url.pathname === "/api/admin/settings" &&
					request.method === "GET"
				) {
					if (!requireAdmin(request)) {
						return json({ error: "forbidden" }, { status: 403 });
					}
					return json({ settings: await store.getSettings() });
				}

				if (
					url.pathname === "/api/admin/settings" &&
					request.method === "PUT"
				) {
					if (!requireAdmin(request)) {
						return json({ error: "forbidden" }, { status: 403 });
					}
					const body = await readJson(request);
					const currentSettings = await store.getSettings();
					const settings = await store.updateSettings({
						newApiBaseUrl: readString(
							body,
							"newApiBaseUrl",
							currentSettings.newApiBaseUrl,
						),
						initialQuota:
							typeof body.initialQuota === "number"
								? body.initialQuota
								: currentSettings.initialQuota,
						callbackSecretSet:
							typeof body.callbackSecret === "string" &&
							body.callbackSecret.length > 0,
					});
					return json({ settings });
				}

				if (
					url.pathname === "/api/callbacks/new-api" &&
					request.method === "POST"
				) {
					const body = await readJson(request);
					await store.addLog({
						id: `log_${crypto.randomUUID()}`,
						type: "callback.new-api",
						message: "New API callback received",
						createdAt: new Date().toISOString(),
						meta: body,
					});
					return json({ ok: true });
				}

				if (url.pathname === "/admin" && request.method === "GET") {
					if (!requireAdmin(request)) return html(adminLoginPage());
					return renderAdminDashboard({
						flash:
							url.searchParams.get("topup") === "success"
								? "充值已入账。"
								: undefined,
					});
				}

				return json({ error: "not_found" }, { status: 404 });
			} catch (error) {
				return json(
					{ error: error instanceof Error ? error.message : "server_error" },
					{ status: 400 },
				);
			}
		},
	};
}
