import { describe, expect, test } from "bun:test";
import {
	getBuiltInSoundEffectById,
	searchBuiltInSoundEffects,
} from "@/sounds/builtin-library";

describe("built-in sound effects", () => {
	test("returns bundled sounds for the default library view", () => {
		const result = searchBuiltInSoundEffects({
			query: "",
			page: 1,
			pageSize: 50,
		});

		expect(result.count).toBeGreaterThan(0);
		expect(result.next).toBeNull();
		expect(result.results[0]?.id).toBeLessThan(0);
		expect(result.results[0]?.previewUrl).toStartWith(
			"/api/sounds/builtin?id=",
		);
	});

	test("matches common sound effect queries without remote search", () => {
		const result = searchBuiltInSoundEffects({
			query: "whoosh",
			page: 1,
			pageSize: 10,
		});

		expect(result.results.length).toBeGreaterThan(0);
		expect(result.results.every((sound) => sound.tags.includes("whoosh"))).toBe(
			true,
		);
	});

	test("finds sounds by the negative local id used by API urls", () => {
		const result = searchBuiltInSoundEffects({
			query: "pop",
			page: 1,
			pageSize: 1,
		});
		const sound = result.results[0];

		expect(sound).toBeDefined();
		expect(getBuiltInSoundEffectById(sound!.id)).toEqual(sound);
	});
});
