import type {
	StockAssetInput,
	StockOrientation,
	StockResolution,
} from "../types";

export type FetchFn = typeof fetch;

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertConfiguredApiKey({
	apiKey,
	provider,
}: {
	apiKey?: string;
	provider: string;
}): string {
	const trimmed = apiKey?.trim();
	if (!trimmed) {
		throw new Error(`configuration_error: missing ${provider} API key`);
	}
	return trimmed;
}

export function getOrientation({
	width,
	height,
}: {
	width?: number;
	height?: number;
}): StockOrientation | null {
	if (!width || !height) return null;
	if (width === height) return "square";
	return width > height ? "landscape" : "portrait";
}

export function matchesOrientation({
	asset,
	orientation,
}: {
	asset: Pick<StockAssetInput, "width" | "height">;
	orientation?: StockOrientation;
}): boolean {
	if (!orientation) return true;
	return getOrientation(asset) === orientation;
}

export function matchesDuration({
	durationSeconds,
	min,
	max,
}: {
	durationSeconds?: number;
	min?: number;
	max?: number;
}): boolean {
	if (durationSeconds === undefined) return true;
	if (min !== undefined && durationSeconds < min) return false;
	if (max !== undefined && durationSeconds > max) return false;
	return true;
}

export function maxWidthForResolution(
	resolution?: StockResolution,
): number | null {
	if (resolution === "hd") return 1280;
	if (resolution === "fullhd") return 1920;
	if (resolution === "4k") return 4096;
	return null;
}

export function normalizeCount(count?: number): number {
	return Math.max(1, Math.min(Math.trunc(count ?? 8), 20));
}

export function normalizePage(page?: number): number {
	return Math.max(1, Math.trunc(page ?? 1));
}
