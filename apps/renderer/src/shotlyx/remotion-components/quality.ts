import type {
	ShotlyxMGPropValue,
	ShotlyxMGQualityIssue,
	ShotlyxMGQualityReport,
	ShotlyxRemotionComponentDocument,
} from "./types";

export interface ShotlyxMGRenderedFrame {
	frame: number;
	markup: string;
}

function visibleText(markup: string): string {
	return markup
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function parseHexColor(value: ShotlyxMGPropValue | undefined): number[] | null {
	if (typeof value !== "string") return null;
	const match = value.trim().match(/^#([0-9a-f]{6})$/i);
	if (!match?.[1]) return null;
	return [0, 2, 4].map((offset) =>
		Number.parseInt(match[1]!.slice(offset, offset + 2), 16),
	);
}

function relativeLuminance(rgb: number[]): number {
	const channels = rgb.map((channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio({
	first,
	second,
}: {
	first: number[];
	second: number[];
}): number {
	const firstLuminance = relativeLuminance(first);
	const secondLuminance = relativeLuminance(second);
	return (
		(Math.max(firstLuminance, secondLuminance) + 0.05) /
		(Math.min(firstLuminance, secondLuminance) + 0.05)
	);
}

function addIssue({
	issues,
	code,
	severity,
	message,
}: {
	issues: ShotlyxMGQualityIssue[];
	code: string;
	severity: ShotlyxMGQualityIssue["severity"];
	message: string;
}): void {
	if (issues.some((issue) => issue.code === code)) return;
	issues.push({ code, severity, message });
}

function pixelStyleValue({
	style,
	property,
}: {
	style: string;
	property: string;
}): number | null {
	const match = style.match(
		new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px`, "i"),
	);
	const value = Number(match?.[1]);
	return Number.isFinite(value) ? value : null;
}

function inspectFrameBounds({
	document,
	frames,
	issues,
}: {
	document: ShotlyxRemotionComponentDocument;
	frames: ShotlyxMGRenderedFrame[];
	issues: ShotlyxMGQualityIssue[];
}): void {
	let farOutsideCount = 0;
	for (const frame of frames) {
		for (const match of frame.markup.matchAll(/style="([^"]+)"/gi)) {
			const style = match[1] ?? "";
			const left = pixelStyleValue({ style, property: "left" });
			const top = pixelStyleValue({ style, property: "top" });
			const width = pixelStyleValue({ style, property: "width" });
			const height = pixelStyleValue({ style, property: "height" });
			const farOutsideX =
				left !== null &&
				(left > document.width * 1.2 ||
					(width !== null && left + width < -document.width * 0.2));
			const farOutsideY =
				top !== null &&
				(top > document.height * 1.2 ||
					(height !== null && top + height < -document.height * 0.2));
			if (farOutsideX || farOutsideY) farOutsideCount += 1;
		}
	}
	if (farOutsideCount >= frames.length) {
		addIssue({
			issues,
			code: "elements-far-outside-canvas",
			severity: "error",
			message: "多个代表帧存在远离画布的元素坐标，可能导致主体越界。",
		});
	}
}

export function evaluateShotlyxMGLocalQuality({
	document,
	frames,
}: {
	document: ShotlyxRemotionComponentDocument;
	frames: ShotlyxMGRenderedFrame[];
}): ShotlyxMGQualityReport {
	const issues: ShotlyxMGQualityIssue[] = [];
	const frameTexts = frames.map((frame) => visibleText(frame.markup));
	const contentProps = document.propsSchema.filter(
		(prop) => prop.role === "content" && prop.type === "text",
	);
	const visibleTextProps = contentProps
		.filter((prop) => {
			const value = document.defaultProps[prop.key];
			return (
				typeof value === "string" &&
				value.trim().length > 0 &&
				frameTexts.some((text) => text.includes(value.trim()))
			);
		})
		.map((prop) => prop.key);
	const textPolicy =
		document.motionSpec?.textPolicy ??
		(contentProps.length > 0 ? "required" : "optional");

	if (textPolicy === "required" && visibleTextProps.length === 0) {
		addIssue({
			issues,
			code: "required-text-not-rendered",
			severity: "error",
			message: "内容型 MG 没有在代表帧中实际渲染任何可编辑文字。",
		});
	}
	if (textPolicy === "forbidden" && frameTexts.some(Boolean)) {
		addIssue({
			issues,
			code: "forbidden-text-rendered",
			severity: "error",
			message: "用户要求无文字，但代表帧中检测到了可见文字。",
		});
	}

	const visuallyEmptyFrames = frames.filter((frame, index) => {
		if (frameTexts[index]) return false;
		const meaningfulTags =
			frame.markup.match(/<(?:svg|path|circle|rect|line|polygon|img|video)\b/gi)
				?.length ?? 0;
		const styledLayers = frame.markup.match(/style="[^"]{20,}"/gi)?.length ?? 0;
		return meaningfulTags === 0 && styledLayers < 2;
	});
	if (visuallyEmptyFrames.length === frames.length) {
		addIssue({
			issues,
			code: "all-frames-empty",
			severity: "error",
			message: "所有代表帧都缺少可见主体。",
		});
	} else if (visuallyEmptyFrames.length > Math.floor(frames.length / 2)) {
		addIssue({
			issues,
			code: "motion-dead-zone",
			severity: "warning",
			message: "多数代表帧缺少可见主体，可能存在过长空白或动效死区。",
		});
	}
	inspectFrameBounds({ document, frames, issues });

	const colorProps = document.propsSchema.filter(
		(prop) => prop.type === "color",
	);
	if (colorProps.length > 5) {
		addIssue({
			issues,
			code: "too-many-editable-colors",
			severity: "warning",
			message: "可编辑颜色超过五种，视觉层级可能过于分散。",
		});
	}
	const longestText = contentProps.reduce((longest, prop) => {
		const value = document.defaultProps[prop.key];
		return typeof value === "string" && value.length > longest.length
			? value
			: longest;
	}, "");
	if (
		longestText.length > 32 &&
		!/(?:maxWidth|wordBreak|overflowWrap|ShotlyxMotion\.fitText)/.test(
			document.componentSource,
		)
	) {
		addIssue({
			issues,
			code: "long-text-without-fit-strategy",
			severity: "warning",
			message: "长文字没有明确的宽度、换行或字号适配策略。",
		});
	}

	const foreground =
		parseHexColor(document.defaultProps.foregroundColor) ??
		parseHexColor(document.defaultProps.primaryColor);
	const background = parseHexColor(document.defaultProps.backgroundColor);
	if (
		foreground &&
		background &&
		contrastRatio({ first: foreground, second: background }) < 3
	) {
		addIssue({
			issues,
			code: "low-color-contrast",
			severity: "warning",
			message: "前景与背景对比度偏低；应保留用户色相并调整明度、描边或背景。",
		});
	}

	if (document.visualDNA && document.visualDNA.colors.userLocked.length > 0) {
		const serializedDefaults = JSON.stringify(
			document.defaultProps,
		).toLowerCase();
		const missingLockedColor = document.visualDNA.colors.userLocked.find(
			(color) => !serializedDefaults.includes(color.toLowerCase()),
		);
		if (missingLockedColor) {
			addIssue({
				issues,
				code: "locked-color-lost",
				severity: "error",
				message: `用户锁定颜色 ${missingLockedColor} 未保留在可编辑属性中。`,
			});
		}
	}
	if (
		document.visualDNA?.sources.typography === "locked" &&
		document.visualDNA.typography.fontFamilies.length > 0
	) {
		const fontDefault = String(document.defaultProps.fontFamily ?? "");
		const missingFont = document.visualDNA.typography.fontFamilies.find(
			(font) => !fontDefault.includes(font.replace(/^['"]|['"]$/g, "")),
		);
		if (missingFont) {
			addIssue({
				issues,
				code: "locked-font-lost",
				severity: "error",
				message: `用户锁定字体 ${missingFont} 未保留在可编辑属性中。`,
			});
		}
	}

	return {
		status: issues.length > 0 ? "needs-attention" : "passed",
		reviewLevel: "local",
		checkedFrames: frames.map((frame) => frame.frame),
		visibleTextProps,
		issues,
		checkedAt: new Date().toISOString(),
	};
}

export function assertShotlyxMGHardQuality(
	report: ShotlyxMGQualityReport,
): void {
	const errors = report.issues.filter((issue) => issue.severity === "error");
	if (!errors.length) return;
	throw new Error(
		`Local visual QA failed: ${errors
			.map((issue) => `${issue.code}: ${issue.message}`)
			.join(" | ")}`,
	);
}
