/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Route tests pass standard Request objects into the Next route handler shape. */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FunctionSchema } from "@/agent/mcp/schema";
import { clearPendingToolCallsForTests, resolveToolCall } from "../resolve";

const originalEnv = { ...process.env };
let tempDir: string;

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-route-cli-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_CONFIG_PATH: path.join(tempDir, "desktop-config.json"),
		AGENT_RUNTIME: "local-cli",
		AGENT_CLI_ID: "claude",
		AGENT_CLI_MODEL: "sonnet",
		SHOTLYX_CLAUDE_BIN: path.join(tempDir, "claude"),
	};
	writeFileSync(
		process.env.SHOTLYX_CLAUDE_BIN!,
		`#!/usr/bin/env bash
prompt="$(cat)"
if [[ "$prompt" == *"TOOL_RESULT timeline_add_text"* ]]; then
  echo '{"type":"final","text":"完成：已添加标题。"}'
else
  echo '{"type":"reasoning","text":"需要调用编辑器工具。"}'
  echo '{"type":"tool_call","tool":"timeline_add_text","params":{"text":"Hello from CLI"}}'
fi
`,
		"utf8",
	);
	chmodSync(process.env.SHOTLYX_CLAUDE_BIN!, 0o755);
});

afterEach(() => {
	clearPendingToolCallsForTests();
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
});

async function readRouteEvents(response: Response) {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const events: Array<{ event: string; data: unknown }> = [];
	let sessionId = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let index = buffer.indexOf("\n\n");
		while (index >= 0) {
			const raw = buffer.slice(0, index);
			buffer = buffer.slice(index + 2);
			const eventLine = raw
				.split("\n")
				.find((line) => line.startsWith("event: "));
			const dataLine = raw
				.split("\n")
				.find((line) => line.startsWith("data: "));
			if (eventLine && dataLine) {
				const event = eventLine.slice("event: ".length);
				const data = JSON.parse(dataLine.slice("data: ".length)) as unknown;
				events.push({ event, data });
				if (
					event === "init" &&
					typeof data === "object" &&
					data !== null &&
					"sessionId" in data &&
					typeof data.sessionId === "string"
				) {
					sessionId = data.sessionId;
				}
				if (
					event === "tool-call" &&
					typeof data === "object" &&
					data !== null &&
					"callId" in data &&
					typeof data.callId === "string"
				) {
					expect(sessionId).toBeTruthy();
					resolveToolCall({
						sessionId,
						callId: data.callId,
						result: {
							status: "success",
							data: { elementId: "text-1" },
						},
					});
				}
			}
			index = buffer.indexOf("\n\n");
		}
	}

	return events;
}

describe("/api/agent/chat local CLI runtime", () => {
	test("can run the same tool-call bridge with a local CLI agent", async () => {
		const { POST } = await import("../route");
		const toolSchemas: FunctionSchema[] = [
			{
				name: "timeline_add_text",
				description: "Add text to the current timeline.",
				parameters: {
					type: "object",
					properties: {
						text: { type: "string", description: "Text to insert" },
					},
					required: ["text"],
				},
			},
		];
		const request = new Request("http://localhost/api/agent/chat", {
			method: "POST",
			body: JSON.stringify({
				messages: [{ role: "user", content: "Add title" }],
				mode: "auto",
				toolSchemas,
			}),
			headers: { "Content-Type": "application/json" },
		});

		const response = await POST(request as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		const events = await readRouteEvents(response);

		expect(events.map((event) => event.event)).toContain("reasoning-delta");
		expect(events.map((event) => event.event)).toContain("tool-call");
		expect(events.map((event) => event.event)).toContain("token-usage");
		expect(events.map((event) => event.event)).toContain("text-delta");
		expect(events.at(-1)?.event).toBe("done");
		expect(events.find((event) => event.event === "token-usage")?.data).toMatchObject({
			source: "local-cli",
			usage: {
				approximate: true,
			},
		});
		expect(
			events.find((event) => event.event === "text-delta")?.data,
		).toMatchObject({ text: "完成：已添加标题。" });
	});

	test("continues after a tool result when the first agent pass has no final text", async () => {
		writeFileSync(
			process.env.SHOTLYX_CLAUDE_BIN!,
			`#!/usr/bin/env bash
prompt="$(cat)"
if [[ "$prompt" == *"Tool Result Continuation"* ]]; then
  echo '{"type":"final","text":"工具返回后继续处理：需要你选择切分分析还是上传小视频。"}'
else
  echo '{"type":"reasoning","text":"先调用视觉工具。"}'
  echo '{"type":"tool_call","tool":"vision_analyze_media","params":{"mediaAssetId":"media-1","analysisType":"visual_summary"}}'
fi
`,
			"utf8",
		);
		chmodSync(process.env.SHOTLYX_CLAUDE_BIN!, 0o755);
		const { POST } = await import("../route");
		const request = new Request("http://localhost/api/agent/chat", {
			method: "POST",
			body: JSON.stringify({
				messages: [{ role: "user", content: "分析一下视频内容" }],
				mode: "auto",
				toolSchemas: [
					{
						name: "vision_analyze_media",
						description: "Analyze video content.",
						parameters: {
							type: "object",
							properties: {
								mediaAssetId: { type: "string", description: "Media asset ID" },
								analysisType: { type: "string", description: "Analysis type" },
							},
							required: ["mediaAssetId"],
						},
					},
				],
			}),
			headers: { "Content-Type": "application/json" },
		});

		const response = await POST(request as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		const events = await readRouteEvents(response);

		expect(events.map((event) => event.event)).toContain("tool-call");
		expect(
			events.find((event) => event.event === "text-delta")?.data,
		).toMatchObject({
			text: "工具返回后继续处理：需要你选择切分分析还是上传小视频。",
		});
		expect(events.at(-1)?.event).toBe("done");
	});

	test("can generate a suggest-mode plan through a local CLI agent", async () => {
		writeFileSync(
			process.env.SHOTLYX_CLAUDE_BIN!,
			`#!/usr/bin/env bash
echo '{"type":"plan","reasoning":"建议先加标题。","steps":[{"tool":"timeline_add_text","params":{"text":"Plan title"},"description":"添加标题","risk":"none"}]}'
`,
			"utf8",
		);
		chmodSync(process.env.SHOTLYX_CLAUDE_BIN!, 0o755);
		const { POST } = await import("../route");
		const request = new Request("http://localhost/api/agent/chat", {
			method: "POST",
			body: JSON.stringify({
				messages: [{ role: "user", content: "Plan a title" }],
				mode: "suggest",
				toolSchemas: [
					{
						name: "timeline_add_text",
						description: "Add text to the current timeline.",
						parameters: {
							type: "object",
							properties: { text: { type: "string" } },
							required: ["text"],
						},
					},
				],
			}),
			headers: { "Content-Type": "application/json" },
		});

		const response = await POST(request as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		const events = await readRouteEvents(response);

		expect(events.map((event) => event.event)).toContain("plan");
		expect(events.find((event) => event.event === "plan")?.data).toMatchObject({
			reasoning: "建议先加标题。",
			steps: [
				{
					tool: "timeline_add_text",
					params: { text: "Plan title" },
				},
			],
		});
		expect(events.at(-1)?.event).toBe("done");
	});

	test("can summarize confirmed plan execution through a local CLI agent", async () => {
		writeFileSync(
			process.env.SHOTLYX_CLAUDE_BIN!,
			`#!/usr/bin/env bash
echo '{"type":"final","text":"执行完成：标题已经添加。"}'
`,
			"utf8",
		);
		chmodSync(process.env.SHOTLYX_CLAUDE_BIN!, 0o755);
		const { POST } = await import("../route");
		const request = new Request("http://localhost/api/agent/chat", {
			method: "POST",
			body: JSON.stringify({
				messages: [{ role: "user", content: "Apply the plan" }],
				mode: "suggest",
				action: "confirm",
				plan: {
					reasoning: "Add a title",
					steps: [
						{
							tool: "timeline_add_text",
							params: { text: "Confirmed title" },
							description: "添加标题",
							risk: "none",
						},
					],
				},
				toolSchemas: [
					{
						name: "timeline_add_text",
						description: "Add text to the current timeline.",
						parameters: {
							type: "object",
							properties: { text: { type: "string" } },
							required: ["text"],
						},
					},
				],
			}),
			headers: { "Content-Type": "application/json" },
		});

		const response = await POST(request as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		const events = await readRouteEvents(response);

		expect(events.map((event) => event.event)).toContain("tool-call");
		expect(events.find((event) => event.event === "text-delta")?.data)
			.toMatchObject({ text: "执行完成：标题已经添加。" });
		expect(events.at(-1)?.event).toBe("done");
	});
});
