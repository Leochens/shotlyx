import type { EditorCore } from "@/core";
import type { MediaTime } from "@/wasm";
import type { CreateTimelineElement } from "@/timeline";
import type { Tool } from "./types";
import {
	optionalNumberParam,
	optionalStringParam,
	requireEnumParam,
	requireNumberParam,
	requireStringParam,
} from "./validation";
import {
	planTextOverlay,
	TEXT_OVERLAY_KINDS,
	TEXT_OVERLAY_PLACEMENTS,
	TEXT_OVERLAY_STYLES,
	type TextOverlayKind,
	type TextOverlayPlacement,
	type TextOverlayStyle,
} from "./text-overlay-planner";

function getCanvasSize({ editor }: { editor: EditorCore }): {
	width: number;
	height: number;
} {
	const canvasSize = editor.project.getActiveOrNull()?.settings.canvasSize;
	return canvasSize ?? { width: 1024, height: 768 };
}

export function buildTextOverlayTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: { mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime };
}): Tool[] {
	const { mediaTimeFromSeconds } = deps;

	return [
		{
			name: "timeline_insert_text_overlay",
			description:
				"Create a designed text overlay such as a title, caption, lower third, or label. The tool plans readable size, placement, and style automatically.",
			parameters: {
				content: { type: "string", description: "Text content to insert" },
				kind: {
					type: "string",
					description:
						"Text role: title, subtitle, caption, lower_third, label",
				},
				style: {
					type: "string",
					description: "Visual style: documentary, clean, bold, social",
					optional: true,
				},
				placement: {
					type: "string",
					description: "Placement: top, center, lower_third, bottom",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description: "Start time in seconds",
				},
				durationSeconds: {
					type: "number",
					description: "Optional duration in seconds",
					optional: true,
				},
				trackId: {
					type: "string",
					description:
						"Optional target text track ID. Omit to auto-place on a text track.",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const content = requireStringParam(params, "content");
				if (content.trim().length === 0) {
					throw new Error("参数缺失：content 不能为空");
				}
				const kind = requireEnumParam(
					params,
					"kind",
					TEXT_OVERLAY_KINDS,
				) as TextOverlayKind;
				const rawStyle = optionalStringParam(params, "style");
				const style = rawStyle
					? (requireEnumParam(
							{ style: rawStyle },
							"style",
							TEXT_OVERLAY_STYLES,
						) as TextOverlayStyle)
					: undefined;
				const rawPlacement = optionalStringParam(params, "placement");
				const placement = rawPlacement
					? (requireEnumParam(
							{ placement: rawPlacement },
							"placement",
							TEXT_OVERLAY_PLACEMENTS,
						) as TextOverlayPlacement)
					: undefined;
				const startTimeSeconds = requireNumberParam(params, "startTimeSeconds");
				const durationSeconds = optionalNumberParam(params, "durationSeconds");
				const trackId = optionalStringParam(params, "trackId");
				if (trackId) {
					const track = editor.timeline.getTrackById({ trackId });
					if (!track) {
						throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
					}
					if (track.type !== "text") {
						throw new Error(`类型不匹配：无法将文本插入 ${track.type} 轨道`);
					}
				}

				const plan = planTextOverlay({
					canvasSize: getCanvasSize({ editor }),
					content,
					kind,
					style,
					placement,
					durationSeconds,
				});
				const element: CreateTimelineElement = {
					type: "text",
					name: plan.name,
					startTime: mediaTimeFromSeconds({ seconds: startTimeSeconds }),
					duration: mediaTimeFromSeconds({ seconds: plan.durationSeconds }),
					trimStart: mediaTimeFromSeconds({ seconds: 0 }),
					trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
					params: plan.params,
				};
				const insertion = editor.timeline.insertElement({
					element,
					placement: trackId
						? { mode: "explicit", trackId }
						: { mode: "auto", trackType: "text" },
				});
				const selectedElement = editor.selection.getSelectedElements()[0];

				return {
					inserted: true,
					trackId: insertion.trackId ?? selectedElement?.trackId ?? trackId,
					elementId: insertion.elementId ?? selectedElement?.elementId,
					kind,
					style: style ?? "clean",
					placement: placement ?? null,
					startTime: startTimeSeconds,
					duration: plan.durationSeconds,
					params: plan.params,
				};
			},
		},
	];
}
