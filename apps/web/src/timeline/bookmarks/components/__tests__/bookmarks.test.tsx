import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const TICKS_PER_SECOND = 120_000;

mock.module("@/wasm", () => ({
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME: 0,
	mediaTime: ({ ticks }: { ticks: number }) => Math.round(ticks),
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * TICKS_PER_SECOND),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / TICKS_PER_SECOND,
	roundMediaTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTicks: ({ ticks }: { ticks: number }) => Math.round(ticks),
	snapSeekMediaTime: ({ time }: { time: number }) => Math.round(time),
	snappedSeekTime: ({ time }: { time: number }) => Math.round(time),
	parseTimecode: () => 0,
	parseMediaTimecode: () => 0,
	addMediaTime: ({ a, b }: { a: number; b: number }) => a + b,
	subMediaTime: ({ a, b }: { a: number; b: number }) => a - b,
	maxMediaTime: ({ a, b }: { a: number; b: number }) => Math.max(a, b),
	minMediaTime: ({ a, b }: { a: number; b: number }) => Math.min(a, b),
	clampMediaTime: ({
		time,
		min,
		max,
	}: {
		time: number;
		min: number;
		max: number;
	}) => Math.min(Math.max(time, min), max),
	lastFrameMediaTime: ({ duration }: { duration: number }) =>
		Math.max(0, duration - 1),
}));

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
