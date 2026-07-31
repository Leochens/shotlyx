import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { wasmMock } from "@/test/wasm-mock";

const TICKS_PER_SECOND = wasmMock.TICKS_PER_SECOND;

mock.module("@/wasm", () => wasmMock);

const editor = {
	scenes: {
		getActiveScene: () => ({
			bookmarks: [{ time: TICKS_PER_SECOND }],
		}),
		removeBookmark: mock(() => {}),
		updateBookmark: mock(() => {}),
	},
	timeline: {
		getTotalDuration: () => 10 * TICKS_PER_SECOND,
	},
	project: {
		getActive: () => ({
			settings: { fps: { numerator: 30, denominator: 1 } },
		}),
	},
	playback: {
		seek: mock(() => {}),
	},
};

mock.module("@/editor/use-editor", () => ({
	useEditor: <T,>(selector?: (editor: typeof editor) => T) =>
		selector ? selector(editor) : editor,
}));

const { TimelineBookmarksRow } = await import("../bookmarks");

describe("TimelineBookmarksRow", () => {
	test("does not nest bookmark buttons inside another button", () => {
		const html = renderToStaticMarkup(
			<TimelineBookmarksRow
				zoomLevel={1}
				dynamicTimelineWidth={400}
				dragState={{
					isDragging: false,
					bookmarkTime: null,
					currentTime: 0,
				}}
				onBookmarkMouseDown={mock(() => {})}
				handleWheel={mock(() => {})}
				handleTimelineContentClick={mock(() => {})}
				handleRulerTrackingMouseDown={mock(() => {})}
				handleRulerMouseDown={mock(() => {})}
			/>,
		);

		expect(html).toContain('aria-label="Timeline bookmarks"');
		expect(html).toContain('aria-label="Bookmark at 1.0s"');
		expect(html.match(/<button/g)?.length).toBe(1);
	});
});
