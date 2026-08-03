/* eslint-disable shotlyx/prefer-object-params -- Test helpers mirror small filesystem calls and stay clearer with positional name/source inputs. */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildLocalCliCommand,
	detectLocalCliAgents,
	parseLocalCliEventLine,
	parseLocalCliEventsFromLine,
	resolveLocalCliWorkingDirectory,
	runLocalCliReactLoop,
	runLocalCliTextTask,
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

	test("runs env-node CLI shims from explicit local paths", async () => {
		const previousHome = process.env.HOME;
		const previousPath = process.env.PATH;
		const homeDir = path.join(tempDir, "home");
		const localBin = path.join(homeDir, ".local", "bin");
		mkdirSync(localBin, { recursive: true });
		process.env.HOME = homeDir;
		process.env.PATH = "/usr/bin:/bin";
		try {
			const fakeNode = path.join(localBin, "node");
			writeFileSync(
				fakeNode,
				`#!/usr/bin/env bash
if [[ "$2" == "--version" ]]; then echo "shim node resolved"; exit 0; fi
exit 0
`,
				"utf8",
			);
			chmodSync(fakeNode, 0o755);
			const fakeClaude = path.join(localBin, "claude");
			writeFileSync(
				fakeClaude,
				`#!/usr/bin/env node
`,
				"utf8",
			);
			chmodSync(fakeClaude, 0o755);

			const agents = await detectLocalCliAgents({
				env: {
					PATH: "/usr/bin:/bin",
					SHOTLYX_CLAUDE_BIN: fakeClaude,
				},
			});

			expect(agents.find((agent) => agent.id === "claude")).toMatchObject({
				available: true,
				version: "shim node resolved",
			});
		} finally {
			if (previousHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = previousHome;
			}
			if (previousPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = previousPath;
			}
		}
	});

	test("runs env-node CLI shims when node only exists under nvm", async () => {
		const previousHome = process.env.HOME;
		const previousPath = process.env.PATH;
		const homeDir = path.join(tempDir, "home");
		const nvmBin = path.join(
			homeDir,
			".nvm",
			"versions",
			"node",
			"v22.12.0",
			"bin",
		);
		const appBin = path.join(homeDir, ".npm-global", "bin");
		mkdirSync(nvmBin, { recursive: true });
		mkdirSync(appBin, { recursive: true });
		process.env.HOME = homeDir;
		process.env.PATH = "/usr/bin:/bin";
		try {
			const fakeNode = path.join(nvmBin, "node");
			writeFileSync(
				fakeNode,
				`#!/usr/bin/env bash
if [[ "$2" == "--version" ]]; then echo "nvm node resolved"; exit 0; fi
exit 0
`,
				"utf8",
			);
			chmodSync(fakeNode, 0o755);
			const fakeClaude = path.join(appBin, "claude");
			writeFileSync(
				fakeClaude,
				`#!/usr/bin/env node
`,
				"utf8",
			);
			chmodSync(fakeClaude, 0o755);

			const agents = await detectLocalCliAgents({
				env: {
					PATH: "/usr/bin:/bin",
					SHOTLYX_CLAUDE_BIN: fakeClaude,
				},
			});

			expect(agents.find((agent) => agent.id === "claude")).toMatchObject({
				available: true,
				version: "nvm node resolved",
			});
		} finally {
			if (previousHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = previousHome;
			}
			if (previousPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = previousPath;
			}
		}
	});

	test("does not reuse a Claude path after switching to Codex", async () => {
		const fakeClaude = writeExecutable(
			"claude",
			`#!/usr/bin/env bash
echo "2.1.220 (Claude Code)"
`,
		);
		const fakeCodex = writeExecutable(
			"codex",
			`#!/usr/bin/env bash
echo "codex-cli 0.130.0"
`,
		);

		const agents = await detectLocalCliAgents({
			env: {
				PATH: tempDir,
				AGENT_CLI_ID: "codex",
				AGENT_CLI_PATH: fakeClaude,
			},
		});

		expect(agents.find((agent) => agent.id === "codex")).toMatchObject({
			available: true,
			binPath: fakeCodex,
			version: "codex-cli 0.130.0",
		});
	});

	test("uses an isolated desktop working directory for local agents", () => {
		expect(
			resolveLocalCliWorkingDirectory({
				env: {
					SHOTLYX_DESKTOP_CONFIG_PATH: path.join(tempDir, "config.json"),
				},
			}),
		).toBe(path.join(tempDir, "agent-workspace"));
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
		expect(codex).toEqual({
			command: "/usr/local/bin/codex",
			args: [
				"--ask-for-approval",
				"never",
				"exec",
				"--json",
				"--skip-git-repo-check",
				"--sandbox",
				"read-only",
				"--model",
				"gpt-5",
			],
			promptViaStdin: true,
			streamFormat: "json-event-stream",
		});
	});

	test("enables native web search only for an explicit Codex search task", () => {
		const command = buildLocalCliCommand({
			agentId: "codex",
			binPath: "/usr/local/bin/codex",
			enableWebSearch: true,
		});

		expect(command.args).toContain("--search");
		expect(command.args.indexOf("--search")).toBeLessThan(
			command.args.indexOf("exec"),
		);
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
		).toEqual([{ type: "reasoning", text: "Inspecting timeline tools." }]);

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
						summary: [{ type: "summary_text", text: "Checking editor state." }],
					},
				}),
			),
		).toEqual([{ type: "reasoning", text: "Checking editor state." }]);
	});

	test("extracts token usage from native CLI JSON events", () => {
		expect(
			parseLocalCliEventsFromLine(
				JSON.stringify({
					type: "result",
					usage: {
						input_tokens: 120,
						output_tokens: 30,
						total_tokens: 150,
					},
				}),
			),
		).toEqual([
			{
				type: "usage",
				usage: {
					inputTokens: 120,
					outputTokens: 30,
					totalTokens: 150,
					source: "local-cli",
				},
			},
		]);
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
		expect(seenEvents).toEqual([
			"reasoning",
			"tool_call",
			"usage",
			"final",
			"usage",
		]);
	});

	test("surfaces a client tool execution failure", async () => {
		const fakeClaude = writeExecutable(
			"claude",
			`#!/usr/bin/env bash
cat >/dev/null
echo '{"type":"reasoning","text":"Trying the editor tool."}'
echo '{"type":"tool_call","tool":"timeline_add_text","params":{"text":"Hello"}}'
`,
		);

		expect(
			runLocalCliReactLoop({
				agentId: "claude",
				binPath: fakeClaude,
				systemPrompt: "You are Shotlyx Agent.",
				messages: [{ role: "user", content: "Add a title" }],
				toolSchemas: [],
				onToolCall: async () => {
					throw new Error("editor_runtime_unavailable");
				},
			}),
		).rejects.toThrow("editor_runtime_unavailable");
	});

	test("runs a keyless local CLI text task with native search enabled", async () => {
		const fakeCodex = writeExecutable(
			"codex",
			`#!/usr/bin/env bash
if [[ " $* " != *" --search "* ]]; then
  exit 64
fi
cat >/dev/null
echo '{"type":"final","text":"LOCAL_SEARCH_OK"}'
`,
		);

		await expect(
			runLocalCliTextTask({
				systemPrompt: "Search the public web.",
				prompt: "Find the current result.",
				enableWebSearch: true,
				env: {
					AGENT_RUNTIME: "local-cli",
					AGENT_CLI_ID: "codex",
					SHOTLYX_CODEX_BIN: fakeCodex,
					HOME: tempDir,
					PATH: tempDir,
				},
			}),
		).resolves.toBe("LOCAL_SEARCH_OK");
	});
});
