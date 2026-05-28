import { describe, expect, mock, test } from "bun:test";
import type { LanguageModel } from "ai";
import { z } from "zod";
import {
	shotlyxRemotionGeneratedComponentSchema,
	generateShotlyxMGComponentDocument,
	type GenerateShotlyxMGComponentOptions,
} from "../generator";

function fakeModel(): LanguageModel {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return {} as LanguageModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const typewriterSource = `
type Props = { title: string; accentColor: string };

export default function ShotlyxComponent(props: Props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const visibleChars = Math.floor(interpolate(frame, [0, 60], [0, props.title.length], { extrapolateRight: "clamp" }));
	return (
		<AbsoluteFill style={{ color: props.accentColor, fontSize: 96 }}>
			{props.title.slice(0, visibleChars)}
		</AbsoluteFill>
	);
}
`;

const bareRemotionHookSource = `
type Props = { title: string };

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const visible = Math.floor(Math.min(1, frame / fps) * props.title.length);
	return <AbsoluteFill>{props.title.slice(0, visible)}</AbsoluteFill>;
}
`;

const runtimeThrowSource = `
type Props = { title: string };

export default function ShotlyxComponent(props: Props) {
	const frame = useCurrentFrame();
	if (frame >= 0) {
		throw new Error("preview cannot render");
	}
	return <AbsoluteFill>{props.title}</AbsoluteFill>;
}
`;

describe("generateShotlyxMGComponentDocument", () => {
	test("uses a strict-provider compatible propsSchema item schema", () => {
		const jsonSchema = z.toJSONSchema(shotlyxRemotionGeneratedComponentSchema, {
			target: "draft-7",
			io: "input",
		});
		const rootProperties = isRecord(jsonSchema)
			? jsonSchema.properties
			: undefined;
		const propsSchema = isRecord(rootProperties)
			? rootProperties.propsSchema
			: undefined;
		const propsSchemaItems = isRecord(propsSchema)
			? propsSchema.items
			: undefined;
		const itemProperties =
			isRecord(propsSchemaItems) && isRecord(propsSchemaItems.properties)
				? propsSchemaItems.properties
				: {};
		const itemRequired =
			isRecord(propsSchemaItems) && Array.isArray(propsSchemaItems.required)
				? propsSchemaItems.required.filter(
						(value): value is string => typeof value === "string",
					)
				: [];

		expect(Object.keys(itemProperties).sort()).toEqual(
			[...itemRequired].sort(),
		);
		expect(itemRequired).toContain("columns");
		expect(itemRequired).toContain("options");
		expect(itemRequired).toContain("min");
		expect(itemRequired).toContain("max");
		expect(itemRequired).toContain("step");
	});

	test("derives defaultProps from propsSchema defaults without asking the model for arbitrary props records", async () => {
		const generateTextMock = mock(
			async ({ prompt, system }: { prompt?: string; system?: string }) => {
				expect(prompt).not.toContain("defaultProps");
				expect(prompt).toContain("Background: transparent");
				expect(system).toContain("Shotlyx Remotion skill context");
				expect(system).toContain("CSS transitions");
				expect(system).toContain("Tailwind animation classes are forbidden");
				expect(system).toContain("Do not add import statements");
				expect(system).toContain("Transparent-background MG is the default");
				expect(system).toContain(
					"Do not create full-canvas or decorative backgrounds unless the user explicitly asks for one",
				);
				expect(system).toContain(
					"If any background/backdrop/canvas layer is necessary, expose it as propsSchema controls",
				);
				expect(prompt).toContain("Default to no background");
				expect(prompt).toContain(
					"If you include any background/backdrop/canvas surface, make it editable",
				);
				return {
					output: {
						name: "Typewriter Title",
						durationSeconds: 5,
						fps: 30,
						width: 1920,
						height: 1080,
						aspectRatio: "16:9",
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
					},
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
			prompt: "做一个打字机标题 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
		});

		expect(document.defaultProps).toMatchObject({
			title: "Hello MG",
			accentColor: "#38bdf8",
		});
		expect(document.transparentBackground).toBe(true);
		expect(document.manifest?.transparentBackground).toBe(true);
	});

	test("defaults MG assets to transparent background and normalizes background color props", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Transparent Overlay",
				durationSeconds: 5,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
				componentSource: `
type Props = { title: string; backgroundColor: string };

export default function ShotlyxComponent(props: Props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
	return <AbsoluteFill style={{ color: "#fff", opacity }}>{props.title}</AbsoluteFill>;
}
`,
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Hello MG",
					},
					{
						key: "backgroundColor",
						label: "Background Color",
						type: "color",
						role: "style",
						default: "#050505",
					},
				],
			},
		}));

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个可叠加透明标题 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
		});

		expect(document.transparentBackground).toBe(true);
		expect(document.defaultProps.backgroundColor).toBe("transparent");
		expect(
			document.propsSchema.find((prop) => prop.key === "backgroundColor"),
		)?.toMatchObject({
			default: "transparent",
		});
	});

	test("normalizes generated table defaults from strict row arrays into editable row objects", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Population Chart",
				durationSeconds: 6,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
				componentSource: `
type Props = { rows: Array<{ year: string; population: number }> };

export default function ShotlyxComponent(props: Props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const reveal = interpolate(frame, [0, 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	return (
		<AbsoluteFill style={{ opacity: reveal }}>
			{props.rows.map((row) => <div key={row.year}>{row.year}: {row.population}</div>)}
		</AbsoluteFill>
	);
}
`,
				propsSchema: [
					{
						key: "rows",
						label: "Rows",
						type: "table",
						role: "data",
						columns: ["year", "population"],
						default: [
							["2014", 1364],
							["2023", 1410],
						],
					},
				],
			},
		}));

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个人口折线图 MG",
			durationSeconds: 6,
			aspectRatio: "16:9",
		});

		expect(document.defaultProps.rows).toEqual([
			{ year: "2014", population: 1364 },
			{ year: "2023", population: 1410 },
		]);
		expect(document.propsSchema[0]?.default).toEqual(
			document.defaultProps.rows,
		);
	});

	test("normalizes missing prop labels and object table columns", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Revenue Table",
				durationSeconds: 6,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
				componentSource: `
type Props = { rows: Array<{ metric: string; value: string; change: string }>; accentColor: string };

export default function ShotlyxComponent(props: Props) {
	const { AbsoluteFill, useCurrentFrame, interpolate } = Remotion;
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
	return (
		<AbsoluteFill style={{ opacity, color: props.accentColor }}>
			{props.rows.map((row) => <div key={row.metric}>{row.metric}: {row.value} {row.change}</div>)}
		</AbsoluteFill>
	);
}
`,
				propsSchema: [
					{
						key: "rows",
						type: "table",
						role: "data",
						columns: [
							{ key: "metric", label: "指标" },
							{ key: "value", label: "数值" },
							{ key: "change", label: "变化" },
						],
						default: [
							["收入", "128万", "增长24%"],
							["留存率", "68%", "提升12%"],
						],
					},
					{
						key: "accentColor",
						type: "color",
						role: "style",
						default: "#38bdf8",
					},
				],
			},
		}));

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个三行数据表格",
			durationSeconds: 6,
			aspectRatio: "16:9",
		});

		expect(document.propsSchema[0]).toMatchObject({
			key: "rows",
			label: "Rows",
			columns: ["metric", "value", "change"],
		});
		expect(document.propsSchema[1]).toMatchObject({
			key: "accentColor",
			label: "Accent Color",
		});
		expect(document.defaultProps.rows).toEqual([
			{ metric: "收入", value: "128万", change: "增长24%" },
			{ metric: "留存率", value: "68%", change: "提升12%" },
		]);
	});

	test("rejects duplicate generated prop keys before saving an asset", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Duplicate Props",
				durationSeconds: 5,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
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
						key: "title",
						label: "Duplicate title",
						type: "text",
						role: "content",
						default: "Duplicate",
					},
				],
			},
		}));

		await expect(
			generateShotlyxMGComponentDocument({
				model: fakeModel(),
				generateTextFn:
					// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
					generateTextMock as unknown as NonNullable<
						GenerateShotlyxMGComponentOptions["generateTextFn"]
					>,
				prompt: "做一个重复 key 的 MG",
				durationSeconds: 5,
				aspectRatio: "16:9",
				repairAttempts: 0,
			}),
		).rejects.toThrow('propsSchema duplicate key "title"');
	});

	test("falls back to plain JSON generation when provider rejects response_format schema", async () => {
		let calls = 0;
		const generateTextMock = mock(async (options: { output?: unknown }) => {
			calls += 1;
			if (calls === 1) {
				expect(options.output).toBeDefined();
				throw new Error(
					"Invalid schema for response_format 'ShotlyxRemotionComponent': In context=('properties', 'propsSchema', 'items'), 'required' is required to be supplied and to be an array including every key in properties. Missing 'columns'.",
				);
			}
			expect(options.output).toBeUndefined();
			return {
				text: JSON.stringify({
					name: "Fallback Typewriter",
					durationSeconds: 5,
					fps: 30,
					width: 1920,
					height: 1080,
					aspectRatio: "16:9",
					componentSource: typewriterSource,
					propsSchema: [
						{
							key: "title",
							label: "Title",
							type: "text",
							role: "content",
							default: "Hello fallback",
							min: null,
							max: null,
							step: null,
							options: null,
							columns: null,
						},
						{
							key: "accentColor",
							label: "Accent",
							type: "color",
							role: "style",
							default: "#38bdf8",
							min: null,
							max: null,
							step: null,
							options: null,
							columns: null,
						},
					],
				}),
			};
		});

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个打字机标题 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
			repairAttempts: 0,
		});

		expect(generateTextMock).toHaveBeenCalledTimes(2);
		expect(document.name).toBe("Fallback Typewriter");
		expect(document.defaultProps.title).toBe("Hello fallback");
	});

	test("falls back to plain JSON generation when Gemini rejects response_schema keywords", async () => {
		let calls = 0;
		const generateTextMock = mock(async (options: { output?: unknown }) => {
			calls += 1;
			if (calls === 1) {
				expect(options.output).toBeDefined();
				throw new Error(
					`Invalid JSON payload received. Unknown name "exclusiveMinimum" at 'generation_config.response_schema.properties[2].value.any_of[0]': Cannot find field.`,
				);
			}
			expect(options.output).toBeUndefined();
			return {
				text: JSON.stringify({
					name: "Gemini Fallback Typewriter",
					durationSeconds: 5,
					fps: 30,
					width: 1920,
					height: 1080,
					aspectRatio: "16:9",
					thumbnailFrame: null,
					componentSource: typewriterSource,
					propsSchema: [
						{
							key: "title",
							label: "Title",
							type: "text",
							role: "content",
							default: "Hello Gemini",
							min: null,
							max: null,
							step: null,
							options: null,
							columns: null,
						},
						{
							key: "accentColor",
							label: "Accent",
							type: "color",
							role: "style",
							default: "#38bdf8",
							min: null,
							max: null,
							step: null,
							options: null,
							columns: null,
						},
					],
				}),
			};
		});

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			providerConfig: {
				name: "mg",
				provider: "google",
				host: "https://generativelanguage.googleapis.com/v1beta",
				apiKey: "google-key",
				model: "gemini-2.5-flash",
				structuredOutputMode: "native",
			},
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个打字机标题 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
			repairAttempts: 0,
		});

		expect(generateTextMock).toHaveBeenCalledTimes(2);
		expect(document.name).toBe("Gemini Fallback Typewriter");
		expect(document.defaultProps.title).toBe("Hello Gemini");
	});

	test("uses plain JSON immediately for Gemini provider configs in auto mode", async () => {
		const generateTextMock = mock(async (options: { output?: unknown }) => {
			expect(options.output).toBeUndefined();
			return {
				text: JSON.stringify({
					name: "Gemini Plain Typewriter",
					durationSeconds: 5,
					fps: 30,
					width: 1920,
					height: 1080,
					aspectRatio: "16:9",
					thumbnailFrame: null,
					componentSource: typewriterSource,
					propsSchema: [
						{
							key: "title",
							label: "Title",
							type: "text",
							role: "content",
							default: "Hello Gemini",
							min: null,
							max: null,
							step: null,
							options: null,
							columns: null,
						},
						{
							key: "accentColor",
							label: "Accent",
							type: "color",
							role: "style",
							default: "#38bdf8",
							min: null,
							max: null,
							step: null,
							options: null,
							columns: null,
						},
					],
				}),
			};
		});

		await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			providerConfig: {
				name: "mg",
				provider: "google",
				host: "https://generativelanguage.googleapis.com/v1beta",
				apiKey: "google-key",
				model: "gemini-2.5-flash",
			},
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个打字机标题 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
			repairAttempts: 0,
		});

		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	test("generates and compiles a Remotion component document", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Typewriter Title",
				durationSeconds: 5,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
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
				defaultProps: {
					title: "Hello MG",
					accentColor: "#38bdf8",
				},
			},
		}));

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个打字机标题 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
		});

		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(document.runtime).toBe("shotlyx-remotion-component-v1");
		expect(document.componentSource).toContain("useCurrentFrame");
		expect(document.compiledModule).toContain("ShotlyxComponent");
		expect(document.defaultProps.title).toBe("Hello MG");
		expect(document.manifest).toMatchObject({
			runtime: "shotlyx-remotion-component-v1",
			entry: "component.tsx",
			durationInFrames: 150,
		});
	});

	test("exposes Remotion APIs as bare compiled bindings for generated components", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Bare Hooks",
				durationSeconds: 5,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
				thumbnailFrame: null,
				componentSource: bareRemotionHookSource,
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Hello MG",
						min: null,
						max: null,
						step: null,
						options: null,
						columns: null,
					},
				],
			},
		}));

		const document = await generateShotlyxMGComponentDocument({
			model: fakeModel(),
			generateTextFn:
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				generateTextMock as unknown as NonNullable<
					GenerateShotlyxMGComponentOptions["generateTextFn"]
				>,
			prompt: "做一个裸 hook 的 MG",
			durationSeconds: 5,
			aspectRatio: "16:9",
		});

		expect(document.compiledModule).toContain("useCurrentFrame");
		expect(document.compiledModule).toContain("useVideoConfig");
		expect(document.compiledModule).toContain("AbsoluteFill");
	});

	test("rejects unsafe generated component source", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Unsafe",
				durationSeconds: 5,
				componentSource:
					"export default function ShotlyxComponent(){ fetch('https://example.com'); return <div />; }",
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Hello",
					},
				],
				defaultProps: {
					title: "Hello",
				},
			},
		}));

		await expect(
			generateShotlyxMGComponentDocument({
				model: fakeModel(),
				generateTextFn:
					// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
					generateTextMock as unknown as NonNullable<
						GenerateShotlyxMGComponentOptions["generateTextFn"]
					>,
				prompt: "做一个不安全组件",
				repairAttempts: 0,
			}),
		).rejects.toThrow("forbidden API: fetch");
	});

	test("rejects components that compile but fail render validation", async () => {
		const generateTextMock = mock(async () => ({
			output: {
				name: "Runtime Throw",
				durationSeconds: 5,
				fps: 30,
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
				componentSource: runtimeThrowSource,
				propsSchema: [
					{
						key: "title",
						label: "Title",
						type: "text",
						role: "content",
						default: "Hello",
					},
				],
			},
		}));

		await expect(
			generateShotlyxMGComponentDocument({
				model: fakeModel(),
				generateTextFn:
					// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
					generateTextMock as unknown as NonNullable<
						GenerateShotlyxMGComponentOptions["generateTextFn"]
					>,
				prompt: "做一个会在预览时报错的组件",
				repairAttempts: 0,
			}),
		).rejects.toThrow("Render validation failed");
	});
});
