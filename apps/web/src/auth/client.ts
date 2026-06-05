import { useEffect, useState } from "react";

function isHttpUrl(value: string | undefined): value is string {
	return value?.startsWith("http://") || value?.startsWith("https://") || false;
}

function getAuthBaseUrl() {
	const configuredUrl = process.env.VITE_SHOTLYX_SERVER_URL;
	if (isHttpUrl(configuredUrl)) {
		return configuredUrl.replace(/\/+$/, "");
	}
	return "";
}

export type AuthUser = {
	id: string;
	email: string;
	name: string;
	createdAt?: string;
};

export type AuthSession = {
	token: string;
	userId: string;
	createdAt: string;
	expiresAt: string;
};

export type NewApiKeySummary = {
	userId: string;
	tokenId: string;
	key: string;
	quota: number;
};

export type AuthAccount = {
	user: AuthUser;
	session: AuthSession;
	newApiKey: NewApiKeySummary | null;
};

type AuthState =
	| { status: "loading"; account: null }
	| { status: "anonymous"; account: null }
	| { status: "authenticated"; account: AuthAccount };

const AUTH_STORAGE_KEY = "shotlyx.auth.session.v1";
const AUTH_ERROR_MESSAGES: Record<string, string> = {
	email_already_registered: "这个邮箱已经注册过了",
	invalid_email: "请输入有效的邮箱地址",
	invalid_email_or_password: "邮箱或密码不正确",
	password_too_short: "密码至少需要 6 位",
};

function buildApiUrl(path: string): string {
	const baseUrl = getAuthBaseUrl();
	return baseUrl ? `${baseUrl}${path}` : path;
}

function readStoredToken(): string | null {
	if (typeof window === "undefined") return null;
	const value = window.localStorage.getItem(AUTH_STORAGE_KEY);
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as { token?: unknown };
		return typeof parsed.token === "string" ? parsed.token : null;
	} catch {
		window.localStorage.removeItem(AUTH_STORAGE_KEY);
		return null;
	}
}

function storeSession(session: AuthSession): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(
		AUTH_STORAGE_KEY,
		JSON.stringify({ token: session.token, expiresAt: session.expiresAt }),
	);
}

export function clearAuthSession(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
	return response.json().catch(() => ({}));
}

function getErrorMessage(payload: unknown, fallback: string): string {
	if (typeof payload === "object" && payload !== null) {
		const error = Reflect.get(payload, "error");
		if (typeof error === "string" && error) {
			return mapAuthErrorMessage(error, fallback);
		}
	}
	return fallback;
}

export function mapAuthErrorMessage(error: string, fallback = error): string {
	return AUTH_ERROR_MESSAGES[error] ?? fallback;
}

async function requestAccount(
	path: string,
	body: Record<string, unknown>,
): Promise<AuthAccount> {
	const response = await fetch(buildApiUrl(path), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, "auth_request_failed"));
	}
	const account = payload as AuthAccount;
	storeSession(account.session);
	return account;
}

export async function registerWithEmail({
	email,
	password,
	name,
}: {
	email: string;
	password: string;
	name: string;
}): Promise<AuthAccount> {
	return requestAccount("/api/auth/register", { email, password, name });
}

export async function loginWithEmail({
	email,
	password,
}: {
	email: string;
	password: string;
}): Promise<AuthAccount> {
	return requestAccount("/api/auth/login", { email, password });
}

export async function getCurrentAccount(): Promise<AuthAccount | null> {
	const token = readStoredToken();
	if (!token) return null;
	const response = await fetch(buildApiUrl("/api/account/me"), {
		cache: "no-store",
		headers: { authorization: `Bearer ${token}` },
	});
	if (response.status === 401) {
		clearAuthSession();
		return null;
	}
	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, "account_request_failed"));
	}
	return payload as AuthAccount;
}

export function useSession(): AuthState {
	const [state, setState] = useState<AuthState>({
		status: "loading",
		account: null,
	});

	useEffect(() => {
		let cancelled = false;
		getCurrentAccount()
			.then((account) => {
				if (cancelled) return;
				setState(
					account
						? { status: "authenticated", account }
						: { status: "anonymous", account: null },
				);
			})
			.catch(() => {
				if (!cancelled) setState({ status: "anonymous", account: null });
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
