import { PostgresShotlyxStore } from "./postgres-store";
import { InMemoryShotlyxStore } from "./store";
import type { ShotlyxStore } from "./types";

export type StoreFactoryEnv = {
	DATABASE_URL?: string;
	NODE_ENV?: string;
};

export type DefaultStoreMode = "memory" | "postgres";

function normalizeDatabaseUrl(value: string | undefined): string {
	return value?.trim() ?? "";
}

export function resolveDefaultStoreMode(
	env: StoreFactoryEnv = process.env,
): DefaultStoreMode {
	if (normalizeDatabaseUrl(env.DATABASE_URL)) return "postgres";
	if (env.NODE_ENV === "production") {
		throw new Error("DATABASE_URL is required for Shotlyx Server production");
	}
	return "memory";
}

export function createDefaultShotlyxStore(
	env: StoreFactoryEnv = process.env,
): ShotlyxStore {
	const mode = resolveDefaultStoreMode(env);
	if (mode === "postgres") {
		return new PostgresShotlyxStore({
			databaseUrl: normalizeDatabaseUrl(env.DATABASE_URL),
		});
	}
	return new InMemoryShotlyxStore();
}
