import { describe, expect, test } from "bun:test";
import {
	CREATE_SHOTLYX_SCHEMA_SQL,
	REQUIRED_SHOTLYX_TABLES,
} from "./postgres-schema";

describe("Shotlyx Postgres schema", () => {
	test("creates the production persistence tables", () => {
		expect(REQUIRED_SHOTLYX_TABLES).toEqual([
			"shotlyx_users",
			"shotlyx_sessions",
			"shotlyx_new_api_key_bindings",
			"shotlyx_payment_orders",
			"shotlyx_credit_ledger",
			"shotlyx_projects",
			"shotlyx_media_assets",
			"shotlyx_logs",
			"shotlyx_server_settings",
		]);

		for (const table of REQUIRED_SHOTLYX_TABLES) {
			expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain(
				`CREATE TABLE IF NOT EXISTS ${table}`,
			);
		}
	});

	test("keeps the New API token binding one-to-one with a Shotlyx user", () => {
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain(
			"PRIMARY KEY REFERENCES shotlyx_users(id)",
		);
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain("api_key TEXT NOT NULL");
	});

	test("keeps credit top-up callbacks idempotent", () => {
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain(
			"idempotency_key TEXT NOT NULL UNIQUE",
		);
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain(
			"out_trade_no TEXT NOT NULL UNIQUE",
		);
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain(
			"CREATE TABLE IF NOT EXISTS shotlyx_credit_ledger",
		);
	});

	test("adds cloud project and media asset sync tables", () => {
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain(
			"CREATE TABLE IF NOT EXISTS shotlyx_projects",
		);
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain("project_json JSONB NOT NULL");
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain(
			"CREATE TABLE IF NOT EXISTS shotlyx_media_assets",
		);
		expect(CREATE_SHOTLYX_SCHEMA_SQL).toContain("object_key TEXT");
	});
});
