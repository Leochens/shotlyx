import { createAuthService } from "./auth";
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

async function readJson(request: Request): Promise<Record<string, unknown>> {
	const value = await request.json().catch(() => ({}));
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
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

function adminPage({
	users,
	logs,
	settings,
}: {
	users: Array<{ email: string; name: string; createdAt: string }>;
	logs: Array<{ type: string; message: string; createdAt: string }>;
	settings: ServerSettings;
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
    h1 { margin: 0 0 24px; }
    section { border: 1px solid rgba(148, 163, 184, .24); margin: 16px 0; padding: 18px; background: rgba(15, 23, 42, .72); }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 10px; border-bottom: 1px solid rgba(148, 163, 184, .16); text-align: left; }
    code { color: #67e8f9; }
  </style>
</head>
<body>
  <main>
    <h1>Shotlyx Server Admin</h1>
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
	const adminToken = config.adminToken ?? process.env.SHOTLYX_ADMIN_TOKEN;
	const auth = createAuthService({ store, newApi, initialQuota });

	async function requireAccount(request: Request) {
		const token = getBearerToken(request);
		if (!token) return null;
		return auth.getSessionAccount(token);
	}

	function requireAdmin(request: Request): boolean {
		if (!adminToken) return true;
		return request.headers.get("x-shotlyx-admin-token") === adminToken;
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
						}),
					);
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
