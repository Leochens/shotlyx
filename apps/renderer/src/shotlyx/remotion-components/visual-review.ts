import { renderShotlyxMGAssetToCanvas } from "./canvas-renderer";
import type {
	ShotlyxMGQualityIssue,
	ShotlyxMGQualityReport,
	ShotlyxRemotionMGAsset,
} from "./types";

const REVIEW_PROGRESS = [0, 0.24, 0.58, 0.94] as const;

function contactSheetSize(asset: ShotlyxRemotionMGAsset): {
	cellWidth: number;
	cellHeight: number;
	width: number;
	height: number;
} {
	const sourceRatio = asset.document.width / asset.document.height;
	const cellWidth = sourceRatio < 1 ? 240 : 400;
	const cellHeight = Math.round(cellWidth / sourceRatio);
	return {
		cellWidth,
		cellHeight,
		width: cellWidth * 2,
		height: cellHeight * 2,
	};
}

export interface ShotlyxMGVisionReviewResult {
	passed: boolean;
	issues: ShotlyxMGQualityIssue[];
	summary: string;
}

function parseVisionReview(value: unknown): ShotlyxMGVisionReviewResult | null {
	if (typeof value !== "string" || !value.trim()) return null;
	const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const candidate = fenced ?? value.match(/\{[\s\S]*\}/)?.[0];
	if (!candidate) return null;
	try {
		const parsed: unknown = JSON.parse(candidate);
		if (typeof parsed !== "object" || parsed === null) return null;
		const rawIssues = Reflect.get(parsed, "issues");
		const issues: ShotlyxMGQualityIssue[] = Array.isArray(rawIssues)
			? rawIssues
					.map((item, index) => {
						if (typeof item === "string") {
							return {
								code: `vision-${index + 1}`,
								severity: "warning" as const,
								message: item,
							};
						}
						if (typeof item !== "object" || item === null) return null;
						const message = Reflect.get(item, "message");
						if (typeof message !== "string" || !message.trim()) return null;
						return {
							code:
								typeof Reflect.get(item, "code") === "string"
									? String(Reflect.get(item, "code"))
									: `vision-${index + 1}`,
							severity:
								Reflect.get(item, "severity") === "error"
									? ("error" as const)
									: ("warning" as const),
							message: message.trim(),
						};
					})
					.filter((issue): issue is ShotlyxMGQualityIssue => issue !== null)
			: [];
		const summary = Reflect.get(parsed, "summary");
		return {
			passed:
				Reflect.get(parsed, "passed") === true &&
				!issues.some((issue) => issue.severity === "error"),
			issues,
			summary:
				typeof summary === "string" && summary.trim()
					? summary.trim()
					: value.trim().slice(0, 500),
		};
	} catch {
		return null;
	}
}

export async function createShotlyxMGContactSheet({
	asset,
}: {
	asset: ShotlyxRemotionMGAsset;
}): Promise<string | null> {
	if (typeof document === "undefined") return null;
	const { cellWidth, cellHeight, width, height } = contactSheetSize(asset);
	const sheet = document.createElement("canvas");
	sheet.width = width;
	sheet.height = height;
	const sheetContext = sheet.getContext("2d");
	if (!sheetContext) return null;
	sheetContext.fillStyle = "#2a2a2a";
	sheetContext.fillRect(0, 0, sheet.width, sheet.height);

	for (const [index, progress] of REVIEW_PROGRESS.entries()) {
		const cell = document.createElement("canvas");
		cell.width = cellWidth;
		cell.height = cellHeight;
		const context = cell.getContext("2d");
		if (!context) return null;
		await renderShotlyxMGAssetToCanvas({
			asset,
			ctx: context,
			width: cellWidth,
			height: cellHeight,
			params: {
				...asset.document.defaultProps,
				progress,
			},
		});
		sheetContext.drawImage(
			cell,
			(index % 2) * cellWidth,
			Math.floor(index / 2) * cellHeight,
		);
	}
	return sheet.toDataURL("image/jpeg", 0.86);
}

export async function reviewShotlyxMGWithVision({
	asset,
	fetchFn = fetch,
	signal,
}: {
	asset: ShotlyxRemotionMGAsset;
	fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
	signal?: AbortSignal;
}): Promise<ShotlyxMGQualityReport | null> {
	const dataUrl = await createShotlyxMGContactSheet({ asset });
	if (!dataUrl) return null;
	const { width, height } = contactSheetSize(asset);
	const response = await fetchFn("/api/agent/vision/analyze", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		signal,
		body: JSON.stringify({
			analysisType: "quality_check",
			detail: "low",
			maxCompletionTokens: 1000,
			prompt: [
				"这是同一个 MG 动画的开场、建立、保持、收束四个代表帧。检查内容完整性、构图、文字可读性、颜色、风格一致性、主体是否越界或被遮挡，以及是否出现廉价 AI 模板感。",
				"只返回 JSON：{passed:boolean,summary:string,issues:[{code:string,severity:'error'|'warning',message:string}]}。只有明显影响使用的问题才标 error。",
			].join("\n"),
			media: {
				name: `${asset.shortId ?? asset.id}-contact-sheet.jpg`,
				type: "image",
				mimeType: "image/jpeg",
				width,
				height,
				dataUrl,
			},
		}),
	});
	if (!response.ok) return null;
	const payload: unknown = await response.json();
	const analysis =
		typeof payload === "object" && payload !== null
			? Reflect.get(payload, "analysis")
			: null;
	const review = parseVisionReview(analysis);
	if (!review) return null;
	const local = asset.document.quality;
	const issues = [...(local?.issues ?? []), ...review.issues];
	return {
		status: review.passed && issues.length === 0 ? "passed" : "needs-attention",
		reviewLevel: "vision",
		checkedFrames: local?.checkedFrames ?? [],
		visibleTextProps: local?.visibleTextProps ?? [],
		issues,
		checkedAt: new Date().toISOString(),
		visionSummary: review.summary,
	};
}
