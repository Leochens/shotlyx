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

	test("routes subtitle filler analysis through the local API", async () => {
		const previousDesktop = process.env.SHOTLYX_DESKTOP;
		const previousViteDesktop = process.env.VITE_SHOTLYX_DESKTOP;
		process.env.SHOTLYX_DESKTOP = "1";
		process.env.VITE_SHOTLYX_DESKTOP = "1";
		try {
			const response = await handleElectronApiRequest(
				new Request("app://shotlyx/api/agent/subtitle-filler-analysis", {
					body: JSON.stringify({ candidates: [] }),
					headers: { "Content-Type": "application/json" },
					method: "POST",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "Invalid input",
			});
		} finally {
			if (previousDesktop === undefined) {
				delete process.env.SHOTLYX_DESKTOP;
			} else {
				process.env.SHOTLYX_DESKTOP = previousDesktop;
			}
			if (previousViteDesktop === undefined) {
				delete process.env.VITE_SHOTLYX_DESKTOP;
			} else {
				process.env.VITE_SHOTLYX_DESKTOP = previousViteDesktop;
			}
		}
	});
});
