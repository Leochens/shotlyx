import type { MediaAssetData } from "@/services/storage/types";

export type TimelineMediaType = "image" | "video" | "audio";
export type DocumentMediaType = "subtitle" | "text";
export type MediaType = TimelineMediaType | DocumentMediaType;

export interface MediaAsset
	extends Omit<MediaAssetData, "size" | "lastModified"> {
	file: File;
	url?: string;
}
