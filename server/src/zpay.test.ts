import { describe, expect, test } from "bun:test";
import {
	buildZpaySignSource,
	signZpayParams,
	verifyZpaySignature,
} from "./zpay";

describe("ZPAY signing", () => {
	test("sorts non-empty params and excludes sign fields before MD5 signing", () => {
		const params = {
			b: "2",
			sign: "ignored",
			a: "1",
			sign_type: "MD5",
			c: "",
		};

		expect(buildZpaySignSource(params)).toBe("a=1&b=2");
		expect(signZpayParams(params, "secret")).toBe(
			"8d9f51949e440aa629fd1a035708473a",
		);
		expect(
			verifyZpaySignature(
				{ ...params, sign: "8d9f51949e440aa629fd1a035708473a" },
				"secret",
			),
		).toBe(true);
	});
});
