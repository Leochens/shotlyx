import type { ExportSubProgress } from ".";

export interface ExportSubProgressCopy {
	estimatedRemaining: string;
	frame: string;
	mgSegment: string;
	timeUnits?: ExportTimeUnitsCopy;
}

export interface ExportTimeUnitsCopy {
	hour: string;
	minute: string;
	second: string;
}

const DEFAULT_TIME_UNITS: ExportTimeUnitsCopy = {
	hour: "小时",
	minute: "分",
	second: "秒",
};

function clampProgress(progress: number): number {
	if (!Number.isFinite(progress)) return 0;
	return Math.min(1, Math.max(0, progress));
}

export function formatExportRemainingTime({
	copy = DEFAULT_TIME_UNITS,
	seconds,
}: {
	copy?: ExportTimeUnitsCopy;
	seconds: number | null | undefined;
}): string | null {
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
		return null;
	}
	const roundedSeconds = Math.ceil(seconds);
	if (roundedSeconds < 60) return `${roundedSeconds}${copy.second}`;

	const minutes = Math.floor(roundedSeconds / 60);
	const remainingSeconds = roundedSeconds % 60;
	if (minutes < 60) {
		return remainingSeconds > 0
			? `${minutes}${copy.minute}${remainingSeconds}${copy.second}`
			: `${minutes}${copy.minute}`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes > 0
		? `${hours}${copy.hour}${remainingMinutes}${copy.minute}`
		: `${hours}${copy.hour}`;
}

export function estimateExportRemainingSeconds({
	elapsedMs,
	progress,
}: {
	elapsedMs: number;
	progress: number;
}): number | null {
	const safeProgress = clampProgress(progress);
	if (elapsedMs <= 0 || safeProgress < 0.02 || safeProgress >= 1) return null;
	const elapsedSeconds = elapsedMs / 1000;
	return Math.max(0, (elapsedSeconds / safeProgress) * (1 - safeProgress));
}

export function getExportSubProgressPercent({
	subProgress,
}: {
	subProgress: ExportSubProgress;
}): number {
	return Math.round(clampProgress(subProgress.progress) * 100);
}

export function formatExportSubProgressLabel({
	copy,
	subProgress,
}: {
	copy: ExportSubProgressCopy;
	subProgress: ExportSubProgress;
}): string {
	const parts: string[] = [];
	if (
		typeof subProgress.stepIndex === "number" &&
		typeof subProgress.stepCount === "number"
	) {
		parts.push(
			`${copy.mgSegment} ${subProgress.stepIndex + 1}/${subProgress.stepCount}`,
		);
	}
	if (subProgress.label) {
		parts.push(subProgress.label);
	}
	if (
		typeof subProgress.current === "number" &&
		typeof subProgress.total === "number" &&
		subProgress.total > 0
	) {
		parts.push(`${copy.frame} ${subProgress.current}/${subProgress.total}`);
	}

	const remaining = formatExportRemainingTime({
		copy: copy.timeUnits,
		seconds: subProgress.estimatedRemainingSeconds,
	});
	if (remaining) {
		parts.push(`${copy.estimatedRemaining} ${remaining}`);
	}

	return parts.join(" · ");
}
