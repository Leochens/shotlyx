import { spawn } from "node:child_process";
import {
	accessSync,
	constants,
	mkdirSync,
	readdirSync,
	realpathSync,
} from "node:fs";
import path from "node:path";
import type { ModelMessage } from "ai";
import type { FunctionSchema } from "@/agent/mcp/schema";
import type { AgentPlan, AgentStep } from "@/agent/controller/types";
import { getRuntimeEnv } from "@/desktop/config/server";
import {
	estimateTokenUsage,
	normalizeTokenUsage,
	type AgentTokenUsageDelta,
} from "@/agent/token-usage";

export type LocalCliAgentId = "claude" | "codex";

export type LocalCliStreamFormat = "claude-stream-json" | "json-event-stream";

export type LocalCliModelOption = {
	id: string;
	label: string;
};

export type LocalCliAgentInfo = {
	id: LocalCliAgentId;
	name: string;
	bin: string;
	binPath: string | null;
	available: boolean;
	version: string | null;
	models: LocalCliModelOption[];
};

export type LocalCliCommand = {
	command: string;
	args: string[];
	promptViaStdin: true;
	streamFormat: LocalCliStreamFormat;
};

export type LocalCliEvent =
	| { type: "reasoning"; text: string }
	| { type: "text"; text: string }
	| { type: "final"; text: string }
	| { type: "usage"; usage: AgentTokenUsageDelta }
	| {
			type: "tool_call";
			id?: string;
			tool: string;
			params: Record<string, unknown>;
	  }
	| { type: "plan"; reasoning?: string; steps: AgentStep[] }
	| { type: "error"; message: string };

export type LocalCliToolCall = {
	callId: string;
	tool: string;
	params: Record<string, unknown>;
};

type LocalCliAgentDef = {
	id: LocalCliAgentId;
	name: string;
	bin: string;
	envOverride: string;
	versionArgs: string[];
	models: LocalCliModelOption[];
};

const DEFAULT_MODEL: LocalCliModelOption = {
	id: "default",
	label: "Default (CLI config)",
};

const LOCAL_CLI_AGENT_DEFS: LocalCliAgentDef[] = [
	{
		id: "claude",
		name: "Claude Code",
		bin: "claude",
		envOverride: "SHOTLYX_CLAUDE_BIN",
		versionArgs: ["--version"],
		models: [
			DEFAULT_MODEL,
			{ id: "sonnet", label: "Sonnet (alias)" },
			{ id: "opus", label: "Opus (alias)" },
			{ id: "haiku", label: "Haiku (alias)" },
			{ id: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
			{ id: "claude-opus-4-5", label: "claude-opus-4-5" },
		],
	},
	{
		id: "codex",
		name: "Codex CLI",
		bin: "codex",
		envOverride: "SHOTLYX_CODEX_BIN",
		versionArgs: ["--version"],
		models: [
			DEFAULT_MODEL,
			{ id: "gpt-5", label: "gpt-5" },
			{ id: "gpt-5-codex", label: "gpt-5-codex" },
			{ id: "o3", label: "o3" },
			{ id: "o4-mini", label: "o4-mini" },
		],
	},
];

function getAgentDef(agentId: string | undefined): LocalCliAgentDef {
	const found = LOCAL_CLI_AGENT_DEFS.find((def) => def.id === agentId);
	if (found) return found;
	return LOCAL_CLI_AGENT_DEFS[0]!;
}

function isExecutable(filePath: string): boolean {
	try {
		accessSync(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function splitPathList(value: string | undefined): string[] {
	return (value ?? "").split(path.delimiter).filter(Boolean);
}

function homePath({
	env,
	segments,
}: {
	env: Record<string, string | undefined>;
	segments: string[];
}): string | null {
	const home = env.HOME ?? process.env.HOME;
	return home ? path.join(home, ...segments) : null;
}

function nodeVersionManagerBinDirs({
	env,
	rootSegments,
	binSegments,
}: {
	env: Record<string, string | undefined>;
	rootSegments: string[];
	binSegments: string[];
}): string[] {
	const root = homePath({ env, segments: rootSegments });
	if (!root) return [];

	try {
		return readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(root, entry.name, ...binSegments))
			.filter((binDir) => isExecutable(path.join(binDir, "node")))
			.sort()
			.reverse();
	} catch {
		return [];
	}
}

function nodeRuntimePathDirs(
	env: Record<string, string | undefined>,
): string[] {
	return [
		...nodeVersionManagerBinDirs({
			env,
			rootSegments: [".nvm", "versions", "node"],
			binSegments: ["bin"],
		}),
		...nodeVersionManagerBinDirs({
			env,
			rootSegments: [".fnm", "node-versions"],
			binSegments: ["installation", "bin"],
		}),
		...nodeVersionManagerBinDirs({
			env,
			rootSegments: [".local", "share", "fnm", "node-versions"],
			binSegments: ["installation", "bin"],
		}),
	];
}

function servBayRuntimePathDirs(): string[] {
	const root = "/Applications/ServBay/package/node";
	return [
		path.join(root, "current", "bin"),
		...nodeVersionManagerBinDirs({
			env: { HOME: "/Applications/ServBay/package" },
			rootSegments: ["node"],
			binSegments: ["current", "bin"],
		}),
	];
}

function commonRuntimePathDirs(
	env: Record<string, string | undefined>,
): string[] {
	const extras = [
		homePath({ env, segments: [".local", "bin"] }),
		homePath({ env, segments: [".bun", "bin"] }),
		homePath({ env, segments: [".volta", "bin"] }),
		homePath({ env, segments: [".asdf", "shims"] }),
		homePath({ env, segments: [".nodenv", "shims"] }),
		...nodeRuntimePathDirs(env),
		"/Applications/ChatGPT.app/Contents/Resources",
		...servBayRuntimePathDirs(),
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
	].filter(Boolean);
	return Array.from(new Set(extras));
}

function matchesAgentPath({
	def,
	filePath,
}: {
	def: LocalCliAgentDef;
	filePath: string;
}): boolean {
	const candidates = [filePath];
	try {
		candidates.push(realpathSync(filePath));
	} catch {
		// The executable check reports an invalid path separately.
	}
	return candidates.some((candidate) => {
		const normalized = candidate.toLowerCase();
		if (path.basename(normalized) === def.bin) return true;
		return def.id === "claude"
			? normalized.includes("claude-code")
			: normalized.includes("@openai/codex");
	});
}

function pathDirs(env: Record<string, string | undefined>): string[] {
	return Array.from(
		new Set([
			...splitPathList(env.PATH),
			...splitPathList(process.env.PATH),
			...commonRuntimePathDirs(env),
		]),
	);
}

function resolveOnPath({
	bin,
	env,
}: {
	bin: string;
	env: Record<string, string | undefined>;
}): string | null {
	for (const dir of pathDirs(env)) {
		const candidate = path.join(dir, bin);
		if (isExecutable(candidate)) return candidate;
	}
	return null;
}

function resolveAgentBin({
	def,
	env,
	explicitPath,
}: {
	def: LocalCliAgentDef;
	env: Record<string, string | undefined>;
	explicitPath?: string;
}): string | null {
	const agentSpecificOverride = env[def.envOverride];
	if (agentSpecificOverride && isExecutable(agentSpecificOverride)) {
		return agentSpecificOverride;
	}
	if (
		explicitPath &&
		isExecutable(explicitPath) &&
		matchesAgentPath({ def, filePath: explicitPath })
	) {
		return explicitPath;
	}
	return resolveOnPath({ bin: def.bin, env });
}

export function resolveLocalCliWorkingDirectory({
	env = getRuntimeEnv(),
}: {
	env?: Record<string, string | undefined>;
} = {}): string {
	const explicitDirectory = env.SHOTLYX_AGENT_WORK_DIR?.trim();
	if (explicitDirectory) return explicitDirectory;
	const configPath = env.SHOTLYX_DESKTOP_CONFIG_PATH?.trim();
	if (configPath) return path.join(path.dirname(configPath), "agent-workspace");
	const home = env.HOME ?? process.env.HOME;
	return home ? path.join(home, ".shotlyx", "agent-workspace") : process.cwd();
}

function buildChildEnv({
	env,
	extraPathDirs = [],
}: {
	env: Record<string, string | undefined>;
	extraPathDirs?: string[];
}): NodeJS.ProcessEnv {
	const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
	merged.PATH = Array.from(
		new Set([
			...splitPathList(env.PATH),
			...splitPathList(process.env.PATH),
			...extraPathDirs.filter(Boolean),
			...commonRuntimePathDirs(env),
		]),
	).join(path.delimiter);
	return merged;
}

function runCommandText({
	command,
	args,
	env,
	timeoutMs = 3000,
}: {
	command: string;
	args: string[];
	env: Record<string, string | undefined>;
	timeoutMs?: number;
}): Promise<string | null> {
	return new Promise((resolve) => {
		const commandDir = path.isAbsolute(command) ? path.dirname(command) : null;
		const child = spawn(command, args, {
			env: buildChildEnv({
				env,
				extraPathDirs: commandDir ? [commandDir] : [],
			}),
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});
		let stdout = "";
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			resolve(null);
		}, timeoutMs);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.on("error", () => {
			clearTimeout(timer);
			resolve(null);
		});
		child.on("close", () => {
			clearTimeout(timer);
			resolve(stdout.trim() || null);
		});
	});
}

export async function detectLocalCliAgents({
	env = getRuntimeEnv(),
}: {
	env?: Record<string, string | undefined>;
} = {}): Promise<LocalCliAgentInfo[]> {
	const agents: LocalCliAgentInfo[] = [];
	const selectedAgentId = getAgentDef(env.AGENT_CLI_ID).id;
	for (const def of LOCAL_CLI_AGENT_DEFS) {
		const binPath = resolveAgentBin({
			def,
			env,
			explicitPath: selectedAgentId === def.id ? env.AGENT_CLI_PATH : undefined,
		});
		const version = binPath
			? await runCommandText({
					command: binPath,
					args: def.versionArgs,
					env,
				})
			: null;
		agents.push({
			id: def.id,
			name: def.name,
			bin: def.bin,
			binPath,
			available: Boolean(binPath && version),
			version,
			models: def.models,
		});
	}
	return agents;
}

export function buildLocalCliCommand({
	agentId,
	binPath,
	model,
	enableWebSearch = false,
}: {
	agentId: LocalCliAgentId;
	binPath: string;
	model?: string;
	enableWebSearch?: boolean;
}): LocalCliCommand {
	if (agentId === "claude") {
		const args = [
			"-p",
			"--input-format",
			"stream-json",
			"--output-format",
			"stream-json",
			"--verbose",
		];
		if (enableWebSearch) {
			args.push("--allowedTools", "WebSearch", "WebFetch");
		}
		if (model && model !== "default") {
			args.push("--model", model);
		}
		return {
			command: binPath,
			args,
			promptViaStdin: true,
			streamFormat: "claude-stream-json",
		};
	}

	const args = [
		"--ask-for-approval",
		"never",
		...(enableWebSearch ? ["--search"] : []),
		"exec",
		"--json",
		"--skip-git-repo-check",
		"--sandbox",
		"read-only",
	];
	if (model && model !== "default") {
		args.push("--model", model);
	}
	return {
		command: binPath,
		args,
		promptViaStdin: true,
		streamFormat: "json-event-stream",
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromUnknown(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value
			.map((item) => textFromUnknown(item))
			.filter(Boolean)
			.join("\n");
	}
	if (!isRecord(value)) return "";

	for (const key of [
		"text",
		"content",
		"message",
		"summary",
		"delta",
		"thinking",
	]) {
		const text = textFromUnknown(value[key]);
		if (text) return text;
	}
	return "";
}

function readText({
	value,
	keys,
}: {
	value: Record<string, unknown>;
	keys: string[];
}): string {
	for (const key of keys) {
		const text = textFromUnknown(value[key]);
		if (text) return text;
	}
	return "";
}

function normalizeParams(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function normalizePlanSteps(value: unknown): AgentStep[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item): AgentStep[] => {
		if (!isRecord(item) || typeof item.tool !== "string") return [];
		return [
			{
				tool: item.tool,
				params: normalizeParams(item.params),
				description:
					typeof item.description === "string"
						? item.description
						: `调用 ${item.tool}`,
				risk:
					item.risk === "destructive" || item.risk === "irreversible"
						? item.risk
						: "none",
			},
		];
	});
}

function extractUsageCandidate(
	value: Record<string, unknown>,
): AgentTokenUsageDelta | null {
	const direct = normalizeTokenUsage({ value, source: "local-cli" });
	if (direct) return direct;

	for (const key of [
		"usage",
		"totalUsage",
		"tokenUsage",
		"token_usage",
		"metrics",
	]) {
		const nested = value[key];
		const usage = normalizeTokenUsage({ value: nested, source: "local-cli" });
		if (usage) return usage;
	}

	return null;
}

function eventsFromText({
	text,
	fallbackType = "text",
}: {
	text: string;
	fallbackType?: "reasoning" | "text";
}): LocalCliEvent[] {
	const protocolEvents = parseProtocolEventsFromText(text);
	if (protocolEvents.length > 0) return protocolEvents;
	return text ? [{ type: fallbackType, text }] : [];
}

function parseProtocolObject(
	parsed: Record<string, unknown>,
): LocalCliEvent | null {
	const type = typeof parsed.type === "string" ? parsed.type : "";
	if (type === "usage" || type === "token_usage") {
		const usage = extractUsageCandidate(parsed);
		return usage ? { type: "usage", usage } : null;
	}
	if (type === "reasoning" || type === "reasoning_delta") {
		return {
			type: "reasoning",
			text: readText({ value: parsed, keys: ["text", "delta"] }),
		};
	}
	if (type === "text" || type === "text_delta") {
		return {
			type: "text",
			text: readText({ value: parsed, keys: ["text", "delta"] }),
		};
	}
	if (type === "final" || type === "done") {
		return {
			type: "final",
			text: readText({ value: parsed, keys: ["text", "content"] }),
		};
	}
	if (type === "tool_call") {
		const tool = readText({
			value: parsed,
			keys: ["tool", "name", "toolName"],
		});
		if (!tool) return null;
		return {
			type: "tool_call",
			id: readText({ value: parsed, keys: ["id", "callId"] }) || undefined,
			tool,
			params: normalizeParams(parsed.params ?? parsed.input),
		};
	}
	if (type === "plan") {
		return {
			type: "plan",
			reasoning:
				readText({ value: parsed, keys: ["reasoning", "text"] }) || undefined,
			steps: normalizePlanSteps(parsed.steps),
		};
	}
	if (type === "error") {
		return {
			type: "error",
			message:
				readText({ value: parsed, keys: ["message", "error"] }) || "CLI error",
		};
	}
	return null;
}

function withUsageEvent({
	events,
	parsed,
}: {
	events: LocalCliEvent[];
	parsed: Record<string, unknown>;
}): LocalCliEvent[] {
	if (events.some((event) => event.type === "usage")) return events;
	const usage = extractUsageCandidate(parsed);
	return usage ? [...events, { type: "usage", usage }] : events;
}

function parseClaudeStreamEvent(
	parsed: Record<string, unknown>,
): LocalCliEvent[] {
	if (parsed.type === "stream_event" && isRecord(parsed.event)) {
		const event = parsed.event;
		if (event.type === "content_block_delta" && isRecord(event.delta)) {
			const delta = event.delta;
			if (delta.type === "thinking_delta") {
				const text =
					readText({ value: delta, keys: ["thinking", "text", "delta"] }) ?? "";
				return eventsFromText({ text, fallbackType: "reasoning" });
			}
			if (delta.type === "text_delta") {
				const text = readText({ value: delta, keys: ["text", "delta"] });
				return eventsFromText({ text, fallbackType: "text" });
			}
		}
		return [];
	}

	if (
		parsed.type === "assistant" &&
		isRecord(parsed.message) &&
		Array.isArray(parsed.message.content)
	) {
		const events: LocalCliEvent[] = [];
		for (const block of parsed.message.content) {
			if (!isRecord(block)) continue;
			if (block.type === "thinking") {
				const text = readText({ value: block, keys: ["thinking", "text"] });
				events.push(...eventsFromText({ text, fallbackType: "reasoning" }));
			} else if (block.type === "text") {
				const text = readText({ value: block, keys: ["text", "content"] });
				events.push(...eventsFromText({ text, fallbackType: "text" }));
			}
		}
		return events;
	}

	return [];
}

function parseCodexJsonEvent(parsed: Record<string, unknown>): LocalCliEvent[] {
	if (
		typeof parsed.type === "string" &&
		(parsed.type.includes("reasoning") || parsed.type.includes("thought"))
	) {
		const text = readText({
			value: parsed,
			keys: ["text", "message", "summary"],
		});
		return eventsFromText({ text, fallbackType: "reasoning" });
	}

	if (isRecord(parsed.item)) {
		const item = parsed.item;
		const itemType = typeof item.type === "string" ? item.type : "";
		if (itemType.includes("reasoning") || itemType.includes("thought")) {
			const text = readText({
				value: item,
				keys: ["text", "message", "summary", "content"],
			});
			return eventsFromText({ text, fallbackType: "reasoning" });
		}
		if (
			itemType === "agent_message" ||
			itemType === "assistant_message" ||
			itemType === "message"
		) {
			const text = readText({ value: item, keys: ["text", "content"] });
			return eventsFromText({ text, fallbackType: "text" });
		}
	}

	return [];
}

function extractCliWrappedText(parsed: Record<string, unknown>): string {
	const direct = readText({
		value: parsed,
		keys: ["text", "delta", "content", "result"],
	});
	if (direct) return direct;

	const message = parsed.message;
	if (isRecord(message)) {
		const messageText = readText({
			value: message,
			keys: ["content", "text"],
		});
		if (messageText) return messageText;
		const content = message.content;
		if (Array.isArray(content)) {
			return content
				.flatMap((item) => {
					if (!isRecord(item)) return [];
					const text = readText({
						value: item,
						keys: ["text", "content", "thinking"],
					});
					return text ? [text] : [];
				})
				.join("\n");
		}
	}

	const item = parsed.item;
	if (isRecord(item)) {
		const itemText = readText({
			value: item,
			keys: ["text", "content", "delta"],
		});
		if (itemText) return itemText;
	}

	return "";
}

function parseProtocolEventsFromText(text: string): LocalCliEvent[] {
	const events: LocalCliEvent[] = [];
	for (const rawLine of text.trim().split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line.startsWith("{")) continue;
		try {
			const parsed: unknown = JSON.parse(line);
			if (!isRecord(parsed)) continue;
			const event = parseProtocolObject(parsed);
			if (event) events.push(event);
		} catch {
			// Ignore non-protocol text in mixed CLI output.
		}
	}
	return events;
}

export function parseLocalCliEventsFromLine(line: string): LocalCliEvent[] {
	const trimmed = line.trim();
	if (!trimmed) return [];
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (!isRecord(parsed)) return [{ type: "text", text: trimmed }];
		const protocolEvent = parseProtocolObject(parsed);
		if (protocolEvent) return [protocolEvent];

		const nativeEvents = [
			...parseClaudeStreamEvent(parsed),
			...parseCodexJsonEvent(parsed),
		];
		if (nativeEvents.length > 0) {
			return withUsageEvent({ events: nativeEvents, parsed });
		}

		const wrappedText = extractCliWrappedText(parsed).trim();
		if (wrappedText) {
			return withUsageEvent({
				events: eventsFromText({ text: wrappedText, fallbackType: "text" }),
				parsed,
			});
		}
		return withUsageEvent({ events: [], parsed });
	} catch {
		return [{ type: "text", text: trimmed }];
	}
}

export function parseLocalCliEventLine(line: string): LocalCliEvent | null {
	return parseLocalCliEventsFromLine(line)[0] ?? null;
}

function encodePromptForStdin({
	agentId,
	prompt,
}: {
	agentId: LocalCliAgentId;
	prompt: string;
}): string {
	if (agentId === "claude") {
		return (
			JSON.stringify({
				type: "user",
				message: {
					role: "user",
					content: [{ type: "text", text: prompt }],
				},
			}) + "\n"
		);
	}
	return prompt;
}

function buildProtocolPrompt({
	systemPrompt,
	messages,
	toolSchemas,
	toolResults,
	mode,
}: {
	systemPrompt: string;
	messages: Array<{ role: string; content: string }>;
	toolSchemas: FunctionSchema[];
	toolResults: string[];
	mode: "react" | "plan";
}): string {
	const protocol =
		mode === "plan"
			? [
					"Return only newline-delimited JSON.",
					"Emit exactly one plan event:",
					`{"type":"plan","reasoning":"short reason","steps":[{"tool":"tool_name","params":{},"description":"what this does","risk":"none"}]}`,
					"If no tool is needed, return an empty steps array and put the user-facing response in reasoning.",
				]
			: [
					"Return only newline-delimited JSON.",
					"Allowed event shapes:",
					`{"type":"reasoning","text":"brief observable progress summary, not hidden chain-of-thought"}`,
					`{"type":"tool_call","tool":"tool_name","params":{}}`,
					`{"type":"final","text":"user-facing answer"}`,
					"Always emit at least one reasoning event before the first tool_call or final event. Keep it short and about observable progress.",
					"Call at most one tool per turn. After a TOOL_RESULT is present, continue from that result and either call the next tool or emit final.",
				];
	return [
		"[Shotlyx System]",
		systemPrompt,
		"",
		"[Local CLI Protocol]",
		...protocol,
		"",
		"[Available Editor Tools]",
		JSON.stringify(toolSchemas),
		"",
		"[Conversation]",
		JSON.stringify(messages),
		"",
		"[Tool Results]",
		toolResults.length > 0 ? toolResults.join("\n") : "None",
	].join("\n");
}

function runLocalCliOnce({
	agentId,
	binPath,
	model,
	prompt,
	env,
	signal,
	enableWebSearch = false,
}: {
	agentId: LocalCliAgentId;
	binPath: string;
	model?: string;
	prompt: string;
	env: Record<string, string | undefined>;
	signal?: AbortSignal;
	enableWebSearch?: boolean;
}): Promise<LocalCliEvent[]> {
	return new Promise((resolve, reject) => {
		const command = buildLocalCliCommand({
			agentId,
			binPath,
			model,
			enableWebSearch,
		});
		const workingDirectory = resolveLocalCliWorkingDirectory({ env });
		mkdirSync(workingDirectory, { recursive: true });
		const commandDir = path.isAbsolute(command.command)
			? path.dirname(command.command)
			: null;
		const child = spawn(command.command, command.args, {
			cwd: workingDirectory,
			env: buildChildEnv({
				env,
				extraPathDirs: commandDir ? [commandDir] : [],
			}),
			stdio: ["pipe", "pipe", "pipe"],
			shell: false,
		});
		const events: LocalCliEvent[] = [];
		let stdout = "";
		let rawStdout = "";
		let stderr = "";
		const abort = () => {
			child.kill("SIGTERM");
			reject(new DOMException("Aborted", "AbortError"));
		};
		if (signal?.aborted) {
			abort();
			return;
		}
		signal?.addEventListener("abort", abort, { once: true });
		child.stdout.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf8");
			rawStdout += text;
			stdout += text;
			const lines = stdout.split(/\r?\n/);
			stdout = lines.pop() ?? "";
			for (const line of lines) {
				events.push(...parseLocalCliEventsFromLine(line));
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			signal?.removeEventListener("abort", abort);
			reject(error);
		});
		child.on("close", (code) => {
			signal?.removeEventListener("abort", abort);
			events.push(...parseLocalCliEventsFromLine(stdout));
			if (code && events.length === 0) {
				reject(
					new Error(
						`local_cli_error: ${stderr.trim() || `CLI exited with code ${code}`}`,
					),
				);
				return;
			}
			if (!events.some((event) => event.type === "usage")) {
				events.push({
					type: "usage",
					usage: estimateTokenUsage({
						inputText: prompt,
						outputText: rawStdout,
						source: "local-cli",
						label: "Local CLI",
					}),
				});
			}
			resolve(events);
		});
		child.stdin.end(encodePromptForStdin({ agentId, prompt }), "utf8");
	});
}

export function resolveLocalCliRuntimeConfig({
	env = getRuntimeEnv(),
}: {
	env?: Record<string, string | undefined>;
} = {}) {
	const agentId = getAgentDef(env.AGENT_CLI_ID).id;
	const def = getAgentDef(agentId);
	const binPath = resolveAgentBin({
		def,
		env,
		explicitPath: env.AGENT_CLI_PATH,
	});
	return {
		enabled: env.AGENT_RUNTIME === "local-cli",
		agentId,
		model: env.AGENT_CLI_MODEL,
		binPath,
		env,
	};
}

export function isLocalCliRuntimeEnabled(): boolean {
	return resolveLocalCliRuntimeConfig().enabled;
}

export async function runLocalCliReactLoop({
	agentId,
	binPath,
	model,
	systemPrompt,
	messages,
	toolSchemas,
	maxTurns = 20,
	onEvent,
	onToolCall,
	env = getRuntimeEnv(),
	signal,
	enableWebSearch = false,
}: {
	agentId: LocalCliAgentId;
	binPath: string;
	model?: string;
	systemPrompt: string;
	messages: Array<{ role: string; content: string }> | ModelMessage[];
	toolSchemas: FunctionSchema[];
	maxTurns?: number;
	onEvent?: (event: LocalCliEvent) => void;
	onToolCall: (call: LocalCliToolCall) => Promise<unknown>;
	env?: Record<string, string | undefined>;
	signal?: AbortSignal;
	enableWebSearch?: boolean;
}): Promise<{ finalText: string; toolCallCount: number }> {
	const toolResults: string[] = [];
	const executedToolSignatures = new Set<string>();
	let finalText = "";
	let toolCallCount = 0;

	for (let turn = 0; turn < maxTurns; turn += 1) {
		const prompt = buildProtocolPrompt({
			systemPrompt,
			messages: messages.map((message) => ({
				role: String(message.role),
				content:
					typeof message.content === "string"
						? message.content
						: JSON.stringify(message.content),
			})),
			toolSchemas,
			toolResults,
			mode: "react",
		});
		const events = await runLocalCliOnce({
			agentId,
			binPath,
			model,
			prompt,
			env,
			signal,
			enableWebSearch,
		});
		let hadToolCall = false;

		for (const event of events) {
			onEvent?.(event);
			if (event.type === "usage") {
				continue;
			}
			if (event.type === "final" || event.type === "text") {
				finalText += event.text;
			}
			if (event.type !== "tool_call") continue;
			const toolSignature = `${event.tool}:${JSON.stringify(event.params)}`;
			if (toolResults.length > 0 && executedToolSignatures.has(toolSignature)) {
				return { finalText, toolCallCount };
			}
			executedToolSignatures.add(toolSignature);
			hadToolCall = true;
			toolCallCount += 1;
			const callId =
				event.id ??
				`${event.tool}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const result = await onToolCall({
				callId,
				tool: event.tool,
				params: event.params,
			});
			toolResults.push(`TOOL_RESULT ${event.tool}: ${JSON.stringify(result)}`);
		}

		if (finalText || !hadToolCall) {
			return { finalText, toolCallCount };
		}
	}

	throw new Error(`local_cli_error: exceeded ${maxTurns} ReAct turns`);
}

export async function runLocalCliTextTask({
	systemPrompt,
	prompt,
	env = getRuntimeEnv(),
	signal,
	enableWebSearch = false,
}: {
	systemPrompt: string;
	prompt: string;
	env?: Record<string, string | undefined>;
	signal?: AbortSignal;
	enableWebSearch?: boolean;
}): Promise<string> {
	const config = resolveLocalCliRuntimeConfig({ env });
	if (!config.enabled) {
		throw new Error("configuration_error: local CLI runtime is not enabled");
	}
	if (!config.binPath) {
		throw new Error(
			`configuration_error: ${config.agentId} CLI is not available`,
		);
	}
	const result = await runLocalCliReactLoop({
		agentId: config.agentId,
		binPath: config.binPath,
		model: config.model,
		systemPrompt,
		messages: [{ role: "user", content: prompt }],
		toolSchemas: [],
		maxTurns: 1,
		onToolCall: async ({ tool }) => {
			throw new Error(`local_cli_error: unexpected editor tool call ${tool}`);
		},
		env: config.env,
		signal,
		enableWebSearch,
	});
	const text = result.finalText.trim();
	if (!text) {
		throw new Error("local_cli_error: local CLI returned an empty response");
	}
	return text;
}

export async function generatePlanWithLocalCli({
	systemPrompt,
	messages,
	toolSchemas,
	env = getRuntimeEnv(),
	signal,
	onUsage,
}: {
	systemPrompt: string;
	messages: Array<{ role: string; content: string; references?: unknown[] }>;
	toolSchemas: FunctionSchema[];
	env?: Record<string, string | undefined>;
	signal?: AbortSignal;
	onUsage?: (usage: AgentTokenUsageDelta) => void;
}): Promise<AgentPlan> {
	const config = resolveLocalCliRuntimeConfig({ env });
	if (!config.binPath) {
		throw new Error(
			`configuration_error: ${config.agentId} CLI is not available`,
		);
	}
	const prompt = buildProtocolPrompt({
		systemPrompt,
		messages,
		toolSchemas,
		toolResults: [],
		mode: "plan",
	});
	const events = await runLocalCliOnce({
		agentId: config.agentId,
		binPath: config.binPath,
		model: config.model,
		prompt,
		env,
		signal,
	});
	let reasoning = "";
	const steps: AgentStep[] = [];
	for (const event of events) {
		if (event.type === "plan") {
			reasoning += event.reasoning ?? "";
			steps.push(...event.steps);
		} else if (event.type === "usage") {
			onUsage?.(event.usage);
		} else if (event.type === "tool_call") {
			steps.push({
				tool: event.tool,
				params: event.params,
				description: `调用 ${event.tool}`,
				risk: "none",
			});
		} else if (event.type === "reasoning" || event.type === "final") {
			reasoning += event.text;
		}
	}
	return {
		complexity:
			steps.length > 3 ? "complex" : steps.length > 1 ? "medium" : "simple",
		reasoning,
		steps,
		needsConfirmation: steps.length > 0,
	};
}
