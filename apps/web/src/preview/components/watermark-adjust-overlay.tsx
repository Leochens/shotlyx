"use client";

import { useRef } from "react";
import { Move } from "lucide-react";
import { useEditor } from "@/editor/use-editor";
import type { MediaAsset } from "@/media/types";
import { normalizeWatermarkTransform } from "@/project/watermark";
import type { TProjectWatermark } from "@/project/types";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { useWatermarkAdjustStore } from "@/preview/watermark-adjust-store";
import { cn } from "@/utils/ui";

interface DragSession {
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startPositionX: number;
	startPositionY: number;
}

function getWatermarkAsset({
	assets,
	watermark,
}: {
	assets: MediaAsset[];
	watermark: TProjectWatermark;
}) {
	if (watermark.type === "text") return null;
	return assets.find((asset) => asset.id === watermark.mediaId) ?? null;
}

function getBoxSize({
	asset,
	displayScale,
	watermark,
}: {
	asset: MediaAsset | null;
	displayScale: { x: number; y: number };
	watermark: TProjectWatermark;
}) {
	if (watermark.type === "text") {
		const width = Math.max(
			96,
			Math.min(360, watermark.text.length * watermark.fontSize * 8),
		);
		const height = Math.max(28, watermark.fontSize * 7);
		return {
			width: width * watermark.scale * displayScale.x,
			height: height * watermark.scale * displayScale.y,
		};
	}

	const width = asset?.width ?? 320;
	const height = asset?.height ?? 180;
	return {
		width: width * watermark.scale * displayScale.x,
		height: height * watermark.scale * displayScale.y,
	};
}

export function WatermarkAdjustOverlay() {
	const editor = useEditor();
	const watermark = useEditor(
		(e) => e.project.getActive().settings.watermark ?? null,
	);
	const assets = useEditor((e) => e.media.getAssets());
	const isAdjustingWatermark = useWatermarkAdjustStore(
		(s) => s.isAdjustingWatermark,
	);
	const viewport = usePreviewViewport();
	const dragSessionRef = useRef<DragSession | null>(null);

	if (!isAdjustingWatermark || !watermark?.enabled) return null;

	const displayScale = viewport.getDisplayScale();
	const asset = getWatermarkAsset({ assets, watermark });
	const center = viewport.positionToOverlay({
		positionX: watermark.positionX,
		positionY: watermark.positionY,
	});
	const size = getBoxSize({ asset, displayScale, watermark });

	const updatePosition = ({
		positionX,
		positionY,
		pushHistory,
	}: {
		positionX: number;
		positionY: number;
		pushHistory: boolean;
	}) => {
		const currentWatermark =
			editor.project.getActive().settings.watermark ?? watermark;
		if (!currentWatermark) return;
		editor.project.updateSettings({
			settings: {
				watermark: normalizeWatermarkTransform({
					...currentWatermark,
					positionX,
					positionY,
				}),
			},
			pushHistory,
		});
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		dragSessionRef.current = {
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startPositionX: watermark.positionX,
			startPositionY: watermark.positionY,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		const session = dragSessionRef.current;
		if (!session) return;
		event.preventDefault();
		event.stopPropagation();
		const deltaX = viewport.screenPixelsToLogicalThreshold({
			screenPixels: event.clientX - session.startClientX,
		}).x;
		const deltaY = viewport.screenPixelsToLogicalThreshold({
			screenPixels: event.clientY - session.startClientY,
		}).y;
		updatePosition({
			positionX: session.startPositionX + deltaX,
			positionY: session.startPositionY + deltaY,
			pushHistory: false,
		});
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
		const session = dragSessionRef.current;
		if (!session) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.currentTarget.hasPointerCapture(session.pointerId)) {
			event.currentTarget.releasePointerCapture(session.pointerId);
		}
		dragSessionRef.current = null;
		const currentWatermark = editor.project.getActive().settings.watermark;
		if (currentWatermark) {
			updatePosition({
				positionX: currentWatermark.positionX,
				positionY: currentWatermark.positionY,
				pushHistory: true,
			});
		}
	};

	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			<button
				type="button"
				className={cn(
					"border-primary bg-background/60 text-foreground absolute flex cursor-move items-center justify-center overflow-hidden rounded-sm border text-xs shadow-lg backdrop-blur-sm",
					"pointer-events-auto focus-visible:outline-primary focus-visible:outline-2",
				)}
				style={{
					left: center.x,
					top: center.y,
					width: Math.max(32, size.width),
					height: Math.max(24, size.height),
					transform: `translate(-50%, -50%) rotate(${watermark.rotate}deg)`,
					opacity: Math.max(0.35, watermark.opacity),
				}}
				aria-label="Drag project watermark"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onDragStart={(event) => event.preventDefault()}
			>
				{watermark.type === "text" ? (
					<span className="truncate px-2">{watermark.text}</span>
				) : (
					<span className="flex items-center gap-1 px-2">
						<Move className="size-3.5" />
						{asset?.name ?? "Watermark"}
					</span>
				)}
			</button>
		</div>
	);
}
