import { generateUUID } from "@/utils/id";
import {
	SHOTLYX_HYPERFRAMES_RUNTIME,
	type ShotlyxHyperFramesDocument,
	type ShotlyxHyperFramesTemplateId,
	type ShotlyxMGAspectRatio,
	type ShotlyxMGPropDefinition,
	type ShotlyxMGPropValue,
} from "@/shotlyx/remotion-components/types";
import {
	getShotlyxHyperFramesTemplate,
	type ShotlyxHyperFramesTemplate,
} from "./templates";

const DEFAULT_DURATION_SECONDS = 5;
const DEFAULT_FPS = 30;
const MAX_TITLE_LENGTH = 72;
const MAX_SUBTITLE_LENGTH = 150;
const MAX_CJK_TITLE_LENGTH = 10;
const MAX_CJK_SUBTITLE_LENGTH = 54;

export interface GenerateShotlyxHyperFramesDocumentOptions {
	prompt: string;
	durationSeconds?: number;
	aspectRatio?: ShotlyxMGAspectRatio;
	templateId?: ShotlyxHyperFramesTemplateId | string;
	transparentBackground?: boolean;
}

function canvasSizeForAspectRatio({
	aspectRatio,
}: {
	aspectRatio: ShotlyxMGAspectRatio;
}): { width: number; height: number } {
	if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
	if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
	return { width: 1920, height: 1080 };
}

function clampDuration(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value))
		return DEFAULT_DURATION_SECONDS;
	return Math.max(0.5, Math.min(30, value));
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function escapeAttrJson(value: unknown): string {
	return escapeHtml(JSON.stringify(value));
}

function truncateText({ value, max }: { value: string; max: number }): string {
	const trimmed = value.replace(/\s+/g, " ").trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function containsCjk(value: string): boolean {
	return /[\u3400-\u9fff]/.test(value);
}

function compactCjkTitle({ value }: { value: string }): string {
	const titleRules: Array<{ pattern: RegExp; title: string }> = [
		{ pattern: /重点词|重点|关键|关键词/, title: "关键词强调" },
		{ pattern: /人脸|人物|角色/, title: "人物指示" },
		{ pattern: /标题/, title: "标题强调" },
		{ pattern: /批注|说明框|圆圈|框框|框选/, title: "批注说明" },
		{ pattern: /箭头|指示|指向/, title: "指向重点" },
		{ pattern: /数据|网格/, title: "数据指示" },
		{ pattern: /字幕/, title: "字幕重点" },
	];
	const match = titleRules.find((rule) => rule.pattern.test(value));
	if (match) return match.title;

	const firstPhrase =
		value
			.split(/并|和|与|，|。|、|,|\s+/)
			.map((part) => part.trim())
			.find((part) => part.length > 0 && part.length <= MAX_CJK_TITLE_LENGTH) ??
		value;
	return truncateText({ value: firstPhrase, max: MAX_CJK_TITLE_LENGTH });
}

function titleFromPrompt({ prompt }: { prompt: string }): string {
	const cleaned = prompt
		.replace(/生成|创建|制作|做一个|做一段|MG|动画|特效/gi, "")
		.replace(/[，。,.]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (containsCjk(cleaned)) {
		return compactCjkTitle({
			value: cleaned || "重点强调",
		});
	}
	return truncateText({
		value: cleaned || "Make the moment obvious",
		max: MAX_TITLE_LENGTH,
	});
}

function subtitleFromPrompt({ prompt }: { prompt: string }): string {
	return truncateText({
		value:
			prompt.length > 12
				? prompt
				: "A designed HyperFrames overlay with editable timing, copy, colors, and motion.",
		max: containsCjk(prompt) ? MAX_CJK_SUBTITLE_LENGTH : MAX_SUBTITLE_LENGTH,
	});
}

function isPropValue(value: unknown): value is ShotlyxMGPropValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		(Array.isArray(value) &&
			value.every(
				(row) =>
					typeof row === "object" &&
					row !== null &&
					!Array.isArray(row) &&
					Object.values(row).every(
						(cell) =>
							typeof cell === "string" ||
							typeof cell === "number" ||
							typeof cell === "boolean",
					),
			))
	);
}

function buildDefaultProps({
	prompt,
	template,
}: {
	prompt: string;
	template: ShotlyxHyperFramesTemplate;
}): Record<string, ShotlyxMGPropValue> {
	return Object.fromEntries(
		template.propsSchema.map((prop) => {
			if (prop.key === "title") return [prop.key, titleFromPrompt({ prompt })];
			if (prop.key === "subtitle")
				return [prop.key, subtitleFromPrompt({ prompt })];
			if (prop.key === "callout") return [prop.key, "Focus here"];
			return [prop.key, prop.default];
		}),
	);
}

function mergeProps({
	propsSchema,
	defaultProps,
	props,
}: {
	propsSchema: ShotlyxMGPropDefinition[];
	defaultProps: Record<string, ShotlyxMGPropValue>;
	props?: Record<string, ShotlyxMGPropValue>;
}): Record<string, ShotlyxMGPropValue> {
	if (!props) return defaultProps;
	const allowedKeys = new Set(propsSchema.map((prop) => prop.key));
	const next = { ...defaultProps };
	for (const [key, value] of Object.entries(props)) {
		if (allowedKeys.has(key) && isPropValue(value)) {
			next[key] = value;
		}
	}
	return next;
}

function getStringProp({
	props,
	key,
	fallback,
}: {
	props: Record<string, ShotlyxMGPropValue>;
	key: string;
	fallback: string;
}): string {
	const value = props[key];
	return typeof value === "string" ? value : fallback;
}

function getNumberProp({
	props,
	key,
	fallback,
}: {
	props: Record<string, ShotlyxMGPropValue>;
	key: string;
	fallback: number;
}): number {
	const value = props[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildVariables({
	propsSchema,
	props,
}: {
	propsSchema: ShotlyxMGPropDefinition[];
	props: Record<string, ShotlyxMGPropValue>;
}): Array<{
	id: string;
	type: "string" | "number" | "color" | "boolean" | "enum";
	label: string;
	default: string | number | boolean;
	options?: Array<{ label: string; value: string }>;
}> {
	return propsSchema
		.filter((prop) => prop.type !== "table" && prop.type !== "image")
		.map((prop) => {
			const defaultValue = props[prop.key] ?? prop.default;
			const base = {
				id: prop.key,
				label: prop.label,
				default:
					typeof defaultValue === "boolean" || typeof defaultValue === "number"
						? defaultValue
						: String(defaultValue),
			};
			if (prop.type === "number") return { ...base, type: "number" as const };
			if (prop.type === "boolean") return { ...base, type: "boolean" as const };
			if (prop.type === "color") return { ...base, type: "color" as const };
			if (prop.type === "select") {
				return {
					...base,
					type: "enum" as const,
					options: prop.options ?? [],
				};
			}
			return { ...base, type: "string" as const };
		});
}

function buildTemplateSpecificMarkup({
	template,
	props,
}: {
	template: ShotlyxHyperFramesTemplate;
	props: Record<string, ShotlyxMGPropValue>;
}): string {
	const title = escapeHtml(
		getStringProp({ props, key: "title", fallback: "" }),
	);
	const subtitle = escapeHtml(
		getStringProp({ props, key: "subtitle", fallback: "" }),
	);
	const callout = escapeHtml(
		getStringProp({ props, key: "callout", fallback: "" }),
	);
	const direction = escapeHtml(
		getStringProp({ props, key: "direction", fallback: "right" }),
	);

	if (template.id === "data-drift-ai") {
		return `
			<div class="hf-grid">
				<div class="hf-node hf-node-a"></div>
				<div class="hf-node hf-node-b"></div>
				<svg class="hf-trace" viewBox="0 0 1000 320" aria-hidden="true">
					<path class="hf-trace-path" d="M80 240 C260 40 430 280 590 110 S830 70 930 210" />
				</svg>
			</div>
			<div class="hf-content hf-content-${direction}">
				<div class="hf-eyebrow">HyperFrames Overlay</div>
				<div class="hf-title">${title}</div>
				<div class="hf-subtitle">${subtitle}</div>
			</div>
			<div class="hf-callout hf-callout-${direction}">
				<span class="hf-callout-dot"></span>
				<span>${callout}</span>
			</div>`;
	}

	if (template.id === "editorial-spotlight") {
		return `
			<div class="hf-paper">
				<div class="hf-eyebrow">Editor's mark</div>
				<div class="hf-title">${title}</div>
				<div class="hf-marker" aria-hidden="true"></div>
				<div class="hf-subtitle">${subtitle}</div>
			</div>
			<svg class="hf-annotation" viewBox="0 0 720 320" aria-hidden="true">
				<path class="hf-annotation-line" d="M88 210 C210 110 342 104 520 170" />
				<ellipse class="hf-annotation-ring" cx="520" cy="170" rx="112" ry="58" />
			</svg>
			<div class="hf-callout hf-callout-${direction}">${callout}</div>`;
	}

	if (template.id === "kinetic-launch-type") {
		const words = title
			.split(" ")
			.slice(0, 8)
			.map((word) => `<span class="hf-word">${word}</span>`)
			.join("");
		return `
			<div class="hf-burst" aria-hidden="true"></div>
			<div class="hf-content hf-content-${direction}">
				<div class="hf-title hf-title-kinetic">${words}</div>
				<div class="hf-subtitle">${subtitle}</div>
			</div>
			<div class="hf-impact-box">${callout}</div>
			<svg class="hf-arrow" viewBox="0 0 520 140" aria-hidden="true">
				<path class="hf-arrow-line" d="M20 92 L420 92" />
				<path class="hf-arrow-head" d="M420 92 L362 44 M420 92 L362 140" />
			</svg>`;
	}

	return `
		<div class="hf-registration" aria-hidden="true"></div>
		<div class="hf-content hf-content-${direction}">
			<div class="hf-eyebrow">Shotlyx HyperFrames</div>
			<div class="hf-title">${title}</div>
			<div class="hf-subtitle">${subtitle}</div>
		</div>
		<div class="hf-rule" aria-hidden="true"></div>
		<div class="hf-callout hf-callout-${direction}">
			<span>${callout}</span>
		</div>
		<svg class="hf-arrow" viewBox="0 0 520 140" aria-hidden="true">
			<path class="hf-arrow-line" d="M20 92 L420 92" />
			<path class="hf-arrow-head" d="M420 92 L362 44 M420 92 L362 140" />
		</svg>`;
}

function buildHyperFramesHtml({
	name,
	durationSeconds,
	width,
	height,
	template,
	props,
	transparentBackground,
}: {
	name: string;
	durationSeconds: number;
	width: number;
	height: number;
	template: ShotlyxHyperFramesTemplate;
	props: Record<string, ShotlyxMGPropValue>;
	transparentBackground: boolean;
}): string {
	const compositionId = `shotlyx-hf-${generateUUID().slice(0, 8)}`;
	const accent = getStringProp({
		props,
		key: "accentColor",
		fallback: template.colors.accent,
	});
	const secondary = getStringProp({
		props,
		key: "secondaryColor",
		fallback: template.colors.secondaryAccent,
	});
	const intensity = getNumberProp({ props, key: "intensity", fallback: 0.72 });
	const variables = buildVariables({
		propsSchema: template.propsSchema,
		props,
	});
	const markup = buildTemplateSpecificMarkup({ template, props });
	const background = transparentBackground
		? "transparent"
		: "linear-gradient(135deg, rgba(8,10,16,0.96), rgba(21,24,32,0.96))";

	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapeHtml(name)}</title>
	<style>
		:root {
			--hf-width: ${width}px;
			--hf-height: ${height}px;
			--hf-accent: ${escapeHtml(accent)};
			--hf-secondary: ${escapeHtml(secondary)};
			--hf-text: ${template.colors.text};
			--hf-muted: ${template.colors.mutedText};
			--hf-panel: ${template.colors.panel};
			--hf-stroke: ${template.colors.stroke};
			--hf-progress: 0;
			--hf-intensity: ${Math.max(0, Math.min(1, intensity))};
		}
		html, body {
			width: 100%;
			height: 100%;
			margin: 0;
			overflow: hidden;
			background: transparent;
		}
		[data-composition-id] {
			position: relative;
			width: 100vw;
			height: 100vh;
			overflow: hidden;
			background: ${background};
			color: var(--hf-text);
			font-family: ${template.fonts.body};
			container-type: size;
		}
		.hf-stage {
			position: absolute;
			inset: 0;
			padding: clamp(54px, 7cqw, 132px);
			box-sizing: border-box;
		}
		.hf-stage::before,
		.hf-stage::after {
			content: "";
			position: absolute;
			pointer-events: none;
			opacity: calc(0.16 + var(--hf-intensity) * 0.12);
			filter: blur(0.5px);
		}
		.hf-stage::before {
			width: 46%;
			height: 46%;
			right: -12%;
			top: -10%;
			border-radius: 999px;
			background: radial-gradient(circle, color-mix(in srgb, var(--hf-accent) 82%, transparent), transparent 68%);
		}
		.hf-stage::after {
			left: 7%;
			bottom: 8%;
			width: 72%;
			height: 2px;
			background: linear-gradient(90deg, transparent, var(--hf-accent), transparent);
			transform-origin: left center;
		}
			.hf-content {
				position: absolute;
				left: clamp(64px, 8cqw, 150px);
				top: 50%;
				transform: translateY(-50%);
				max-width: min(52%, 920px);
				display: flex;
				flex-direction: column;
				gap: clamp(16px, 2cqw, 30px);
		}
		.hf-content-left { left: auto; right: clamp(64px, 8cqw, 150px); align-items: flex-end; text-align: right; }
		.hf-content-up { top: 37%; }
		.hf-content-down { top: 62%; }
		.hf-eyebrow {
			width: fit-content;
			border: 2px solid color-mix(in srgb, var(--hf-accent) 82%, white 18%);
			padding: 9px 15px;
			border-radius: 999px;
			color: var(--hf-accent);
			text-transform: uppercase;
			letter-spacing: 0;
			font-weight: 800;
			font-size: clamp(18px, 1.5cqw, 28px);
		}
			.hf-title {
				font-family: ${template.fonts.heading};
				font-size: clamp(52px, 6.8cqw, 118px);
				line-height: 0.98;
				font-weight: 850;
				letter-spacing: 0;
				max-width: 13ch;
				text-wrap: balance;
				text-shadow: 0 22px 70px rgba(0,0,0,0.22);
			}
		.hf-title-kinetic {
			display: flex;
			flex-wrap: wrap;
			gap: 0.12em 0.2em;
			max-width: 11ch;
			text-transform: uppercase;
		}
		.hf-word {
			display: inline-block;
			background: linear-gradient(180deg, var(--hf-text), color-mix(in srgb, var(--hf-text) 72%, var(--hf-accent)));
			-webkit-background-clip: text;
			color: transparent;
		}
			.hf-subtitle {
				max-width: min(52cqw, 640px);
				color: var(--hf-muted);
				font-size: clamp(20px, 1.6cqw, 32px);
				line-height: 1.18;
				font-weight: 520;
			}
		.hf-callout,
		.hf-impact-box {
			position: absolute;
			right: clamp(64px, 8cqw, 150px);
			bottom: clamp(70px, 8cqw, 138px);
			padding: clamp(18px, 2cqw, 34px) clamp(24px, 2.8cqw, 52px);
			border: 3px solid var(--hf-accent);
				border-radius: 18px;
				background: var(--hf-panel);
				color: var(--hf-text);
				font-size: clamp(22px, 1.9cqw, 36px);
				font-weight: 760;
			box-shadow: 0 18px 80px color-mix(in srgb, var(--hf-accent) 24%, transparent);
			backdrop-filter: blur(18px);
			max-width: 44%;
		}
		.hf-callout-left { right: auto; left: clamp(64px, 8cqw, 150px); }
		.hf-callout-up { bottom: auto; top: clamp(70px, 8cqw, 138px); }
		.hf-callout-down { bottom: clamp(50px, 6cqw, 110px); }
		.hf-callout-dot {
			display: inline-block;
			width: 0.58em;
			height: 0.58em;
			margin-right: 0.55em;
			border-radius: 999px;
			background: var(--hf-secondary);
			box-shadow: 0 0 26px var(--hf-secondary);
		}
		.hf-arrow {
			position: absolute;
			right: 22%;
			bottom: 29%;
			width: min(34%, 520px);
			overflow: visible;
		}
		.hf-arrow-line,
		.hf-arrow-head,
		.hf-annotation-line,
		.hf-annotation-ring,
		.hf-trace-path {
			fill: none;
			stroke: var(--hf-accent);
			stroke-width: 12;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		.hf-trace {
			position: absolute;
			inset: 17% 10% auto auto;
			width: 58%;
			overflow: visible;
		}
		.hf-trace-path {
			stroke-width: 5;
			filter: drop-shadow(0 0 18px var(--hf-accent));
			stroke-dasharray: 980;
			stroke-dashoffset: 980;
		}
		.hf-grid {
			position: absolute;
			inset: 0;
			background-image:
				linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px),
				linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px);
			background-size: 8% 12%;
			mask-image: radial-gradient(circle at 68% 44%, #000 0%, transparent 72%);
		}
		.hf-node {
			position: absolute;
			width: clamp(86px, 7cqw, 136px);
			aspect-ratio: 1;
			border: 3px solid var(--hf-accent);
			border-radius: 999px;
			box-shadow: 0 0 44px color-mix(in srgb, var(--hf-accent) 38%, transparent);
		}
		.hf-node-a { right: 37%; top: 23%; }
		.hf-node-b { right: 13%; top: 48%; border-color: var(--hf-secondary); }
		.hf-burst {
			position: absolute;
			right: 9%;
			top: 11%;
			width: min(28%, 420px);
			aspect-ratio: 1;
			border: clamp(12px, 1.4cqw, 24px) solid var(--hf-secondary);
			border-radius: 999px;
			opacity: 0.88;
			box-shadow: inset 0 0 0 24px color-mix(in srgb, var(--hf-secondary) 18%, transparent);
		}
		.hf-paper {
			position: absolute;
			left: clamp(64px, 8cqw, 150px);
			top: 50%;
			transform: translateY(-50%);
			width: min(62%, 1040px);
			padding: clamp(48px, 5cqw, 92px);
			border-radius: 24px;
			background: var(--hf-panel);
			color: var(--hf-text);
			box-shadow: 0 28px 90px rgba(43,39,34,0.22);
		}
		.hf-marker {
			width: min(72%, 720px);
			height: clamp(20px, 2.3cqw, 42px);
			margin-top: -0.28em;
			background: color-mix(in srgb, var(--hf-accent) 58%, transparent);
			border-radius: 999px;
			transform-origin: left center;
		}
		.hf-annotation {
			position: absolute;
			right: 8%;
			top: 35%;
			width: min(40%, 720px);
			overflow: visible;
		}
		.hf-annotation-line,
		.hf-annotation-ring {
			stroke-width: 8;
		}
		.hf-registration {
			position: absolute;
			left: 6%;
			top: 10%;
			width: 21%;
			height: 28%;
			border-left: 4px solid var(--hf-accent);
			border-top: 4px solid var(--hf-accent);
			opacity: 0.8;
		}
		.hf-rule {
			position: absolute;
			left: 8%;
			right: 8%;
			bottom: 18%;
			height: 4px;
			background: linear-gradient(90deg, var(--hf-accent), transparent 80%);
			transform-origin: left center;
		}
	</style>
</head>
<body>
	<div
		id="stage"
		data-composition-id="${compositionId}"
		data-start="0"
		data-duration="${durationSeconds}"
		data-width="${width}"
		data-height="${height}"
		data-track-index="0"
		data-composition-variables="${escapeAttrJson(variables)}"
	>
		<div class="hf-stage hf-template-${template.id}">
			${markup}
		</div>
	</div>
	<script>
		(function () {
			const clamp = function (value) {
				return Math.max(0, Math.min(1, value));
			};
			const elementBaseStyles = new WeakMap();
			const getBaseStyles = function (element) {
				const cached = elementBaseStyles.get(element);
				if (cached) return cached;
				const computed = window.getComputedStyle(element);
				const base = {
					opacity: Number.parseFloat(computed.opacity || "1"),
					strokeDashoffset: Number.parseFloat(computed.strokeDashoffset || "0"),
					transform: element.style.transform || "",
				};
				elementBaseStyles.set(element, base);
				return base;
			};
			const tweenFraction = function (tween, time) {
				const duration = Math.max(0.001, Number(tween.vars.duration) || 0.5);
				const repeat = Math.max(0, Number(tween.vars.repeat) || 0);
				const elapsed = time - tween.start;
				if (elapsed <= 0) return 0;
				const cycleCount = repeat + 1;
				if (elapsed >= duration * cycleCount) {
					return tween.vars.yoyo && repeat % 2 === 1 ? 0 : 1;
				}
				const cycle = Math.floor(elapsed / duration);
				const fraction = (elapsed - cycle * duration) / duration;
				return tween.vars.yoyo && cycle % 2 === 1 ? 1 - fraction : fraction;
			};
			const applyTween = function (tween, time) {
				const fraction = tweenFraction(tween, time);
				document.querySelectorAll(tween.selector).forEach(function (element) {
					const base = getBaseStyles(element);
					const valueAt = function (target, fallback) {
						const targetNumber = Number(target);
						const start = tween.kind === "from" ? targetNumber : fallback;
						const end = tween.kind === "from" ? fallback : targetNumber;
						return start + (end - start) * fraction;
					};
					const transforms = [];
					if (Number.isFinite(Number(tween.vars.y))) {
						transforms.push("translateY(" + valueAt(tween.vars.y, 0) + "px)");
					}
					if (Number.isFinite(Number(tween.vars.scale))) {
						transforms.push("scale(" + valueAt(tween.vars.scale, 1) + ")");
					}
					if (Number.isFinite(Number(tween.vars.scaleX))) {
						transforms.push("scaleX(" + valueAt(tween.vars.scaleX, 1) + ")");
					}
					if (transforms.length > 0) {
						element.style.transform = [base.transform, ...transforms]
							.filter(Boolean)
							.join(" ");
					}
					if (Number.isFinite(Number(tween.vars.opacity))) {
						element.style.opacity = String(
							valueAt(tween.vars.opacity, base.opacity),
						);
					}
					if (Number.isFinite(Number(tween.vars.strokeDashoffset))) {
						element.style.strokeDashoffset = String(
							valueAt(tween.vars.strokeDashoffset, base.strokeDashoffset),
						);
					}
					if (tween.vars.transformOrigin) {
						element.style.transformOrigin = tween.vars.transformOrigin;
					}
				});
			};
			const gsap = {
				timeline: function () {
					const tweens = [];
					let duration = 1;
					const timeline = {
						from: function (selector, vars, start) {
							const tween = {
								kind: "from",
								selector,
								vars,
								start: Number(start) || 0,
							};
							tweens.push(tween);
							duration = Math.max(
								duration,
								tween.start +
									(Number(vars.duration) || 0.5) *
										(Math.max(0, Number(vars.repeat) || 0) + 1),
							);
							return timeline;
						},
						to: function (selector, vars, start) {
							const tween = {
								kind: "to",
								selector,
								vars,
								start: Number(start) || 0,
							};
							tweens.push(tween);
							duration = Math.max(
								duration,
								tween.start +
									(Number(vars.duration) || 0.5) *
										(Math.max(0, Number(vars.repeat) || 0) + 1),
							);
							return timeline;
						},
						progress: function (value) {
							const time = clamp(Number(value) || 0) * duration;
							tweens.forEach(function (tween) {
								applyTween(tween, time);
							});
							return timeline;
						},
						pause: function () {
							return timeline;
						},
					};
					return timeline;
				},
			};
			const compositionId = "${compositionId}";
			window.__hyperframes = window.__hyperframes || {
				getVariables: function () { return ${JSON.stringify(props)}; }
			};
			const vars = window.__hyperframes.getVariables();
			document.documentElement.style.setProperty("--hf-accent", vars.accentColor || "${accent}");
			document.documentElement.style.setProperty("--hf-secondary", vars.secondaryColor || "${secondary}");
			document.documentElement.style.setProperty("--hf-intensity", String(vars.intensity ?? ${intensity}));
			window.__timelines = window.__timelines || {};
			const tl = gsap.timeline({
				paused: true,
				defaults: { duration: 0.55, ease: "${template.motion.easeOut}" }
			});
			tl.from(".hf-rule", { scaleX: 0, duration: 0.6, ease: "power2.out" }, 0.08);
			tl.from(".hf-eyebrow", { y: ${Math.round(template.motion.entranceY * 0.45)}, opacity: 0, duration: 0.45, ease: "power2.out" }, 0.14);
			tl.from(".hf-title, .hf-word", { y: ${template.motion.entranceY}, opacity: 0, scale: 0.96, stagger: ${template.motion.stagger}, duration: 0.7, ease: "${template.motion.easeOut}" }, 0.22);
			tl.from(".hf-subtitle", { y: ${Math.round(template.motion.entranceY * 0.65)}, opacity: 0, duration: 0.55, ease: "power2.out" }, 0.44);
			tl.from(".hf-callout, .hf-impact-box", { y: 34, opacity: 0, scale: 0.96, duration: 0.5, ease: "back.out(1.4)" }, 0.72);
			tl.from(".hf-arrow-line, .hf-arrow-head, .hf-annotation-line, .hf-annotation-ring", { opacity: 0, scaleX: 0.18, transformOrigin: "left center", duration: 0.62, ease: "power2.out" }, 0.82);
			tl.to(".hf-trace-path", { strokeDashoffset: 0, duration: 1.15, ease: "power2.out" }, 0.42);
			tl.to(".hf-node, .hf-burst, .hf-registration", { scale: 1.035, opacity: 0.92, duration: 1.1, repeat: ${Math.max(1, Math.ceil(durationSeconds / 1.1) - 1)}, yoyo: true, ease: "sine.inOut" }, 1.02);
			tl.to(".hf-marker, .hf-rule", { scaleX: 1, duration: 0.65, ease: "power2.out" }, 0.62);
			window.__timelines[compositionId] = tl;
			window.addEventListener("message", function (event) {
				if (!event.data || event.data.type !== "shotlyx:set-progress") return;
				const progress = Math.max(0, Math.min(1, Number(event.data.progress) || 0));
				document.documentElement.style.setProperty("--hf-progress", String(progress));
				tl.progress(progress).pause();
			});
			tl.progress(0.58).pause();
		})();
	</script>
</body>
</html>`;
}

function buildDesignBrief({
	template,
}: {
	template: ShotlyxHyperFramesTemplate;
}): string {
	return [
		`${template.label}: ${template.description}`,
		`Principles: ${template.principles.join("; ")}`,
		`Constraints: ${template.constraints.join("; ")}`,
		"HyperFrames contract: data-composition-variables, embedded offline timeline runtime, registered window.__timelines key, finite repeats, layout-before-animation.",
	].join("\n");
}

function buildSimulatedRender({
	htmlSource,
}: {
	htmlSource: string;
}): ShotlyxHyperFramesDocument["render"] {
	return {
		status: "simulated",
		format: "html-preview",
		previewHtml: htmlSource,
		diagnostics: [
			"simulated: data-composition-id present",
			"simulated: data-composition-variables declared",
			"simulated: embedded offline timeline registered on window.__timelines",
			"simulated: render target is transparent HTML preview; WebM render can replace this snapshot later",
		],
		updatedAt: new Date().toISOString(),
	};
}

export function rebuildShotlyxHyperFramesDocument({
	document,
	props,
}: {
	document: ShotlyxHyperFramesDocument;
	props?: Record<string, ShotlyxMGPropValue>;
}): ShotlyxHyperFramesDocument {
	const template = getShotlyxHyperFramesTemplate({
		templateId: document.templateId,
	});
	const nextProps = mergeProps({
		propsSchema: document.propsSchema,
		defaultProps: document.defaultProps,
		props,
	});
	const htmlSource = buildHyperFramesHtml({
		name: document.name,
		durationSeconds: document.durationSeconds,
		width: document.width,
		height: document.height,
		template,
		props: nextProps,
		transparentBackground: document.transparentBackground !== false,
	});
	return {
		...document,
		htmlSource,
		defaultProps: nextProps,
		render: buildSimulatedRender({ htmlSource }),
	};
}

export async function generateShotlyxHyperFramesDocument({
	prompt,
	durationSeconds,
	aspectRatio = "16:9",
	templateId,
	transparentBackground = true,
}: GenerateShotlyxHyperFramesDocumentOptions): Promise<ShotlyxHyperFramesDocument> {
	const template = getShotlyxHyperFramesTemplate({ templateId });
	const normalizedDuration = clampDuration(durationSeconds);
	const { width, height } = canvasSizeForAspectRatio({ aspectRatio });
	const defaultProps = buildDefaultProps({ prompt, template });
	const name = truncateText({
		value: `${template.label}: ${titleFromPrompt({ prompt })}`,
		max: 96,
	});
	const baseDocument: ShotlyxHyperFramesDocument = {
		version: 1,
		runtime: SHOTLYX_HYPERFRAMES_RUNTIME,
		name,
		durationSeconds: normalizedDuration,
		fps: DEFAULT_FPS,
		width,
		height,
		aspectRatio,
		transparentBackground,
		templateId: template.id,
		designBrief: buildDesignBrief({ template }),
		htmlSource: "",
		propsSchema: template.propsSchema,
		defaultProps,
		sourcePrompt: prompt,
		thumbnailFrame: Math.floor(normalizedDuration * DEFAULT_FPS * 0.58),
		render: {
			status: "pending",
			format: "html-preview",
			diagnostics: [],
			updatedAt: new Date().toISOString(),
		},
	};
	return rebuildShotlyxHyperFramesDocument({ document: baseDocument });
}
