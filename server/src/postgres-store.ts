import postgres from "postgres";
import { runShotlyxSchemaMigrations } from "./postgres-schema";
import type {
	CreditLedgerEntry,
	CreditLedgerStatus,
	NewApiKeyBinding,
	PaymentOrder,
	PaymentOrderPayType,
	PaymentOrderStatus,
	PaymentProvider,
	ServerSettings,
	SyncedMediaAsset,
	SyncedProject,
	ShotlyxLogEntry,
	ShotlyxSession,
	ShotlyxStore,
	ShotlyxUser,
} from "./types";

type Row = Record<string, unknown>;

export type QueryableSql = (<T extends Row[] = Row[]>(
	strings: TemplateStringsArray,
	...values: unknown[]
) => Promise<T>) & {
	unsafe?: <T extends Row[] = Row[]>(query: string) => Promise<T>;
	end?: () => Promise<void>;
	json?: (value: unknown) => unknown;
};

type PostgresStoreConfig = {
	databaseUrl?: string;
	runMigrations?: boolean;
	sql?: QueryableSql;
};

const DEFAULT_SETTINGS: ServerSettings = {
	newApiBaseUrl: "",
	initialQuota: 100_000,
	callbackSecretSet: false,
};

function readString(row: Row, key: string): string {
	const value = row[key];
	if (value instanceof Date) return value.toISOString();
	return typeof value === "string" ? value : "";
}

function readOptionalString(row: Row, key: string): string | undefined {
	const value = row[key];
	return typeof value === "string" ? value : undefined;
}

function readNumber(row: Row, key: string): number {
	const value = row[key];
	if (typeof value === "number") return value;
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "string") return Number(value);
	return 0;
}

function readBoolean(row: Row, key: string): boolean {
	return row[key] === true;
}

function readLedgerStatus(row: Row): CreditLedgerStatus {
	const value = readString(row, "status");
	if (value === "applied" || value === "failed") return value;
	return "pending";
}

function readPaymentProvider(row: Row): PaymentProvider {
	return readString(row, "provider") === "zpay" ? "zpay" : "zpay";
}

function readPaymentStatus(row: Row): PaymentOrderStatus {
	const value = readString(row, "status");
	if (value === "paid" || value === "failed") return value;
	return "pending";
}

function readPaymentPayType(row: Row): PaymentOrderPayType {
	return readString(row, "pay_type") === "wxpay" ? "wxpay" : "alipay";
}

function readJsonMeta(row: Row): Record<string, unknown> | undefined {
	const value = row.meta_json;
	return readJsonRecord(value);
}

function readJsonRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	if (typeof value === "string" && value) {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				!Array.isArray(parsed)
			) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function toUser(row: Row): ShotlyxUser {
	return {
		id: readString(row, "id"),
		email: readString(row, "email"),
		name: readString(row, "name"),
		passwordHash: readString(row, "password_hash"),
		createdAt: readString(row, "created_at"),
		updatedAt: readString(row, "updated_at"),
	};
}

function toSession(row: Row): ShotlyxSession {
	return {
		token: readString(row, "token"),
		userId: readString(row, "user_id"),
		createdAt: readString(row, "created_at"),
		expiresAt: readString(row, "expires_at"),
	};
}

function toNewApiKeyBinding(row: Row): NewApiKeyBinding {
	return {
		userId: readString(row, "new_api_user_id"),
		tokenId: readString(row, "token_id"),
		key: readString(row, "api_key"),
		quota: readNumber(row, "quota"),
	};
}

function toLog(row: Row): ShotlyxLogEntry {
	return {
		id: readString(row, "id"),
		type: readString(row, "type"),
		userId: readOptionalString(row, "user_id"),
		message: readString(row, "message"),
		createdAt: readString(row, "created_at"),
		meta: readJsonMeta(row),
	};
}

function toCreditLedgerEntry(row: Row): CreditLedgerEntry {
	return {
		id: readString(row, "id"),
		userId: readString(row, "user_id"),
		idempotencyKey: readString(row, "idempotency_key"),
		type: "top_up",
		amount: readNumber(row, "amount"),
		balanceBefore: readNumber(row, "balance_before"),
		balanceAfter: readNumber(row, "balance_after"),
		status: readLedgerStatus(row),
		createdAt: readString(row, "created_at"),
		updatedAt: readString(row, "updated_at"),
		externalPaymentId: readOptionalString(row, "external_payment_id"),
		note: readOptionalString(row, "note"),
		meta: readJsonMeta(row),
	};
}

function toPaymentOrder(row: Row): PaymentOrder {
	return {
		id: readString(row, "id"),
		provider: readPaymentProvider(row),
		userId: readString(row, "user_id"),
		outTradeNo: readString(row, "out_trade_no"),
		credits: readNumber(row, "credits"),
		moneyCents: readNumber(row, "money_cents"),
		payType: readPaymentPayType(row),
		status: readPaymentStatus(row),
		providerTradeNo: readOptionalString(row, "provider_trade_no"),
		createdAt: readString(row, "created_at"),
		updatedAt: readString(row, "updated_at"),
		paidAt: readOptionalString(row, "paid_at"),
		meta: readJsonMeta(row),
	};
}

function toSyncedProject(row: Row): SyncedProject {
	return {
		id: readString(row, "id"),
		userId: readString(row, "user_id"),
		name: readString(row, "name"),
		metadata: readJsonRecord(row.metadata_json) ?? {},
		project: readJsonRecord(row.project_json) ?? {},
		createdAt: readString(row, "created_at"),
		updatedAt: readString(row, "updated_at"),
	};
}

function toSyncedMediaAsset(row: Row): SyncedMediaAsset {
	const status = readString(row, "upload_status");
	return {
		id: readString(row, "id"),
		userId: readString(row, "user_id"),
		projectId: readString(row, "project_id"),
		name: readString(row, "name"),
		mediaType: readString(row, "media_type"),
		mimeType: readString(row, "mime_type"),
		sizeBytes: readNumber(row, "size_bytes"),
		objectKey: readOptionalString(row, "object_key"),
		uploadStatus:
			status === "uploading" || status === "uploaded" || status === "failed"
				? status
				: "local-only",
		createdAt: readString(row, "created_at"),
		updatedAt: readString(row, "updated_at"),
		uploadedAt: readOptionalString(row, "uploaded_at"),
		expiresAt: readOptionalString(row, "expires_at"),
	};
}

function toSettings(row: Row): ServerSettings {
	return {
		newApiBaseUrl: readString(row, "new_api_base_url"),
		initialQuota: readNumber(row, "initial_quota"),
		callbackSecretSet: readBoolean(row, "callback_secret_set"),
	};
}

export class PostgresShotlyxStore implements ShotlyxStore {
	private readonly sql: QueryableSql;
	private readonly shouldRunMigrations: boolean;
	private migrationsPromise: Promise<void> | null = null;

	constructor({
		databaseUrl,
		runMigrations = true,
		sql,
	}: PostgresStoreConfig = {}) {
		if (!sql && !databaseUrl) {
			throw new Error("DATABASE_URL is required for PostgresShotlyxStore");
		}
		this.sql =
			sql ??
			(postgres(databaseUrl as string, {
				max: 10,
				idle_timeout: 30,
				connect_timeout: 10,
			}) as QueryableSql);
		this.shouldRunMigrations = runMigrations;
	}

	private async ensureReady(): Promise<void> {
		if (!this.shouldRunMigrations) return;
		this.migrationsPromise ??= runShotlyxSchemaMigrations(this.sql);
		await this.migrationsPromise;
	}

	async createUser(user: ShotlyxUser): Promise<void> {
		await this.ensureReady();
		await this.sql`
			INSERT INTO shotlyx_users (
				id,
				email,
				name,
				password_hash,
				created_at,
				updated_at
			)
			VALUES (
				${user.id},
				${user.email},
				${user.name},
				${user.passwordHash},
				${user.createdAt},
				${user.updatedAt}
			)
		`;
	}

	async findUserByEmail(email: string): Promise<ShotlyxUser | null> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT id, email, name, password_hash, created_at, updated_at
			FROM shotlyx_users
			WHERE email = ${email}
			LIMIT 1
		`;
		return rows[0] ? toUser(rows[0]) : null;
	}

	async findUserById(id: string): Promise<ShotlyxUser | null> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT id, email, name, password_hash, created_at, updated_at
			FROM shotlyx_users
			WHERE id = ${id}
			LIMIT 1
		`;
		return rows[0] ? toUser(rows[0]) : null;
	}

	async listUsers(): Promise<ShotlyxUser[]> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT id, email, name, password_hash, created_at, updated_at
			FROM shotlyx_users
			ORDER BY created_at ASC
		`;
		return rows.map(toUser);
	}

	async createSession(session: ShotlyxSession): Promise<void> {
		await this.ensureReady();
		await this.sql`
			INSERT INTO shotlyx_sessions (
				token,
				user_id,
				created_at,
				expires_at
			)
			VALUES (
				${session.token},
				${session.userId},
				${session.createdAt},
				${session.expiresAt}
			)
		`;
	}

	async findSessionByToken(token: string): Promise<ShotlyxSession | null> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT token, user_id, created_at, expires_at
			FROM shotlyx_sessions
			WHERE token = ${token}
			LIMIT 1
		`;
		return rows[0] ? toSession(rows[0]) : null;
	}

	async saveNewApiKeyBinding({
		shotlyxUserId,
		binding,
	}: {
		shotlyxUserId: string;
		binding: NewApiKeyBinding;
	}): Promise<void> {
		await this.ensureReady();
		await this.sql`
			INSERT INTO shotlyx_new_api_key_bindings (
				shotlyx_user_id,
				new_api_user_id,
				token_id,
				api_key,
				quota,
				updated_at
			)
			VALUES (
				${shotlyxUserId},
				${binding.userId},
				${binding.tokenId},
				${binding.key},
				${binding.quota},
				NOW()
			)
			ON CONFLICT (shotlyx_user_id)
			DO UPDATE SET
				new_api_user_id = EXCLUDED.new_api_user_id,
				token_id = EXCLUDED.token_id,
				api_key = EXCLUDED.api_key,
				quota = EXCLUDED.quota,
				updated_at = NOW()
		`;
	}

	async findNewApiKeyByShotlyxUserId(
		shotlyxUserId: string,
	): Promise<NewApiKeyBinding | null> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT new_api_user_id, token_id, api_key, quota
			FROM shotlyx_new_api_key_bindings
			WHERE shotlyx_user_id = ${shotlyxUserId}
			LIMIT 1
		`;
		return rows[0] ? toNewApiKeyBinding(rows[0]) : null;
	}

	async addLog(entry: ShotlyxLogEntry): Promise<void> {
		await this.ensureReady();
		const metaJson = entry.meta ? JSON.stringify(entry.meta) : null;
		await this.sql`
			INSERT INTO shotlyx_logs (
				id,
				type,
				user_id,
				message,
				created_at,
				meta_json
			)
			VALUES (
				${entry.id},
				${entry.type},
				${entry.userId ?? null},
				${entry.message},
				${entry.createdAt},
				${metaJson}::jsonb
			)
		`;
	}

	async listLogs(): Promise<ShotlyxLogEntry[]> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT id, type, user_id, message, created_at, meta_json
			FROM shotlyx_logs
			ORDER BY created_at ASC
		`;
		return rows.map(toLog);
	}

	async insertCreditLedgerEntryIfAbsent(
		entry: CreditLedgerEntry,
	): Promise<{ entry: CreditLedgerEntry; inserted: boolean }> {
		await this.ensureReady();
		const metaJson = entry.meta ? JSON.stringify(entry.meta) : null;
		const rows = await this.sql`
			INSERT INTO shotlyx_credit_ledger (
				id,
				user_id,
				idempotency_key,
				type,
				amount,
				balance_before,
				balance_after,
				status,
				external_payment_id,
				note,
				created_at,
				updated_at,
				meta_json
			)
			VALUES (
				${entry.id},
				${entry.userId},
				${entry.idempotencyKey},
				${entry.type},
				${entry.amount},
				${entry.balanceBefore},
				${entry.balanceAfter},
				${entry.status},
				${entry.externalPaymentId ?? null},
				${entry.note ?? null},
				${entry.createdAt},
				${entry.updatedAt},
				${metaJson}::jsonb
			)
			ON CONFLICT (idempotency_key) DO NOTHING
			RETURNING
				id,
				user_id,
				idempotency_key,
				type,
				amount,
				balance_before,
				balance_after,
				status,
				external_payment_id,
				note,
				created_at,
				updated_at,
				meta_json
		`;
		if (rows[0]) {
			return { entry: toCreditLedgerEntry(rows[0]), inserted: true };
		}

		const existingRows = await this.sql`
			SELECT
				id,
				user_id,
				idempotency_key,
				type,
				amount,
				balance_before,
				balance_after,
				status,
				external_payment_id,
				note,
				created_at,
				updated_at,
				meta_json
			FROM shotlyx_credit_ledger
			WHERE idempotency_key = ${entry.idempotencyKey}
			LIMIT 1
		`;
		if (!existingRows[0]) {
			throw new Error("credit_ledger_insert_conflict_not_found");
		}
		return {
			entry: toCreditLedgerEntry(existingRows[0]),
			inserted: false,
		};
	}

	async updateCreditLedgerEntry(
		entry: CreditLedgerEntry,
	): Promise<CreditLedgerEntry> {
		await this.ensureReady();
		const metaJson = entry.meta ? JSON.stringify(entry.meta) : null;
		const rows = await this.sql`
			UPDATE shotlyx_credit_ledger
			SET
				amount = ${entry.amount},
				balance_before = ${entry.balanceBefore},
				balance_after = ${entry.balanceAfter},
				status = ${entry.status},
				external_payment_id = ${entry.externalPaymentId ?? null},
				note = ${entry.note ?? null},
				updated_at = ${entry.updatedAt},
				meta_json = ${metaJson}::jsonb
			WHERE id = ${entry.id}
			RETURNING
				id,
				user_id,
				idempotency_key,
				type,
				amount,
				balance_before,
				balance_after,
				status,
				external_payment_id,
				note,
				created_at,
				updated_at,
				meta_json
		`;
		if (!rows[0]) throw new Error("credit_ledger_entry_not_found");
		return toCreditLedgerEntry(rows[0]);
	}

	async listCreditLedgerEntriesByUserId(
		userId: string,
	): Promise<CreditLedgerEntry[]> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT
				id,
				user_id,
				idempotency_key,
				type,
				amount,
				balance_before,
				balance_after,
				status,
				external_payment_id,
				note,
				created_at,
				updated_at,
				meta_json
			FROM shotlyx_credit_ledger
			WHERE user_id = ${userId}
			ORDER BY created_at ASC
		`;
		return rows.map(toCreditLedgerEntry);
	}

	async createPaymentOrder(order: PaymentOrder): Promise<void> {
		await this.ensureReady();
		const metaJson = order.meta ? JSON.stringify(order.meta) : null;
		await this.sql`
			INSERT INTO shotlyx_payment_orders (
				id,
				provider,
				user_id,
				out_trade_no,
				credits,
				money_cents,
				pay_type,
				status,
				provider_trade_no,
				created_at,
				updated_at,
				paid_at,
				meta_json
			)
			VALUES (
				${order.id},
				${order.provider},
				${order.userId},
				${order.outTradeNo},
				${order.credits},
				${order.moneyCents},
				${order.payType},
				${order.status},
				${order.providerTradeNo ?? null},
				${order.createdAt},
				${order.updatedAt},
				${order.paidAt ?? null},
				${metaJson}::jsonb
			)
		`;
	}

	async findPaymentOrderByOutTradeNo(
		outTradeNo: string,
	): Promise<PaymentOrder | null> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT
				id,
				provider,
				user_id,
				out_trade_no,
				credits,
				money_cents,
				pay_type,
				status,
				provider_trade_no,
				created_at,
				updated_at,
				paid_at,
				meta_json
			FROM shotlyx_payment_orders
			WHERE out_trade_no = ${outTradeNo}
			LIMIT 1
		`;
		return rows[0] ? toPaymentOrder(rows[0]) : null;
	}

	async updatePaymentOrder(order: PaymentOrder): Promise<PaymentOrder> {
		await this.ensureReady();
		const metaJson = order.meta ? JSON.stringify(order.meta) : null;
		const rows = await this.sql`
			UPDATE shotlyx_payment_orders
			SET
				status = ${order.status},
				provider_trade_no = ${order.providerTradeNo ?? null},
				updated_at = ${order.updatedAt},
				paid_at = ${order.paidAt ?? null},
				meta_json = ${metaJson}::jsonb
			WHERE out_trade_no = ${order.outTradeNo}
			RETURNING
				id,
				provider,
				user_id,
				out_trade_no,
				credits,
				money_cents,
				pay_type,
				status,
				provider_trade_no,
				created_at,
				updated_at,
				paid_at,
				meta_json
		`;
		if (!rows[0]) throw new Error("payment_order_not_found");
		return toPaymentOrder(rows[0]);
	}

	async listPaymentOrdersByUserId(userId: string): Promise<PaymentOrder[]> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT
				id,
				provider,
				user_id,
				out_trade_no,
				credits,
				money_cents,
				pay_type,
				status,
				provider_trade_no,
				created_at,
				updated_at,
				paid_at,
				meta_json
			FROM shotlyx_payment_orders
			WHERE user_id = ${userId}
			ORDER BY created_at ASC
		`;
		return rows.map(toPaymentOrder);
	}

	async upsertProject(project: SyncedProject): Promise<void> {
		await this.ensureReady();
		await this.sql`
			INSERT INTO shotlyx_projects (
				id,
				user_id,
				name,
				metadata_json,
				project_json,
				created_at,
				updated_at
			)
			VALUES (
				${project.id},
				${project.userId},
				${project.name},
				${JSON.stringify(project.metadata)}::jsonb,
				${JSON.stringify(project.project)}::jsonb,
				${project.createdAt},
				${project.updatedAt}
			)
			ON CONFLICT (id)
			DO UPDATE SET
				name = EXCLUDED.name,
				metadata_json = EXCLUDED.metadata_json,
				project_json = EXCLUDED.project_json,
				updated_at = EXCLUDED.updated_at
			WHERE shotlyx_projects.user_id = EXCLUDED.user_id
		`;
	}

	async findProjectByUserId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<SyncedProject | null> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT id, user_id, name, metadata_json, project_json, created_at, updated_at
			FROM shotlyx_projects
			WHERE user_id = ${userId} AND id = ${projectId}
			LIMIT 1
		`;
		return rows[0] ? toSyncedProject(rows[0]) : null;
	}

	async listProjectsByUserId(userId: string): Promise<SyncedProject[]> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT id, user_id, name, metadata_json, project_json, created_at, updated_at
			FROM shotlyx_projects
			WHERE user_id = ${userId}
			ORDER BY updated_at DESC
		`;
		return rows.map(toSyncedProject);
	}

	async deleteProjectByUserId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<void> {
		await this.ensureReady();
		await this.sql`
			DELETE FROM shotlyx_projects
			WHERE user_id = ${userId} AND id = ${projectId}
		`;
		await this.deleteMediaAssetsByProjectId({ userId, projectId });
	}

	async upsertMediaAsset(asset: SyncedMediaAsset): Promise<void> {
		await this.ensureReady();
		await this.sql`
			INSERT INTO shotlyx_media_assets (
				id,
				user_id,
				project_id,
				name,
				media_type,
				mime_type,
				size_bytes,
				object_key,
				upload_status,
				created_at,
				updated_at,
				uploaded_at,
				expires_at
			)
			VALUES (
				${asset.id},
				${asset.userId},
				${asset.projectId},
				${asset.name},
				${asset.mediaType},
				${asset.mimeType},
				${asset.sizeBytes},
				${asset.objectKey ?? null},
				${asset.uploadStatus},
				${asset.createdAt},
				${asset.updatedAt},
				${asset.uploadedAt ?? null},
				${asset.expiresAt ?? null}
			)
			ON CONFLICT (id)
			DO UPDATE SET
				name = EXCLUDED.name,
				media_type = EXCLUDED.media_type,
				mime_type = EXCLUDED.mime_type,
				size_bytes = EXCLUDED.size_bytes,
				object_key = EXCLUDED.object_key,
				upload_status = EXCLUDED.upload_status,
				updated_at = EXCLUDED.updated_at,
				uploaded_at = EXCLUDED.uploaded_at,
				expires_at = EXCLUDED.expires_at
			WHERE shotlyx_media_assets.user_id = EXCLUDED.user_id
				AND shotlyx_media_assets.project_id = EXCLUDED.project_id
		`;
	}

	async findMediaAssetByUserId({
		userId,
		projectId,
		assetId,
	}: {
		userId: string;
		projectId: string;
		assetId: string;
	}): Promise<SyncedMediaAsset | null> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT
				id,
				user_id,
				project_id,
				name,
				media_type,
				mime_type,
				size_bytes,
				object_key,
				upload_status,
				created_at,
				updated_at,
				uploaded_at,
				expires_at
			FROM shotlyx_media_assets
			WHERE user_id = ${userId} AND project_id = ${projectId} AND id = ${assetId}
			LIMIT 1
		`;
		return rows[0] ? toSyncedMediaAsset(rows[0]) : null;
	}

	async listMediaAssetsByProjectId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<SyncedMediaAsset[]> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT
				id,
				user_id,
				project_id,
				name,
				media_type,
				mime_type,
				size_bytes,
				object_key,
				upload_status,
				created_at,
				updated_at,
				uploaded_at,
				expires_at
			FROM shotlyx_media_assets
			WHERE user_id = ${userId} AND project_id = ${projectId}
			ORDER BY updated_at DESC
		`;
		return rows.map(toSyncedMediaAsset);
	}

	async deleteMediaAssetsByProjectId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<void> {
		await this.ensureReady();
		await this.sql`
			DELETE FROM shotlyx_media_assets
			WHERE user_id = ${userId} AND project_id = ${projectId}
		`;
	}

	async getSettings(): Promise<ServerSettings> {
		await this.ensureReady();
		const rows = await this.sql`
			SELECT new_api_base_url, initial_quota, callback_secret_set
			FROM shotlyx_server_settings
			WHERE id = 'default'
			LIMIT 1
		`;
		return rows[0] ? toSettings(rows[0]) : { ...DEFAULT_SETTINGS };
	}

	async updateSettings(
		settings: Partial<ServerSettings>,
	): Promise<ServerSettings> {
		await this.ensureReady();
		const current = await this.getSettings();
		const next = { ...current, ...settings };
		const rows = await this.sql`
			INSERT INTO shotlyx_server_settings (
				id,
				new_api_base_url,
				initial_quota,
				callback_secret_set,
				updated_at
			)
			VALUES (
				'default',
				${next.newApiBaseUrl},
				${next.initialQuota},
				${next.callbackSecretSet},
				NOW()
			)
			ON CONFLICT (id)
			DO UPDATE SET
				new_api_base_url = EXCLUDED.new_api_base_url,
				initial_quota = EXCLUDED.initial_quota,
				callback_secret_set = EXCLUDED.callback_secret_set,
				updated_at = NOW()
			RETURNING new_api_base_url, initial_quota, callback_secret_set
		`;
		return rows[0] ? toSettings(rows[0]) : next;
	}

	async close(): Promise<void> {
		await this.sql.end?.();
	}
}
