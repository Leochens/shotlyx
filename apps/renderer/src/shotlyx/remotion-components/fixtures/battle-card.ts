import type { ShotlyxRemotionComponentDocument } from "../types";

export const shotlyxBattleCardFixture: ShotlyxRemotionComponentDocument = {
	version: 1,
	runtime: "shotlyx-remotion-component-v1",
	name: "Shotlyx Battle Card",
	durationSeconds: 5,
	fps: 30,
	width: 1920,
	height: 1080,
	aspectRatio: "16:9",
	componentSource: `
type Props = {
	title: string;
	subtitle: string;
	accentColor: string;
	backgroundColor: string;
};

export default function ShotlyxComponent(props: Props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const visibleChars = Math.floor(interpolate(frame, [0, 60], [0, props.title.length], { extrapolateRight: "clamp" }));
	const subtitleOpacity = interpolate(frame, [45, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	return (
		<AbsoluteFill style={{
			backgroundColor: props.backgroundColor,
			color: "#ffffff",
			fontFamily: "Inter, sans-serif",
			justifyContent: "center",
			alignItems: "center",
			gap: 24,
		}}>
			<div style={{ color: props.accentColor, fontSize: 112, fontWeight: 800 }}>
				{props.title.slice(0, visibleChars)}
			</div>
			<div style={{ opacity: subtitleOpacity, fontSize: 44 }}>
				{props.subtitle}
			</div>
		</AbsoluteFill>
	);
}
`,
	compiledModule: `
const React = globalThis.__SHOTLYX_REMOTION_RUNTIME__.React;
const Remotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;
function ShotlyxComponent(props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const visibleChars = Math.floor(interpolate(frame, [0, 60], [0, props.title.length], { extrapolateRight: "clamp" }));
	const subtitleOpacity = interpolate(frame, [45, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	return React.createElement(AbsoluteFill, { style: { backgroundColor: props.backgroundColor, color: "#ffffff", fontFamily: "Inter, sans-serif", justifyContent: "center", alignItems: "center", gap: 24 } },
		React.createElement("div", { style: { color: props.accentColor, fontSize: 112, fontWeight: 800 } }, props.title.slice(0, visibleChars)),
		React.createElement("div", { style: { opacity: subtitleOpacity, fontSize: 44 } }, props.subtitle)
	);
}
export default ShotlyxComponent;
`,
	propsSchema: [
		{
			key: "title",
			label: "Title",
			type: "text",
			role: "content",
			default: "Shotlyx MG",
		},
		{
			key: "subtitle",
			label: "Subtitle",
			type: "text",
			role: "content",
			default: "Editable Remotion component",
		},
		{
			key: "accentColor",
			label: "Accent",
			type: "color",
			role: "style",
			default: "#38bdf8",
		},
		{
			key: "backgroundColor",
			label: "Background",
			type: "color",
			role: "style",
			default: "#0f172a",
		},
	],
	defaultProps: {
		title: "Shotlyx MG",
		subtitle: "Editable Remotion component",
		accentColor: "#38bdf8",
		backgroundColor: "#0f172a",
	},
	sourcePrompt: "Shotlyx Remotion battle card fixture",
};
