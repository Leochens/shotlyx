import { describe, expect, test } from "bun:test";
import { getAccountInitials } from "./account-menu";

describe("account menu", () => {
	test("uses the first letters from a display name", () => {
		expect(
			getAccountInitials({
				name: "Zhang Long",
				email: "zhl@example.com",
			}),
		).toBe("ZL");
	});

	test("falls back to the email local part", () => {
		expect(
			getAccountInitials({
				name: "",
				email: "zhl@example.com",
			}),
		).toBe("ZH");
	});
});
