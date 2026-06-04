import type { SceneTracks, TimelineTrack } from "@/timeline";
import { expandCompoundElement } from "@/timeline/compound-elements";
import type { MediaAsset } from "@/media/types";
import { RootNode } from "./nodes/root-node";
import { VideoNode } from "./nodes/video-node";
import { ImageNode } from "./nodes/image-node";
import { ImageSequenceNode } from "./nodes/image-sequence-node";
import { TextNode } from "./nodes/text-node";
import { StickerNode } from "./nodes/sticker-node";
import { GraphicNode } from "./nodes/graphic-node";
import { ColorNode } from "./nodes/color-node";
import { BlurBackgroundNode } from "./nodes/blur-background-node";
import { EffectLayerNode } from "./nodes/effect-layer-node";
import type { AnyBaseNode } from "./nodes/base-node";
import type {
	TBackground,
	TCanvasSize,
	TProjectWatermark,
} from "@/project/types";
import { DEFAULT_BACKGROUND_BLUR_INTENSITY } from "@/background/blur";
import { DEFAULTS } from "@/timeline/defaults";
import {
	buildTransformFromParams,
	type Transform,
	readBlendModeFromParams,
	readOpacityFromParams,
} from "@/rendering";
import {
	getShotlyxMGExportRender,
	isShotlyxMGFrameSequenceRender,
	type ShotlyxMGExportRenderMap,
} from "./shotlyx-mg-export-prerender";

const PREVIEW_MAX_IMAGE_SIZE = 2048;

function getAnimatedImageMimeType({
	asset,
	elementName,
}: {
	asset: MediaAsset;
	elementName: string;
}): string | null {
	if (
		asset.file.type === "image/gif" ||
		asset.file.name.toLowerCase().endsWith(".gif") ||
		asset.name.toLowerCase().endsWith(".gif") ||
		elementName.toLowerCase().endsWith(".gif")
	) {
		return "image/gif";
	}

	return null;
}

function removeShotlyxMGSquareAspectCompensation({
	height,
	transform,
	width,
}: {
	height: number;
	transform: Transform;
	width: number;
}): Transform {
	const aspect = height > 0 ? width / height : 1;
	if (aspect <= 0 || !Number.isFinite(aspect)) return transform;
	return {
		...transform,
		scaleX: transform.scaleX / aspect,
	};
}

function getVisibleSortedElements({ track }: { track: TimelineTrack }) {
	return track.elements
		.filter((element) => !("hidden" in element && element.hidden))
		.flatMap((element) => expandCompoundElement({ element }))
		.filter((element) => !("hidden" in element && element.hidden))
		.slice()
		.sort((a, b) => {
			if (a.startTime !== b.startTime) return a.startTime - b.startTime;
			return a.id.localeCompare(b.id);
		});
}

function buildTrackNodes({
	tracks,
	mediaMap,
	canvasSize,
	isPreview,
	shotlyxMGRenderMap,
}: {
	tracks: TimelineTrack[];
	mediaMap: Map<string, MediaAsset>;
	canvasSize: TCanvasSize;
	isPreview?: boolean;
	shotlyxMGRenderMap?: ShotlyxMGExportRenderMap;
}): AnyBaseNode[] {
	const nodes: AnyBaseNode[] = [];

	for (const track of tracks) {
		const elements = getVisibleSortedElements({ track });

		for (const element of elements) {
			if (element.type === "effect") {
				nodes.push(
					new EffectLayerNode({
						effectType: element.effectType,
						effectParams: element.params,
						timeOffset: element.startTime,
						duration: element.duration,
						transform: buildTransformFromParams({ params: element.params }),
						animations: element.animations,
					}),
				);
				continue;
			}

			if (element.type === "video" || element.type === "image") {
				const mediaAsset = mediaMap.get(element.mediaId);
				if (!mediaAsset?.file || !mediaAsset?.url) {
					continue;
				}

				if (element.type === "video" && mediaAsset.type === "video") {
					nodes.push(
						new VideoNode({
							mediaId: mediaAsset.id,
							url: mediaAsset.url,
							file: mediaAsset.file,
							duration: element.duration,
							timeOffset: element.startTime,
							trimStart: element.trimStart,
							trimEnd: element.trimEnd,
							retime: element.retime,
							transform: buildTransformFromParams({ params: element.params }),
							animations: element.animations,
							opacity: readOpacityFromParams({ params: element.params }),
							blendMode: readBlendModeFromParams({ params: element.params }),
							effects: element.effects ?? [],
							masks: element.masks ?? [],
						}),
					);
				}
				if (element.type === "image" && mediaAsset.type === "image") {
					const animatedMimeType = getAnimatedImageMimeType({
						asset: mediaAsset,
						elementName: element.name,
					});
					nodes.push(
						new ImageNode({
							url: mediaAsset.url,
							file: mediaAsset.file,
							animated: animatedMimeType !== null,
							animatedMimeType: animatedMimeType ?? undefined,
							duration: element.duration,
							timeOffset: element.startTime,
							trimStart: element.trimStart,
							trimEnd: element.trimEnd,
							transform: buildTransformFromParams({ params: element.params }),
							animations: element.animations,
							opacity: readOpacityFromParams({ params: element.params }),
							blendMode: readBlendModeFromParams({ params: element.params }),
							effects: element.effects ?? [],
							masks: element.masks ?? [],
							...(isPreview && {
								maxSourceSize: PREVIEW_MAX_IMAGE_SIZE,
							}),
						}),
					);
				}
			}

			if (element.type === "text" || element.type === "subtitle") {
				nodes.push(
					new TextNode({
						...element,
						transform: buildTransformFromParams({ params: element.params }),
						opacity: readOpacityFromParams({ params: element.params }),
						blendMode: readBlendModeFromParams({ params: element.params }),
						canvasCenter: { x: canvasSize.width / 2, y: canvasSize.height / 2 },
						canvasHeight: canvasSize.height,
						textBaseline: "middle",
						effects: element.effects ?? [],
					}),
				);
			}

			if (element.type === "sticker") {
				nodes.push(
					new StickerNode({
						stickerId: element.stickerId,
						intrinsicWidth: element.intrinsicWidth,
						intrinsicHeight: element.intrinsicHeight,
						duration: element.duration,
						timeOffset: element.startTime,
						trimStart: element.trimStart,
						trimEnd: element.trimEnd,
						transform: buildTransformFromParams({ params: element.params }),
						animations: element.animations,
						opacity: readOpacityFromParams({ params: element.params }),
						blendMode: readBlendModeFromParams({ params: element.params }),
						effects: element.effects ?? [],
					}),
				);
			}

			if (element.type === "graphic") {
				const renderedMG = getShotlyxMGExportRender({
					elementId: element.id,
					renderMap: shotlyxMGRenderMap,
					trackId: track.id,
				});
				if (isShotlyxMGFrameSequenceRender(renderedMG)) {
					const transform = removeShotlyxMGSquareAspectCompensation({
						height: renderedMG.height,
						transform: buildTransformFromParams({ params: element.params }),
						width: renderedMG.width,
					});
					nodes.push(
						new ImageSequenceNode({
							frames: renderedMG.frames,
							sourceHeight: renderedMG.height,
							sourceWidth: renderedMG.width,
							duration: element.duration,
							timeOffset: element.startTime,
							trimStart: 0,
							trimEnd: 0,
							transform,
							animations: element.animations,
							opacity: readOpacityFromParams({ params: element.params }),
							blendMode: readBlendModeFromParams({ params: element.params }),
							effects: element.effects ?? [],
							masks: element.masks ?? [],
						}),
					);
					continue;
				}
				if (renderedMG?.file && renderedMG.url) {
					nodes.push(
						new VideoNode({
							mediaId: renderedMG.id,
							url: renderedMG.url,
							file: renderedMG.file,
							duration: element.duration,
							timeOffset: element.startTime,
							trimStart: 0,
							trimEnd: 0,
							transform: buildTransformFromParams({ params: element.params }),
							animations: element.animations,
							opacity: readOpacityFromParams({ params: element.params }),
							blendMode: readBlendModeFromParams({ params: element.params }),
							effects: element.effects ?? [],
							masks: element.masks ?? [],
						}),
					);
					continue;
				}
				nodes.push(
					new GraphicNode({
						definitionId: element.definitionId,
						params: element.params,
						motionGraphicBaseParams: element.motionGraphicBaseParams,
						duration: element.duration,
						timeOffset: element.startTime,
						trimStart: element.trimStart,
						trimEnd: element.trimEnd,
						transform: buildTransformFromParams({ params: element.params }),
						animations: element.animations,
						opacity: readOpacityFromParams({ params: element.params }),
						blendMode: readBlendModeFromParams({ params: element.params }),
						effects: element.effects ?? [],
						masks: element.masks ?? [],
					}),
				);
			}
		}
	}

	return nodes;
}

function buildBlurBackgroundNodes({
	track,
	mediaMap,
	blurIntensity,
}: {
	track: TimelineTrack | undefined;
	mediaMap: Map<string, MediaAsset>;
	blurIntensity: number;
}): AnyBaseNode[] {
	if (!track) {
		return [];
	}

	const nodes: AnyBaseNode[] = [];
	const elements = getVisibleSortedElements({ track });

	for (const element of elements) {
		if (element.type !== "video" && element.type !== "image") {
			continue;
		}

		const mediaAsset = mediaMap.get(element.mediaId);
		if (
			!mediaAsset?.file ||
			!mediaAsset?.url ||
			(mediaAsset.type !== "video" && mediaAsset.type !== "image")
		) {
			continue;
		}

		nodes.push(
			new BlurBackgroundNode({
				mediaId: mediaAsset.id,
				url: mediaAsset.url,
				file: mediaAsset.file,
				mediaType: mediaAsset.type,
				duration: element.duration,
				timeOffset: element.startTime,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				retime: element.type === "video" ? element.retime : undefined,
				blurIntensity,
			}),
		);
	}

	return nodes;
}

function buildWatermarkNodes({
	canvasSize,
	duration,
	mediaMap,
	watermark,
	isPreview,
}: {
	canvasSize: TCanvasSize;
	duration: number;
	mediaMap: Map<string, MediaAsset>;
	watermark?: TProjectWatermark | null;
	isPreview?: boolean;
}): AnyBaseNode[] {
	if (!watermark?.enabled) return [];

	const params = {
		"transform.positionX": watermark.positionX,
		"transform.positionY": watermark.positionY,
		"transform.scaleX": watermark.scale,
		"transform.scaleY": watermark.scale,
		"transform.rotate": watermark.rotate,
		opacity: watermark.opacity,
		blendMode: "normal",
	};

	if (watermark.type === "text") {
		const textParams = {
			...DEFAULTS.text.element.params,
			...params,
			content: watermark.text,
			fontSize: watermark.fontSize,
			fontFamily: watermark.fontFamily,
			color: watermark.color,
			"background.enabled": false,
		};
		return [
			new TextNode({
				id: "project-watermark",
				type: "text",
				name: "Global watermark",
				duration,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
				params: textParams,
				transform: buildTransformFromParams({ params: textParams }),
				opacity: readOpacityFromParams({ params: textParams }),
				blendMode: readBlendModeFromParams({ params: textParams }),
				canvasCenter: { x: canvasSize.width / 2, y: canvasSize.height / 2 },
				canvasHeight: canvasSize.height,
				textBaseline: "middle",
			}),
		];
	}

	const mediaAsset = mediaMap.get(watermark.mediaId);
	if (
		!mediaAsset?.file ||
		!mediaAsset.url ||
		mediaAsset.type !== watermark.type
	) {
		return [];
	}

	const transform = buildTransformFromParams({ params });
	if (watermark.type === "image") {
		return [
			new ImageNode({
				url: mediaAsset.url,
				file: mediaAsset.file,
				animated:
					getAnimatedImageMimeType({
						asset: mediaAsset,
						elementName: mediaAsset.name,
					}) !== null,
				animatedMimeType:
					getAnimatedImageMimeType({
						asset: mediaAsset,
						elementName: mediaAsset.name,
					}) ?? undefined,
				duration,
				timeOffset: 0,
				trimStart: 0,
				trimEnd: 0,
				transform,
				opacity: watermark.opacity,
				blendMode: "normal",
				effects: [],
				masks: [],
				...(isPreview && { maxSourceSize: PREVIEW_MAX_IMAGE_SIZE }),
			}),
		];
	}

	return [
		new VideoNode({
			mediaId: mediaAsset.id,
			url: mediaAsset.url,
			file: mediaAsset.file,
			duration,
			timeOffset: 0,
			trimStart: 0,
			trimEnd: 0,
			transform,
			opacity: watermark.opacity,
			blendMode: "normal",
			effects: [],
			masks: [],
		}),
	];
}

export type BuildSceneParams = {
	canvasSize: TCanvasSize;
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	duration: number;
	background: TBackground;
	watermark?: TProjectWatermark | null;
	isPreview?: boolean;
	shotlyxMGRenderMap?: ShotlyxMGExportRenderMap;
};

export function buildScene({
	canvasSize,
	tracks,
	mediaAssets,
	duration,
	background,
	watermark,
	isPreview,
	shotlyxMGRenderMap,
}: BuildSceneParams) {
	const rootNode = new RootNode({ duration });
	const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

	const visibleTracks = [
		...tracks.overlay.filter((track) => !("hidden" in track && track.hidden)),
		...(!tracks.main.hidden ? [tracks.main] : []),
	];
	const orderedTracksBottomToTop = visibleTracks.slice().reverse();
	const mainTrack = tracks.main.hidden ? undefined : tracks.main;

	const allNodes = buildTrackNodes({
		tracks: orderedTracksBottomToTop,
		mediaMap,
		canvasSize,
		isPreview,
		shotlyxMGRenderMap,
	});

	if (background.type === "blur") {
		const blurNodes = buildBlurBackgroundNodes({
			track: mainTrack,
			mediaMap,
			blurIntensity:
				background.blurIntensity ?? DEFAULT_BACKGROUND_BLUR_INTENSITY,
		});
		for (const node of blurNodes) {
			rootNode.add(node);
		}
	} else if (
		background.type === "color" &&
		background.color !== "transparent"
	) {
		rootNode.add(new ColorNode({ color: background.color }));
	}

	for (const node of allNodes) {
		rootNode.add(node);
	}

	for (const node of buildWatermarkNodes({
		canvasSize,
		duration,
		mediaMap,
		watermark,
		isPreview,
	})) {
		rootNode.add(node);
	}

	return rootNode;
}
