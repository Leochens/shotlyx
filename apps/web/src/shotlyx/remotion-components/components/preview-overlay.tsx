"use client";

import { useMemo } from "react";
import type { MediaAsset } from "@/media/types";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import type { TCanvasSize } from "@/project/types";
import type { ParamValues } from "@/params";
import type { SceneTracks } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";
import {
	resolveShotlyxMGInputProps,
	resolveShotlyxMGPlayerBackground,
} from "../media-props";
import { SHOTLYX_MG_GRAPHIC_DEFINITION_ID } from "../project-assets";
import type { ShotlyxMGAsset } from "../types";
import { ShotlyxRemotionComponentPlayer } from "./remotion-component-player";

export function getShotlyxMGTrackZIndexMap({
	tracks,
}: {
	tracks: SceneTracks;
}): Map<string, number> {
	const visibleTracksTopToBottom = [
		...tracks.overlay.filter((track) => !("hidden" in track && track.hidden)),
		...(!tracks.main.hidden ? [tracks.main] : []),
	];
	return new Map(
		visibleTracksTopToBottom.map((track, index) => [
			track.id,
			visibleTracksTopToBottom.length - index,
		]),
	);
}

function readOpacity({ params }: { params: ParamValues }): number {
	const value = params.opacity;
	return typeof value === "number" ? value : 1;
}

export function ShotlyxRemotionPreviewOverlay({
	tracks,
	currentTime,
	canvasSize,
	mediaAssets,
	shotlyxMGAssets,
	sceneLeft,
	sceneTop,
	sceneWidth,
	sceneHeight,
}: {
	tracks: SceneTracks;
	currentTime: number;
	canvasSize: TCanvasSize;
	mediaAssets: MediaAsset[];
	shotlyxMGAssets: ShotlyxMGAsset[];
	sceneLeft: number;
	sceneTop: number;
	sceneWidth: number;
	sceneHeight: number;
}) {
	const assetById = useMemo(
		() => new Map(shotlyxMGAssets.map((asset) => [asset.id, asset])),
		[shotlyxMGAssets],
	);
	const trackZIndexById = useMemo(
		() => getShotlyxMGTrackZIndexMap({ tracks }),
		[tracks],
	);
	const visibleElements = useMemo(
		() =>
			getVisibleElementsWithBounds({
				tracks,
				currentTime,
				canvasSize,
				mediaAssets,
			}).filter(
				(item) =>
					item.element.type === "graphic" &&
					item.element.definitionId === SHOTLYX_MG_GRAPHIC_DEFINITION_ID &&
					typeof item.element.motionGraphicAssetId === "string" &&
					assetById.has(item.element.motionGraphicAssetId),
			),
		[assetById, canvasSize, currentTime, mediaAssets, tracks],
	);

	if (visibleElements.length === 0) return null;

	const scaleX = sceneWidth / canvasSize.width;
	const scaleY = sceneHeight / canvasSize.height;

	return (
		<div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
			{visibleElements.map((item) => {
				if (
					item.element.type !== "graphic" ||
					typeof item.element.motionGraphicAssetId !== "string"
				) {
					return null;
				}
				const asset = assetById.get(item.element.motionGraphicAssetId);
				if (!asset) return null;

				const localSeconds = Math.max(
					0,
					(Number(currentTime) -
						Number(item.element.startTime) +
						Number(item.element.trimStart)) /
						TICKS_PER_SECOND,
				);
				const currentFrame = localSeconds * asset.document.fps;
				const width = Math.abs(item.bounds.width) * scaleX;
				const height = Math.abs(item.bounds.height) * scaleY;
				const flipX = item.bounds.width < 0 ? -1 : 1;
				const flipY = item.bounds.height < 0 ? -1 : 1;

				const inputParams = {
					...(item.element.motionGraphicBaseParams ?? {}),
					...item.element.params,
				};

				return (
					<div
						key={`${item.trackId}:${item.elementId}`}
						className="absolute overflow-hidden"
						style={{
							left: sceneLeft + item.bounds.cx * scaleX,
							top: sceneTop + item.bounds.cy * scaleY,
							width,
							height,
							zIndex: trackZIndexById.get(item.trackId) ?? 0,
							opacity: readOpacity({ params: item.element.params }),
							transform: `translate(-50%, -50%) rotate(${item.bounds.rotation}deg) scaleX(${flipX}) scaleY(${flipY})`,
							transformOrigin: "center",
						}}
					>
						<ShotlyxRemotionComponentPlayer
							asset={asset}
							controls={false}
							currentFrame={currentFrame}
							inputProps={resolveShotlyxMGInputProps({
								asset,
								params: inputParams,
								mediaAssets,
							})}
							background={resolveShotlyxMGPlayerBackground({
								asset,
								params: inputParams,
							})}
						/>
					</div>
				);
			})}
		</div>
	);
}
