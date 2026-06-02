import { describe, expect, mock, test } from "bun:test";
import { buildVisionTools } from "../vision-tools";

function createEditorWithAssets(assets: unknown[]) {
	return {
		media: {
			getAssets: () => assets,
		},
		selection: {
			getSelectedElements: () => [],
		},
		timeline: {
			getElementsWithTracks: () => [],
		},
	};
}

describe("vision analysis tools", () => {
	test("builds a video understanding tool for Agent visual analysis", () => {
		const tools = buildVisionTools({
			editor: createEditorWithAssets([]) as never,
			deps: {
				fetchFn: mock(() => Promise.resolve(new Response())),
				readFileAsDataUrl: mock(() => Promise.resolve("data:video/mp4;base64,AA==")),
			},
		});

		const tool = tools.find((item) => item.name === "vision_analyze_media");

		expect(tool).toBeDefined();
		expect(tool?.description).toContain("视频内容");
		expect(tool?.parameters.mediaAssetId).toBeDefined();
	});

	test("sends the selected media asset to the vision analysis API", async () => {
		const file = new File(["demo"], "demo.mp4", { type: "video/mp4" });
		const editor = createEditorWithAssets([
			{
				id: "media-1",
				name: "demo.mp4",
				type: "video",
				duration: 12,
				width: 1920,
				height: 1080,
				file,
			},
		]);
		const fetchFn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/agent/vision/analyze");
			const body = JSON.parse(String(init?.body));
			expect(body).toMatchObject({
				analysisType: "editing_suggestions",
				prompt: "给出剪辑建议",
				media: {
					mediaAssetId: "media-1",
					name: "demo.mp4",
					type: "video",
					mimeType: "video/mp4",
					dataUrl: "data:video/mp4;base64,AA==",
					durationSeconds: 12,
					width: 1920,
					height: 1080,
				},
			});
			return Response.json({
				model: "MiniMax-M3",
				analysis: "建议保留开头动作，并在 8 秒处切到特写。",
			});
		});
		const [tool] = buildVisionTools({
			editor: editor as never,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:video/mp4;base64,AA=="),
				),
			},
		});

		const result = await tool.handler({
			mediaAssetId: "media-1",
			analysisType: "editing_suggestions",
			prompt: "给出剪辑建议",
		});

		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			model: "MiniMax-M3",
			analysis: "建议保留开头动作，并在 8 秒处切到特写。",
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});
