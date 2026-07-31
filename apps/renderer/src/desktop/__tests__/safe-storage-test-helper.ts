import path from "node:path";

export function installTestSafeStorage({
	directory,
}: {
	directory: string;
}): () => void {
	const original = globalThis.__SHOTLYX_SAFE_STORAGE__;
	process.env.SHOTLYX_DESKTOP_SECRETS_PATH = path.join(
		directory,
		"secrets.json",
	);
	globalThis.__SHOTLYX_SAFE_STORAGE__ = {
		isEncryptionAvailable: () => true,
		encryptString: (value) =>
			Buffer.from(`shotlyx-test:${value}`, "utf8").toString("base64"),
		decryptString: (value) => {
			const decoded = Buffer.from(value, "base64").toString("utf8");
			if (!decoded.startsWith("shotlyx-test:")) {
				throw new Error("Invalid test ciphertext");
			}
			return decoded.slice("shotlyx-test:".length);
		},
	};
	return () => {
		globalThis.__SHOTLYX_SAFE_STORAGE__ = original;
	};
}
