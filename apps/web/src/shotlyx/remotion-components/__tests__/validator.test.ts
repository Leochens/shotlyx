import { describe, expect, test } from "bun:test";
import {
	assertValidShotlyxRemotionComponentAssetDocument,
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

	test("rejects nested full-canvas background layers for transparent MG documents", () => {
		expect(() =>
			assertValidShotlyxRemotionComponentAssetDocument({
				...validDocument,
				transparentBackground: true,
				componentSource: `
type Props = { title: string; accentColor: string };

export default function ShotlyxComponent(props: Props) {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	const opacity = Math.min(1, frame / 30);
	return (
		<AbsoluteFill style={{ color: props.accentColor, fontSize: 96 }}>
			<div style={{ position: "absolute", inset: 0, backgroundColor: "#050505" }} />
			<div style={{ position: "relative", opacity }}>{props.title}</div>
		</AbsoluteFill>
	);
}
`,
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

	test("rejects double-applied coordinate transforms that can move visuals off canvas", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent() {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	const y = -300 + frame * 2;
	return (
		<AbsoluteFill>
			<span style={{ position: "absolute", top: y, transform: \`translateY(\${y}px)\` }}>1</span>
		</AbsoluteFill>
	);
}
`,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.join("\n")).toContain("double-applies top");
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

	test("rejects Node and CommonJS globals in generated source", () => {
		const result = validateShotlyxRemotionComponentSource({
			source: `
export default function ShotlyxComponent() {
	const { AbsoluteFill, useCurrentFrame } = Remotion;
	const frame = useCurrentFrame();
	const assetPath = __filename + String(frame);
	return <AbsoluteFill>{assetPath}</AbsoluteFill>;
}
`,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.join("\n")).toContain("CommonJS global: __filename");
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

	test("accepts unused editable props so schema can be derived conservatively", () => {
		expect(() =>
			assertValidShotlyxRemotionComponentAssetDocument({
				...validDocument,
				propsSchema: [
					...validDocument.propsSchema,
					{
						key: "items",
						label: "Data items",
						type: "table",
						role: "data",
						default: [{ label: "A", value: 1, note: "primary" }],
						columns: ["label", "value", "note"],
					},
				],
				defaultProps: {
					...validDocument.defaultProps,
					items: [{ label: "A", value: 1, note: "primary" }],
				},
			}),
		).not.toThrow();
	});
});
