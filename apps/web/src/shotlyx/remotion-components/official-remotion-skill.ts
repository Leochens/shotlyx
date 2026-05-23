export const OFFICIAL_REMOTION_SKILL_SOURCE = {
	name: "remotion-best-practices",
	repository: "https://github.com/remotion-dev/skills",
	commit: "277510e78245ac0fa275d7cb6520d52e0ac2e212",
	skillPath: "skills/remotion/SKILL.md",
	installCommand:
		"npx skills add https://github.com/remotion-dev/skills --skill remotion",
	verifiedAt: "2026-05-18",
} as const;

export type OfficialRemotionSkillImpact =
	| "critical"
	| "high"
	| "medium"
	| "low";

export interface OfficialRemotionSkillRule {
	id: string;
	impact: OfficialRemotionSkillImpact;
	sourcePath: string;
	description: string;
	tags: string[];
	triggers: string[];
	officialDirectives: string[];
	shotlyxAdapterNotes: string[];
}

function sourceUrl({ sourcePath }: { sourcePath: string }): string {
	return `${OFFICIAL_REMOTION_SKILL_SOURCE.repository}/blob/${OFFICIAL_REMOTION_SKILL_SOURCE.commit}/${sourcePath}`;
}

export const OFFICIAL_REMOTION_SKILL_RULES: OfficialRemotionSkillRule[] = [
	{
		id: "shotlyx-runtime-adapter",
		impact: "critical",
		sourcePath: OFFICIAL_REMOTION_SKILL_SOURCE.skillPath,
		description: "Shotlyx runtime adapter for the official Remotion skill.",
		tags: ["shotlyx", "runtime", "adapter"],
		triggers: [],
		officialDirectives: [
			"Generate Remotion video code with frame-based animation, assets, media, sequencing, and composition rules.",
		],
		shotlyxAdapterNotes: [
			"Do not add import statements. Use the provided global Remotion object only.",
			"Use only Shotlyx exposed globals: AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video.",
			"Declare every editable value in propsSchema. Use props for user media instead of staticFile() or invented filenames.",
			"Audio should be handled by Shotlyx timeline tools unless Shotlyx exposes an Audio runtime global later.",
		],
	},
	{
		id: "animations",
		impact: "critical",
		sourcePath: "skills/remotion/rules/animations.md",
		description: "Fundamental animation skills for Remotion.",
		tags: ["animations", "transitions", "frames", "useCurrentFrame"],
		triggers: [
			"动画",
			"动效",
			"motion",
			"animate",
			"animation",
			"入场",
			"出场",
		],
		officialDirectives: [
			"Drive animations with useCurrentFrame().",
			"Write animation timing in seconds and multiply by fps from useVideoConfig().",
			"Use interpolate() with explicit frame ranges and easing.",
			"CSS transitions, CSS animations, and Tailwind animation classes are forbidden.",
		],
		shotlyxAdapterNotes: [
			"Use frame-derived style values only; never rely on browser-time animation primitives.",
			"Clamp interpolate() output unless deliberate overshoot is part of the effect.",
		],
	},
	{
		id: "sequencing",
		impact: "critical",
		sourcePath: "skills/remotion/rules/sequencing.md",
		description: "Sequencing patterns for delay, trim, and limited duration.",
		tags: ["sequence", "series", "timing", "delay", "trim"],
		triggers: ["分段", "切换", "sequence", "scene", "字幕", "caption", "delay"],
		officialDirectives: [
			"Use Sequence to delay when an element appears in the timeline.",
			"Use durationInFrames to limit how long content is visible.",
			'Use layout="none" when an extra absolute-fill wrapper is not wanted.',
			"useCurrentFrame() inside a Sequence returns local frame values.",
		],
		shotlyxAdapterNotes: [
			"Use Sequence. Do not use Series until Shotlyx exposes it in the runtime.",
			"Prefer simple nested Sequence layouts that remain readable and editable.",
		],
	},
	{
		id: "text-animations",
		impact: "medium",
		sourcePath: "skills/remotion/rules/text-animations.md",
		description: "Typography, typewriter, and word highlighting patterns.",
		tags: ["typography", "text", "typewriter", "highlighter"],
		triggers: [
			"文字",
			"标题",
			"打字机",
			"typewriter",
			"高亮",
			"highlight",
			"text",
		],
		officialDirectives: [
			"Use string slicing for typewriter effects.",
			"Never fake typewriter effects with per-character opacity.",
			"Animate word highlights from frame timing.",
		],
		shotlyxAdapterNotes: [
			"Expose title/copy, font, colors, and motion speed as propsSchema fields.",
			"Keep text within canvas safe areas and choose thumbnailFrame after text is visible.",
		],
	},
	{
		id: "timing",
		impact: "medium",
		sourcePath: "skills/remotion/rules/timing.md",
		description: "Interpolation and timing in Remotion.",
		tags: ["easing", "bezier", "interpolation", "spring", "timing"],
		triggers: ["弹性", "缓动", "节奏", "timing", "easing", "spring", "bounce"],
		officialDirectives: [
			"Drive motion with interpolate() over explicit frame ranges.",
			"Use Easing.bezier() for custom timing curves.",
			"Use spring() for specialized physical motion.",
			"Clamp interpolation output when values should stay in range.",
		],
		shotlyxAdapterNotes: [
			"Prefer one or two clear timing curves per component instead of many unrelated motions.",
			"Base frame ranges on fps from useVideoConfig().",
		],
	},
	{
		id: "images",
		impact: "high",
		sourcePath: "skills/remotion/rules/images.md",
		description: "Embedding and sizing images in Remotion.",
		tags: ["image", "img", "asset", "dimensions"],
		triggers: ["图片", "图像", "logo", "image", "img", "photo", "avatar"],
		officialDirectives: [
			"Use Img for images.",
			"Control image size and placement with the style prop.",
			"Use objectFit for stable cropping and fitting.",
		],
		shotlyxAdapterNotes: [
			"Do not call staticFile(). Image URLs must come from editable image props.",
			"Render a designed fallback if an image prop is empty.",
		],
	},
	{
		id: "videos",
		impact: "high",
		sourcePath: "skills/remotion/rules/videos.md",
		description: "Embedding videos in Remotion.",
		tags: ["video", "media", "trim", "volume", "speed", "loop", "pitch"],
		triggers: ["视频", "素材", "video", "media", "b-roll", "clip"],
		officialDirectives: [
			"Use Video for video elements.",
			"Use trimBefore and trimAfter for trimming.",
			"Wrap media in Sequence to delay when it appears.",
			"Use style and objectFit for size and position.",
		],
		shotlyxAdapterNotes: [
			"Use the Shotlyx global Video, not @remotion/media imports.",
			"Video URLs must come from editable props or imported media assets.",
		],
	},
	{
		id: "subtitles",
		impact: "medium",
		sourcePath: "skills/remotion/rules/subtitles.md",
		description: "Subtitle and caption data rules.",
		tags: ["subtitles", "captions", "json"],
		triggers: [
			"字幕",
			"caption",
			"subtitle",
			"transcript",
			"srt",
			"vtt",
			"逐词",
		],
		officialDirectives: [
			"Represent captions as JSON-style timed caption objects.",
			"Keep caption timing fields explicit: text, start, and end.",
			"Load display/import/transcribe caption rules depending on the task.",
		],
		shotlyxAdapterNotes: [
			"For timeline subtitles, prefer the Agent subtitles_import tool over generating Remotion caption code.",
			"For MG caption components, expose caption rows as an editable table prop.",
		],
	},
	{
		id: "display-captions",
		impact: "medium",
		sourcePath: "skills/remotion/rules/display-captions.md",
		description: "Displaying captions with pages and word highlighting.",
		tags: ["captions", "subtitles", "display", "highlight"],
		triggers: [
			"字幕",
			"caption",
			"subtitle",
			"高亮",
			"逐词",
			"词高亮",
			"word highlight",
			"caption page",
			"tiktok",
		],
		officialDirectives: [
			"Group captions into display pages.",
			"Render caption pages with Sequence.",
			"Calculate frame timing from caption start and end values.",
		],
		shotlyxAdapterNotes: [
			"Do not fetch caption JSON inside generated components. Pass caption data through propsSchema.",
			"Keep a single editable caption style for a generated caption component.",
		],
	},
	{
		id: "import-srt-captions",
		impact: "medium",
		sourcePath: "skills/remotion/rules/import-srt-captions.md",
		description: "Importing SRT captions.",
		tags: ["captions", "srt", "subtitles"],
		triggers: ["srt", "字幕文件", "导入字幕", "import captions"],
		officialDirectives: [
			"Parse SRT into timed caption data before rendering.",
			"Use caption data rather than embedding raw SRT text in JSX.",
		],
		shotlyxAdapterNotes: [
			"In Shotlyx, use subtitles_import for SRT at the timeline layer.",
			"Only generate Remotion SRT rendering code when the user explicitly wants an MG component.",
		],
	},
	{
		id: "parameters",
		impact: "high",
		sourcePath: "skills/remotion/rules/parameters.md",
		description: "Making videos parametrizable.",
		tags: ["parameters", "schema", "zod"],
		triggers: ["参数", "可编辑", "props", "schema", "param", "editable"],
		officialDirectives: [
			"Expose video inputs through a schema so users can edit parameters.",
			"Use typed props for user-editable content and styling.",
		],
		shotlyxAdapterNotes: [
			"Use Shotlyx propsSchema instead of a Zod composition schema.",
			"Every editable default belongs in propsSchema[].default; do not return a separate defaults object.",
		],
	},
	{
		id: "charts",
		impact: "low",
		sourcePath: "skills/remotion/rules/assets/charts-bar-chart.tsx",
		description: "Chart animation example from the official skill assets.",
		tags: ["chart", "data", "bar"],
		triggers: ["图表", "数据", "chart", "bar", "line", "dashboard", "table"],
		officialDirectives: [
			"Use frame-based interpolation for chart values.",
			"Keep data structured instead of hard-coded into JSX.",
		],
		shotlyxAdapterNotes: [
			"Expose chart rows as editable table props.",
			"Animate bars, counters, and labels from useCurrentFrame().",
		],
	},
	{
		id: "transitions",
		impact: "medium",
		sourcePath: "skills/remotion/rules/transitions.md",
		description: "Scene transition patterns.",
		tags: ["transition", "scene", "wipe", "fade"],
		triggers: ["转场", "transition", "wipe", "fade", "slide", "切入", "切出"],
		officialDirectives: [
			"Build transitions from frame-based opacity, transform, masks, or clipping.",
			"Time transitions with explicit frame ranges.",
		],
		shotlyxAdapterNotes: [
			"Do not use CSS transition properties.",
			"Keep transitions short enough that the main subject is visible in the thumbnail frame.",
		],
	},
	{
		id: "audio",
		impact: "high",
		sourcePath: "skills/remotion/rules/audio.md",
		description: "Audio and sound in Remotion.",
		tags: ["audio", "media", "volume", "sfx"],
		triggers: ["音频", "音乐", "bgm", "sound", "audio", "sfx"],
		officialDirectives: [
			"Use Audio for audio in full Remotion projects.",
			"Use trimBefore, trimAfter, Sequence, and volume for audio timing.",
		],
		shotlyxAdapterNotes: [
			"Shotlyx does not expose Audio in generated component runtime yet.",
			"Use Shotlyx timeline audio tools for audio material and BGM.",
		],
	},
];

export function getOfficialRemotionSkillRuleSourceUrl({
	rule,
}: {
	rule: OfficialRemotionSkillRule;
}): string {
	return sourceUrl({ sourcePath: rule.sourcePath });
}
