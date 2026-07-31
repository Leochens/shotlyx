/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- This generic adapter preserves the caller-owned media metadata type across a JSON boundary. */
import type { StorageAdapter } from "./types";

interface MediaResponse<T> {
	asset?: T;
	assets?: T[];
}

export class DesktopProjectMediaMetadataAdapter<
	T,
> implements StorageAdapter<T> {
	constructor(private readonly projectId: string) {}

	private buildUrl({ id }: { id?: string } = {}): string {
		const params = id ? `?${new URLSearchParams({ id }).toString()}` : "";
		return `/api/desktop/projects/${encodeURIComponent(
			this.projectId,
		)}/media${params}`;
	}

	async get(key: string): Promise<T | null> {
		const response = await fetch(this.buildUrl({ id: key }), {
			cache: "no-store",
		});
		if (response.status === 404) return null;
		await assertOk({ response });
		const body = (await response.json()) as MediaResponse<T>;
		return body.asset ?? null;
	}

	async set({ value }: { key: string; value: T }): Promise<void> {
		const response = await fetch(this.buildUrl(), {
			body: JSON.stringify(value),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		await assertOk({ response });
	}

	async remove(key: string): Promise<void> {
		const response = await fetch(this.buildUrl({ id: key }), {
			method: "DELETE",
		});
		await assertOk({ response });
	}

	async list(): Promise<string[]> {
		const assets = await this.getAll();
		return assets.flatMap((asset) => {
			if (typeof asset !== "object" || asset === null) return [];
			const id = Reflect.get(asset, "id");
			return typeof id === "string" ? [id] : [];
		});
	}

	async getAll(): Promise<T[]> {
		const response = await fetch(this.buildUrl(), { cache: "no-store" });
		await assertOk({ response });
		const body = (await response.json()) as MediaResponse<T>;
		return Array.isArray(body.assets) ? body.assets : [];
	}

	async clear(): Promise<void> {
		const response = await fetch(this.buildUrl(), { method: "DELETE" });
		await assertOk({ response });
	}
}

async function assertOk({ response }: { response: Response }): Promise<void> {
	if (response.ok) return;
	throw new Error(`Desktop project media request failed: ${response.status}`);
}
