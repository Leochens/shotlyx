"use client";

import { useMemo } from "react";
import { Section, SectionContent, SectionFields } from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { useEditor } from "@/editor/use-editor";
import type { ParamValue, ParamValues } from "@/params";
import {
	getBuiltInElementParams,
	type ElementParamDefinition,
} from "@/params/registry";
import type { TProjectSubtitles } from "@/project/types";
import {
	buildDefaultProjectSubtitleStyleParams,
	createEmptyProjectSubtitles,
	DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE,
} from "@/subtitles/project-subtitles";
import type { SubtitleLineBreakMode } from "@/subtitles/types";

const DISPLAY_PARAM_KEYS = [
	"subtitle.revealMode",
	"subtitle.maxCharsPerLine",
	"subtitle.lineBreakMode",
	"subtitle.highlightColor",
] as const;
const TEXT_PARAM_KEYS = [
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"lineHeight",
] as const;
const LAYOUT_PARAM_KEYS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"opacity",
] as const;
const BACKGROUND_PARAM_KEYS = [
	"background.enabled",
	"background.color",
	"background.cornerRadius",
	"background.paddingX",
	"background.paddingY",
] as const;

const PROJECT_SUBTITLE_PARAM_KEYS = new Set<string>([
	...DISPLAY_PARAM_KEYS,
	...TEXT_PARAM_KEYS,
	...LAYOUT_PARAM_KEYS,
	...BACKGROUND_PARAM_KEYS,
]);

function getProjectSubtitleParams({
	keys,
}: {
	keys: readonly string[];
}): ElementParamDefinition[] {
	const keySet = new Set(keys);
	return getBuiltInElementParams({ type: "subtitle" }).filter((param) =>
		keySet.has(param.key),
	);
}

function normalizeProjectSubtitles({
	subtitles,
}: {
	subtitles: TProjectSubtitles | null | undefined;
}): TProjectSubtitles {
	return subtitles ?? createEmptyProjectSubtitles();
}

function readProjectSubtitleValue({
	key,
	subtitles,
	defaultStyleParams,
}: {
	key: string;
	subtitles: TProjectSubtitles;
	defaultStyleParams: ParamValues;
}): ParamValue {
	if (key === "subtitle.revealMode") return subtitles.revealMode;
	if (key === "subtitle.maxCharsPerLine") {
		return (
			subtitles.maxCharsPerLine ?? DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE
		);
	}
	if (key === "subtitle.lineBreakMode") return subtitles.lineBreakMode;
	return subtitles.styleParams?.[key] ?? defaultStyleParams[key] ?? "";
}

function getProjectSubtitleDefaultValue({
	key,
	defaultStyleParams,
}: {
	key: string;
	defaultStyleParams: ParamValues;
}): ParamValue {
	if (key === "subtitle.revealMode") return "line";
	if (key === "subtitle.maxCharsPerLine") {
		return DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE;
	}
	if (key === "subtitle.lineBreakMode") return "page";
	return defaultStyleParams[key] ?? "";
}

function isVisible({
	param,
	values,
}: {
	param: ElementParamDefinition;
	values: ParamValues;
}): boolean {
	return (param.dependencies ?? []).every(
		(dependency) => values[dependency.param] === dependency.equals,
	);
}

export function ProjectSubtitlePropertiesPanel() {
	const editor = useEditor();
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	const rawProjectSubtitles = useEditor(
		(e) => e.project.getActive().settings.subtitles ?? null,
	);
	const projectSubtitles = useMemo(
		() => normalizeProjectSubtitles({ subtitles: rawProjectSubtitles }),
		[rawProjectSubtitles],
	);
	const defaultStyleParams = useMemo(
		() => buildDefaultProjectSubtitleStyleParams({ canvasSize }),
		[canvasSize],
	);
	const values: ParamValues = {};
	for (const key of PROJECT_SUBTITLE_PARAM_KEYS) {
		values[key] = readProjectSubtitleValue({
			key,
			subtitles: projectSubtitles,
			defaultStyleParams,
		});
	}

	const updateParam = ({ key, value }: { key: string; value: ParamValue }) => {
		const currentSubtitles = normalizeProjectSubtitles({
			subtitles: editor.project.getActive().settings.subtitles,
		});
		let nextSubtitles: TProjectSubtitles;
		if (key === "subtitle.revealMode") {
			const revealMode =
				value === "line" || value === "token" || value === "karaoke"
					? value
					: currentSubtitles.revealMode;
			nextSubtitles = { ...currentSubtitles, revealMode };
		} else if (key === "subtitle.maxCharsPerLine") {
			nextSubtitles = {
				...currentSubtitles,
				maxCharsPerLine:
					typeof value === "number"
						? Math.round(value)
						: currentSubtitles.maxCharsPerLine,
			};
		} else if (key === "subtitle.lineBreakMode") {
			const lineBreakMode: SubtitleLineBreakMode =
				value === "wrap" || value === "page"
					? value
					: currentSubtitles.lineBreakMode;
			nextSubtitles = { ...currentSubtitles, lineBreakMode };
		} else {
			nextSubtitles = {
				...currentSubtitles,
				styleParams: {
					...(currentSubtitles.styleParams ?? {}),
					[key]: value,
				},
			};
		}

		void editor.project.updateSettings({
			settings: {
				subtitles: {
					...nextSubtitles,
					updatedAt: new Date().toISOString(),
				},
			},
		});
	};

	return (
		<div data-testid="global-subtitle-properties" className="pb-4">
			<ProjectSubtitleParamSection
				title="显示"
				params={getProjectSubtitleParams({ keys: DISPLAY_PARAM_KEYS })}
				values={values}
				defaultStyleParams={defaultStyleParams}
				onChange={updateParam}
			/>
			<ProjectSubtitleParamSection
				title="文字"
				params={getProjectSubtitleParams({ keys: TEXT_PARAM_KEYS })}
				values={values}
				defaultStyleParams={defaultStyleParams}
				onChange={updateParam}
			/>
			<ProjectSubtitleParamSection
				title="位置"
				params={getProjectSubtitleParams({ keys: LAYOUT_PARAM_KEYS })}
				values={values}
				defaultStyleParams={defaultStyleParams}
				onChange={updateParam}
			/>
			<ProjectSubtitleParamSection
				title="背景"
				params={getProjectSubtitleParams({ keys: BACKGROUND_PARAM_KEYS })}
				values={values}
				defaultStyleParams={defaultStyleParams}
				onChange={updateParam}
			/>
		</div>
	);
}

function ProjectSubtitleParamSection({
	title,
	params,
	values,
	defaultStyleParams,
	onChange,
}: {
	title: string;
	params: ElementParamDefinition[];
	values: ParamValues;
	defaultStyleParams: ParamValues;
	onChange: (args: { key: string; value: ParamValue }) => void;
}) {
	return (
		<Section sectionKey={`project-global-subtitles:${title}`}>
			<div className="px-3.5 pb-2 pt-4 text-xs font-medium text-foreground">
				{title}
			</div>
			<SectionContent className="pt-0">
				<SectionFields>
					{params
						.filter((param) => isVisible({ param, values }))
						.map((param) => {
							const defaultValue = getProjectSubtitleDefaultValue({
								key: param.key,
								defaultStyleParams,
							});
							return (
								<PropertyParamField
									key={param.key}
									param={{ ...param, default: defaultValue }}
									value={values[param.key] ?? defaultValue}
									onPreview={(value) => onChange({ key: param.key, value })}
									onCommit={() => {}}
								/>
							);
						})}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
