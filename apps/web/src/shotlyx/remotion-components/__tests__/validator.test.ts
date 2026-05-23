import { describe, expect, test } from "bun:test";
import {
	assertValidShotlyxRemotionComponentAssetDocument,
	validateShotlyxRemotionComponentDataContract,
	validateShotlyxRemotionComponentSource,
} from "../validator";

const validDocument = {
	version: 1,
	runtime: "shotlyx-remotion-component-v1",
	name: "Typewriter Title",
	durationSeconds: 5,
	fps: 30,
	width: 1920,
	height: 1080,
	aspectRatio: "16:9",
	componentSource: `
type Props = { title: string; accentColor: string };

export default function ShotlyxComponent(props: Props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const visibleChars = Math.floor(interpolate(frame, [0, 60], [0, props.title.length], { extrapolateRight: "clamp" }));
	return (
		<AbsoluteFill style={{ backgroundColor: "#111", color: props.accentColor, fontSize: 96 }}>
			{props.title.slice(0, visibleChars)}
		</AbsoluteFill>
	);
}
`,
	compiledModule: "export default function ShotlyxComponent(){ return null; }",
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
	defaultProps: {
		title: "Hello MG",
		accentColor: "#38bdf8",
	},
	sourcePrompt: "做一个打字机标题 MG",
};

describe("Shotlyx Remotion component validation", () => {
	test("accepts a generated Remotion component document", () => {
		expect(() =>
			assertValidShotlyxRemotionComponentAssetDocument(validDocument),
		).not.toThrow();
	});

	test("rejects network and browser escape APIs in generated source", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent() {
	fetch("https://example.com");
	return <div />;
}
`,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.join("\n")).toContain("fetch");
	});

	test("rejects CSS timeline animation primitives in generated source", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent() {
	const { AbsoluteFill } = Remotion;
	return <AbsoluteFill style={{ transition: "opacity 300ms ease", animation: "fade 1s ease" }} />;
}
`,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.join("\n")).toContain("CSS transition");
		expect(result.errors.join("\n")).toContain("CSS animation");
	});

	test("rejects static Remotion components with no frame-based MG motion", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent() {
	const { AbsoluteFill } = Remotion;
	return <AbsoluteFill><div>Static title only</div></AbsoluteFill>;
}
`,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.join("\n")).toContain("useCurrentFrame()");
	});

	test("accepts frame-based manual text reveal without CSS animation", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const chars = Math.floor(interpolate(frame, [0, 60], [0, props.title.length], { extrapolateRight: "clamp" }));
	return <AbsoluteFill>{props.title.slice(0, chars)}</AbsoluteFill>;
}
`,
		});

		expect(result.valid).toBe(true);
	});

	test("rejects full-canvas AbsoluteFill backgrounds for transparent MG documents", () => {
		expect(() =>
			assertValidShotlyxRemotionComponentAssetDocument({
				...validDocument,
				transparentBackground: true,
			}),
		).toThrow("transparentBackground");
	});

	test("accepts manual frame math without requiring interpolate spring or Sequence", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	const opacity = Math.min(1, frame / 30);
	const offset = Math.max(0, 40 - frame);
	return (
		<AbsoluteFill style={{ opacity, transform: "translateY(" + offset + "px)" }}>
			{props.title}
		</AbsoluteFill>
	);
}
`,
		});

		expect(result.valid).toBe(true);
	});

	test("rejects official full-project APIs that are not exposed in Shotlyx runtime", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent() {
	const { AbsoluteFill, Series, Audio, staticFile } = Remotion;
	return <AbsoluteFill><Series><Audio src={staticFile("song.mp3")} /></Series></AbsoluteFill>;
}
`,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.join("\n")).toContain("unsupported API: staticFile");
		expect(result.errors.join("\n")).toContain("unsupported API: Series");
		expect(result.errors.join("\n")).toContain("unsupported API: Audio");
	});

	test("requires defaultProps to cover every editable prop", () => {
		expect(() =>
			assertValidShotlyxRemotionComponentAssetDocument({
				...validDocument,
				defaultProps: {
					title: "Only title",
				},
			}),
		).toThrow('defaultProps missing key "accentColor"');
	});

	test("rejects table props when source does not read declared column keys", () => {
		const result = validateShotlyxRemotionComponentDataContract({
			source: `
export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	useCurrentFrame();
	return <AbsoluteFill>{props.diseases.map((row) => <div>{row.symptom}</div>)}</AbsoluteFill>;
}
`,
			propsSchema: [
				{
					key: "diseases",
					label: "病害数据",
					type: "table",
					role: "data",
					default: [{ 病害名称: "疫病", 核心症状: "高湿环境" }],
					columns: ["病害名称", "核心症状"],
				},
			],
		});

		expect(result.valid).toBe(false);
		expect(result.errors.join("\n")).toContain("核心症状");
	});

	test("accepts table props when source reads declared column keys exactly", () => {
		const result = validateShotlyxRemotionComponentDataContract({
			source: `
export default function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	useCurrentFrame();
	return <AbsoluteFill>{props.diseases.map((row) => <div>{row["病害名称"]}{row["核心症状"]}</div>)}</AbsoluteFill>;
}
`,
			propsSchema: [
				{
					key: "diseases",
					label: "病害数据",
					type: "table",
					role: "data",
					default: [{ 病害名称: "疫病", 核心症状: "高湿环境" }],
					columns: ["病害名称", "核心症状"],
				},
			],
		});

		expect(result.valid).toBe(true);
	});
});
