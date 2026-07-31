import type { StorageAdapter } from "./types";
import {
	getDesktopFileSource,
	registerDesktopFileSource,
} from "@/media/desktop-file-source";

export class DesktopMediaFilesAdapter implements StorageAdapter<File> {
	constructor(private readonly options: { projectId: string }) {}

	private buildUrl({ id, name }: { id?: string; name?: string } = {}): string {
		const params = new URLSearchParams({
			projectId: this.options.projectId,
		});
		if (id) params.set("id", id);
		if (name) params.set("name", name);
		return `/api/desktop/media-library/files?${params.toString()}`;
	}

	async get(key: string): Promise<File | null> {
		const response = await fetch(this.buildUrl({ id: key }), {
			cache: "no-store",
		});
		if (response.status === 404) return null;
		await assertOkResponse({ response });

		const blob = await response.blob();
		const encodedName = response.headers.get("X-Shotlyx-Filename");
		const name = encodedName ? decodeURIComponent(encodedName) : key;
		const file = new File([blob], name, {
			type: blob.type || response.headers.get("Content-Type") || "",
		});
		const encodedSourcePath = response.headers.get("X-Shotlyx-Source-Path");
		return encodedSourcePath
			? registerDesktopFileSource({
					file,
					sourcePath: decodeURIComponent(encodedSourcePath),
				})
			: file;
	}

	async set({ key, value }: { key: string; value: File }): Promise<void> {
		const sourcePath = getDesktopFileSource({ file: value });
		const baseUrl = this.buildUrl({ id: key, name: value.name });
		const url = sourcePath
			? `${baseUrl}&${new URLSearchParams({ sourcePath }).toString()}`
			: baseUrl;
		const response = await fetch(url, {
			...(sourcePath
				? {}
				: {
						body: value,
						headers: value.type ? { "Content-Type": value.type } : undefined,
					}),
			method: "POST",
		});
		await assertOkResponse({ response });
	}

	async remove(key: string): Promise<void> {
		const response = await fetch(this.buildUrl({ id: key }), {
			method: "DELETE",
		});
		await assertOkResponse({ response });
	}

	async list(): Promise<string[]> {
		return [];
	}

	async clear(): Promise<void> {
		const response = await fetch(this.buildUrl(), {
			method: "DELETE",
		});
		await assertOkResponse({ response });
	}
}

async function assertOkResponse({ response }: { response: Response }) {
	if (response.ok) return;
	let message = `Desktop media library request failed: ${response.status}`;
	try {
		const body = await response.json();
		if (isRecord(body)) {
			const bodyMessage = Reflect.get(body, "message");
			const bodyError = Reflect.get(body, "error");
			message =
				(typeof bodyMessage === "string" && bodyMessage) ||
				(typeof bodyError === "string" && bodyError) ||
				message;
		}
	} catch {
		// Keep the status-based message.
	}
	throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
