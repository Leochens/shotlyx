import type { EditorCore } from "@/core";
import { getMediaTypeFromFile } from "@/media/media-utils";
import type { MediaAsset } from "@/media/types";
import type { ParamValues } from "@/params";
import type { UploadedSoundAsset } from "@/sounds/types";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type { CreateUploadAudioElement, TrackType } from "@/timeline/types";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";

const DEFAULT_UPLOADED_SOUND_DURATION_SECONDS = 1;
const UPLOADED_SOUND_LIBRARY_PROVIDER = "shotlyx:uploaded-sound-library";
const DEFAULT_AUDIO_PARAMS = {
	volume: 1,
	muted: false,
} satisfies ParamValues;

export const UPLOADED_SOUND_UPLOAD_ACCEPT =
	"audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac";

export type UploadedSoundProjectMediaAsset = MediaAsset & {
	type: "audio";
};

export function isUploadedSoundFile({ file }: { file: File }): boolean {
	return getMediaTypeFromFile({ file }) === "audio";
}

export function filterUploadedSoundAssets({
	items,
	query,
}: {
	items: UploadedSoundAsset[];
	query: string;
}): UploadedSoundAsset[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return items;

	return items.filter((item) => {
		const searchable = [item.name, item.file.name, item.file.type]
			.join(" ")
			.toLowerCase();
		return searchable.includes(normalizedQuery);
	});
}

function soundDurationSeconds({ duration }: { duration?: number }): number {
	return Number.isFinite(duration) && duration && duration > 0
		? duration
		: DEFAULT_UPLOADED_SOUND_DURATION_SECONDS;
}

export function buildUploadedSoundProjectMediaAsset({
	item,
}: {
	item: UploadedSoundAsset;
}): Omit<UploadedSoundProjectMediaAsset, "id"> {
	const sourceUrl = `shotlyx://uploaded-sounds/${item.id}`;
	const now = new Date().toISOString();
	return {
		name: item.name,
		type: "audio",
		file: item.file,
		url: item.url,
		duration: soundDurationSeconds({ duration: item.duration }),
		ephemeral: true,
		externalSource: {
			provider: UPLOADED_SOUND_LIBRARY_PROVIDER,
			providerAssetId: item.id,
			sourceUrl,
			importedAt: now,
			license: {
				name: "User uploaded",
				attributionRequired: false,
				sourceProvider: "User upload",
				sourceUrl,
				verifiedAt: now,
			},
		},
	};
}

export function isUploadedSoundProjectMediaAsset(
	asset: MediaAsset,
): asset is UploadedSoundProjectMediaAsset {
	return asset.type === "audio";
}

export function findProjectMediaAssetForUploadedSound({
	assets,
	item,
}: {
	assets: MediaAsset[];
	item: UploadedSoundAsset;
}): UploadedSoundProjectMediaAsset | null {
	const found = assets.find(
		(asset): asset is UploadedSoundProjectMediaAsset =>
			asset.ephemeral === true &&
			asset.externalSource?.provider === UPLOADED_SOUND_LIBRARY_PROVIDER &&
			asset.externalSource.providerAssetId === item.id &&
			isUploadedSoundProjectMediaAsset(asset),
	);
	return found ?? null;
}

export function buildUploadedSoundMediaElement({
	asset,
	startTime,
}: {
	asset: UploadedSoundProjectMediaAsset;
	startTime: MediaTime;
}): CreateUploadAudioElement {
	const element = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: "audio",
		name: asset.name,
		duration: mediaTimeFromSeconds({
			seconds: soundDurationSeconds({ duration: asset.duration }),
		}),
		startTime,
	});

	if (element.type !== "audio" || element.sourceType !== "upload") {
		throw new Error("Failed to build uploaded sound element");
	}

	return {
		...element,
		params: {
			...DEFAULT_AUDIO_PARAMS,
			...element.params,
		},
	};
}

export async function insertUploadedSoundAsset({
	editor,
	item,
	startTime,
	placement = { mode: "auto", trackType: "audio" },
}: {
	editor: EditorCore;
	item: UploadedSoundAsset;
	startTime: MediaTime;
	placement?:
		| { mode: "explicit"; trackId: string }
		| { mode: "auto"; trackType?: TrackType; insertIndex?: number };
}): Promise<{ elementId?: string; trackId?: string | null; mediaId: string }> {
	const activeProject = editor.project.getActiveOrNull();
	if (!activeProject) {
		throw new Error("No active project");
	}

	let mediaAsset = findProjectMediaAssetForUploadedSound({
		assets: editor.media.getAssets(),
		item,
	});
	if (!mediaAsset) {
		const created = await editor.media.addMediaAsset({
			projectId: activeProject.metadata.id,
			asset: buildUploadedSoundProjectMediaAsset({ item }),
		});
		if (!created || !isUploadedSoundProjectMediaAsset(created)) {
			throw new Error("Failed to prepare uploaded sound media");
		}
		mediaAsset = created;
	}

	const insertion = editor.timeline.insertElement({
		placement,
		element: buildUploadedSoundMediaElement({
			asset: mediaAsset,
			startTime,
		}),
	});

	return {
		elementId: insertion.elementId,
		trackId: insertion.trackId,
		mediaId: mediaAsset.id,
	};
}
