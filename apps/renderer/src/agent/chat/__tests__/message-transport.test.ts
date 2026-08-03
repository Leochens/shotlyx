import { describe, expect, test } from "bun:test";
import { toAgentRequestMessage } from "../message-transport";

describe("chat message transport", () => {
	test("sends hidden orchestration content to the agent without changing the bubble", () => {
		const request = toAgentRequestMessage({
			role: "user",
			content: "生成一个人口变化 MG",
			requestContent:
				'内部参数：{"durationSeconds":5} 请调用 shotlyx_generate_mg_component',
		});

		expect(request.content).toContain('"durationSeconds":5');
		expect(request.content).toContain("shotlyx_generate_mg_component");
		expect(request.content).not.toContain("生成一个人口变化 MG");
	});
});
