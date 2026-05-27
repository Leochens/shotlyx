import { describe, expect, test } from "bun:test";
import { VISIBLE_TAB_KEYS } from "../assets-panel-store";

describe("assets panel visible tabs", () => {
	test("shows the stickers tab", () => {
		expect(VISIBLE_TAB_KEYS).toContain("stickers");
	});
});
