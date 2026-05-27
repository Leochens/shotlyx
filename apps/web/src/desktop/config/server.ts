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
	configured: boolean;
	required: boolean;
	fields: DesktopConfigStatusItem[];
}

const CONFIG_VERSION = 1;

export function isDesktopMode(): boolean {
	return (
		process.env.SHOTLYX_DESKTOP === "1" ||
		process.env.NEXT_PUBLIC_SHOTLYX_DESKTOP === "1"
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
	return result;
}

export function readDesktopApiConfig(): DesktopApiConfigFile {
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

export function writeDesktopApiConfig(
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

export function getRuntimeEnv(): NodeJS.ProcessEnv {
	if (!isDesktopMode()) return process.env;
	return {
		...process.env,
		...desktopValuesToEnv(readDesktopApiConfig().values),
	};
}

export function applyDesktopConfigToProcessEnv(): void {
	if (!isDesktopMode()) return;
	const env = desktopValuesToEnv(readDesktopApiConfig().values);
	for (const [key, value] of Object.entries(env)) {
		if (value) {
			process.env[key] = value;
		}
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
		const required = group.id === "agent-llm";
		const configured = required
			? Boolean(envValues.AGENT_LLM_KEY)
			: fields.some((field) => field.configured);
		return {
			id: group.id,
			title: group.title,
			configured,
			required,
			fields,
		};
	});
}
