/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- This generic adapter preserves the caller-owned serialized project type across a JSON boundary. */
import type { StorageAdapter } from "./types";

interface ProjectsResponse<T> {
	project?: T;
	projects?: T[];
}

export class DesktopProjectsAdapter<T> implements StorageAdapter<T> {
	async get(key: string): Promise<T | null> {
		const response = await fetch(
			`/api/desktop/projects/${encodeURIComponent(key)}`,
			{ cache: "no-store" },
		);
		if (response.status === 404) return null;
		await assertOk({ response });
		const body = (await response.json()) as ProjectsResponse<T>;
		return body.project ?? null;
	}

	async set({ value }: { key: string; value: T }): Promise<void> {
		const response = await fetch("/api/desktop/projects", {
			body: JSON.stringify(value),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		await assertOk({ response });
	}

	async remove(key: string): Promise<void> {
		const response = await fetch(
			`/api/desktop/projects/${encodeURIComponent(key)}`,
			{ method: "DELETE" },
		);
		await assertOk({ response });
	}

	async list(): Promise<string[]> {
		const projects = await this.getAll();
		return projects.flatMap((project) => {
			if (typeof project !== "object" || project === null) return [];
			const metadata = Reflect.get(project, "metadata");
			if (typeof metadata !== "object" || metadata === null) return [];
			const id = Reflect.get(metadata, "id");
			return typeof id === "string" ? [id] : [];
		});
	}

	async getAll(): Promise<T[]> {
		const response = await fetch("/api/desktop/projects", {
			cache: "no-store",
		});
		await assertOk({ response });
		const body = (await response.json()) as ProjectsResponse<T>;
		return Array.isArray(body.projects) ? body.projects : [];
	}

	async clear(): Promise<void> {
		for (const key of await this.list()) {
			await this.remove(key);
		}
	}
}

async function assertOk({ response }: { response: Response }): Promise<void> {
	if (response.ok) return;
	throw new Error(`Desktop project request failed: ${response.status}`);
}
