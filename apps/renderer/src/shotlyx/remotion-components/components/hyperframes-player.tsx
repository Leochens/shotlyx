"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ShotlyxHyperFramesAsset } from "../types";

function buildSrcDoc({
	asset,
	background,
}: {
	asset: ShotlyxHyperFramesAsset;
	background?: string;
}): string {
	if (!background) return asset.document.htmlSource;
	return asset.document.htmlSource.replace(
		"</style>",
		`[data-composition-id] { background: ${background} !important; }\n</style>`,
	);
}

export function ShotlyxHyperFramesPlayer({
	asset,
	currentFrame,
	background,
}: {
	asset: ShotlyxHyperFramesAsset;
	controls?: boolean;
	currentFrame?: number;
	inputProps?: Record<string, unknown>;
	background?: string;
}) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const durationInFrames = Math.max(
		1,
		Math.round(asset.document.durationSeconds * asset.document.fps),
	);
	const srcDoc = useMemo(
		() => buildSrcDoc({ asset, background }),
		[asset, background],
	);

	useEffect(() => {
		if (currentFrame === undefined) return;
		const progress = Math.max(
			0,
			Math.min(1, Math.floor(currentFrame) / Math.max(1, durationInFrames - 1)),
		);
		iframeRef.current?.contentWindow?.postMessage(
			{ type: "shotlyx:set-progress", progress },
			"*",
		);
	}, [currentFrame, durationInFrames]);

	return (
		<iframe
			ref={iframeRef}
			title={asset.name}
			srcDoc={srcDoc}
			sandbox="allow-scripts"
			className="size-full border-0 bg-transparent"
		/>
	);
}
