import type { QueryableSql } from "./postgres-store";

export const REQUIRED_SHOTLYX_TABLES = [
	"shotlyx_users",
	"shotlyx_sessions",
	"shotlyx_new_api_key_bindings",
	"shotlyx_payment_orders",
	"shotlyx_credit_ledger",
	"shotlyx_projects",
	"shotlyx_media_assets",
	"shotlyx_logs",
	"shotlyx_server_settings",
] as const;

export const CREATE_SHOTLYX_SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS shotlyx_users (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_sessions (
		token TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES shotlyx_users(id) ON DELETE CASCADE,
		created_at TIMESTAMPTZ NOT NULL,
		expires_at TIMESTAMPTZ NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS shotlyx_sessions_user_id_idx
		ON shotlyx_sessions(user_id)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_new_api_key_bindings (
		shotlyx_user_id TEXT PRIMARY KEY REFERENCES shotlyx_users(id) ON DELETE CASCADE,
		new_api_user_id TEXT NOT NULL,
		token_id TEXT NOT NULL,
		api_key TEXT NOT NULL,
		quota BIGINT NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_payment_orders (
		id TEXT PRIMARY KEY,
		provider TEXT NOT NULL,
		user_id TEXT NOT NULL REFERENCES shotlyx_users(id) ON DELETE CASCADE,
		out_trade_no TEXT NOT NULL UNIQUE,
		credits BIGINT NOT NULL,
		money_cents BIGINT NOT NULL,
		pay_type TEXT NOT NULL,
		status TEXT NOT NULL,
		provider_trade_no TEXT,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL,
		paid_at TIMESTAMPTZ,
		meta_json JSONB
	)`,
	`CREATE INDEX IF NOT EXISTS shotlyx_payment_orders_user_id_idx
		ON shotlyx_payment_orders(user_id, created_at ASC)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_credit_ledger (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES shotlyx_users(id) ON DELETE CASCADE,
		idempotency_key TEXT NOT NULL UNIQUE,
		type TEXT NOT NULL,
		amount BIGINT NOT NULL,
		balance_before BIGINT NOT NULL,
		balance_after BIGINT NOT NULL,
		status TEXT NOT NULL,
		external_payment_id TEXT,
		note TEXT,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL,
		meta_json JSONB
	)`,
	`CREATE INDEX IF NOT EXISTS shotlyx_credit_ledger_user_id_idx
		ON shotlyx_credit_ledger(user_id, created_at ASC)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_projects (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES shotlyx_users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		metadata_json JSONB NOT NULL,
		project_json JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS shotlyx_projects_user_id_updated_at_idx
		ON shotlyx_projects(user_id, updated_at DESC)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_media_assets (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES shotlyx_users(id) ON DELETE CASCADE,
		project_id TEXT NOT NULL,
		name TEXT NOT NULL,
		media_type TEXT NOT NULL,
		mime_type TEXT NOT NULL,
		size_bytes BIGINT NOT NULL,
		metadata_json JSONB NOT NULL DEFAULT '{}',
		object_key TEXT,
		upload_status TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL,
		uploaded_at TIMESTAMPTZ,
		expires_at TIMESTAMPTZ
	)`,
	`ALTER TABLE shotlyx_media_assets
		ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'`,
	`CREATE INDEX IF NOT EXISTS shotlyx_media_assets_project_id_idx
		ON shotlyx_media_assets(user_id, project_id, updated_at DESC)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_logs (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		user_id TEXT REFERENCES shotlyx_users(id) ON DELETE SET NULL,
		message TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		meta_json JSONB
	)`,
	`CREATE INDEX IF NOT EXISTS shotlyx_logs_created_at_idx
		ON shotlyx_logs(created_at DESC)`,
	`CREATE TABLE IF NOT EXISTS shotlyx_server_settings (
		id TEXT PRIMARY KEY,
		new_api_base_url TEXT NOT NULL DEFAULT '',
		initial_quota BIGINT NOT NULL DEFAULT 100000,
		callback_secret_set BOOLEAN NOT NULL DEFAULT FALSE,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
	`INSERT INTO shotlyx_server_settings (
		id,
		new_api_base_url,
		initial_quota,
		callback_secret_set
	)
	VALUES ('default', '', 100000, FALSE)
	ON CONFLICT (id) DO NOTHING`,
] as const;

export const CREATE_SHOTLYX_SCHEMA_SQL =
	CREATE_SHOTLYX_SCHEMA_STATEMENTS.join(";\n\n");

export async function runShotlyxSchemaMigrations(
	sql: QueryableSql,
): Promise<void> {
	if (!sql.unsafe) {
		throw new Error("postgres_sql_unsafe_required_for_migrations");
	}
	for (const statement of CREATE_SHOTLYX_SCHEMA_STATEMENTS) {
		await sql.unsafe(statement);
	}
}
