"use client";

import { useRef } from "react";
import {
	ShotlyxMGPropInput,
	coerceShotlyxMGPropValue,
} from "@/shotlyx/remotion-components/components/shotlyx-mg-asset-dialog";
import { SHOTLYX_MG_GRAPHIC_DEFINITION_ID } from "@/shotlyx/remotion-components/project-assets";
import {
	type ShotlyxMGAsset,
	type ShotlyxMGPropDefinition,
	type ShotlyxMGPropValue,
} from "@/shotlyx/remotion-components/types";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import {
	useKeyframedParamProperty,
	type KeyframedParamPropertyResult,
} from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import type { ParamDefinition, ParamValues } from "@/params";
import type { GraphicElement } from "@/timeline";
import { graphicsRegistry, registerDefaultGraphics, resolveGraphicElementParamsAtTime } from "@/graphics";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useEditor } from "@/editor/use-editor";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import type { MediaTime } from "@/wasm";

registerDefaultGraphics();

const DEFAULT_STROKE_WIDTH = 2;

export function GraphicTab({
	element,
	trackId,
}: {
	element: GraphicElement;
	trackId: string;
}) {
	const editor = useEditor();
	const definition = graphicsRegistry.get(element.definitionId);
	const shotlyxAsset =
		element.definitionId === SHOTLYX_MG_GRAPHIC_DEFINITION_ID &&
		element.motionGraphicAssetId
			? editor.project.getShotlyxMGAsset({
					id: element.motionGraphicAssetId,
				})
			: null;
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const liveElement = renderElement as GraphicElement;
	const resolvedParams = resolveGraphicElementParamsAtTime({
		element: liveElement,
		localTime,
	});

	const shapeParams = definition.params.filter(
		(p) =>
			p.group !== "stroke" &&
			!(
				element.definitionId === SHOTLYX_MG_GRAPHIC_DEFINITION_ID &&
				p.key === "shotlyxMGAssetId"
			),
	);
	const hasStrokeParams = definition.params.some((p) => p.group === "stroke");

	return (
		<div className="flex flex-col">
			{shotlyxAsset && (
				<ShotlyxMGInstanceSection
					asset={shotlyxAsset}
					element={liveElement}
					trackId={trackId}
				/>
			)}
			{shapeParams.length > 0 && (
				<Section collapsible sectionKey={`${element.id}:graphic`}>
					<SectionHeader>
						<SectionTitle>{definition.name}</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							{shapeParams.map((param) => (
								<AnimatedGraphicParamField
									key={param.key}
									param={param}
									trackId={trackId}
									element={liveElement}
									localTime={localTime}
									isPlayheadWithinElementRange={isPlayheadWithinElementRange}
									resolvedParams={resolvedParams}
								/>
							))}
						</SectionFields>
					</SectionContent>
				</Section>
			)}
			{hasStrokeParams && <StrokeSection element={element} trackId={trackId} />}
		</div>
	);
}

function isShotlyxMGPropValue(value: unknown): value is ShotlyxMGPropValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		Array.isArray(value)
	);
}

function resolveShotlyxMGPropValue({
	asset,
	element,
	prop,
}: {
	asset: ShotlyxMGAsset;
	element: GraphicElement;
	prop: ShotlyxMGPropDefinition;
}): ShotlyxMGPropValue {
	const instanceValue = element.params[prop.key];
	if (isShotlyxMGPropValue(instanceValue)) {
		return instanceValue;
	}
	return coerceShotlyxMGPropValue({
		prop,
		value: asset.document.defaultProps[prop.key],
	});
}

function ShotlyxMGInstanceSection({
	asset,
	element,
	trackId,
}: {
	asset: ShotlyxMGAsset;
	element: GraphicElement;
	trackId: string;
}) {
	const editor = useEditor();
	const setProp = ({
		key,
		value,
	}: {
		key: string;
		value: ShotlyxMGPropValue;
	}) => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						// Shotlyx Remotion props can include table rows. The editor's
						// generic ParamValues type is primitive-only, but the runtime
						// renderer intentionally reads these custom values.
						// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
						params: {
							...element.params,
							[key]: value,
						} as unknown as ParamValues,
					},
				},
			],
		});
	};

	return (
		<Section
			collapsible
			defaultOpen
			sectionKey={`${element.id}:shotlyx-mg-props`}
		>
			<SectionHeader>
				<SectionTitle>MG 参数 · Remotion</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					{asset.document.propsSchema.map((prop, index) => (
						<SectionField key={`${prop.key}:${index}`} label={prop.label}>
							<ShotlyxMGPropInput
								prop={prop}
								value={resolveShotlyxMGPropValue({
									asset,
									element,
									prop,
								})}
								onChange={(value) => setProp({ key: prop.key, value })}
							/>
						</SectionField>
					))}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function StrokeSection({
	element,
	trackId,
}: {
	element: GraphicElement;
	trackId: string;
}) {
	const editor = useEditor();
	const definition = graphicsRegistry.get(element.definitionId);
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const liveElement = renderElement as GraphicElement;
	const resolvedParams = resolveGraphicElementParamsAtTime({
		element: liveElement,
		localTime,
	});
	const strokeParams = definition.params.filter((p) => p.group === "stroke");
	const lastStrokeWidth = useRef(DEFAULT_STROKE_WIDTH);
	const isStrokeEnabled = Number(element.params.strokeWidth ?? 0) > 0;

	const toggleStroke = () => {
		if (isStrokeEnabled) {
			lastStrokeWidth.current = Number(
				element.params.strokeWidth ?? DEFAULT_STROKE_WIDTH,
			);
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: { params: { ...element.params, strokeWidth: 0 } },
					},
				],
			});
		} else {
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: {
							params: {
								...element.params,
								strokeWidth: lastStrokeWidth.current,
							},
						},
					},
				],
			});
		}
	};

	return (
		<Section
			collapsible
			defaultOpen={isStrokeEnabled}
			sectionKey={`${element.id}:stroke`}
		>
			<SectionHeader
				trailing={
					<Button
						variant="ghost"
						size="icon"
						onClick={(event) => {
							event.stopPropagation();
							toggleStroke();
						}}
					>
						<HugeiconsIcon
							icon={isStrokeEnabled ? MinusSignIcon : PlusSignIcon}
							strokeWidth={1}
						/>
					</Button>
				}
			>
				<SectionTitle>Stroke</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn(!isStrokeEnabled && "pointer-events-none opacity-50")}
			>
				<SectionFields>
					{strokeParams.map((param) => (
						<AnimatedGraphicParamField
							key={param.key}
							param={param}
							trackId={trackId}
							element={liveElement}
							localTime={localTime}
							isPlayheadWithinElementRange={isPlayheadWithinElementRange}
							resolvedParams={resolvedParams}
						/>
					))}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function AnimatedGraphicParamField({
	param,
	trackId,
	element,
	localTime,
	isPlayheadWithinElementRange,
	resolvedParams,
}: {
	key?: string;
	param: ParamDefinition;
	trackId: string;
	element: GraphicElement;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	resolvedParams: ParamValues;
}) {
	const animatedParam: KeyframedParamPropertyResult = useKeyframedParamProperty(
		{
			param,
			trackId,
			elementId: element.id,
			animations: element.animations,
			localTime,
			isPlayheadWithinElementRange,
			resolvedValue: resolvedParams[param.key] ?? param.default,
			buildBaseUpdates: ({ value }) => ({
				params: {
					...element.params,
					[param.key]: value,
				},
			}),
		},
	);

	return (
		<PropertyParamField
			param={param}
			value={resolvedParams[param.key] ?? param.default}
			onPreview={animatedParam.onPreview}
			onCommit={animatedParam.onCommit}
			keyframe={{
				isActive: animatedParam.isKeyframedAtTime,
				isDisabled: !isPlayheadWithinElementRange,
				onToggle: animatedParam.toggleKeyframe,
			}}
		/>
	);
}
