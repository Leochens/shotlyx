import type {
	ShotlyxHyperFramesTemplateId,
	ShotlyxMGPropDefinition,
} from "@/shotlyx/remotion-components/types";

export interface ShotlyxHyperFramesTemplate {
	id: ShotlyxHyperFramesTemplateId;
	label: string;
	description: string;
	bestFor: Array<"title" | "arrow" | "box" | "circle" | "caption-emphasis">;
	colors: {
		text: string;
		mutedText: string;
		panel: string;
		accent: string;
		secondaryAccent: string;
		stroke: string;
	};
	fonts: {
		heading: string;
		body: string;
	};
	motion: {
		easeIn: string;
		easeOut: string;
		stagger: number;
		entranceY: number;
	};
	principles: string[];
	constraints: string[];
	propsSchema: ShotlyxMGPropDefinition[];
}

const COMMON_PROPS: ShotlyxMGPropDefinition[] = [
	{
		key: "title",
		label: "Title",
		type: "text",
		role: "content",
		default: "Make the moment obvious",
	},
	{
		key: "subtitle",
		label: "Subtitle",
		type: "text",
		role: "content",
		default: "A designed overlay that reads like video, not a web card.",
	},
	{
		key: "callout",
		label: "Callout",
		type: "text",
		role: "content",
		default: "Key point",
	},
	{
		key: "accentColor",
		label: "Accent color",
		type: "color",
		role: "style",
		default: "#0066ff",
	},
	{
		key: "secondaryColor",
		label: "Secondary color",
		type: "color",
		role: "style",
		default: "#f5a623",
	},
	{
		key: "direction",
		label: "Direction",
		type: "select",
		role: "motion",
		default: "right",
		options: [
			{ label: "Right", value: "right" },
			{ label: "Left", value: "left" },
			{ label: "Up", value: "up" },
			{ label: "Down", value: "down" },
		],
	},
	{
		key: "intensity",
		label: "Motion intensity",
		type: "number",
		role: "motion",
		default: 0.72,
		min: 0,
		max: 1,
		step: 0.01,
	},
];

function withTemplateDefaults({
	accent,
	secondary,
}: {
	accent: string;
	secondary: string;
}): ShotlyxMGPropDefinition[] {
	return COMMON_PROPS.map((prop) => {
		if (prop.key === "accentColor") return { ...prop, default: accent };
		if (prop.key === "secondaryColor") return { ...prop, default: secondary };
		return prop;
	});
}

export const SHOTLYX_HYPERFRAMES_TEMPLATE_IDS = [
	"swiss-pulse-explainer",
	"kinetic-launch-type",
	"data-drift-ai",
	"editorial-spotlight",
] as const;

export const SHOTLYX_HYPERFRAMES_TEMPLATES: ShotlyxHyperFramesTemplate[] = [
	{
		id: "swiss-pulse-explainer",
		label: "Swiss Pulse Explainer",
		description:
			"Grid-led, crisp title/callout overlays for explainers and product notes.",
		bestFor: ["title", "arrow", "box", "caption-emphasis"],
		colors: {
			text: "#f7f8fa",
			mutedText: "rgba(247,248,250,0.72)",
			panel: "rgba(12,14,18,0.78)",
			accent: "#0066ff",
			secondaryAccent: "#f5a623",
			stroke: "#0066ff",
		},
		fonts: {
			heading: "Inter, Helvetica, Arial, sans-serif",
			body: "Inter, Helvetica, Arial, sans-serif",
		},
		motion: {
			easeIn: "power2.in",
			easeOut: "expo.out",
			stagger: 0.08,
			entranceY: 48,
		},
		principles: [
			"12-column grid feel with one strong anchor",
			"one visible accent hue and structured rules",
			"transparent overlay by default",
		],
		constraints: [
			"straight or 45-degree arrows only",
			"outline boxes must not fully cover the target",
			"caption emphasis uses bars, underline, or a small pill",
		],
		propsSchema: withTemplateDefaults({
			accent: "#0066ff",
			secondary: "#f5a623",
		}),
	},
	{
		id: "kinetic-launch-type",
		label: "Kinetic Launch Type",
		description:
			"Large kinetic typography with chunky callouts for hooks and reveals.",
		bestFor: ["title", "caption-emphasis", "arrow", "circle"],
		colors: {
			text: "#fffaf0",
			mutedText: "rgba(255,250,240,0.74)",
			panel: "rgba(17,17,17,0.76)",
			accent: "#ffd60a",
			secondaryAccent: "#e63946",
			stroke: "#ffd60a",
		},
		fonts: {
			heading: "Space Grotesk, Inter, Arial, sans-serif",
			body: "Inter, Arial, sans-serif",
		},
		motion: {
			easeIn: "power3.in",
			easeOut: "back.out(1.8)",
			stagger: 0.045,
			entranceY: 62,
		},
		principles: [
			"text is the main visual object",
			"fast entrance, readable hold",
			"two or three active layers only",
		],
		constraints: [
			"split titles into words but preserve a stable final layout",
			"finite pulse count only",
			"baseline of emphasized captions cannot jump",
		],
		propsSchema: withTemplateDefaults({
			accent: "#ffd60a",
			secondary: "#e63946",
		}),
	},
	{
		id: "data-drift-ai",
		label: "Data Drift AI",
		description:
			"Sparse data-flow overlays with nodes, traces, glow, and smooth movement.",
		bestFor: ["title", "arrow", "circle", "box"],
		colors: {
			text: "#eafbff",
			mutedText: "rgba(234,251,255,0.68)",
			panel: "rgba(8,12,20,0.66)",
			accent: "#06b6d4",
			secondaryAccent: "#7c3aed",
			stroke: "rgba(6,182,212,0.92)",
		},
		fonts: {
			heading: "IBM Plex Sans, Inter, Arial, sans-serif",
			body: "IBM Plex Sans, Inter, Arial, sans-serif",
		},
		motion: {
			easeIn: "sine.inOut",
			easeOut: "power2.out",
			stagger: 0.12,
			entranceY: 34,
		},
		principles: [
			"thin data paths explain the motion",
			"soft glow supports one focal label",
			"continuous movement without visual clutter",
		],
		constraints: [
			"max four information boxes",
			"decorative opacity stays under 0.35",
			"line animations use strokeDashoffset",
		],
		propsSchema: withTemplateDefaults({
			accent: "#06b6d4",
			secondary: "#7c3aed",
		}),
	},
	{
		id: "editorial-spotlight",
		label: "Editorial Spotlight",
		description:
			"Human, tutorial-friendly annotation with marker sweeps and soft notes.",
		bestFor: ["title", "box", "circle", "caption-emphasis", "arrow"],
		colors: {
			text: "#2b2722",
			mutedText: "rgba(43,39,34,0.72)",
			panel: "rgba(255,248,236,0.84)",
			accent: "#f5a623",
			secondaryAccent: "#8faf8c",
			stroke: "#f5a623",
		},
		fonts: {
			heading: "Source Serif 4, Georgia, serif",
			body: "Inter, Arial, sans-serif",
		},
		motion: {
			easeIn: "power1.inOut",
			easeOut: "sine.inOut",
			stagger: 0.1,
			entranceY: 30,
		},
		principles: [
			"one focal annotation at a time",
			"soft hierarchy, not hype motion",
			"marker emphasis remains readable without the marker",
		],
		constraints: [
			"seeded deterministic offsets only",
			"no random hand-drawn jitter",
			"text must fit in note containers",
		],
		propsSchema: withTemplateDefaults({
			accent: "#f5a623",
			secondary: "#8faf8c",
		}),
	},
];

export function getShotlyxHyperFramesTemplate({
	templateId,
}: {
	templateId?: string;
}): ShotlyxHyperFramesTemplate {
	return (
		SHOTLYX_HYPERFRAMES_TEMPLATES.find(
			(template) => template.id === templateId,
		) ?? SHOTLYX_HYPERFRAMES_TEMPLATES[0]
	);
}

export function listShotlyxHyperFramesTemplates(): ShotlyxHyperFramesTemplate[] {
	return SHOTLYX_HYPERFRAMES_TEMPLATES;
}
