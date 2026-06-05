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
});
