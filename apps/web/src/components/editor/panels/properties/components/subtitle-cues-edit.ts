import type { MediaAsset } from "@/media/types";
import { formatSrt } from "@/subtitles/srt";
import type { SubtitleLayerCue } from "@/subtitles/types";
import type { SubtitleElement } from "@/timeline";

interface SubtitleAssetSyncEditor {
	project: {
		getActive(): { metadata: { id: string } };
	};
	media: {
		getAssets(): MediaAsset[];
		updateMediaAsset(args: {
			projectId: string;
			id: string;
			updates: { file: File };
		}): Promise<unknown>;
	};
}

export function applySubtitleCueTextEdits({
	cues,
	texts,
}: {
	cues: readonly SubtitleLayerCue[];
	texts: readonly string[];
}): SubtitleLayerCue[] {
	return cues.map((cue, index) => {
		const nextText = texts[index] ?? cue.text;
		if (nextText === cue.text) return cue;

		return {
			...cue,
			text: nextText,
			tokens: undefined,
		};
	});
}

function linkedSubtitleAssetId({
	element,
}: {
	element: Pick<SubtitleElement, "params">;
}): string | null {
	const value = element.params["subtitle.assetId"];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function buildSubtitleAssetFile({
	name,
	cues,
}: {
	name: string;
	cues: readonly SubtitleLayerCue[];
}): File {
	const filename = name.trim() || "subtitles.srt";
	return new File([`${formatSrt({ cues: [...cues] })}\n`], filename, {
		type: "application/x-subrip;charset=utf-8",
	});
}

export async function syncLinkedSubtitleAssetFromCues({
	editor,
	element,
	cues,
}: {
	editor: SubtitleAssetSyncEditor;
	element: Pick<SubtitleElement, "params">;
	cues: readonly SubtitleLayerCue[];
}): Promise<void> {
	const assetId = linkedSubtitleAssetId({ element });
	if (!assetId) return;

	const asset = editor.media
		.getAssets()
		.find((item) => item.id === assetId && item.type === "subtitle");
	if (!asset) return;

	const activeProject = editor.project.getActive();
	await editor.media.updateMediaAsset({
		projectId: activeProject.metadata.id,
		id: asset.id,
		updates: {
			file: buildSubtitleAssetFile({
				name: asset.name,
				cues,
			}),
		},
	});
}
