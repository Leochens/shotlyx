import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
const subscribe = () => () => {};
const fakeEditor = {
	playback: { subscribe },
	timeline: { subscribe },
	scenes: { subscribe, getActiveSceneOrNull: () => null },
	project: {
		subscribe,
		getActiveOrNull: () => null,
		getActiveBrandKit: () => null,
		getBrandKits: () => [],
	},
	media: { subscribe, getAssets: () => [] },
	renderer: { subscribe },
	selection: { subscribe },
	clipboard: { subscribe },
	diagnostics: { subscribe },
};

mock.module("@/core", () => ({
	EditorCore: {
		getInstance: () => fakeEditor,
	},
}));

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { BottomToolbar } = await import("../bottom-toolbar");

describe("BottomToolbar", () => {
	test("renders the mode controls directly above the chat input", () => {
		const html = renderToStaticMarkup(
			<BottomToolbar
				input=""
				selectedAgent="media"
				onInputChange={() => {}}
				onSubmit={() => {}}
			/>,
		);

		const controlsIndex = html.indexOf('data-testid="chat-mode-controls"');
		const inputIndex = html.indexOf('data-testid="chat-input"');

		expect(controlsIndex).toBeGreaterThanOrEqual(0);
		expect(controlsIndex).toBeLessThan(inputIndex);
		expect(html).toContain("Execution mode: Auto");
	});

	test("shows queue and guide controls while the agent is running", () => {
		const html = renderToStaticMarkup(
			<BottomToolbar
				input="继续补充资料"
				selectedAgent="default"
				disabled
				runningSubmitMode="queue"
				onInputChange={() => {}}
				onSubmit={() => {}}
				onRunningSubmitModeChange={() => {}}
			/>,
		);

		expect(html).toContain("排队");
		expect(html).toContain("引导");
		expect(html).toContain('data-testid="running-submit-mode-controls"');
	});

	test("shows material controls only in the topic workbench", () => {
		const topicHtml = renderToStaticMarkup(
			<BottomToolbar
				input=""
				selectedAgent="default"
				workbench="topic"
				onInputChange={() => {}}
				onSubmit={() => {}}
			/>,
		);
		const videoHtml = renderToStaticMarkup(
			<BottomToolbar
				input=""
				selectedAgent="default"
				workbench="video"
				onInputChange={() => {}}
				onSubmit={() => {}}
			/>,
		);

		expect(topicHtml).toContain("上传素材");
		expect(topicHtml).toContain("粘贴脚本或录屏稿");
		expect(videoHtml).not.toContain("上传素材");
	});

	test("can center the default chat input for the focused topic chat", () => {
		const html = renderToStaticMarkup(
			<BottomToolbar
				input=""
				selectedAgent="default"
				centered
				onInputChange={() => {}}
				onSubmit={() => {}}
			/>,
		);

		expect(html).toContain("max-w-4xl");
	});

	test("expands long topic workflow prompts in the chat input", () => {
		const longTopicPrompt = `${"我想做一个口播观点类视频。".repeat(45)}

候选选题产出要求：
- 标题
- 核心观点
`;

		const html = renderToStaticMarkup(
			<BottomToolbar
				input={longTopicPrompt}
				selectedAgent="default"
				workbench="topic"
				onInputChange={() => {}}
				onSubmit={() => {}}
			/>,
		);

		expect(html).toContain('rows="10"');
		expect(html).toContain("min-h-56");
	});

	test("shows a draft-first action in focused topic mode", () => {
		const html = renderToStaticMarkup(
			<BottomToolbar
				input=""
				selectedAgent="default"
				workbench="topic"
				primaryActionLabel="我先自己打打草稿"
				allowEmptySubmit
				onInputChange={() => {}}
				onSubmit={() => {}}
			/>,
		);

		expect(html).toContain("我先自己打打草稿");
		expect(html).not.toContain('disabled=""');
	});
});
