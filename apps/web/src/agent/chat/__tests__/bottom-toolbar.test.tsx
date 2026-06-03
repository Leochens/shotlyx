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
});
