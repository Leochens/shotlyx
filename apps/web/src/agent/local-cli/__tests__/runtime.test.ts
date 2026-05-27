/* eslint-disable shotlyx/prefer-object-params -- Test helpers mirror small filesystem calls and stay clearer with positional name/source inputs. */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildLocalCliCommand,
	detectLocalCliAgents,
	parseLocalCliEventLine,
	parseLocalCliEventsFromLine,
	runLocalCliReactLoop,
} from "../runtime";

let tempDir: string;

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-cli-runtime-"));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

function writeExecutable(name: string, source: string): string {
	const bin = path.join(tempDir, name);
	writeFileSync(bin, source, "utf8");
	chmodSync(bin, 0o755);
	return bin;
}

describe("local CLI runtime", () => {
	test("detects Claude Code and Codex CLI from injected PATH", async () => {
		writeExecutable(
			"claude",
			`#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "2.1.143 (Claude Code)"; exit 0; fi
exit 0
`,
		);
		writeExecutable(
			"codex",
			`#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "codex-cli 0.130.0"; exit 0; fi
exit 0
`,
		);

		const agents = await detectLocalCliAgents({
			env: { PATH: tempDir },
		});

		expect(agents.map((agent) => agent.id)).toEqual(["claude", "codex"]);
		expect(agents.find((agent) => agent.id === "claude")).toMatchObject({
			available: true,
			version: "2.1.143 (Claude Code)",
			models: expect.arrayContaining([
				expect.objectContaining({ id: "sonnet" }),
			]),
		});
		expect(agents.find((agent) => agent.id === "codex")).toMatchObject({
			available: true,
			version: "codex-cli 0.130.0",
		});
	});

	test("builds safe stdin-based commands for Claude Code and Codex", () => {
		expect(
			buildLocalCliCommand({
				agentId: "claude",
				binPath: "/usr/local/bin/claude",
				model: "sonnet",
			}),
		).toEqual({
			command: "/usr/local/bin/claude",
			args: [
				"-p",
				"--input-format",
				"stream-json",
				"--output-format",
				"stream-json",
				"--verbose",
				"--model",
				"sonnet",
			],
			promptViaStdin: true,
			streamFormat: "claude-stream-json",
		});

		const codex = buildLocalCliCommand({
			agentId: "codex",
			binPath: "/usr/local/bin/codex",
			model: "gpt-5",
		});
		expect(codex.command).toBe("/usr/local/bin/codex");
		expect(codex.promptViaStdin).toBe(true);
		expect(codex.args).toContain("exec");
		expect(codex.args).toContain("--json");
		expect(codex.args).toContain("--model");
		expect(codex.args).toContain("gpt-5");
	});

	test("parses Shotlyx JSONL protocol events", () => {
		expect(
			parseLocalCliEventLine(
				JSON.stringify({ type: "reasoning", text: "I should inspect tools." }),
			),
		).toEqual({ type: "reasoning", text: "I should inspect tools." });
		expect(
			parseLocalCliEventLine(
				JSON.stringify({
					type: "tool_call",
					id: "call-1",
					tool: "timeline_add_text",
					params: { text: "Hello" },
				}),
			),
		).toEqual({
			type: "tool_call",
			id: "call-1",
			tool: "timeline_add_text",
			params: { text: "Hello" },
		});
		expect(parseLocalCliEventLine("plain text")).toEqual({
			type: "text",
			text: "plain text",
		});
	});

	test("unwraps CLI JSON streams that contain Shotlyx JSONL text", () => {
		expect(
			parseLocalCliEventsFromLine(
				JSON.stringify({
					type: "assistant",
					message: {
						content: [
							{
								type: "text",
								text: [
									JSON.stringify({ type: "reasoning", text: "thinking" }),
									JSON.stringify({
										type: "tool_call",
										tool: "timeline_add_text",
										params: { text: "Hi" },
									}),
								].join("\n"),
							},
						],
					},
				}),
			),
		).toEqual([
			{ type: "reasoning", text: "thinking" },
			{
				type: "tool_call",
				tool: "timeline_add_text",
				params: { text: "Hi" },
			},
		]);

		expect(
			parseLocalCliEventsFromLine(
				JSON.stringify({
					type: "item.completed",
					item: {
						type: "agent_message",
						text: JSON.stringify({ type: "final", text: "Done" }),
					},
				}),
			),
		).toEqual([{ type: "final", text: "Done" }]);
	});

	test("maps native Claude Code thinking stream events to reasoning", () => {
		expect(
			parseLocalCliEventsFromLine(
				JSON.stringify({
					type: "stream_event",
					event: {
						type: "content_block_delta",
						delta: {
							type: "thinking_delta",
							thinking: "Inspecting timeline tools.",
						},
					},
				}),
			),
		).toEqual([
			{ type: "reasoning", text: "Inspecting timeline tools." },
		]);

		expect(
			parseLocalCliEventsFromLine(
				JSON.stringify({
					type: "assistant",
					message: {
						content: [
							{ type: "thinking", thinking: "Need one editor action." },
							{ type: "text", text: '{"type":"final","text":"Done"}' },
						],
					},
				}),
			),
		).toEqual([
			{ type: "reasoning", text: "Need one editor action." },
			{ type: "final", text: "Done" },
		]);
	});

	test("maps Codex reasoning items to reasoning", () => {
		expect(
			parseLocalCliEventsFromLine(
				JSON.stringify({
					type: "item.completed",
					item: {
						type: "reasoning",
						text: "Choosing the safe timeline tool.",
					},
				}),
			),
		).toEqual([
			{ type: "reasoning", text: "Choosing the safe timeline tool." },
		]);

		expect(
			parseLocalCliEventsFromLine(
				JSON.stringify({
					type: "item.updated",
					item: {
						type: "reasoning",
						summary: [
							{ type: "summary_text", text: "Checking editor state." },
						],
					},
				}),
			),
		).toEqual([{ type: "reasoning", text: "Checking editor state." }]);
	});

	test("runs a multi-turn ReAct loop through a fake CLI and tool callback", async () => {
		const fakeClaude = writeExecutable(
			"claude",
			`#!/usr/bin/env bash
prompt="$(cat)"
if [[ "$prompt" == *"TOOL_RESULT timeline_add_text"* ]]; then
  echo '{"type":"final","text":"Added the title."}'
else
  echo '{"type":"reasoning","text":"Need to add a title."}'
  echo '{"type":"tool_call","tool":"timeline_add_text","params":{"text":"Hello"}}'
fi
`,
		);

		const seenEvents: string[] = [];
		const result = await runLocalCliReactLoop({
			agentId: "claude",
			binPath: fakeClaude,
			model: "sonnet",
			systemPrompt: "You are Shotlyx Agent.",
			messages: [{ role: "user", content: "Add a title" }],
			toolSchemas: [
				{
					name: "timeline_add_text",
					description: "Add text",
					parameters: {
						type: "object",
						properties: { text: { type: "string" } },
						required: ["text"],
					},
				},
			],
			maxTurns: 3,
			onEvent: (event) => {
				seenEvents.push(event.type);
			},
			onToolCall: async ({ tool, params }) => {
				expect(tool).toBe("timeline_add_text");
				expect(params).toEqual({ text: "Hello" });
				return { status: "success", data: { elementId: "text-1" } };
			},
		});

		expect(result.finalText).toBe("Added the title.");
		expect(result.toolCallCount).toBe(1);
		expect(seenEvents).toEqual(["reasoning", "tool_call", "final"]);
	});
});
