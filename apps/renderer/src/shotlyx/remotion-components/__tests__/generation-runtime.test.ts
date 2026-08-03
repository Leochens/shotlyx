import { describe, expect, mock, test } from "bun:test";
import { resolveShotlyxMGGenerationRuntime } from "../generation-runtime";

describe("Shotlyx MG generation runtime", () => {
	test("reuses the selected local CLI without requesting an API model bundle", async () => {
		const runTextTask = mock(async () => "LOCAL_MG_SOURCE");
		const getModelBundle = mock(() => {
			throw new Error("API model bundle should not be requested");
		});
		const runtime = resolveShotlyxMGGenerationRuntime({
			env: { AGENT_RUNTIME: "local-cli" },
			resolveLocalCliConfig: () => ({
				enabled: true,
				agentId: "codex",
				model: "default",
				binPath: "/usr/local/bin/codex",
				env: { AGENT_RUNTIME: "local-cli" },
			}),
			runTextTask,
			getModelBundle,
		});

		await expect(
			runtime.generateSourceFn?.({
				system: "Generate safe TSX.",
				prompt: "Generate a chart.",
				maxOutputTokens: 4000,
			}),
		).resolves.toBe("LOCAL_MG_SOURCE");
		expect(getModelBundle).not.toHaveBeenCalled();
		expect(runTextTask).toHaveBeenCalledTimes(1);
		expect(runTextTask.mock.calls[0]?.[0]).toMatchObject({
			enableWebSearch: false,
			prompt: "Generate a chart.",
		});
	});
});
