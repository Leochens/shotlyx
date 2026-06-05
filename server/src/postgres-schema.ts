import type { QueryableSql } from "./postgres-store";

export const REQUIRED_SHOTLYX_TABLES = [
	"shotlyx_users",
	"shotlyx_sessions",
	"shotlyx_new_api_key_bindings",
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
