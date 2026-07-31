import { describe, expect, test } from "bun:test";
import { ApiRequest } from "@/platform/http";
import { searchBuiltInSoundEffects } from "@/sounds/builtin-library";
import { GET } from "@/api/sounds/builtin/route";

describe("built-in sound route", () => {
	test("returns generated wav audio for a built-in sound", async () => {
		const sound = searchBuiltInSoundEffects({
			query: "",
			page: 1,
			pageSize: 1,
		}).results[0];

		const response = await GET(
			new ApiRequest(`http://localhost/api/sounds/builtin?id=${sound!.id}`),
		);
		const bytes = new Uint8Array(await response.arrayBuffer());
		const header = new TextDecoder().decode(bytes.slice(0, 4));

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("audio/wav");
		expect(header).toBe("RIFF");
		expect(bytes.length).toBeGreaterThan(44);
	});

	test("rejects unknown built-in sound ids", async () => {
		const response = await GET(
			new ApiRequest("http://localhost/api/sounds/builtin?id=-999999"),
		);

		expect(response.status).toBe(404);
	});
});
