const desktopFileSources = new WeakMap<File, string>();

export function registerDesktopFileSource({
	file,
	sourcePath,
}: {
	file: File;
	sourcePath: string;
}): File {
	if (sourcePath) desktopFileSources.set(file, sourcePath);
	return file;
}

export function getDesktopFileSource({ file }: { file: File }): string | null {
	return desktopFileSources.get(file) ?? null;
}

interface SelectedFileDescriptor {
	id: string;
	lastModified: number;
	name: string;
	size: number;
	sourcePath: string;
	type: string;
}

function isSelectedFileDescriptor(
	value: unknown,
): value is SelectedFileDescriptor {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	return (
		typeof Reflect.get(value, "id") === "string" &&
		typeof Reflect.get(value, "lastModified") === "number" &&
		typeof Reflect.get(value, "name") === "string" &&
		typeof Reflect.get(value, "sourcePath") === "string" &&
		typeof Reflect.get(value, "type") === "string"
	);
}

export async function selectLinkedDesktopFiles(): Promise<File[] | null> {
	const response = await fetch("/api/desktop/media-library/select-files", {
		method: "POST",
	});
	if (!response.ok) {
		throw new Error(`Desktop file selection failed: ${response.status}`);
	}
	const body = (await response.json()) as unknown;
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		throw new Error("Desktop file selection returned invalid data");
	}
	if (Reflect.get(body, "cancelled") === true) return null;
	const descriptors = Reflect.get(body, "files");
	if (!Array.isArray(descriptors)) {
		throw new Error("Desktop file selection returned invalid files");
	}

	const files: File[] = [];
	for (const descriptor of descriptors.filter(isSelectedFileDescriptor)) {
		const fileResponse = await fetch(
			`/api/desktop/media-library/selected/${encodeURIComponent(
				descriptor.id,
			)}`,
			{ cache: "no-store" },
		);
		if (!fileResponse.ok) {
			throw new Error(`Failed to read ${descriptor.name}`);
		}
		const blob = await fileResponse.blob();
		const file = new File([blob], descriptor.name, {
			lastModified: descriptor.lastModified,
			type: descriptor.type || blob.type,
		});
		files.push(
			registerDesktopFileSource({
				file,
				sourcePath: descriptor.sourcePath,
			}),
		);
	}
	return files;
}
