import { describe, expect, test } from "bun:test";
import type {
	EffectElement,
	EffectTrack,
	SceneTracks,
	TextElement,
	TextTrack,
	VideoTrack,
} from "@/timeline";
import { buildOrganizedTracksPlan } from "./organize-tracks";

function textElement({
	id,
	startTime,
	duration = 10,
}: {
	id: string;
	startTime: number;
	duration?: number;
}): TextElement {
	return {
		id,
		name: id,
		type: "text",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		params: {},
	};
}

function effectElement({
	id,
	startTime,
	duration = 10,
}: {
	id: string;
	startTime: number;
	duration?: number;
}): EffectElement {
	return {
		id,
		name: id,
		type: "effect",
		effectType: "blur",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		params: {},
	};
}

function textTrack({
	id,
	elements,
	hidden = false,
}: {
	id: string;
	elements: TextElement[];
	hidden?: boolean;
}): TextTrack {
	return {
		id,
		name: id,
		type: "text",
		hidden,
		elements,
	};
}

function effectTrack({
	id,
	elements,
}: {
	id: string;
	elements: EffectElement[];
}): EffectTrack {
	return {
		id,
		name: id,
		type: "effect",
		hidden: false,
		elements,
	};
}

function baseTracks(overlay: SceneTracks["overlay"]): SceneTracks {
	return {
		overlay,
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [],
		} satisfies VideoTrack,
		audio: [],
	};
}

describe("buildOrganizedTracksPlan", () => {
	test("merges same-type non-overlapping overlay elements onto one track", () => {
		const tracks = baseTracks([
			textTrack({
				id: "text-1",
				elements: [textElement({ id: "a", startTime: 0 })],
			}),
			textTrack({
				id: "text-2",
				elements: [textElement({ id: "b", startTime: 12 })],
			}),
		]);

		const plan = buildOrganizedTracksPlan({ tracks });

		expect(plan.changed).toBe(true);
		expect(plan.tracks.overlay).toHaveLength(1);
		expect(plan.tracks.overlay[0]?.id).toBe("text-1");
		expect(
			plan.tracks.overlay[0]?.elements.map((element) => element.id),
		).toEqual(["a", "b"]);
		expect(plan.elementTrackMap.get("b")).toBe("text-1");
	});

	test("keeps overlapping same-type elements on separate tracks", () => {
		const tracks = baseTracks([
			effectTrack({
				id: "effect-1",
				elements: [effectElement({ id: "a", startTime: 0, duration: 20 })],
			}),
			effectTrack({
				id: "effect-2",
				elements: [effectElement({ id: "b", startTime: 10, duration: 20 })],
			}),
		]);

		const plan = buildOrganizedTracksPlan({ tracks });

		expect(plan.changed).toBe(false);
		expect(plan.tracks.overlay).toHaveLength(2);
		expect(plan.elementTrackMap.get("a")).toBe("effect-1");
		expect(plan.elementTrackMap.get("b")).toBe("effect-2");
	});

	test("does not merge tracks with different visibility state", () => {
		const tracks = baseTracks([
			textTrack({
				id: "visible-text",
				elements: [textElement({ id: "a", startTime: 0 })],
			}),
			textTrack({
				id: "hidden-text",
				hidden: true,
				elements: [textElement({ id: "b", startTime: 12 })],
			}),
		]);

		const plan = buildOrganizedTracksPlan({ tracks });

		expect(plan.changed).toBe(false);
		expect(plan.tracks.overlay).toHaveLength(2);
		expect(plan.elementTrackMap.get("b")).toBe("hidden-text");
	});

	test("does not merge same-type tracks across another layer type", () => {
		const tracks = baseTracks([
			textTrack({
				id: "text-top",
				elements: [textElement({ id: "a", startTime: 0 })],
			}),
			effectTrack({
				id: "effect-middle",
				elements: [effectElement({ id: "fx", startTime: 0 })],
			}),
			textTrack({
				id: "text-bottom",
				elements: [textElement({ id: "b", startTime: 12 })],
			}),
		]);

		const plan = buildOrganizedTracksPlan({ tracks });

		expect(plan.changed).toBe(false);
		expect(plan.tracks.overlay.map((track) => track.id)).toEqual([
			"text-top",
			"effect-middle",
			"text-bottom",
		]);
		expect(plan.elementTrackMap.get("b")).toBe("text-bottom");
	});

	test("compacts only consecutive same-type runs and preserves layer order", () => {
		const tracks = baseTracks([
			effectTrack({
				id: "effect-1",
				elements: [effectElement({ id: "fx-1", startTime: 0 })],
			}),
			effectTrack({
				id: "effect-2",
				elements: [effectElement({ id: "fx-2", startTime: 12 })],
			}),
			textTrack({
				id: "text-middle",
				elements: [textElement({ id: "text", startTime: 0 })],
			}),
			effectTrack({
				id: "effect-3",
				elements: [effectElement({ id: "fx-3", startTime: 24 })],
			}),
			effectTrack({
				id: "effect-4",
				elements: [effectElement({ id: "fx-4", startTime: 36 })],
			}),
		]);

		const plan = buildOrganizedTracksPlan({ tracks });

		expect(plan.changed).toBe(true);
		expect(plan.tracks.overlay.map((track) => track.id)).toEqual([
			"effect-1",
			"text-middle",
			"effect-3",
		]);
		expect(
			plan.tracks.overlay[0]?.elements.map((element) => element.id),
		).toEqual(["fx-1", "fx-2"]);
		expect(
			plan.tracks.overlay[2]?.elements.map((element) => element.id),
		).toEqual(["fx-3", "fx-4"]);
		expect(plan.elementTrackMap.get("fx-4")).toBe("effect-3");
	});
});
