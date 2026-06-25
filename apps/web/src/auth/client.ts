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
		product?: {
			type: BillingProductType;
			code: string;
			name: string;
		} | null;
	};
	checkoutUrl: string;
};

export type BillingProductType = "plan" | "credit_package";

export type BillingPlan = {
	type: "plan";
	code: string;
	name: string;
	description: string;
	priceCents: number;
	period: "month";
	includedCredits: number;
	features: string[];
	highlight?: boolean;
};

export type BillingCreditPackage = {
	type: "credit_package";
	code: string;
	name: string;
	description: string;
	priceCents: number;
	credits: number;
	bonusCredits: number;
	highlight?: boolean;
};

export type UsagePricingRule = {
	code: string;
	name: string;
	unit: string;
	credits: number;
	description: string;
	adminConfigKey: string;
};

export type AccountBillingState = {
	user: AuthUser;
	wallet: {
		availableCredits: number;
		heldCredits: number;
	};
	creditBreakdown: {
		subscriptionCredits: number;
		creditPackageCredits: number;
		adminCredits: number;
		promoCredits: number;
		refundAdjustmentCredits: number;
		totalActiveCredits: number;
	};
	subscription: {
		status: "none" | "active";
		planCode?: string;
		planName?: string;
		includedCredits?: number;
		latestGrantedAt?: string;
	};
	catalog: {
		plans: BillingPlan[];
		creditPackages: BillingCreditPackage[];
	};
	usagePricingRules: UsagePricingRule[];
	newApiKey: NewApiKeySummary | null;
	ledgerEntries: CreditLedgerEntry[];
	billingCenter?: {
		configured: boolean;
		baseUrl?: string;
		appCode?: string;
		missing: string[];
	};
};

export type ObjectStorageConfigStatus = {
	driver: "local" | "cos" | "r2" | "s3";
	configured: boolean;
	productionReady: boolean;
	keyPrefix: string;
	bucket?: string;
	endpoint?: string;
	publicBaseUrl?: string;
	missing: string[];
	maxUploadSizeMb: number;
	localPreviewRecommended: boolean;
	signedUrlTtlSeconds?: number;
	cosUploadStsTtlSeconds?: number;
	cosUploadSliceSizeMb?: number;
};

export type CloudUploadStatus =
	| "local-only"
	| "uploading"
	| "uploaded"
	| "failed";

export type CloudProjectRecord = {
	id: string;
	userId: string;
	name: string;
	metadata: Record<string, unknown>;
	project: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

export type CloudMediaAssetMetadata = {
	width?: number;
	height?: number;
	duration?: number;
	fps?: number;
	hasAudio?: boolean;
	thumbnailUrl?: string;
};

export type CloudMediaAssetRecord = {
	id: string;
	userId: string;
	projectId: string;
	name: string;
	mediaType: string;
	mimeType: string;
	sizeBytes: number;
	metadata?: CloudMediaAssetMetadata;
	objectKey?: string;
	uploadStatus: CloudUploadStatus;
	createdAt: string;
	updatedAt: string;
	uploadedAt?: string;
	expiresAt?: string;
};

export type DirectUploadSession = {
	mode: "local-preview" | "cos";
	provider: "local" | "cos";
	bucket?: string;
	region?: string;
	key: string;
	objectKey: string;
	uploadToken: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	maxSizeBytes: number;
	sliceSizeBytes: number;
	startTime: number;
	expiredTime: number;
	credentials?: {
		tmpSecretId: string;
		tmpSecretKey: string;
		sessionToken: string;
	};
	localPreviewRecommended: boolean;
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

function readRequiredToken(): string {
	const token = readStoredToken();
	if (!token) throw new Error("unauthorized");
	return token;
}

export function hasStoredAuthSession(): boolean {
	return Boolean(readStoredToken());
}

async function requestAuthenticatedJson({
	path,
	method = "GET",
	body,
}: {
	path: string;
	method?: "GET" | "POST" | "PUT" | "DELETE";
	body?: Record<string, unknown>;
}): Promise<unknown> {
	const token = readRequiredToken();
	const response = await fetch(buildApiUrl(path), {
		method,
		cache: method === "GET" ? "no-store" : undefined,
		headers: {
			authorization: `Bearer ${token}`,
			...(body ? { "content-type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (response.status === 401) {
		clearAuthSession();
		throw new Error(mapAuthErrorMessage("unauthorized", "请重新登录"));
	}
	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, "request_failed"));
	}
	return payload;
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
	const token = readRequiredToken();

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
	const token = readRequiredToken();

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

export async function getAccountBillingState(): Promise<AccountBillingState> {
	const token = readRequiredToken();
	const response = await fetch(buildApiUrl("/api/account/billing-state"), {
		cache: "no-store",
		headers: { authorization: `Bearer ${token}` },
	});
	if (response.status === 401) {
		clearAuthSession();
		throw new Error(mapAuthErrorMessage("unauthorized", "请重新登录"));
	}
	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, "billing_state_request_failed"));
	}
	return payload as AccountBillingState;
}

export async function createBillingCheckout({
	productType,
	productCode,
	type,
}: {
	productType: BillingProductType;
	productCode: string;
	type: "alipay" | "wxpay";
}): Promise<CreditTopUpPayment> {
	const token = readRequiredToken();
	const response = await fetch(buildApiUrl("/api/account/billing/checkout"), {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ productType, productCode, type }),
	});
	if (response.status === 401) {
		clearAuthSession();
		throw new Error(mapAuthErrorMessage("unauthorized", "请重新登录"));
	}
	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new Error(getErrorMessage(payload, "billing_checkout_failed"));
	}
	return payload as CreditTopUpPayment;
}

export async function getObjectStorageConfigStatus(): Promise<ObjectStorageConfigStatus> {
	const payload = await requestAuthenticatedJson({
		path: "/api/account/storage/config",
	});
	if (typeof payload === "object" && payload !== null) {
		const storage = Reflect.get(payload, "storage");
		if (storage) return storage as ObjectStorageConfigStatus;
	}
	throw new Error("storage_config_request_failed");
}

export async function listCloudProjects(): Promise<CloudProjectRecord[]> {
	const payload = await requestAuthenticatedJson({ path: "/api/account/projects" });
	if (typeof payload === "object" && payload !== null) {
		const projects = Reflect.get(payload, "projects");
		if (Array.isArray(projects)) return projects as CloudProjectRecord[];
	}
	return [];
}

export async function getCloudProject({
	projectId,
}: {
	projectId: string;
}): Promise<{
	project: CloudProjectRecord;
	assets: CloudMediaAssetRecord[];
} | null> {
	const payload = await requestAuthenticatedJson({
		path: `/api/account/projects/${encodeURIComponent(projectId)}`,
	});
	if (typeof payload !== "object" || payload === null) return null;
	const project = Reflect.get(payload, "project");
	const assets = Reflect.get(payload, "assets");
	if (!project) return null;
	return {
		project: project as CloudProjectRecord,
		assets: Array.isArray(assets) ? (assets as CloudMediaAssetRecord[]) : [],
	};
}

export async function upsertCloudProject({
	project,
}: {
	project: Record<string, unknown>;
}): Promise<CloudProjectRecord> {
	const payload = await requestAuthenticatedJson({
		path: "/api/account/projects",
		method: "POST",
		body: { project },
	});
	if (typeof payload === "object" && payload !== null) {
		const record = Reflect.get(payload, "project");
		if (record) return record as CloudProjectRecord;
	}
	throw new Error("cloud_project_sync_failed");
}

export async function deleteCloudProjects({
	ids,
}: {
	ids: string[];
}): Promise<void> {
	await requestAuthenticatedJson({
		path: "/api/account/projects",
		method: "DELETE",
		body: { ids },
	});
}

export async function initiateCloudAssetUpload({
	projectId,
	assetId,
	fileName,
	mimeType,
	mediaType,
	sizeBytes,
	metadata,
}: {
	projectId: string;
	assetId: string;
	fileName: string;
	mimeType: string;
	mediaType: string;
	sizeBytes: number;
	metadata?: CloudMediaAssetMetadata;
}): Promise<{
	upload: DirectUploadSession;
	asset: CloudMediaAssetRecord;
	storage: ObjectStorageConfigStatus;
}> {
	const payload = await requestAuthenticatedJson({
		path: `/api/account/projects/${encodeURIComponent(projectId)}/assets/initiate`,
		method: "POST",
		body: { assetId, fileName, mimeType, mediaType, sizeBytes, metadata },
	});
	return payload as {
		upload: DirectUploadSession;
		asset: CloudMediaAssetRecord;
		storage: ObjectStorageConfigStatus;
	};
}

export async function completeCloudAssetUpload({
	projectId,
	assetId,
	uploadToken,
}: {
	projectId: string;
	assetId: string;
	uploadToken: string;
}): Promise<{
	asset: CloudMediaAssetRecord;
	readUrl: string | null;
}> {
	const payload = await requestAuthenticatedJson({
		path: `/api/account/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/complete`,
		method: "POST",
		body: { uploadToken },
	});
	return payload as {
		asset: CloudMediaAssetRecord;
		readUrl: string | null;
	};
}

export async function getCloudAssetReadUrl({
	projectId,
	assetId,
}: {
	projectId: string;
	assetId: string;
}): Promise<{ readUrl: string | null; asset: CloudMediaAssetRecord }> {
	const payload = await requestAuthenticatedJson({
		path: `/api/account/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/read-url`,
	});
	return payload as { readUrl: string | null; asset: CloudMediaAssetRecord };
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
