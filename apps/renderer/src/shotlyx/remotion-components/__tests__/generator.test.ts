import { describe, expect, mock, test } from "bun:test";
import type { LanguageModel } from "ai";
import {
	createShotlyxRemotionComponentDocument,
	generateShotlyxMGComponentDocument,
	type GenerateShotlyxMGComponentOptions,
} from "../generator";

function fakeModel(): LanguageModel {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return {} as LanguageModel;
}

const typewriterSource = `
type Props = { title: string; accentColor: string };

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const visibleChars = Math.floor(interpolate(frame, [0, 60], [0, props.title.length], { extrapolateRight: "clamp" }));
	return (
		<AbsoluteFill style={{ color: props.accentColor, fontSize: 96 }}>
			{props.title.slice(0, visibleChars)}
		</AbsoluteFill>
	);
}
`;

const topLevelRemotionBindingSource = `
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type Props = { title: string };

const { AbsoluteFill, interpolate, useCurrentFrame } = Remotion;

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
	return <AbsoluteFill style={{ opacity }}>{props.title}</AbsoluteFill>;
}
`;

describe("Shotlyx Remotion generator", () => {
	test("compiles a Remotion component document from trusted TSX", async () => {
		const document = await createShotlyxRemotionComponentDocument({
			name: "Typewriter Title",
			componentSource: typewriterSource,
			propsSchema: [
				{
					key: "title",
					label: "Title",
					type: "text",
					role: "content",
					default: "Hello MG",
				},
				{
					key: "accentColor",
					label: "Accent",
					type: "color",
					role: "style",
					default: "#38bdf8",
				},
			],
			sourcePrompt: "做一个打字机标题 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
		});

		expect(document.runtime).toBe("shotlyx-remotion-component-v1");
		expect(document.componentSource).toContain("useCurrentFrame");
		expect(document.compiledModule).toContain("ShotlyxComponent");
		expect(document.defaultProps.title).toBe("Hello MG");
		expect(document.manifest).toMatchObject({
			name: "Typewriter Title",
			durationInFrames: 150,
		});
	});

	test("normalizes top-level Remotion imports and duplicate bindings", async () => {
		const document = await createShotlyxRemotionComponentDocument({
			name: "Normalized Bindings",
			componentSource: topLevelRemotionBindingSource,
			propsSchema: [
				{
					key: "title",
					label: "Title",
					type: "text",
					role: "content",
					default: "Hello",
				},
			],
			sourcePrompt: "测试重复 Remotion binding",
			durationSeconds: 4,
			aspectRatio: "16:9",
		});

		expect(document.componentSource).not.toContain('from "remotion"');
		expect(document.componentSource).not.toContain(
			"const { AbsoluteFill, interpolate, useCurrentFrame } = Remotion",
		);
		expect(document.compiledModule).toContain("ShotlyxComponent");
	});

	test("normalizes duplicate default export statements", async () => {
		const document = await createShotlyxRemotionComponentDocument({
			name: "Duplicate Default Export",
			componentSource: `
type Props = { title: string };

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
	return <AbsoluteFill style={{ opacity }}>{props.title}</AbsoluteFill>;
}

export default ShotlyxComponent;
export { ShotlyxComponent as default };
export default React.memo(ShotlyxComponent);
`,
			propsSchema: [
				{
					key: "title",
					label: "Title",
					type: "text",
					role: "content",
					default: "Hello",
				},
			],
			sourcePrompt: "测试重复 default export",
			durationSeconds: 4,
			aspectRatio: "16:9",
		});

		expect(document.componentSource.match(/export\s+default/g)?.length).toBe(1);
		expect(document.compiledModule).toContain("ShotlyxComponent");
	});

	test("rejects unsafe generated component source", async () => {
		await expect(
			createShotlyxRemotionComponentDocument({
				name: "Unsafe",
				componentSource: `
export default function ShotlyxComponent() {
	const frame = useCurrentFrame();
	fetch("https://example.com/" + frame);
	return <AbsoluteFill />;
}
`,
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Unsafe",
					},
				],
				sourcePrompt: "unsafe",
				durationSeconds: 3,
				aspectRatio: "16:9",
			}),
		).rejects.toThrow("forbidden API: fetch");
	});

	test("rejects components that compile but fail render validation", async () => {
		await expect(
			createShotlyxRemotionComponentDocument({
				name: "Runtime Throw",
				componentSource: `
export default function ShotlyxComponent() {
	const frame = useCurrentFrame();
	if (frame >= 0) throw new Error("preview cannot render");
	return <AbsoluteFill />;
}
`,
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Runtime",
					},
				],
				sourcePrompt: "runtime throw",
				durationSeconds: 3,
				aspectRatio: "16:9",
			}),
		).rejects.toThrow("Render validation failed");
	});

	test("rejects SVG child tags rendered outside svg context", async () => {
		await expect(
			createShotlyxRemotionComponentDocument({
				name: "Bare SVG Child",
				componentSource: `
export default function ShotlyxComponent() {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill>
			<g transform={"translate(" + (120 + frame * 0) + ",230)"}>
				<rect x={0} y={0} width={200} height={80} fill="#22d3ee" />
			</g>
		</AbsoluteFill>
	);
}
`,
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Runtime",
					},
				],
				sourcePrompt: "bare svg",
				durationSeconds: 3,
				aspectRatio: "16:9",
			}),
		).rejects.toThrow("wrapped in an <svg> element");
	});

	test("rejects non-finite render values before saving generated MG", async () => {
		await expect(
			createShotlyxRemotionComponentDocument({
				name: "NaN Transform",
				componentSource: `
export default function ShotlyxComponent() {
	const frame = useCurrentFrame();
	const scale = frame / 0 - Infinity;
	return (
		<AbsoluteFill>
			<svg width="100%" height="100%">
				<g transform={"translate(120,230) scale(" + scale + ")"}>
					<circle cx={120} cy={120} r={64} fill="#22d3ee" />
				</g>
			</svg>
		</AbsoluteFill>
	);
}
`,
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Runtime",
					},
				],
				sourcePrompt: "nan transform",
				durationSeconds: 3,
				aspectRatio: "16:9",
			}),
		).rejects.toThrow("non-finite value");
	});

	test("custom generation asks for TSX only and derives editable props", async () => {
		const generateTextMock = mock(
			async (options: {
				output?: unknown;
				prompt?: string;
				system?: string;
			}) => {
				expect(options.output).toBeUndefined();
				expect(options.prompt).toContain("Design the content structure");
				expect(options.system).toContain("Return TSX code only");
				expect(options.system).toContain("Default editable props");
				return {
					text: `
type Props = {
	title: string;
	subtitle: string;
	caption: string;
	showLabels: boolean;
	primaryColor: string;
	secondaryColor: string;
	warningColor: string;
	fontFamily: string;
	intensity: number;
	density: number;
	backdropOpacity: number;
};

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	const opacity = interpolate(frame, [0, 18, durationInFrames - 18, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	const lift = interpolate(frame, [0, 28], [36, 0], { extrapolateRight: "clamp" });
	return (
		<AbsoluteFill style={{ opacity, color: props.primaryColor, fontFamily: props.fontFamily, justifyContent: "center", alignItems: "center" }}>
			<div style={{ transform: "translateY(" + lift + "px)", textAlign: "center" }}>
				<div style={{ fontSize: 92, fontWeight: 800 }}>{props.title}</div>
				{props.showLabels ? <div style={{ fontSize: 32, color: props.secondaryColor }}>{props.subtitle}</div> : null}
			</div>
		</AbsoluteFill>
	);
}
`,
				};
			},
		);

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个 AI 芯片发布 MG，标题「Neural Core」",
			durationSeconds: 5,
			aspectRatio: "16:9",
			repairAttempts: 0,
		});

		expect(document.name).toBe("做一个 AI 芯片发布 MG，标题「Neural Core」");
		expect(document.defaultProps.title).toBe("Neural Core");
		expect(document.propsSchema.map((prop) => prop.key)).toContain(
			"primaryColor",
		);
		expect(document.componentSource).toContain("ShotlyxComponent");
	});

	test("custom generation can use a local CLI source generator without an API model", async () => {
		const generateSourceFn = mock(
			async () => `
type Props = { title: string; primaryColor: string };

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
	return <AbsoluteFill style={{ opacity, color: props.primaryColor, fontSize: 72 }}>{props.title}</AbsoluteFill>;
}
`,
		);

		const document = await generateShotlyxMGComponentDocument({
			generateSourceFn,
			prompt: "生成标题「本地 Agent MG」",
			durationSeconds: 4,
			aspectRatio: "16:9",
			repairAttempts: 0,
		});

		expect(generateSourceFn).toHaveBeenCalledTimes(1);
		expect(document.defaultProps.title).toBe("本地 Agent MG");
		expect(document.componentSource).toContain("ShotlyxComponent");
	});

	test("custom generation repairs invalid TSX without regenerating schema", async () => {
		let calls = 0;
		const generateTextMock = mock(
			async (options: { output?: unknown; prompt?: string }) => {
				calls += 1;
				expect(options.output).toBeUndefined();
				if (calls === 1) {
					return {
						text: `
export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const broken =
	return <AbsoluteFill>{frame}</AbsoluteFill>;
}
`,
					};
				}
				expect(options.prompt).toContain("Previous code failed");
				return {
					text: `
type Props = { primaryColor: string; secondaryColor: string; warningColor: string; fontFamily: string; intensity: number; density: number; backdropOpacity: number };

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
	return <AbsoluteFill style={{ opacity, color: props.primaryColor }}><svg width="100%" height="100%"><circle cx="50%" cy="50%" r={80 + frame} fill="none" stroke={props.primaryColor} strokeWidth={8} /></svg></AbsoluteFill>;
}
`,
				};
			},
		);

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "纯视觉圆环扩散，不出现文字",
			durationSeconds: 4,
			aspectRatio: "16:9",
			repairAttempts: 1,
		});

		expect(calls).toBe(2);
		expect(document.defaultProps.primaryColor).toBe("#22d3ee");
		expect(document.propsSchema.some((prop) => prop.key === "title")).toBe(
			false,
		);
	});
});
