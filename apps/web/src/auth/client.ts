import { useEffect, useState } from "react";

function isHttpUrl(value: string | undefined): value is string {
	return value?.startsWith("http://") || value?.startsWith("https://") || false;
}

function hasApiOrigin(value: string | undefined): boolean {
	return Boolean(value?.trim());
}

function getAuthBaseUrl() {
	if (hasApiOrigin(process.env.VITE_SHOTLYX_API_ORIGIN)) {
		return "";
	}

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

export type CreditLedgerEntry = {
	id: string;
	userId: string;
	idempotencyKey: string;
	type: "top_up";
	amount: number;
	balanceBefore: number;
	balanceAfter: number;
	status: "pending" | "applied" | "failed";
	createdAt: string;
	updatedAt: string;
	externalPaymentId?: string;
	note?: string;
	meta?: Record<string, unknown>;
};

export type CreditTopUpPayment = {
	order: {
		id: string;
		provider?: "zpay";
		outTradeNo: string;
		credits: number;
		money: string;
		type: "alipay" | "wxpay";
		status: "pending" | "paid" | "failed";
		createdAt?: string;
		paidAt?: string;
	};
	checkoutUrl: string;
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
const authSessionListeners = new Set<(account: AuthAccount | null) => void>();
let cachedAccount: AuthAccount | null | undefined;

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

function notifyAuthSessionListeners(account: AuthAccount | null): void {
	for (const listener of authSessionListeners) {
		listener(account);
	}
}

function storeAccount(account: AuthAccount): void {
	cachedAccount = account;
	storeSession(account.session);
	notifyAuthSessionListeners(account);
}

export function subscribeAuthSessionChanges(
	listener: (account: AuthAccount | null) => void,
): () => void {
	authSessionListeners.add(listener);
	return () => {
		authSessionListeners.delete(listener);
	};
}

export function clearAuthSession(): void {
	cachedAccount = null;
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(AUTH_STORAGE_KEY);
	notifyAuthSessionListeners(null);
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
	storeAccount(account);
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
	if (cachedAccount !== undefined) return cachedAccount;
	const token = readStoredToken();
	if (!token) {
		cachedAccount = null;
		return null;
	}
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
	cachedAccount = payload as AuthAccount;
	return cachedAccount;
}

export async function getCreditLedgerEntries(): Promise<CreditLedgerEntry[]> {
	const token = readStoredToken();
	if (!token) throw new Error("unauthorized");

	const response = await fetch(buildApiUrl("/api/account/credits/ledger"), {
		cache: "no-store",
		headers: { authorization: `Bearer ${token}` },
	});
	if (response.status === 401) {
		clearAuthSession();
		throw new Error(mapAuthErrorMessage("unauthorized", "请重新登录"));
	}
	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, "credit_ledger_request_failed"));
	}
	if (typeof payload === "object" && payload !== null) {
		const entries = Reflect.get(payload, "entries");
		if (Array.isArray(entries)) return entries as CreditLedgerEntry[];
	}
	return [];
}

export async function createCreditTopUpPayment({
	credits,
	type,
}: {
	credits: number;
	type: "alipay" | "wxpay";
}): Promise<CreditTopUpPayment> {
	const token = readStoredToken();
	if (!token) throw new Error("unauthorized");

	const response = await fetch(buildApiUrl("/api/account/credits/payments"), {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ credits, type }),
	});
	if (response.status === 401) {
		clearAuthSession();
		throw new Error(mapAuthErrorMessage("unauthorized", "请重新登录"));
	}
	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, "payment_request_failed"));
	}
	return payload as CreditTopUpPayment;
}

export function useSession(): AuthState {
	const [state, setState] = useState<AuthState>({
		status: "loading",
		account: null,
	});

	useEffect(() => {
		let cancelled = false;
		const applyAccount = (account: AuthAccount | null) => {
			setState(
				account
					? { status: "authenticated", account }
					: { status: "anonymous", account: null },
			);
		};
		getCurrentAccount()
			.then((account) => {
				if (cancelled) return;
				applyAccount(account);
			})
			.catch(() => {
				if (!cancelled) setState({ status: "anonymous", account: null });
			});
		const unsubscribe = subscribeAuthSessionChanges((account) => {
			if (!cancelled) applyAccount(account);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	return state;
}
