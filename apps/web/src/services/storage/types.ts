import type { MediaType } from "@/media/types";
import type {
	TProject,
	TProjectMetadata,
	TTimelineViewState,
} from "@/project/types";
import type { TScene } from "@/timeline";

export interface StorageAdapter<T> {
	get(key: string): Promise<T | null>;
	set(args: { key: string; value: T }): Promise<void>;
	remove(key: string): Promise<void>;
	list(): Promise<string[]>;
	clear(): Promise<void>;
}

export interface ExternalMediaSourceLicense {
	name: string;
	url?: string;
	attributionRequired: boolean;
	commercialUse?: boolean;
	derivativesAllowed?: boolean;
	sourceProvider: string;
	sourceUrl: string;
	attributionText?: string;
	verifiedAt: string;
}

export interface ExternalMediaSource {
	provider: string;
	providerAssetId: string;
	sourceUrl: string;
	importedAt: string;
	author?: {
		name?: string;
		url?: string;
	};
	license: ExternalMediaSourceLicense;
}

export interface MediaAssetData {
	id: string;
	name: string;
	type: MediaType;
	size: number;
	lastModified: number;
	width?: number;
	height?: number;
	duration?: number;
	fps?: number;
	hasAudio?: boolean;
	ephemeral?: boolean;
	thumbnailUrl?: string;
	externalSource?: ExternalMediaSource;
}

export interface AnimatedStickerAssetData {
	id: string;
	name: string;
	type: "image" | "video";
	size: number;
	lastModified: number;
	width?: number;
	height?: number;
	duration?: number;
	fps?: number;
	hasAudio?: boolean;
	thumbnailUrl?: string;
	createdAt: string;
	updatedAt: string;
}

export interface AnimatedStickerAsset
	extends Omit<AnimatedStickerAssetData, "size" | "lastModified"> {
	file: File;
	url?: string;
}

export type SerializedScene = Omit<TScene, "createdAt" | "updatedAt"> & {
	createdAt: string;
	updatedAt: string;
};

export type SerializedProjectMetadata = Omit<
	TProjectMetadata,
	"createdAt" | "updatedAt"
> & {
	createdAt: string;
	updatedAt: string;
};

export type SerializedProject = Omit<TProject, "metadata" | "scenes"> & {
	metadata: SerializedProjectMetadata;
	scenes: SerializedScene[];
	timelineViewState?: TTimelineViewState;
};

export interface StorageConfig {
	projectsDb: string;
	mediaDb: string;
	savedSoundsDb: string;
	uploadedSoundsDb: string;
	animatedStickersDb: string;
	version: number;
}

// TypeScript type augmentation to add async iterator methods to FileSystemDirectoryHandle
// These methods are part of the File System Access API spec but may not be in all type definitions
declare global {
	interface FileSystemDirectoryHandle {
		keys(): AsyncIterableIterator<string>;
		values(): AsyncIterableIterator<FileSystemHandle>;
		entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
	}
}
