import { describe, expect, test } from "bun:test";
import { PostgresShotlyxStore } from "./postgres-store";
import { InMemoryShotlyxStore } from "./store";
import {
	createDefaultShotlyxStore,
	resolveDefaultStoreMode,
} from "./store-factory";

describe("Shotlyx store factory", () => {
	test("uses the in-memory store only for non-production local runs without DATABASE_URL", () => {
		expect(
			createDefaultShotlyxStore({
				DATABASE_URL: "",
				NODE_ENV: "development",
			}),
		).toBeInstanceOf(InMemoryShotlyxStore);
		expect(
			resolveDefaultStoreMode({
				DATABASE_URL: "",
				NODE_ENV: "test",
			}),
		).toBe("memory");
	});

	test("requires DATABASE_URL in production", () => {
		expect(() =>
			createDefaultShotlyxStore({
				DATABASE_URL: "",
				NODE_ENV: "production",
			}),
		).toThrow("DATABASE_URL is required");
	});

	test("uses Postgres when DATABASE_URL is configured", () => {
		expect(
			createDefaultShotlyxStore({
				DATABASE_URL: "postgresql://shotlyx:shotlyx@localhost:5432/shotlyx",
				NODE_ENV: "production",
			}),
		).toBeInstanceOf(PostgresShotlyxStore);
	});
});
