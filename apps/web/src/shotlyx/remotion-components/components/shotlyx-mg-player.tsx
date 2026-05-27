"use client";

import {
	isShotlyxHyperFramesAsset,
	isShotlyxRemotionMGAsset,
	type ShotlyxMGAsset,
} from "../types";
import { ShotlyxHyperFramesPlayer } from "./hyperframes-player";
import { ShotlyxRemotionComponentPlayer } from "./remotion-component-player";

export function ShotlyxMGPlayer({
	asset,
	controls = true,
	currentFrame,
	inputProps,
	background,
}: {
	asset: ShotlyxMGAsset;
	controls?: boolean;
	currentFrame?: number;
	inputProps?: Record<string, unknown>;
	background?: string;
}) {
	if (isShotlyxHyperFramesAsset(asset)) {
		return (
			<ShotlyxHyperFramesPlayer
				asset={asset}
				controls={controls}
				currentFrame={currentFrame}
				inputProps={inputProps}
				background={background}
			/>
		);
	}
	if (isShotlyxRemotionMGAsset(asset)) {
		return (
			<ShotlyxRemotionComponentPlayer
				asset={asset}
				controls={controls}
				currentFrame={currentFrame}
				inputProps={inputProps}
				background={background}
			/>
		);
	}
	return null;
}
