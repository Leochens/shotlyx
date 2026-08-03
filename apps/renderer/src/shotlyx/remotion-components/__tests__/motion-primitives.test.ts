import { describe, expect, test } from "bun:test";
import { createShotlyxMotionPrimitives } from "../motion-primitives";
import { createShotlyxRemotionComponentDocument } from "../generator";

describe("Shotlyx motion primitives", () => {
	test("provides deterministic build-hold-resolve timing and text fit", () => {
		const motion = createShotlyxMotionPrimitives();
		expect(motion.buildHoldResolve(0, 100).build).toBe(0);
		expect(motion.buildHoldResolve(50, 100).hold).toBeGreaterThan(0);
		expect(motion.buildHoldResolve(99, 100).resolve).toBe(1);
		expect(motion.seeded(4, 18)).toBe(motion.seeded(4, 18));
		expect(
			motion.fitText("很长的标题文字", 320, 2, 96, 24),
		).toBeGreaterThanOrEqual(24);
	});

	test("is available to generated components in render validation", async () => {
		const document = await createShotlyxRemotionComponentDocument({
			name: "Primitive title",
			componentSource: `
export default function ShotlyxComponent(props) {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	const phases = ShotlyxMotion.buildHoldResolve(frame, durationInFrames);
	const fontSize = ShotlyxMotion.fitText(props.title, 900, 2, 110, 32);
	return <AbsoluteFill style={{ opacity: 1 - phases.resolve, fontSize }}>{props.title}</AbsoluteFill>;
}`,
			propsSchema: [
				{
					key: "title",
					label: "Title",
					type: "text",
					role: "content",
					default: "原子动效能力",
				},
			],
			sourcePrompt: "测试 ShotlyxMotion",
			durationSeconds: 3,
			aspectRatio: "16:9",
		});

		expect(document.compiledModule).toContain("ShotlyxMotion");
		expect(document.quality?.status).toBe("passed");
	});
});
