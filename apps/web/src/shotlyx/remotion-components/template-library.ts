import { createShotlyxRemotionComponentDocument } from "./generator";
export {
	listShotlyxMGTemplates,
	resolveShotlyxMGTemplateForTask,
	type ShotlyxMGTemplateCategory,
	type ShotlyxMGTemplateId,
	type ShotlyxMGTemplateMetadata,
} from "./template-registry";
import type { ShotlyxMGTemplateId } from "./template-registry";
import type {
	ShotlyxMGAspectRatio,
	ShotlyxMGPropDefinition,
	ShotlyxRemotionComponentDocument,
} from "./types";

export interface CreateShotlyxMGTemplateDocumentOptions {
	templateId: ShotlyxMGTemplateId;
	prompt: string;
	taskLabel: string;
	taskFocus: string;
	durationSeconds?: number;
	aspectRatio?: ShotlyxMGAspectRatio;
	transparentBackground?: boolean;
}

const DEFAULT_DURATION_SECONDS = 5;
const DEFAULT_ACCENT_COLOR = "#58A6FF";
const DEFAULT_FONT_FAMILY =
	'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export async function createShotlyxMGTemplateDocument({
	templateId,
	prompt,
	taskLabel,
	taskFocus,
	durationSeconds = DEFAULT_DURATION_SECONDS,
	aspectRatio = "16:9",
	transparentBackground = true,
}: CreateShotlyxMGTemplateDocumentOptions): Promise<ShotlyxRemotionComponentDocument> {
	const builder = TEMPLATE_BUILDERS[templateId];
	return await createShotlyxRemotionComponentDocument({
		name: builder.name,
		componentSource: builder.source({ prompt }),
		propsSchema: builder.propsSchema({ prompt, taskLabel, taskFocus }),
		sourcePrompt: prompt,
		durationSeconds,
		aspectRatio,
		transparentBackground,
	});
}

interface TemplateBuildContext {
	prompt: string;
	taskLabel?: string;
	taskFocus?: string;
}

interface TemplateBuilder {
	name: string;
	source: (context: TemplateBuildContext) => string;
	propsSchema: (context: Required<TemplateBuildContext>) => ShotlyxMGPropDefinition[];
}

function truncateText({
	value,
	maxLength,
}: {
	value: string;
	maxLength: number;
}): string {
	const trimmed = value.trim().replace(/\s+/g, " ");
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, maxLength - 1)}…`;
}

function extractTitleParts({ prompt }: { prompt: string }): {
	title: string;
	subtitle: string;
} {
	const bracketTitle = prompt.match(/《([^》]+)》/)?.[1]?.trim();
	const quotedTitle = prompt.match(/["“]([^"”]+)["”]/)?.[1]?.trim();
	const afterTitleMarker = prompt.match(/标题(?:是|为)?\s*([^，。,.]+)/)?.[1]?.trim();
	const rawTitle = bracketTitle || quotedTitle || afterTitleMarker || prompt;
	const [title, subtitle] = rawTitle
		.split(/[：:|-]/)
		.map((part) => part.trim())
		.filter(Boolean);
	return {
		title: truncateText({ value: title || rawTitle, maxLength: 26 }),
		subtitle: truncateText({
			value: subtitle || prompt.replace(rawTitle, "").trim() || "Shotlyx MG",
			maxLength: 36,
		}),
	};
}

function extractNumbers({ prompt }: { prompt: string }): string[] {
	return Array.from(new Set(prompt.match(/\d+(?:\.\d+)?%?/g) ?? [])).slice(0, 4);
}

function titlePropsSchema({
	prompt,
	taskLabel,
}: Required<TemplateBuildContext>): ShotlyxMGPropDefinition[] {
	const { title, subtitle } = extractTitleParts({ prompt });
	const numbers = extractNumbers({ prompt });
	return [
		textProp({ key: "title", label: "主标题", defaultValue: title }),
		textProp({ key: "subtitle", label: "副标题", defaultValue: subtitle }),
		textProp({
			key: "kicker",
			label: "标签",
			defaultValue: numbers.length ? numbers.join(" / ") : taskLabel,
		}),
		colorProp({
			key: "accentColor",
			label: "强调色",
			defaultValue: DEFAULT_ACCENT_COLOR,
		}),
		fontProp({
			key: "fontFamily",
			label: "字体",
			defaultValue: DEFAULT_FONT_FAMILY,
		}),
		numberProp({
			key: "intensity",
			label: "动效强度",
			defaultValue: 1,
			min: 0.4,
			max: 1.6,
			step: 0.1,
		}),
		selectProp({
			key: "entrance",
			label: "入场方式",
			defaultValue: "mask",
			options: [
				{ label: "遮罩揭示", value: "mask" },
				{ label: "上滑", value: "slide" },
				{ label: "缩放", value: "scale" },
			],
		}),
	];
}

function metricPropsSchema({
	prompt,
	taskLabel,
	taskFocus,
}: Required<TemplateBuildContext>): ShotlyxMGPropDefinition[] {
	const numbers = extractNumbers({ prompt });
	const { title, subtitle } = extractTitleParts({ prompt });
	return [
		textProp({
			key: "metricValue",
			label: "重点数值",
			defaultValue: numbers[0] ?? title,
		}),
		textProp({ key: "metricLabel", label: "指标标签", defaultValue: taskLabel }),
		textProp({
			key: "caption",
			label: "说明文字",
			defaultValue: truncateText({
				value: taskFocus || subtitle,
				maxLength: 42,
			}),
		}),
		colorProp({
			key: "accentColor",
			label: "强调色",
			defaultValue: "#7CFFB2",
		}),
		fontProp({
			key: "fontFamily",
			label: "字体",
			defaultValue: DEFAULT_FONT_FAMILY,
		}),
		numberProp({
			key: "glow",
			label: "发光强度",
			defaultValue: 0.75,
			min: 0,
			max: 1,
			step: 0.05,
		}),
	];
}

function annotationPropsSchema({
	prompt,
	taskLabel,
	taskFocus,
}: Required<TemplateBuildContext>): ShotlyxMGPropDefinition[] {
	const numbers = extractNumbers({ prompt });
	const { title } = extractTitleParts({ prompt });
	return [
		textProp({
			key: "targetText",
			label: "被标注内容",
			defaultValue: numbers[0] ?? title,
		}),
		textProp({
			key: "calloutText",
			label: "标注文案",
			defaultValue: truncateText({
				value: taskFocus || taskLabel,
				maxLength: 34,
			}),
		}),
		selectProp({
			key: "shape",
			label: "标注形状",
			defaultValue: "circle",
			options: [
				{ label: "圆圈", value: "circle" },
				{ label: "方框", value: "box" },
				{ label: "下划线", value: "underline" },
			],
		}),
		colorProp({
			key: "accentColor",
			label: "强调色",
			defaultValue: "#FFCF5A",
		}),
		fontProp({
			key: "fontFamily",
			label: "字体",
			defaultValue: DEFAULT_FONT_FAMILY,
		}),
	];
}

function dataTablePropsSchema({
	prompt,
	taskLabel,
}: Required<TemplateBuildContext>): ShotlyxMGPropDefinition[] {
	const { title } = extractTitleParts({ prompt });
	const numbers = extractNumbers({ prompt });
	const rows = numbers.length
		? numbers.map((number, index) => ({
				项目: `阶段 ${index + 1}`,
				数值: number,
				说明: index === numbers.length - 1 ? "重点指标" : "对比指标",
			}))
		: [
				{ 项目: "主题", 数值: title, 说明: taskLabel },
				{ 项目: "重点", 数值: "可编辑", 说明: "模板参数" },
			];
	return [
		textProp({ key: "title", label: "表格标题", defaultValue: title }),
		{
			key: "rows",
			label: "表格数据",
			type: "table",
			role: "data",
			default: rows,
			columns: ["项目", "数值", "说明"],
		},
		numberProp({
			key: "highlightRow",
			label: "高亮行",
			defaultValue: Math.max(0, rows.length - 1),
			min: 0,
			max: 8,
			step: 1,
		}),
		colorProp({
			key: "accentColor",
			label: "强调色",
			defaultValue: "#58A6FF",
		}),
		fontProp({
			key: "fontFamily",
			label: "字体",
			defaultValue: DEFAULT_FONT_FAMILY,
		}),
	];
}

function textProp({
	key,
	label,
	defaultValue,
}: {
	key: string;
	label: string;
	defaultValue: string;
}): ShotlyxMGPropDefinition {
	return {
		key,
		label,
		type: "text",
		role: "content",
		default: defaultValue,
	};
}

function colorProp({
	key,
	label,
	defaultValue,
}: {
	key: string;
	label: string;
	defaultValue: string;
}): ShotlyxMGPropDefinition {
	return {
		key,
		label,
		type: "color",
		role: "style",
		default: defaultValue,
	};
}

function fontProp({
	key,
	label,
	defaultValue,
}: {
	key: string;
	label: string;
	defaultValue: string;
}): ShotlyxMGPropDefinition {
	return {
		key,
		label,
		type: "font",
		role: "typography",
		default: defaultValue,
	};
}

function numberProp({
	key,
	label,
	defaultValue,
	min,
	max,
	step,
}: {
	key: string;
	label: string;
	defaultValue: number;
	min: number;
	max: number;
	step: number;
}): ShotlyxMGPropDefinition {
	return {
		key,
		label,
		type: "number",
		role: "motion",
		default: defaultValue,
		min,
		max,
		step,
	};
}

function selectProp({
	key,
	label,
	defaultValue,
	options,
}: {
	key: string;
	label: string;
	defaultValue: string;
	options: Array<{ label: string; value: string }>;
}): ShotlyxMGPropDefinition {
	return {
		key,
		label,
		type: "select",
		role: "style",
		default: defaultValue,
		options,
	};
}

const TEMPLATE_BUILDERS: Record<ShotlyxMGTemplateId, TemplateBuilder> = {
	"title-reveal": {
		name: "内置模板 · 标题大字展示",
		propsSchema: titlePropsSchema,
		source: titleRevealSource,
	},
	"metric-emphasis": {
		name: "内置模板 · 重点指标突出",
		propsSchema: metricPropsSchema,
		source: metricEmphasisSource,
	},
	"annotation-callout": {
		name: "内置模板 · 圆圈方框标注",
		propsSchema: annotationPropsSchema,
		source: annotationCalloutSource,
	},
	"data-table": {
		name: "内置模板 · 数据表格图",
		propsSchema: dataTablePropsSchema,
		source: dataTableSource,
	},
};

function titleRevealSource(): string {
	return `export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const h = React.createElement;
	const frame = useCurrentFrame();
	const show = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	const y = props.entrance === "slide" ? interpolate(frame, [0, 24], [42, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
	const scale = props.entrance === "scale" ? interpolate(frame, [0, 24], [0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
	const sweep = interpolate(frame, [10, 46], [-20, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	return h(AbsoluteFill, { style: { pointerEvents: "none", color: "white", fontFamily: props.fontFamily } },
		h("div", { style: { position: "absolute", left: "8%", top: "24%", maxWidth: "76%", opacity: show, transform: "translateY(" + y + "px) scale(" + scale + ")" } },
			h("div", { style: { display: "inline-flex", padding: "7px 14px", borderRadius: 999, border: "1px solid " + props.accentColor, color: props.accentColor, fontSize: 26, marginBottom: 24, background: "rgba(8,12,22,.52)" } }, props.kicker),
			h("div", { style: { fontSize: 86, fontWeight: 820, lineHeight: .98, letterSpacing: 0, textShadow: "0 18px 60px rgba(0,0,0,.38)" } }, props.title),
			h("div", { style: { marginTop: 18, fontSize: 34, lineHeight: 1.2, opacity: interpolate(frame, [18, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), color: "rgba(255,255,255,.82)" } }, props.subtitle),
			h("div", { style: { marginTop: 30, width: "68%", height: 4, borderRadius: 999, background: "linear-gradient(90deg,transparent," + props.accentColor + ",transparent)", transform: "translateX(" + sweep + "%)", opacity: .35 + props.intensity * .38 } })
		)
	);
}`;
}

function metricEmphasisSource(): string {
	return `export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const h = React.createElement;
	const frame = useCurrentFrame();
	const pop = interpolate(frame, [0, 18], [.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	const line = interpolate(frame, [16, 54], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	return h(AbsoluteFill, { style: { pointerEvents: "none", color: "white", fontFamily: props.fontFamily } },
		h("div", { style: { position: "absolute", left: "10%", top: "28%", padding: "30px 36px", borderRadius: 28, border: "1px solid rgba(255,255,255,.18)", background: "rgba(10,14,22,.5)", boxShadow: "0 24px 80px rgba(0,0,0,.3),0 0 " + Math.round(props.glow * 80) + "px " + props.accentColor, transform: "scale(" + pop + ")" } },
			h("div", { style: { fontSize: 28, color: props.accentColor, fontWeight: 700 } }, props.metricLabel),
			h("div", { style: { fontSize: 118, lineHeight: .96, fontWeight: 860, letterSpacing: 0 } }, props.metricValue),
			h("div", { style: { marginTop: 18, fontSize: 30, maxWidth: 720, color: "rgba(255,255,255,.82)" } }, props.caption),
			h("div", { style: { marginTop: 22, width: line + "%", height: 5, borderRadius: 999, background: props.accentColor } })
		)
	);
}`;
}

function annotationCalloutSource(): string {
	return `export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const h = React.createElement;
	const frame = useCurrentFrame();
	const draw = interpolate(frame, [6, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	const label = interpolate(frame, [28, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	const radius = props.shape === "circle" ? 999 : 20;
	const underlineHeight = props.shape === "underline" ? 5 : 82;
	const ring = { position: "absolute", left: 0, right: 0, bottom: props.shape === "underline" ? 10 : "auto", top: props.shape === "underline" ? "auto" : 0, height: underlineHeight, borderRadius: radius, border: props.shape === "underline" ? "0 solid transparent" : "4px solid " + props.accentColor, background: props.shape === "underline" ? props.accentColor : "transparent", opacity: draw, transform: "scaleX(" + draw + ")", transformOrigin: "left center" };
	return h(AbsoluteFill, { style: { pointerEvents: "none", color: "white", fontFamily: props.fontFamily } },
		h("div", { style: { position: "absolute", left: "18%", top: "36%", display: "flex", alignItems: "center", gap: 28 } },
			h("div", { style: { position: "relative", padding: "20px 30px" } }, h("div", { style: { fontSize: 56, fontWeight: 780, letterSpacing: 0 } }, props.targetText), h("div", { style: ring })),
			h("div", { style: { width: 120, height: 3, borderRadius: 999, background: props.accentColor, transform: "scaleX(" + draw + ")", transformOrigin: "left center" } }),
			h("div", { style: { padding: "16px 20px", borderRadius: 18, background: "rgba(8,12,22,.62)", border: "1px solid rgba(255,255,255,.18)", fontSize: 28, lineHeight: 1.25, maxWidth: 440, opacity: label, transform: "translateY(" + (18 - label * 18) + "px)" } }, props.calloutText)
		)
	);
}`;
}

function dataTableSource(): string {
	return `export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const h = React.createElement;
	const frame = useCurrentFrame();
	const rows = Array.isArray(props.rows) ? props.rows : [];
	const columns = ["项目", "数值", "说明"];
	const getCell = (row, column) => {
		if (column === "项目") return row["项目"];
		if (column === "数值") return row["数值"];
		return row["说明"];
	};
	const grid = "1.1fr .9fr 1.4fr";
	return h(AbsoluteFill, { style: { pointerEvents: "none", color: "white", fontFamily: props.fontFamily } },
		h("div", { style: { position: "absolute", left: "9%", right: "9%", top: "16%", padding: "28px 32px", borderRadius: 24, background: "rgba(8,12,22,.58)", border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 24px 70px rgba(0,0,0,.28)" } },
			h("div", { style: { fontSize: 44, fontWeight: 820, marginBottom: 24, letterSpacing: 0 } }, props.title),
			h("div", { style: { display: "grid", gridTemplateColumns: grid, gap: 12, color: props.accentColor, fontSize: 22, fontWeight: 760 } }, columns.map((c) => h("div", { key: c }, c))),
			h("div", { style: { marginTop: 12, display: "grid", gap: 10 } }, rows.slice(0, 6).map((row, index) => {
				const p = interpolate(frame, [12 + index * 6, 28 + index * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
				const hi = index === props.highlightRow;
				return h("div", { key: index, style: { display: "grid", gridTemplateColumns: grid, gap: 12, padding: "15px 18px", borderRadius: 16, background: hi ? "rgba(88,166,255,.22)" : "rgba(255,255,255,.07)", border: hi ? "1px solid " + props.accentColor : "1px solid rgba(255,255,255,.08)", fontSize: 25, opacity: p, transform: "translateY(" + (18 - p * 18) + "px)" } }, columns.map((c) => h("div", { key: c }, String(getCell(row, c) ?? ""))));
			}))
		)
	);
}`;
}
