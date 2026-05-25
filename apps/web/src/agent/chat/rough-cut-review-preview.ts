export interface RoughCutLinePreviewToken {
	id: string;
	timelineStartSeconds: number;
	timelineEndSeconds: number;
}

export interface RoughCutLinePreviewSegment {
	startSeconds: number;
	endSeconds: number;
}

export function buildRoughCutLinePreviewSegments({
	tokens,
	selectedTokenIds,
}: {
	tokens: RoughCutLinePreviewToken[];
	selectedTokenIds: ReadonlySet<string>;
}): RoughCutLinePreviewSegment[] {
	if (tokens.length === 0) return [];
	const sortedTokens = [...tokens].sort(
		(left, right) => left.timelineStartSeconds - right.timelineStartSeconds,
	);
	const lineStart = Math.min(
		...sortedTokens.map((token) => token.timelineStartSeconds),
	);
	const lineEnd = Math.max(
		...sortedTokens.map((token) => token.timelineEndSeconds),
	);
	const deletedRanges = sortedTokens
		.filter((token) => selectedTokenIds.has(token.id))
		.map((token) => ({
			startSeconds: Math.max(lineStart, token.timelineStartSeconds),
			endSeconds: Math.min(lineEnd, token.timelineEndSeconds),
		}))
		.filter((range) => range.endSeconds > range.startSeconds);

	const segments: RoughCutLinePreviewSegment[] = [];
	let cursor = lineStart;
	for (const range of deletedRanges) {
		if (range.startSeconds > cursor) {
			segments.push({
				startSeconds: cursor,
				endSeconds: range.startSeconds,
			});
		}
		cursor = Math.max(cursor, range.endSeconds);
	}
	if (cursor < lineEnd) {
		segments.push({
			startSeconds: cursor,
			endSeconds: lineEnd,
		});
	}
	return segments.filter(
		(segment) => segment.endSeconds - segment.startSeconds > 0.001,
	);
}
