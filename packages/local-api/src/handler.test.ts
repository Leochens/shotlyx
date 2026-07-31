import { describe, expect, test } from "bun:test";
import { handleElectronApiRequest } from "./handler";

describe("desktop local API boundary", () => {
	test("keeps the local health route available", async () => {
		const response = await handleElectronApiRequest(
			new Request("app://shotlyx/api/health"),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
	});

	test("does not expose account or authentication routes", async () => {
		for (const path of ["/api/auth/session", "/api/account/me"]) {
			const response = await handleElectronApiRequest(
				new Request(`app://shotlyx${path}`),
			);
			expect(response.status).toBe(404);
		}
	});

	test("does not attach permissive CORS headers", async () => {
		const response = await handleElectronApiRequest(
			new Request("app://shotlyx/api/health"),
		);

		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});
});
