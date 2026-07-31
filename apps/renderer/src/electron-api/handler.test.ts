import { describe, expect, test } from "bun:test";

describe("electron API handler", () => {
	test("routes subtitle filler analysis requests to the local API module", async () => {
		const previousDesktop = process.env.SHOTLYX_DESKTOP;
		const previousViteDesktop = process.env.VITE_SHOTLYX_DESKTOP;
		process.env.SHOTLYX_DESKTOP = "1";
		process.env.VITE_SHOTLYX_DESKTOP = "1";
		try {
			const { handleElectronApiRequest } = await import("./handler");

			const response = await handleElectronApiRequest(
				new Request("http://localhost/api/agent/subtitle-filler-analysis", {
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
