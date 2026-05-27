"use client";

import { Player, type PlayerRef } from "@remotion/player";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import {
	AbsoluteFill,
	Easing,
	Img,
	Sequence,
	Video,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import type { ShotlyxRemotionMGAsset } from "../types";

type RemotionRuntime = {
	React: typeof import("react");
	Remotion: {
		AbsoluteFill: typeof AbsoluteFill;
		Sequence: typeof Sequence;
		useCurrentFrame: typeof useCurrentFrame;
		useVideoConfig: typeof useVideoConfig;
		interpolate: typeof interpolate;
		spring: typeof spring;
		Easing: typeof Easing;
		Img: typeof Img;
		Video: typeof Video;
	};
};

declare global {
	var __SHOTLYX_REMOTION_RUNTIME__: RemotionRuntime | undefined;
}

async function loadReactRuntime(): Promise<typeof import("react")> {
	return await import("react");
}

function isRemotionComponent(
	value: unknown,
): value is ComponentType<Record<string, unknown>> {
	return typeof value === "function";
}

function withRemotionBareBindings({ moduleSource }: { moduleSource: string }) {
	if (
		moduleSource.includes(
			"const { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video } = Remotion;",
		)
	) {
		return moduleSource;
	}
	return [
		"const { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video } = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;",
		moduleSource,
	].join("\n");
}

function useCompiledRemotionComponent({
	asset,
}: {
	asset: ShotlyxRemotionMGAsset;
}): ComponentType<Record<string, unknown>> | null {
	const [component, setComponent] = useState<ComponentType<
		Record<string, unknown>
	> | null>(null);

	useEffect(() => {
		let disposed = false;
		let moduleUrl: string | null = null;

		async function load() {
			const ReactRuntime = await loadReactRuntime();
			globalThis.__SHOTLYX_REMOTION_RUNTIME__ = {
				React: ReactRuntime,
				Remotion: {
					AbsoluteFill,
					Sequence,
					useCurrentFrame,
					useVideoConfig,
					interpolate,
					spring,
					Easing,
					Img,
					Video,
				},
			};
			const blob = new Blob(
				[
					withRemotionBareBindings({
						moduleSource: asset.document.compiledModule,
					}),
				],
				{
					type: "text/javascript",
				},
			);
			moduleUrl = URL.createObjectURL(blob);
			const mod: unknown = await import(/* webpackIgnore: true */ moduleUrl);
			const candidate =
				typeof mod === "object" && mod !== null
					? Reflect.get(mod, "default")
					: null;
			if (!disposed && isRemotionComponent(candidate)) {
				setComponent(() => candidate);
			}
		}

		void load().catch((error) => {
			console.error("Failed to load Shotlyx Remotion component:", error);
			if (!disposed) {
				setComponent(null);
			}
		});

		return () => {
			disposed = true;
			if (moduleUrl) {
				URL.revokeObjectURL(moduleUrl);
			}
		};
	}, [asset.document.compiledModule]);

	return component;
}

export function ShotlyxRemotionComponentPlayer({
	asset,
	controls = true,
	currentFrame,
	inputProps,
	background,
}: {
	asset: ShotlyxRemotionMGAsset;
	controls?: boolean;
	currentFrame?: number;
	inputProps?: Record<string, unknown>;
	background?: string;
}) {
	const playerRef = useRef<PlayerRef>(null);
	const Component = useCompiledRemotionComponent({ asset });
	const durationInFrames = Math.round(
		asset.document.durationSeconds * asset.document.fps,
	);
	const normalizedFrame =
		currentFrame === undefined
			? undefined
			: Math.max(0, Math.min(durationInFrames - 1, Math.floor(currentFrame)));
	const playerBackground =
		background ??
		(asset.document.transparentBackground === false
			? "#050505"
			: "transparent");

	useEffect(() => {
		if (normalizedFrame === undefined) return;
		playerRef.current?.seekTo(normalizedFrame);
	}, [normalizedFrame]);

	if (!Component) {
		return (
			<div className="flex size-full items-center justify-center bg-neutral-950 text-xs text-neutral-500">
				加载 Remotion 组件...
			</div>
		);
	}

	return (
		<Player
			ref={playerRef}
			component={Component}
			inputProps={inputProps ?? asset.document.defaultProps}
			durationInFrames={durationInFrames}
			fps={asset.document.fps}
			compositionWidth={asset.document.width}
			compositionHeight={asset.document.height}
			controls={controls}
			clickToPlay={controls}
			spaceKeyToPlayOrPause={controls}
			initialFrame={normalizedFrame}
			style={{
				width: "100%",
				height: "100%",
				background: playerBackground,
			}}
		/>
	);
}
