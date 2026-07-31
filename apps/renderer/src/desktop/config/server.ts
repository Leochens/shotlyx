import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
	DESKTOP_API_FIELD_KEYS,
	DESKTOP_API_FIELDS,
	DESKTOP_API_GROUPS,
	isDesktopApiFieldKey,
	isSecretDesktopApiField,
} from "./catalog";
import {
	isDesktopSecretStorageAvailable,
	pickSecretValues,
	readDesktopSecrets,
	writeDesktopSecrets,
} from "./safe-storage";

export type DesktopApiValues = Partial<Record<string, string>>;

export interface DesktopApiConfigFile {
	version: 1;
	values: DesktopApiValues;
	updatedAt: string;
}

export interface DesktopConfigStatusItem {
	key: string;
	label: string;
	configured: boolean;
	secret: boolean;
}

export interface DesktopConfigStatusGroup {
	id: string;
	title: string;
	tier: "core" | "experimental";
	configured: boolean;
	required: boolean;
	fields: DesktopConfigStatusItem[];
}

const CONFIG_VERSION = 1;
const MINIMAX_TOKEN_PLAN_HOST = "https://api.minimaxi.com/v1";
const MINIMAX_LEGACY_GLOBAL_HOST = "https://api.minimax.io/v1";
const appliedDesktopEnvOriginals = new Map<string, string | undefined>();

export function isDesktopMode(): boolean {
	return (
		process.env.SHOTLYX_DESKTOP === "1" ||
		process.env.VITE_SHOTLYX_DESKTOP === "1"
	);
}

export function getDesktopConfigPath(): string {
	return (
		process.env.SHOTLYX_DESKTOP_CONFIG_PATH ??
		path.join(homedir(), ".shotlyx", "desktop-api-config.json")
	);
}

function normalizeValues(values: unknown): DesktopApiValues {
	if (typeof values !== "object" || values === null || Array.isArray(values)) {
		return {};
	}

	const result: DesktopApiValues = {};
	for (const [key, value] of Object.entries(values)) {
		if (!isDesktopApiFieldKey(key) || typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) {
			result[key] = trimmed;
		}
	}
	if (
		result.AGENT_VISION_KEY?.startsWith("sk-cp-") &&
		result.AGENT_VISION_HOST === MINIMAX_LEGACY_GLOBAL_HOST
	) {
		result.AGENT_VISION_HOST = MINIMAX_TOKEN_PLAN_HOST;
	}
	return result;
}

function readDesktopApiConfigFile(): DesktopApiConfigFile {
	const configPath = getDesktopConfigPath();
	if (!existsSync(configPath)) {
		return {
			version: CONFIG_VERSION,
			values: {},
			updatedAt: new Date(0).toISOString(),
		};
	}

	try {
		const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			throw new Error("Invalid desktop config file");
		}
		const maybeConfig = raw as Partial<DesktopApiConfigFile>;
		return {
			version: CONFIG_VERSION,
			values: normalizeValues(maybeConfig.values),
			updatedAt:
				typeof maybeConfig.updatedAt === "string"
					? maybeConfig.updatedAt
					: new Date(0).toISOString(),
		};
	} catch {
		return {
			version: CONFIG_VERSION,
			values: {},
			updatedAt: new Date(0).toISOString(),
		};
	}
}

function writeDesktopApiConfigFile(
	values: DesktopApiValues,
): DesktopApiConfigFile {
	const configPath = getDesktopConfigPath();
	mkdirSync(path.dirname(configPath), { recursive: true });
	const config = {
		version: CONFIG_VERSION,
		values: normalizeValues(values),
		updatedAt: new Date().toISOString(),
	} satisfies DesktopApiConfigFile;
	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
		mode: 0o600,
	});
	try {
		chmodSync(configPath, 0o600);
	} catch {
		// Best effort on platforms that support POSIX permissions.
	}
	return config;
}

function omitSecretValues(values: DesktopApiValues): DesktopApiValues {
	return Object.fromEntries(
		Object.entries(values).filter(([key]) => !isSecretDesktopApiField(key)),
	);
}

export function readDesktopApiConfig(): DesktopApiConfigFile {
	const stored = readDesktopApiConfigFile();
	const publicValues = omitSecretValues(stored.values);
	const legacySecrets = pickSecretValues(stored.values);
	let secrets = readDesktopSecrets();

	if (
		Object.keys(legacySecrets).length > 0 &&
		isDesktopSecretStorageAvailable()
	) {
		secrets = { ...secrets, ...legacySecrets };
		writeDesktopSecrets(secrets);
		const migrated = writeDesktopApiConfigFile(publicValues);
		return {
			...migrated,
			values: { ...publicValues, ...secrets },
		};
	}

	return {
		...stored,
		values: {
			...publicValues,
			...secrets,
			...(isDesktopSecretStorageAvailable() ? {} : legacySecrets),
		},
	};
}

export function writeDesktopApiConfig(
	values: DesktopApiValues,
): DesktopApiConfigFile {
	const normalized = normalizeValues(values);
	const secrets = pickSecretValues(normalized);
	const publicValues = omitSecretValues(normalized);
	writeDesktopSecrets(secrets);
	const config = writeDesktopApiConfigFile(publicValues);
	return {
		...config,
		values: { ...publicValues, ...secrets },
	};
}

export function mergeDesktopApiConfig({
	values,
	clear = [],
}: {
	values: DesktopApiValues;
	clear?: string[];
}): DesktopApiConfigFile {
	const current = readDesktopApiConfig().values;
	const next: DesktopApiValues = { ...current };

	for (const key of clear) {
		if (isDesktopApiFieldKey(key)) {
			delete next[key];
		}
	}

	for (const [key, value] of Object.entries(values)) {
		if (!isDesktopApiFieldKey(key)) continue;
		const trimmed = typeof value === "string" ? value.trim() : "";
		if (!trimmed) continue;
		next[key] = trimmed;
	}

	return writeDesktopApiConfig(next);
}

export function desktopValuesToEnv(values: DesktopApiValues): DesktopApiValues {
	const env: DesktopApiValues = {};
	for (const field of DESKTOP_API_FIELDS) {
		const value = values[field.key] ?? field.defaultValue;
		if (value) {
			env[field.env] = value;
		}
	}
	return env;
}

function desktopSavedValuesToEnv(values: DesktopApiValues): DesktopApiValues {
	const env: DesktopApiValues = {};
	for (const field of DESKTOP_API_FIELDS) {
		const value = values[field.key];
		if (value) {
			env[field.env] = value;
		}
	}
	return env;
}

export function getRuntimeEnv(): NodeJS.ProcessEnv {
	if (!isDesktopMode()) return process.env;
	const values = readDesktopApiConfig().values;
	return {
		...desktopValuesToEnv(values),
		...process.env,
		...desktopSavedValuesToEnv(values),
	};
}

export function applyDesktopConfigToProcessEnv(): void {
	if (!isDesktopMode()) return;
	const values = readDesktopApiConfig().values;
	const defaults = desktopValuesToEnv(values);
	const saved = desktopSavedValuesToEnv(values);
	const nextAppliedKeys = new Set<string>();
	for (const [key, value] of Object.entries(defaults)) {
		if (
			value &&
			(saved[key] !== undefined ||
				appliedDesktopEnvOriginals.has(key) ||
				process.env[key] === undefined)
		) {
			if (!appliedDesktopEnvOriginals.has(key)) {
				appliedDesktopEnvOriginals.set(key, process.env[key]);
			}
			process.env[key] = value;
			nextAppliedKeys.add(key);
		}
	}
	for (const [key, value] of Object.entries(saved)) {
		if (value) {
			if (!appliedDesktopEnvOriginals.has(key)) {
				appliedDesktopEnvOriginals.set(key, process.env[key]);
			}
			process.env[key] = value;
			nextAppliedKeys.add(key);
		}
	}
	for (const [key, originalValue] of appliedDesktopEnvOriginals) {
		if (nextAppliedKeys.has(key)) continue;
		if (originalValue === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = originalValue;
		}
		appliedDesktopEnvOriginals.delete(key);
	}
}

export function getPublicDesktopApiValues(values: DesktopApiValues) {
	return Object.fromEntries(
		DESKTOP_API_FIELD_KEYS.map((key) => [
			key,
			isSecretDesktopApiField(key) ? "" : (values[key] ?? ""),
		]),
	) as DesktopApiValues;
}

export function getDesktopConfigStatus(
	values: DesktopApiValues = readDesktopApiConfig().values,
): DesktopConfigStatusGroup[] {
	const envValues = desktopValuesToEnv(values);
	const agentRuntime =
		envValues.AGENT_RUNTIME === "local-cli" ? "local-cli" : "api";

	return DESKTOP_API_GROUPS.map((group) => {
		const fields = group.fields.map((field) => {
			const value = envValues[field.env];
			return {
				key: field.key,
				label: field.label,
				configured: Boolean(value),
				secret: Boolean(field.secret),
			};
		});
		const required =
			group.id === "agent-runtime" ||
			(group.id === "agent-llm" && agentRuntime !== "local-cli");
		const configured =
			group.id === "agent-runtime"
				? agentRuntime === "local-cli"
					? Boolean(envValues.AGENT_CLI_ID)
					: true
				: group.id === "agent-llm"
					? agentRuntime === "local-cli"
						? false
						: Boolean(envValues.AGENT_LLM_KEY)
					: fields.some((field) => field.configured);
		return {
			id: group.id,
			title: group.title,
			tier: group.tier,
			configured,
			required,
			fields,
		};
	});
}

export function hasRequiredDesktopConfig(
	values: DesktopApiValues = readDesktopApiConfig().values,
): boolean {
	const requiredGroups = getDesktopConfigStatus(values).filter(
		(group) => group.required,
	);
	return (
		requiredGroups.length > 0 &&
		requiredGroups.every((group) => group.configured)
	);
}
