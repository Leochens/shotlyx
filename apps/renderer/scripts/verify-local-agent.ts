import {
	resolveLocalCliRuntimeConfig,
	runLocalCliReactLoop,
} from "../src/agent/local-cli/runtime";

const LIVE_FLAG = "--live";
const TOOL_NAME = "shotlyx_acceptance_echo";
const TOOL_TOKEN = "shotlyx-live-bridge-2026";
const RECEIPT = "SHOTLYX_LOCAL_AGENT_OK";

async function main() {
	if (!process.argv.includes(LIVE_FLAG)) {
		throw new Error(
			`Live verification calls the selected CLI model service. Re-run with ${LIVE_FLAG} after confirming network use.`,
		);
	}

	const config = resolveLocalCliRuntimeConfig({ env: process.env });
	if (!config.enabled) {
		throw new Error("Set AGENT_RUNTIME=local-cli for live verification.");
	}
	if (!config.binPath) {
		throw new Error(`${config.agentId} CLI is not available.`);
	}

	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 180_000);
	const eventTypes: string[] = [];
	let executedTool = "";

	try {
		const result = await runLocalCliReactLoop({
			agentId: config.agentId,
			binPath: config.binPath,
			model: config.model,
			env: config.env,
			signal: abortController.signal,
			maxTurns: 4,
			systemPrompt:
				"You are validating the Shotlyx local Agent bridge. Follow the local CLI protocol exactly. Do not inspect files or call any tool except the provided acceptance tool.",
			messages: [
				{
					role: "user",
					content: `Call ${TOOL_NAME} exactly once with token ${TOOL_TOKEN}. After its result, return a final event containing the receipt exactly as provided.`,
				},
			],
			toolSchemas: [
				{
					name: TOOL_NAME,
					description:
						"Validate the Shotlyx model-to-runtime tool bridge. This only echoes a fixed acceptance receipt and cannot access files, credentials, or project state.",
					parameters: {
						type: "object",
						properties: {
							token: {
								type: "string",
								description:
									"The exact acceptance token from the user request.",
							},
						},
						required: ["token"],
					},
				},
			],
			onEvent: (event) => eventTypes.push(event.type),
			onToolCall: async ({ tool, params }) => {
				if (tool !== TOOL_NAME || params.token !== TOOL_TOKEN) {
					throw new Error(
						"The local Agent emitted an invalid acceptance tool call.",
					);
				}
				executedTool = tool;
				return { status: "success", receipt: RECEIPT };
			},
		});

		if (executedTool !== TOOL_NAME || result.toolCallCount !== 1) {
			throw new Error(
				"The local runtime did not execute exactly one tool call.",
			);
		}
		if (!result.finalText.includes(RECEIPT)) {
			throw new Error("The model did not continue from the local tool result.");
		}

		console.log(
			JSON.stringify(
				{
					ok: true,
					agentId: config.agentId,
					model: config.model ?? "default",
					executedTool,
					toolCallCount: result.toolCallCount,
					eventTypes,
					finalText: result.finalText,
				},
				null,
				2,
			),
		);
	} finally {
		clearTimeout(timeout);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
