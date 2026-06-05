import postgres from "postgres";
import { runShotlyxSchemaMigrations } from "./postgres-schema";
import type {
	NewApiKeyBinding,
	ServerSettings,
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

function readJsonMeta(row: Row): Record<string, unknown> | undefined {
	const value = row.meta_json;
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
