import { useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { AddMediaAssetCommand } from "@/commands/media";
import { InsertElementCommand } from "@/commands/timeline";
import { BatchCommand } from "@/commands";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds } from "@/wasm";
import { isTypableDOMElement } from "@/utils/browser";
import { isTimelineMediaType } from "@/media/media-utils";
import {
	extractMediaFilesFromClipboard,
	shouldPasteInternalClipboardFromPasteEvent,
} from "@/media/clipboard-media";

export function usePasteMedia() {
	const editor = useEditor();

	useEffect(() => {
		const handlePaste = async (event: ClipboardEvent) => {
			const activeElement = document.activeElement;

			if (
				activeElement instanceof HTMLElement &&
				isTypableDOMElement({ element: activeElement })
			) {
				return;
			}

			const files = extractMediaFilesFromClipboard({
				clipboardData: event.clipboardData,
			});
			if (
				shouldPasteInternalClipboardFromPasteEvent({
					mediaFilesCount: files.length,
					hasInternalClipboardEntry: editor.clipboard.hasEntry(),
					shouldPreferInternalClipboard:
						editor.clipboard.shouldPreferInternalClipboard(),
				})
			) {
				event.preventDefault();
				editor.clipboard.paste();
				return;
			}
			if (files.length === 0) return;

			event.preventDefault();

			const activeProject = editor.project.getActive();
			if (!activeProject) return;

			try {
				await showMediaUploadToast({
					filesCount: files.length,
					promise: async () => {
						const processedAssets = await processMediaAssets({ files });
						const startTime = editor.playback.getCurrentTime();

						for (const asset of processedAssets) {
							if (!isTimelineMediaType(asset.type)) continue;
							const addMediaCmd = new AddMediaAssetCommand({
								projectId: activeProject.metadata.id,
								asset,
							});
							const assetId = addMediaCmd.getAssetId();
							const duration =
								asset.duration != null
									? mediaTimeFromSeconds({ seconds: asset.duration })
									: DEFAULT_NEW_ELEMENT_DURATION;
							const trackType = asset.type === "audio" ? "audio" : "video";

							const element = buildElementFromMedia({
								mediaId: assetId,
								mediaType: asset.type,
								name: asset.name,
								duration,
								startTime,
								buffer:
									asset.type === "audio"
										? new AudioBuffer({ length: 1, sampleRate: 44100 })
										: undefined,
							});

							const insertCmd = new InsertElementCommand({
								element,
								placement: { mode: "auto", trackType },
							});
							const batchCmd = new BatchCommand([addMediaCmd, insertCmd]);
							editor.command.execute({ command: batchCmd });
						}

						return {
							uploadedCount: processedAssets.length,
							assetNames: processedAssets.map((asset) => asset.name),
						};
					},
				});
			} catch (error) {
				console.error("Failed to paste media:", error);
			}
		};

		const handleWindowBlur = () => {
			editor.clipboard.markExternalClipboardMayHaveChanged();
		};

		window.addEventListener("paste", handlePaste);
		window.addEventListener("blur", handleWindowBlur);
		return () => {
			window.removeEventListener("paste", handlePaste);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [editor]);
}
