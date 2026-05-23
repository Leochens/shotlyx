import type { PersistStorage, StorageValue } from "zustand/middleware";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface PersistedRecord<T> {
	id: string;
	value: StorageValue<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isStorageValue<T>(value: unknown): value is StorageValue<T> {
	return (
		isRecord(value) &&
		"state" in value &&
		(!("version" in value) || typeof value.version === "number")
	);
}

function isPersistedRecord<T>(value: unknown): value is PersistedRecord<T> {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		isStorageValue<T>(value.value)
	);
}

function getNoopStorage<T>(): PersistStorage<T, Promise<void>> {
	return {
		getItem: async () => null,
		setItem: async () => {},
		removeItem: async () => {},
	};
}

function parseStorageValue<T>({
	raw,
}: {
	raw: string | null;
}): StorageValue<T> | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (isStorageValue<T>(parsed)) return parsed;
		return null;
	} catch {
		return null;
	}
}

function readLegacyItem<T>({
	name,
	legacyStorage,
}: {
	name: string;
	legacyStorage: BrowserStorage | null;
}): StorageValue<T> | null {
	if (!legacyStorage) return null;
	try {
		return parseStorageValue<T>({ raw: legacyStorage.getItem(name) });
	} catch {
		return null;
	}
}

function writeLegacyItem<T>({
	name,
	value,
	legacyStorage,
}: {
	name: string;
	value: StorageValue<T>;
	legacyStorage: BrowserStorage | null;
}): void {
	if (!legacyStorage) return;
	try {
		legacyStorage.setItem(name, JSON.stringify(value));
	} catch {
		// Persisting chat history should not break the active chat interaction.
	}
}

function removeLegacyItem({
	name,
	legacyStorage,
}: {
	name: string;
	legacyStorage: BrowserStorage | null;
}): void {
	if (!legacyStorage) return;
	try {
		legacyStorage.removeItem(name);
	} catch {
		// Ignore unavailable storage.
	}
}

function openDatabase({
	dbName,
	storeName,
}: {
	dbName: string;
	storeName: string;
}): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(dbName, 1);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(storeName)) {
				db.createObjectStore(storeName, { keyPath: "id" });
			}
		};
	});
}

async function readIndexedDBItem<T>({
	dbName,
	storeName,
	name,
}: {
	dbName: string;
	storeName: string;
	name: string;
}): Promise<StorageValue<T> | null> {
	const db = await openDatabase({ dbName, storeName });
	return new Promise((resolve, reject) => {
		const transaction = db.transaction([storeName], "readonly");
		const store = transaction.objectStore(storeName);
		const request = store.get(name);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const record: unknown = request.result;
			resolve(isPersistedRecord<T>(record) ? record.value : null);
		};
	});
}

async function writeIndexedDBItem<T>({
	dbName,
	storeName,
	name,
	value,
}: {
	dbName: string;
	storeName: string;
	name: string;
	value: StorageValue<T>;
}): Promise<void> {
	const db = await openDatabase({ dbName, storeName });
	return new Promise((resolve, reject) => {
		const transaction = db.transaction([storeName], "readwrite");
		const store = transaction.objectStore(storeName);
		const request = store.put({ id: name, value } satisfies PersistedRecord<T>);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

async function removeIndexedDBItem({
	dbName,
	storeName,
	name,
}: {
	dbName: string;
	storeName: string;
	name: string;
}): Promise<void> {
	const db = await openDatabase({ dbName, storeName });
	return new Promise((resolve, reject) => {
		const transaction = db.transaction([storeName], "readwrite");
		const store = transaction.objectStore(storeName);
		const request = store.delete(name);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

export function createIndexedDBPersistStorage<T>({
	dbName,
	storeName,
	legacyStorage,
}: {
	dbName: string;
	storeName: string;
	legacyStorage: BrowserStorage | null;
}): PersistStorage<T, Promise<void>> {
	if (typeof window === "undefined" || typeof indexedDB === "undefined") {
		return getNoopStorage<T>();
	}

	return {
		getItem: async (name) => {
			try {
				const persisted = await readIndexedDBItem<T>({
					dbName,
					storeName,
					name,
				});
				if (persisted) return persisted;
			} catch {
				return readLegacyItem<T>({ name, legacyStorage });
			}

			const legacyValue = readLegacyItem<T>({ name, legacyStorage });
			if (!legacyValue) return null;

			try {
				await writeIndexedDBItem<T>({
					dbName,
					storeName,
					name,
					value: legacyValue,
				});
				removeLegacyItem({ name, legacyStorage });
			} catch {
				// If migration cannot finish, keep using the legacy value for this load.
			}

			return legacyValue;
		},
			// PersistStorage follows the Web Storage shape here.
			// eslint-disable-next-line shotlyx/prefer-object-params
			setItem: async (name, value) => {
			try {
				await writeIndexedDBItem<T>({
					dbName,
					storeName,
					name,
					value,
				});
				removeLegacyItem({ name, legacyStorage });
			} catch {
				writeLegacyItem<T>({ name, value, legacyStorage });
			}
		},
		removeItem: async (name) => {
			try {
				await removeIndexedDBItem({ dbName, storeName, name });
			} catch {
				// Ignore unavailable IndexedDB.
			}
			removeLegacyItem({ name, legacyStorage });
		},
	};
}
