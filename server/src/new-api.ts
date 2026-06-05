import type { NewApiKeyBinding } from "./types";

export type NewApiCreateUserKeyInput = {
	email: string;
	name: string;
	initialQuota: number;
};

export type NewApiUpdateTokenQuotaInput = {
	userId: string;
	tokenId: string;
	quota: number;
};

export type NewApiUpdateTokenQuotaResult = {
	quota: number;
};

export type NewApiGateway = {
	createUserKey(input: NewApiCreateUserKeyInput): Promise<NewApiKeyBinding>;
	updateTokenQuota(
		input: NewApiUpdateTokenQuotaInput,
	): Promise<NewApiUpdateTokenQuotaResult>;
};

export type NewApiGatewayConfig = {
	baseUrl: string;
	adminToken: string;
	defaultGroup?: string;
	fetch?: typeof fetch;
};

type NewApiResponse = Record<string, unknown>;

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function getString(value: NewApiResponse, keys: string[]): string | null {
	for (const key of keys) {
		const candidate = value[key];
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate;
		}
	}
	return null;
}

function getNumber(value: NewApiResponse, keys: string[]): number | null {
	for (const key of keys) {
		const candidate = value[key];
		if (typeof candidate === "number" && Number.isFinite(candidate)) {
			return candidate;
		}
	}
	return null;
}

function unwrapResponsePayload(payload: unknown): NewApiResponse {
	if (typeof payload !== "object" || payload === null) return {};
	const record = payload as NewApiResponse;
	const data = record.data;
	if (typeof data === "object" && data !== null) {
		return data as NewApiResponse;
	}
	return record;
}

function normalizeTokenId(tokenId: string): string | number {
	const numericId = Number(tokenId);
	return Number.isInteger(numericId) && String(numericId) === tokenId
		? numericId
		: tokenId;
}

export function createNewApiGateway({
	baseUrl,
	adminToken,
	defaultGroup,
	fetch: fetchImpl = fetch,
}: NewApiGatewayConfig): NewApiGateway {
	const normalizedBaseUrl = trimTrailingSlash(baseUrl);

	async function request({
		path,
		body,
		method = "POST",
		headers: extraHeaders = {},
	}: {
		path: string;
		body: Record<string, unknown>;
		method?: "POST" | "PUT";
		headers?: Record<string, string>;
	}) {
		const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${adminToken}`,
				...extraHeaders,
			},
			body: JSON.stringify(body),
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(`newapi_request_failed:${response.status}`);
		}
		return unwrapResponsePayload(payload);
	}

	return {
		async createUserKey({ email, name, initialQuota }) {
			const userPayload = await request({
				path: "/api/user/",
				body: {
					username: email,
					display_name: name,
					quota: initialQuota,
					group: defaultGroup,
				},
			});
			const newApiUserId =
				getString(userPayload, ["id", "user_id"]) ??
				String(getNumber(userPayload, ["id", "user_id"]) ?? email);

			const tokenPayload = await request({
				path: "/api/token/",
				body: {
					name: `Shotlyx ${name}`,
					unlimited_quota: false,
					remain_quota: initialQuota,
					user_id: newApiUserId,
				},
			});

			return {
				userId: newApiUserId,
				tokenId:
					getString(tokenPayload, ["id", "token_id"]) ??
					String(getNumber(tokenPayload, ["id", "token_id"]) ?? ""),
				key:
					getString(tokenPayload, ["key", "token"]) ??
					getString(tokenPayload, ["value"]) ??
					"",
				quota:
					getNumber(tokenPayload, ["remain_quota", "quota"]) ?? initialQuota,
			};
		},
		async updateTokenQuota({ userId, tokenId, quota }) {
			const tokenPayload = await request({
				path: "/api/token/",
				method: "PUT",
				headers: { "New-Api-User": userId },
				body: {
					id: normalizeTokenId(tokenId),
					remain_quota: quota,
					unlimited_quota: false,
				},
			});

			return {
				quota: getNumber(tokenPayload, ["remain_quota", "quota"]) ?? quota,
			};
		},
	};
}
