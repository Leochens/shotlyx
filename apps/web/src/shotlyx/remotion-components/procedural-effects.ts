import { createShotlyxRemotionComponentDocument } from "./generator";
import type {
	ShotlyxMGAspectRatio,
	ShotlyxMGPropDefinition,
	ShotlyxRemotionComponentDocument,
} from "./types";

export type ShotlyxProceduralEffectPhase =
	| "full"
	| "charge"
	| "burst"
	| "scatter"
	| "afterglow";

const STAR_EXPLOSION_COMPONENT_SOURCE = `
type Props = {
	phase: "full" | "charge" | "burst" | "scatter" | "afterglow";
	coreColor: string;
	accentColor: string;
	trailColor: string;
	particleCount: number;
	burstRadius: number;
	trailLength: number;
	glowOpacity: number;
	energy: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const easeInOut = (value: number) => {
	const t = clamp01(value);
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const seedUnit = (index: number, salt: number) => {
	const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
	return value - Math.floor(value);
};
const phaseWindow = (phase: Props["phase"], raw: number) => {
	if (phase === "full") return raw;
	if (phase === "charge") return clamp01(raw * 1.18);
	if (phase === "burst") return clamp01((raw - 0.02) / 0.82);
	if (phase === "scatter") return clamp01((raw - 0.06) / 0.88);
	return clamp01((raw - 0.08) / 0.86);
};

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const { width, height, durationInFrames } = useVideoConfig();
	const frameCount = Math.max(1, durationInFrames - 1);
	const rawProgress = clamp01(frame / frameCount);
	const phase = props.phase || "full";
	const local = phaseWindow(phase, rawProgress);
	const particleCount = Math.max(36, Math.min(260, Math.round(props.particleCount)));
	const centerX = width / 2;
	const centerY = height / 2;
	const minSize = Math.min(width, height);
	const radiusMax = Math.min(props.burstRadius, minSize * 0.78);
	const energy = Math.max(0.45, Math.min(1.8, props.energy));
	const chargeMix = phase === "charge" ? 1 : phase === "full" ? clamp01((0.38 - rawProgress) / 0.38) : 0;
	const burstMix = phase === "burst" ? 1 : phase === "full" ? 1 - Math.abs(rawProgress - 0.42) / 0.34 : phase === "charge" ? clamp01((local - 0.62) / 0.38) : 0;
	const scatterMix = phase === "scatter" ? 1 : phase === "full" ? clamp01((rawProgress - 0.36) / 0.52) : phase === "burst" ? clamp01((local - 0.28) / 0.72) : phase === "afterglow" ? 0.45 : 0;
	const afterMix = phase === "afterglow" ? 1 : phase === "full" ? clamp01((rawProgress - 0.66) / 0.34) : 0;
	const corePulse = Math.sin(frame * 0.23) * 0.5 + 0.5;
	const coreScale = (phase === "charge" ? 0.28 + easeInOut(local) * 0.72 : phase === "burst" ? 1.4 - local * 0.75 : phase === "afterglow" ? 0.8 - local * 0.45 : 0.7 + burstMix * 0.75) * energy;
	const coreOpacity = Math.max(0, Math.min(1, props.glowOpacity * (0.18 + chargeMix * 0.52 + Math.max(0, burstMix) * 0.78 + afterMix * (1 - local) * 0.42)));
	const particles = Array.from({ length: particleCount }, (_, index) => {
		const angle = seedUnit(index, 1) * Math.PI * 2;
		const lane = 0.35 + seedUnit(index, 2) * 0.65;
		const speed = 0.72 + seedUnit(index, 3) * 0.72;
		const wobble = Math.sin(frame * (0.025 + seedUnit(index, 4) * 0.035) + index) * (7 + seedUnit(index, 5) * 16);
		const chargeRadius = radiusMax * (1.04 - easeInOut(local) * 0.94) * lane;
		const burstRadius = radiusMax * easeOutCubic(local) * lane * speed;
		const scatterRadius = radiusMax * (0.18 + easeOutCubic(local) * 0.98) * lane * speed;
		const afterRadius = radiusMax * (0.55 + local * 0.28) * lane;
		const radius = phase === "charge"
			? chargeRadius
			: phase === "burst"
				? burstRadius
				: phase === "scatter"
					? scatterRadius
					: phase === "afterglow"
						? afterRadius
						: rawProgress < 0.34
							? radiusMax * (1.05 - easeInOut(rawProgress / 0.34) * 0.93) * lane
							: radiusMax * easeOutCubic((rawProgress - 0.28) / 0.72) * lane * speed;
		const spiral = (phase === "charge" ? 1 - local : local) * (0.45 + seedUnit(index, 6) * 1.1);
		const currentAngle = angle + spiral + wobble / Math.max(radiusMax, 1);
		const x = centerX + Math.cos(currentAngle) * (radius + wobble);
		const y = centerY + Math.sin(currentAngle) * (radius + wobble * 0.62);
		const tail = Math.max(4, props.trailLength * (0.55 + speed) * (phase === "charge" ? 0.55 : 1));
		const previousX = x - Math.cos(currentAngle) * tail;
		const previousY = y - Math.sin(currentAngle) * tail;
		const size = (1.3 + seedUnit(index, 7) * 4.2) * (0.85 + burstMix * 0.55) * energy;
		const twinkle = 0.72 + Math.sin(frame * 0.21 + index * 1.7) * 0.28;
		const fade = phase === "charge"
			? 0.22 + local * 0.78
			: phase === "burst"
				? Math.max(0, 1 - local * 0.25)
				: phase === "scatter"
					? Math.max(0, 1 - local * 0.72)
					: phase === "afterglow"
						? Math.max(0, 0.75 - local * 0.62)
						: rawProgress < 0.38 ? 0.24 + rawProgress * 1.4 : Math.max(0, 1 - (rawProgress - 0.38) * 1.15);
		const opacity = Math.max(0.04, Math.min(1, fade * twinkle));
		const color = index % 5 === 0 ? props.coreColor : index % 3 === 0 ? props.accentColor : props.trailColor;
		return (
			<g key={index} opacity={opacity}>
				<line
					x1={previousX}
					y1={previousY}
					x2={x}
					y2={y}
					stroke={color}
					strokeWidth={Math.max(0.8, size * 0.44)}
					strokeLinecap="round"
					opacity={Math.min(0.72, opacity * 0.78)}
				/>
				<circle cx={x} cy={y} r={size} fill={color} />
				<circle cx={x} cy={y} r={size * 2.4} fill={color} opacity={opacity * 0.16} />
			</g>
		);
	});
	const shockwaves = Array.from({ length: 3 }, (_, index) => {
		const delay = index * 0.14;
		const progress = clamp01((phase === "full" ? rawProgress - 0.28 : local - delay) / 0.72);
		const radius = radiusMax * easeOutCubic(progress) * (0.52 + index * 0.2);
		const opacity = Math.max(0, (1 - progress) * (phase === "charge" ? 0.22 : 0.48) * props.glowOpacity);
		return (
			<circle
				key={index}
				cx={centerX}
				cy={centerY}
				r={radius}
				fill="none"
				stroke={index === 0 ? props.coreColor : props.accentColor}
				strokeWidth={Math.max(1.5, 7 - index * 1.8)}
				opacity={opacity}
			/>
		);
	});
	const rayOpacity = Math.max(0, (burstMix * 0.46 + chargeMix * 0.12) * props.glowOpacity);
	const rays = Array.from({ length: 18 }, (_, index) => {
		const angle = (index / 18) * Math.PI * 2 + frame * 0.004;
		const inner = 28 * coreScale;
		const outer = radiusMax * (0.22 + easeOutCubic(local) * 0.52) * (0.74 + seedUnit(index, 11) * 0.35);
		return (
			<line
				key={index}
				x1={centerX + Math.cos(angle) * inner}
				y1={centerY + Math.sin(angle) * inner}
				x2={centerX + Math.cos(angle) * outer}
				y2={centerY + Math.sin(angle) * outer}
				stroke={index % 2 === 0 ? props.coreColor : props.accentColor}
				strokeWidth={1.2 + seedUnit(index, 12) * 2.5}
				strokeLinecap="round"
				opacity={rayOpacity}
			/>
		);
	});

	return (
		<AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", opacity: 1 }}>
			<svg width={width} height={height} viewBox={"0 0 " + width + " " + height} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
				<defs>
					<radialGradient id="shotlyxStarExplosionCore" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor={props.coreColor} stopOpacity={0.94} />
						<stop offset="42%" stopColor={props.accentColor} stopOpacity={0.32} />
						<stop offset="100%" stopColor={props.accentColor} stopOpacity={0} />
					</radialGradient>
				</defs>
				<g>{rays}</g>
				<g>{shockwaves}</g>
				<circle cx={centerX} cy={centerY} r={110 * coreScale} fill="url(#shotlyxStarExplosionCore)" opacity={coreOpacity * 0.8} />
				<circle cx={centerX} cy={centerY} r={22 * coreScale + corePulse * 8} fill={props.coreColor} opacity={Math.min(1, coreOpacity + 0.18)} />
				<g>{particles}</g>
			</svg>
		</AbsoluteFill>
	);
}
`;

const phaseOptions = [
	{ label: "完整爆炸", value: "full" },
	{ label: "能量聚集", value: "charge" },
	{ label: "星核爆发", value: "burst" },
	{ label: "星尘扩散", value: "scatter" },
	{ label: "余韵消散", value: "afterglow" },
];

const phaseNames: Record<ShotlyxProceduralEffectPhase, string> = {
	full: "完整爆炸",
	charge: "能量聚集",
	burst: "星核爆发",
	scatter: "星尘扩散",
	afterglow: "余韵消散",
};

export function isStarExplosionEffectRequest({ prompt }: { prompt: string }): boolean {
	const normalized = prompt.toLowerCase();
	const hasStar = [
		"星星",
		"星空",
		"星光",
		"星形",
		"star",
		"starfield",
		"stellar",
	].some((token) => normalized.includes(token));
	const hasExplosion = [
		"爆炸",
		"爆发",
		"炸开",
		"粒子爆",
		"explosion",
		"explode",
		"burst",
	].some((token) => normalized.includes(token));
	const hasEffectIntent = [
		"mg",
		"特效",
		"动画",
		"粒子",
		"纯视觉",
		"无文字",
		"effect",
		"particle",
		"animation",
	].some((token) => normalized.includes(token));
	return hasStar && hasExplosion && hasEffectIntent;
}

function phaseForComponent({
	componentIndex,
	componentCount,
	taskId,
}: {
	componentIndex: number;
	componentCount: number;
	taskId?: string;
}): ShotlyxProceduralEffectPhase {
	if (componentCount <= 1) return "full";
	if (taskId?.includes("charge")) return "charge";
	if (taskId?.includes("burst")) return "burst";
	if (taskId?.includes("scatter")) return "scatter";
	if (taskId?.includes("afterglow")) return "afterglow";
	const phases: ShotlyxProceduralEffectPhase[] = [
		"charge",
		"burst",
		"scatter",
		"afterglow",
	];
	return phases[componentIndex % phases.length] ?? "full";
}

function starExplosionPropsSchema({
	phase,
}: {
	phase: ShotlyxProceduralEffectPhase;
}): ShotlyxMGPropDefinition[] {
	return [
		{
			key: "phase",
			label: "爆炸阶段",
			type: "select",
			role: "motion",
			default: phase,
			options: phaseOptions,
		},
		{
			key: "coreColor",
			label: "星核颜色",
			type: "color",
			role: "style",
			default: "#ffffff",
		},
		{
			key: "accentColor",
			label: "冲击波颜色",
			type: "color",
			role: "style",
			default: "#facc15",
		},
		{
			key: "trailColor",
			label: "星尘拖尾颜色",
			type: "color",
			role: "style",
			default: "#60a5fa",
		},
		{
			key: "particleCount",
			label: "粒子数量",
			type: "number",
			role: "motion",
			default: 132,
			min: 36,
			max: 260,
			step: 1,
		},
		{
			key: "burstRadius",
			label: "爆发半径",
			type: "number",
			role: "motion",
			default: 720,
			min: 180,
			max: 1200,
			step: 10,
		},
		{
			key: "trailLength",
			label: "拖尾长度",
			type: "number",
			role: "motion",
			default: 44,
			min: 4,
			max: 140,
			step: 1,
		},
		{
			key: "glowOpacity",
			label: "辉光强度",
			type: "number",
			role: "style",
			default: 0.92,
			min: 0,
			max: 1,
			step: 0.01,
		},
		{
			key: "energy",
			label: "爆发能量",
			type: "number",
			role: "motion",
			default: 1,
			min: 0.45,
			max: 1.8,
			step: 0.05,
		},
	];
}

export async function createShotlyxStarExplosionEffectDocument({
	prompt,
	taskId,
	componentIndex,
	componentCount,
	durationSeconds,
	aspectRatio,
	transparentBackground,
}: {
	prompt: string;
	taskId?: string;
	componentIndex: number;
	componentCount: number;
	durationSeconds?: number;
	aspectRatio: ShotlyxMGAspectRatio;
	transparentBackground: boolean;
}): Promise<ShotlyxRemotionComponentDocument> {
	const phase = phaseForComponent({
		componentIndex,
		componentCount,
		taskId,
	});
	return createShotlyxRemotionComponentDocument({
		name: `自定义特效 · 星星爆炸 · ${phaseNames[phase]}`,
		componentSource: STAR_EXPLOSION_COMPONENT_SOURCE,
		propsSchema: starExplosionPropsSchema({ phase }),
		sourcePrompt: prompt,
		durationSeconds: durationSeconds ?? 5,
		aspectRatio,
		transparentBackground,
		thumbnailFrame: Math.round((durationSeconds ?? 5) * 30 * 0.42),
	});
}
