import type { FrameRate } from "opencut-wasm";
import type { ShotlyxMGAsset } from "@/shotlyx/remotion-components/asset-store";
import type { ProjectBrandKit } from "@/brand-kit/types";
import type { ProjectMotionGraphicAsset } from "@/motion-graphics/types";
import type { TScene } from "@/timeline/types";
import type { MediaTime } from "@/wasm";

export type TBackground =
	| {
			type: "color";
			color: string;
	  }
	| {
			type: "blur";
			blurIntensity: number;
	  };

export interface TCanvasSize {
	width: number;
	height: number;
}

export type TProjectWatermark =
	| {
			enabled: boolean;
			type: "text";
			text: string;
			positionX: number;
			positionY: number;
			scale: number;
			rotate: number;
			opacity: number;
			fontSize: number;
			color: string;
			fontFamily: string;
	  }
	| {
			enabled: boolean;
			type: "image" | "video";
			mediaId: string;
			positionX: number;
			positionY: number;
			scale: number;
			rotate: number;
			opacity: number;
	  };

export interface TProjectMetadata {
	id: string;
	name: string;
	thumbnail?: string;
	duration: MediaTime;
	createdAt: Date;
	updatedAt: Date;
}

export interface TProjectSettings {
	fps: FrameRate;
	canvasSize: TCanvasSize;
	canvasSizeMode?: "preset" | "custom";
	lastCustomCanvasSize?: TCanvasSize | null;
	originalCanvasSize?: TCanvasSize | null;
	background: TBackground;
	watermark?: TProjectWatermark | null;
}

export interface TTimelineViewState {
	zoomLevel: number;
	scrollLeft: number;
	playheadTime: MediaTime;
}

export interface TProject {
	metadata: TProjectMetadata;
	scenes: TScene[];
	currentSceneId: string;
	settings: TProjectSettings;
	version: number;
	timelineViewState?: TTimelineViewState;
	brandKits?: ProjectBrandKit[];
	activeBrandKitId?: string | null;
	motionGraphicAssets?: ProjectMotionGraphicAsset[];
	shotlyxMGAssets?: ShotlyxMGAsset[];
}

export type TProjectSortKey = "createdAt" | "updatedAt" | "name" | "duration";
export type TSortOrder = "asc" | "desc";
export type TProjectSortOption = `${TProjectSortKey}-${TSortOrder}`;
