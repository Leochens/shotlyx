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
	isDesktopApiFieldKey,
	isSecretDesktopApiField,
} from "@/desktop/config/catalog";

type SecretValues = Partial<Record<string, string>>;

interface EncryptedSecretsFile {
	version: 1;
	values: Record<string, string>;
	updatedAt: string;
}

interface SafeStorageBridge {
	decryptString(value: string): string;
	encryptString(value: string): string;
	isEncryptionAvailable(): boolean;
}

declare global {
	// Installed by the Electron main process before the local API bundle loads.
	var __SHOTLYX_SAFE_STORAGE__: SafeStorageBridge | undefined;
}

const FILE_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBridge(): SafeStorageBridge | null {
	const bridge = globalThis.__SHOTLYX_SAFE_STORAGE__;
	if (
		!bridge ||
		typeof bridge.decryptString !== "function" ||
		typeof bridge.encryptString !== "function" ||
		typeof bridge.isEncryptionAvailable !== "function"
	) {
		return null;
	}
	return bridge;
}

export function isDesktopSecretStorageAvailable(): boolean {
	try {
		return getBridge()?.isEncryptionAvailable() === true;
	} catch {
		return false;
	}
}

export function getDesktopSecretsPath(): string {
	return (
		process.env.SHOTLYX_DESKTOP_SECRETS_PATH ??
		path.join(homedir(), ".shotlyx", "desktop-api-secrets.json")
	);
}

function normalizeSecrets(values: unknown): SecretValues {
	if (!isRecord(values)) return {};
	const result: SecretValues = {};
	for (const [key, value] of Object.entries(values)) {
		if (
			!isDesktopApiFieldKey(key) ||
			!isSecretDesktopApiField(key) ||
			typeof value !== "string"
		) {
			continue;
		}
		const trimmed = value.trim();
		if (trimmed) result[key] = trimmed;
	}
	return result;
}

export function readDesktopSecrets(): SecretValues {
	const bridge = getBridge();
	if (!bridge?.isEncryptionAvailable()) return {};
	const filePath = getDesktopSecretsPath();
	if (!existsSync(filePath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
		if (!isRecord(parsed) || !isRecord(parsed.values)) return {};
		const result: SecretValues = {};
		for (const [key, encrypted] of Object.entries(parsed.values)) {
			if (
				!isDesktopApiFieldKey(key) ||
				!isSecretDesktopApiField(key) ||
				typeof encrypted !== "string" ||
				!encrypted
			) {
				continue;
			}
			try {
				const decrypted = bridge.decryptString(encrypted).trim();
				if (decrypted) result[key] = decrypted;
			} catch {
				console.warn(`[desktop-config] Could not decrypt ${key}.`);
			}
		}
		return result;
	} catch {
		return {};
	}
}

export function writeDesktopSecrets(
	values: SecretValues,
): EncryptedSecretsFile {
	const normalized = normalizeSecrets(values);
	const bridge = getBridge();
	if (Object.keys(normalized).length > 0 && !bridge?.isEncryptionAvailable()) {
		throw new Error("desktop_safe_storage_unavailable");
	}
	const encryptedValues: Record<string, string> = {};
	if (bridge?.isEncryptionAvailable()) {
		for (const [key, value] of Object.entries(normalized)) {
			if (value) encryptedValues[key] = bridge.encryptString(value);
		}
	}
	const file = {
		version: FILE_VERSION,
		values: encryptedValues,
		updatedAt: new Date().toISOString(),
	} satisfies EncryptedSecretsFile;
	const filePath = getDesktopSecretsPath();
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`, {
		mode: 0o600,
	});
	try {
		chmodSync(filePath, 0o600);
	} catch {
		// Some filesystems do not expose POSIX permissions.
	}
	return file;
}

export function pickSecretValues(values: SecretValues): SecretValues {
	return normalizeSecrets(values);
}
