import { getMGModelBundle } from "@/agent/ai-sdk/providers";
import {
	resolveLocalCliRuntimeConfig,
	runLocalCliTextTask,
} from "@/agent/local-cli/runtime";
import { getRuntimeEnv } from "@/desktop/config/server";
import type { GenerateShotlyxMGComponentOptions } from "./generator";

type MGGenerationRuntime = Pick<
	GenerateShotlyxMGComponentOptions,
	"model" | "providerConfig" | "generateSourceFn"
>;

export function resolveShotlyxMGGenerationRuntime({
	env = getRuntimeEnv(),
	resolveLocalCliConfig = resolveLocalCliRuntimeConfig,
	runTextTask = runLocalCliTextTask,
	getModelBundle = getMGModelBundle,
}: {
	env?: Record<string, string | undefined>;
	resolveLocalCliConfig?: typeof resolveLocalCliRuntimeConfig;
	runTextTask?: typeof runLocalCliTextTask;
	getModelBundle?: typeof getMGModelBundle;
} = {}): MGGenerationRuntime {
	const localCli = resolveLocalCliConfig({ env });
	if (localCli.enabled) {
		if (!localCli.binPath) {
			throw new Error(
				`configuration_error: ${localCli.agentId} CLI is not available`,
			);
		}
		return {
			generateSourceFn: async ({
				system,
				prompt,
				maxOutputTokens,
				abortSignal,
			}) =>
				runTextTask({
					systemPrompt: [
						system,
						"This is a local Shotlyx MG source-generation task.",
						"Return only the requested component source in the final response; do not inspect files or use web search.",
						`Keep the response within approximately ${maxOutputTokens} tokens.`,
					].join("\n\n"),
					prompt,
					env,
					signal: abortSignal,
					enableWebSearch: false,
				}),
		};
	}

	const bundle = getModelBundle();
	return {
		model: bundle.model,
		providerConfig: bundle.config,
	};
}
