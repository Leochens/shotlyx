export type AgentTokenUsageSource = "api" | "local-cli";

export interface AgentTokenUsageDelta {
	inputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	totalTokens?: number;
	cachedInputTokens?: number;
	cacheWriteTokens?: number;
	source: AgentTokenUsageSource;
	label?: string;
	approximate?: boolean;
}

export interface AgentTokenUsageTotals {
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	cachedInputTokens: number;
	cacheWriteTokens: number;
	approximate: boolean;
	sources: AgentTokenUsageSource[];
	updatedAt: number;
}

const CJK_PATTERN =
	/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createEmptyTokenUsage(): AgentTokenUsageTotals {
	return {
		inputTokens: 0,
		outputTokens: 0,
		reasoningTokens: 0,
		totalTokens: 0,
		cachedInputTokens: 0,
		cacheWriteTokens: 0,
		approximate: false,
		sources: [],
		updatedAt: Date.now(),
	};
}

function finiteTokenCount(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}
	return Math.round(value);
}

function readNumberFromRecord({
	value,
	keys,
}: {
	value: unknown;
	keys: string[];
}): number | undefined {
	if (!isRecord(value)) return undefined;
	for (const key of keys) {
		const direct = finiteTokenCount(value[key]);
		if (direct !== undefined) return direct;
	}
	return undefined;
}

function readNestedRecord({
	value,
	keys,
}: {
	value: unknown;
	keys: string[];
}): unknown {
	if (!isRecord(value)) return undefined;
	for (const key of keys) {
		const nested = value[key];
		if (isRecord(nested)) {
			return nested;
		}
	}
	return undefined;
}

export function normalizeTokenUsage({
	value,
	source,
	label,
	approximate,
}: {
	value: unknown;
	source: AgentTokenUsageSource;
	label?: string;
	approximate?: boolean;
}): AgentTokenUsageDelta | null {
	if (!isRecord(value)) return null;
	const inputDetails = readNestedRecord({
		value,
		keys: ["inputTokenDetails", "promptTokenDetails", "prompt_tokens_details"],
	});
	const outputDetails = readNestedRecord({
		value,
		keys: [
			"outputTokenDetails",
			"completionTokenDetails",
			"completion_tokens_details",
		],
	});

	const inputTokens = readNumberFromRecord({
		value,
		keys: ["inputTokens", "promptTokens", "prompt_tokens", "input_tokens"],
	});
	const outputTokens = readNumberFromRecord({
		value,
		keys: [
			"outputTokens",
			"completionTokens",
			"completion_tokens",
			"output_tokens",
		],
	});
	const reasoningTokens =
		readNumberFromRecord({
			value,
			keys: ["reasoningTokens", "reasoning_tokens"],
		}) ??
		readNumberFromRecord({
			value: outputDetails,
			keys: ["reasoningTokens", "reasoning_tokens"],
		});
	const cachedInputTokens =
		readNumberFromRecord({
			value,
			keys: ["cachedInputTokens", "cacheReadTokens", "cached_tokens"],
		}) ??
		readNumberFromRecord({
			value: inputDetails,
			keys: ["cacheReadTokens", "cachedTokens", "cached_tokens"],
		});
	const cacheWriteTokens =
		readNumberFromRecord({
			value,
			keys: ["cacheWriteTokens", "cacheCreationInputTokens"],
		}) ??
		readNumberFromRecord({
			value: inputDetails,
			keys: ["cacheWriteTokens", "cacheCreationInputTokens"],
		});
	const totalTokens =
		readNumberFromRecord({
			value,
			keys: ["totalTokens", "total_tokens"],
		}) ??
		(inputTokens !== undefined || outputTokens !== undefined
			? (inputTokens ?? 0) + (outputTokens ?? 0)
			: reasoningTokens);

	if (
		inputTokens === undefined &&
		outputTokens === undefined &&
		reasoningTokens === undefined &&
		cachedInputTokens === undefined &&
		cacheWriteTokens === undefined &&
		totalTokens === undefined
	) {
		return null;
	}

	return {
		inputTokens,
		outputTokens,
		reasoningTokens,
		totalTokens,
		cachedInputTokens,
		cacheWriteTokens,
		source,
		label,
		approximate,
	};
}

export function estimateTokenCountFromText(text: string): number {
	if (!text) return 0;
	const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
	const nonCjkCount = Math.max(text.length - cjkCount, 0);
	return Math.max(1, Math.ceil(cjkCount + nonCjkCount / 4));
}

export function estimateTokenUsage({
	inputText,
	outputText,
	source,
	label,
}: {
	inputText: string;
	outputText: string;
	source: AgentTokenUsageSource;
	label?: string;
}): AgentTokenUsageDelta {
	const inputTokens = estimateTokenCountFromText(inputText);
	const outputTokens = estimateTokenCountFromText(outputText);
	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens + outputTokens,
		source,
		label,
		approximate: true,
	};
}

export function addTokenUsage({
	current,
	delta,
}: {
	current: AgentTokenUsageTotals;
	delta: AgentTokenUsageDelta;
}): AgentTokenUsageTotals {
	const inputDelta = delta.inputTokens ?? 0;
	const outputDelta = delta.outputTokens ?? 0;
	const reasoningDelta = delta.reasoningTokens ?? 0;
	const totalDelta =
		delta.totalTokens ??
		inputDelta + outputDelta + (outputDelta ? 0 : reasoningDelta);
	const sources = current.sources.includes(delta.source)
		? current.sources
		: [...current.sources, delta.source];

	return {
		inputTokens: current.inputTokens + inputDelta,
		outputTokens: current.outputTokens + outputDelta,
		reasoningTokens: current.reasoningTokens + reasoningDelta,
		totalTokens: current.totalTokens + totalDelta,
		cachedInputTokens: current.cachedInputTokens + (delta.cachedInputTokens ?? 0),
		cacheWriteTokens: current.cacheWriteTokens + (delta.cacheWriteTokens ?? 0),
		approximate: current.approximate || Boolean(delta.approximate),
		sources,
		updatedAt: Date.now(),
	};
}
