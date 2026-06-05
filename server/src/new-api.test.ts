import { describe, expect, test } from "bun:test";
import { createNewApiGateway } from "./new-api";

describe("New API gateway", () => {
	test("updates a token remain quota with the bound New API user header", async () => {
		const requests: Array<{
			url: string;
			method: string;
			headers: Record<string, string>;
			body: Record<string, unknown>;
		}> = [];
		const gateway = createNewApiGateway({
			baseUrl: "https://new-api.example.com/",
			adminToken: "admin-token",
			fetch: async (input, init) => {
				const headers = new Headers(init?.headers);
				requests.push({
					url: String(input),
					method: init?.method ?? "GET",
					headers: Object.fromEntries(headers.entries()),
					body: JSON.parse(String(init?.body ?? "{}")) as Record<
						string,
						unknown
					>,
				});
				return Response.json({
					success: true,
					data: { remain_quota: 4_200 },
				});
			},
		});

		const result = await gateway.updateTokenQuota({
			userId: "newapi-user-1",
			tokenId: "123",
			quota: 4_200,
		});

		expect(result).toEqual({ quota: 4_200 });
		expect(requests).toEqual([
			{
				url: "https://new-api.example.com/api/token/",
				method: "PUT",
				headers: {
					authorization: "Bearer admin-token",
					"content-type": "application/json",
					"new-api-user": "newapi-user-1",
				},
				body: {
					id: 123,
					remain_quota: 4_200,
					unlimited_quota: false,
				},
			},
		]);
	});
});
