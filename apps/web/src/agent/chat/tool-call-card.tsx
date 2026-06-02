import { useMemo, useState } from "react";
import {
	AlertTriangle,
	ChevronDown,
	CheckCircle2,
	Circle,
	Download,
	Expand,
	ExternalLink,
	Film,
	Grid2X2,
	ImageIcon,
	Loader2,
	Music2,
	PanelTop,
	PlayCircle,
	Wrench,
	X,
	XCircle,
} from "lucide-react";
import type { ToolCallRecord } from "@/agent/controller/types";
import { MAX_TOOL_PROGRESS_EVENTS } from "./progress-history";

interface ToolCallGroupProps {
	toolCalls: ToolCallRecord[];
}

export type ToolStatus = "pending" | "success" | "error";

export interface ToolActionResult {
	status: "success" | "error";
	data?: unknown;
	error?: string;
}

export interface ToolCallActionRequest {
	action: "stock-import-candidate";
	payload: {
		candidateId: string;
	};
}

export interface ToolOutputDisplay {
	tone: ToolStatus;
	text: string;
}

const STATUS_CONFIG = {
	pending: {
		icon: Loader2,
		iconClass: "animate-spin text-blue-500 dark:text-blue-400",
		dotClass:
			"bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.35)] dark:bg-blue-400 dark:shadow-[0_0_10px_rgba(96,165,250,0.65)]",
		label: "执行中",
		labelClass: "text-blue-600 dark:text-blue-300",
		rowClass:
			"border-blue-200/80 bg-blue-50/80 dark:border-blue-500/30 dark:bg-blue-500/5",
	},
	success: {
		icon: CheckCircle2,
		iconClass: "text-emerald-600 dark:text-emerald-400",
		dotClass: "bg-emerald-500 dark:bg-emerald-400",
		label: "已完成",
		labelClass: "text-emerald-600 dark:text-emerald-300",
		rowClass:
			"border-emerald-200/80 bg-emerald-50/80 dark:border-neutral-800 dark:bg-neutral-900/40",
	},
	error: {
		icon: XCircle,
		iconClass: "text-red-600 dark:text-red-400",
		dotClass: "bg-red-500 dark:bg-red-400",
		label: "失败",
		labelClass: "text-red-600 dark:text-red-300",
		rowClass:
			"border-red-200/90 bg-red-50/80 dark:border-red-500/30 dark:bg-red-500/5",
	},
} as const;

const REVIEW_ONLY_TOOLS = new Set(["rough_cut_create_review"]);

function getLatestProgress(toolCall: ToolCallRecord) {
	const progress = toolCall.progress ?? [];
	return progress[progress.length - 1];
}

export interface JobTaskProgressItem {
	id: string;
	label: string;
	status: "running" | "success" | "error";
	detail: string;
	index?: number;
	current?: number;
	total?: number;
}

export function getJobTaskProgressItems(
	toolCall: ToolCallRecord,
): JobTaskProgressItem[] {
	const taskItems = new Map<string, JobTaskProgressItem>();
	for (const event of toolCall.progress ?? []) {
		if (!event.taskId && event.taskIndex === undefined) continue;
		const id = event.taskId ?? `task-${event.taskIndex}`;
		taskItems.set(id, {
			id,
			label: event.taskLabel ?? event.label,
			status: event.status,
			detail: event.label,
			index: event.taskIndex,
			current: event.current,
			total: event.total,
		});
	}
	return [...taskItems.values()].sort(
		(left, right) => (left.index ?? 0) - (right.index ?? 0),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackgroundJobRunning(toolCall: ToolCallRecord): boolean {
	if (
		toolCall.result?.status !== "success" ||
		!isRecord(toolCall.result.data)
	) {
		return false;
	}
	const latestProgress = getLatestProgress(toolCall);
	if (
		latestProgress?.status === "error" ||
		latestProgress?.stage === "completed" ||
		latestProgress?.stage === "complete" ||
		latestProgress?.stage === "cancelled"
	) {
		return false;
	}
	return (
		toolCall.result.data.runtime === "shotlyx-mg-job-v1" &&
		toolCall.result.data.status === "running"
	);
}

export function getToolStatus(toolCall: ToolCallRecord): ToolStatus {
	const latestProgress = getLatestProgress(toolCall);
	if (latestProgress?.status === "error") return "error";
	if (
		latestProgress?.stage === "completed" ||
		latestProgress?.stage === "complete"
	) {
		return "success";
	}
	if (isBackgroundJobRunning(toolCall)) return "pending";
	return toolCall.result?.status ?? "pending";
}

export function getToolOutputDisplay(
	toolCall: ToolCallRecord,
): ToolOutputDisplay {
	const status = getToolStatus(toolCall);
	const latestProgress = getLatestProgress(toolCall);
	if (!toolCall.result) {
		return {
			tone: "pending",
			text: "等待工具返回结果...",
		};
	}
	if (status === "pending") {
		return {
			tone: "pending",
			text: "MG 子智能体已启动，正在后台生成。",
		};
	}
	if (status === "success") {
		return {
			tone: "success",
			text:
				toolCall.tool === "creative_generate_image"
					? "图片已生成并保存到资源库。"
					: toolCall.tool === "creative_generate_seedance_video"
						? "Seedance 视频已生成并保存到资源库。"
						: toolCall.tool === "stock_search_media"
							? "素材候选已通过资源卡展示。"
							: toolCall.tool === "rough_cut_create_review"
								? "粗剪审核单已生成，请在弹窗里确认后再剪辑。"
								: toolCall.tool === "rough_cut_apply_review"
									? "已按审核结果完成粗剪。"
									: toolCall.tool === "vision_analyze_media"
										? "视觉分析已完成。"
										: stringifyCompact(toolCall.result.data),
		};
	}
	return {
		tone: "error",
		text:
			toolCall.result.error ??
			latestProgress?.detail ??
			latestProgress?.label ??
			"未知错误",
	};
}

function getPendingIndex(toolCalls: ToolCallRecord[]): number {
	return toolCalls.findIndex(
		(toolCall) => getToolStatus(toolCall) === "pending",
	);
}

function getSelectedIndex({
	toolCalls,
	selectedToolKey,
}: {
	toolCalls: ToolCallRecord[];
	selectedToolKey: string | null;
}): number {
	if (toolCalls.length === 0) return 0;
	if (selectedToolKey) {
		const selectedIndex = toolCalls.findIndex(
			(toolCall, index) => getToolKey({ toolCall, index }) === selectedToolKey,
		);
		if (selectedIndex >= 0) return selectedIndex;
	}
	const pendingIndex = getPendingIndex(toolCalls);
	if (pendingIndex >= 0) return pendingIndex;
	return toolCalls.length - 1;
}

function getToolKey({
	toolCall,
	index,
}: {
	toolCall: ToolCallRecord;
	index: number;
}): string {
	return `${index}:${toolCall.tool}`;
}

export interface ToolCallSummaryCounts {
	total: number;
	pending: number;
	success: number;
	failed: number;
}

export function getToolCallSummaryCounts(
	toolCalls: ToolCallRecord[],
): ToolCallSummaryCounts {
	const total = toolCalls.length;
	let pending = 0;
	let failed = 0;
	for (const toolCall of toolCalls) {
		const status = getToolStatus(toolCall);
		if (status === "pending") {
			pending += 1;
		} else if (status === "error") {
			failed += 1;
		}
	}
	return {
		total,
		pending,
		success: total - pending - failed,
		failed,
	};
}

export function buildToolCallSummary(toolCalls: ToolCallRecord[]): string {
	const { total, pending, success, failed } =
		getToolCallSummaryCounts(toolCalls);
	const parts = [
		"工具调用",
		`${total} 项`,
		`${success} 成功`,
		`${failed} 失败`,
	];
	if (pending > 0) {
		parts.push(`${pending} 进行中`);
	}
	return parts.join(" · ");
}

function buildCompactToolNames(toolCalls: ToolCallRecord[]): string {
	return toolCalls
		.slice(0, 4)
		.map((toolCall) => toolCall.tool)
		.join(" · ");
}

function stringifyCompact(value: unknown): string {
	const serialized = JSON.stringify(value, null, 2);
	if (serialized === undefined) return String(value);
	if (serialized.length <= 4000) return serialized;
	return `${serialized.slice(0, 4000)}\n... 已截断`;
}

export function ToolCallGroup({ toolCalls }: ToolCallGroupProps) {
	const [expandedSignature, setExpandedSignature] = useState<string | null>(
		null,
	);
	const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);

	const hasPending = toolCalls.some(
		(toolCall) => getToolStatus(toolCall) === "pending",
	);
	const hasError = toolCalls.some(
		(toolCall) => getToolStatus(toolCall) === "error",
	);
	const summary = useMemo(() => buildToolCallSummary(toolCalls), [toolCalls]);
	const compactToolNames = useMemo(
		() => buildCompactToolNames(toolCalls),
		[toolCalls],
	);

	if (toolCalls.length === 0) return null;

	const statusSignature = toolCalls
		.map(
			(toolCall, index) =>
				`${getToolKey({ toolCall, index })}:${getToolStatus(toolCall)}`,
		)
		.join("|");
	const isOpen = hasPending || expandedSignature === statusSignature;
	const selectedIndex = getSelectedIndex({ toolCalls, selectedToolKey });

	return (
		<div className="mt-2 w-full overflow-hidden rounded-sm border border-border/70 bg-card/95 shadow-[0_12px_30px_rgba(14,44,56,0.08),inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-cyan-300/15 dark:bg-neutral-950/55 dark:shadow-none">
			<button
				type="button"
				onClick={() => {
					if (hasPending) return;
					setExpandedSignature((value) =>
						value === statusSignature ? null : statusSignature,
					);
				}}
				className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-accent/70 dark:hover:bg-neutral-900/80"
			>
				<div className="min-w-0 flex-1">
					<div className="truncate text-xs font-medium text-foreground dark:text-neutral-200">
						{summary}
					</div>
					<div className="truncate text-[10px] text-muted-foreground dark:text-neutral-500">
						{compactToolNames}
					</div>
				</div>
				<ChevronDown
					size={14}
					className={`shrink-0 text-muted-foreground transition-transform dark:text-neutral-500 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>

			{isOpen && (
				<div className="border-border/70 border-t px-2 py-2 dark:border-neutral-800">
					{!hasPending && !hasError && shouldShowRunReviewStrip(toolCalls) && (
						<RunReviewStrip />
					)}
					<div className="space-y-1">
						{toolCalls.map((toolCall, index) => (
							<ToolCallRow
								key={getToolKey({ toolCall, index })}
								toolCall={toolCall}
								index={index}
								isSelected={index === selectedIndex}
								onSelect={() =>
									setSelectedToolKey(getToolKey({ toolCall, index }))
								}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function shouldShowRunReviewStrip(toolCalls: ToolCallRecord[]): boolean {
	return !toolCalls.some((toolCall) => REVIEW_ONLY_TOOLS.has(toolCall.tool));
}

function RunReviewStrip() {
	return (
		<div className="mb-2 flex items-start gap-2 rounded-sm border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-2 text-[0.68rem] leading-5 text-emerald-800 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-100/85">
			<CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
			<div>
				<span className="font-medium text-emerald-800 dark:text-emerald-200">
					已应用到当前项目。
				</span>
				<span className="text-emerald-700/80 dark:text-emerald-100/70">
					{" "}
					如果效果不对，可以用撤销回退，或继续让 Agent 基于当前结果调整。
				</span>
			</div>
		</div>
	);
}

function ToolCallRow({
	toolCall,
	index,
	isSelected,
	onSelect,
}: {
	toolCall: ToolCallRecord;
	index: number;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const status = getToolStatus(toolCall);
	const config = STATUS_CONFIG[status];
	const StatusIcon = config.icon;
	const isImageGeneration = toolCall.tool === "creative_generate_image";
	const latestProgress = getLatestProgress(toolCall);

	return (
		<div
			className={`rounded border transition-colors ${
				isSelected ? config.rowClass : "border-transparent bg-transparent"
			}`}
		>
			<button
				type="button"
				onClick={onSelect}
				className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
			>
				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dotClass}`}
				/>
				<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground dark:text-neutral-600">
					{String(index + 1).padStart(2, "0")}
				</span>
				<StatusIcon size={13} className={`shrink-0 ${config.iconClass}`} />
				<div className="min-w-0 flex-1">
					<div className="truncate font-mono text-[11px] text-foreground dark:text-neutral-300">
						{toolCall.tool}
					</div>
					{latestProgress && (
						<div
							className={`truncate text-[10px] ${
								latestProgress.status === "error"
									? "text-red-600 dark:text-red-300"
									: latestProgress.status === "success"
										? "text-emerald-600 dark:text-emerald-300"
										: "text-blue-600 dark:text-blue-300"
							}`}
						>
							{latestProgress.label}
						</div>
					)}
				</div>
				<span className={`shrink-0 text-[10px] ${config.labelClass}`}>
					{config.label}
				</span>
			</button>

			{isSelected && (
				<div className="space-y-2 px-2 pb-2">
					{isImageGeneration && status === "pending" && (
						<ImageGenerationLoading />
					)}
					{isImageGeneration && toolCall.result?.status === "success" && (
						<GeneratedImagesPreview data={toolCall.result.data} />
					)}
					<ToolCallDetails toolCall={toolCall} />
				</div>
			)}
		</div>
	);
}

function ToolCallDetails({ toolCall }: { toolCall: ToolCallRecord }) {
	const progress = useMemo(() => toolCall.progress ?? [], [toolCall.progress]);
	const renderedProgress = useMemo(
		() => progress.slice(-MAX_TOOL_PROGRESS_EVENTS),
		[progress],
	);
	const omittedProgressCount = progress.length - renderedProgress.length;
	const output = useMemo(() => getToolOutputDisplay(toolCall), [toolCall]);
	const taskProgress = useMemo(
		() => getJobTaskProgressItems(toolCall),
		[toolCall],
	);
	const paramsText = useMemo(
		() => stringifyCompact(toolCall.params),
		[toolCall.params],
	);

	return (
		<div className="space-y-2">
			{taskProgress.length > 0 && <JobTaskProgressList items={taskProgress} />}
			{progress.length > 0 && (
				<div>
					<div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground dark:text-neutral-600">
						<Circle size={9} />
						进度
					</div>
					<div className="max-h-32 overflow-auto rounded border border-border/60 bg-background/75 p-2 dark:border-transparent dark:bg-neutral-950/80">
						<div className="space-y-1">
							{omittedProgressCount > 0 && (
								<div className="text-[10px] text-muted-foreground dark:text-neutral-600">
									已折叠 {omittedProgressCount} 条较早进度
								</div>
							)}
							{renderedProgress.map((event, index) => (
								<div
									key={`${event.stage}-${event.label}-${index}`}
									className="flex items-start gap-2 text-[10px] leading-relaxed"
								>
									<span
										className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
											event.status === "error"
												? "bg-red-400"
												: event.status === "success"
													? "bg-emerald-400"
													: "bg-blue-400"
										}`}
									/>
									<div className="min-w-0 flex-1">
										<div className="truncate text-foreground dark:text-neutral-300">
											{event.label}
										</div>
										{event.detail && (
											<div className="line-clamp-2 text-muted-foreground dark:text-neutral-600">
												{event.detail}
											</div>
										)}
									</div>
									{event.total !== undefined && event.current !== undefined && (
										<span className="shrink-0 tabular-nums text-muted-foreground dark:text-neutral-600">
											{event.current}/{event.total}
										</span>
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			)}
			<div className="grid gap-2 md:grid-cols-2">
				<div>
					<div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground dark:text-neutral-600">
						<Wrench size={11} />
						输入
					</div>
					<pre className="max-h-56 select-text overflow-auto rounded border border-border/60 bg-background/80 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground dark:border-transparent dark:bg-neutral-950 dark:text-neutral-400">
						{paramsText}
					</pre>
				</div>
				<div>
					<div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground dark:text-neutral-600">
						<Circle size={9} />
						输出
					</div>
					<div
						className={`max-h-56 select-text overflow-auto rounded border p-2 text-[10px] leading-relaxed whitespace-pre-wrap ${
							output.tone === "success"
								? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800 dark:border-transparent dark:bg-emerald-500/5 dark:text-emerald-300/80"
								: output.tone === "error"
									? "border-red-200/80 bg-red-50/80 text-red-700 dark:border-transparent dark:bg-red-500/5 dark:text-red-300"
									: "border-blue-200/80 bg-blue-50/80 text-blue-700 dark:border-transparent dark:bg-blue-500/5 dark:text-blue-300"
						}`}
					>
						{output.text}
					</div>
				</div>
			</div>
		</div>
	);
}

function JobTaskProgressList({ items }: { items: JobTaskProgressItem[] }) {
	return (
		<div>
			<div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground dark:text-neutral-600">
				<Grid2X2 size={10} />
				并行任务
			</div>
			<div className="rounded border border-border/60 bg-background/75 p-2 dark:border-transparent dark:bg-neutral-950/80">
				<div className="grid gap-1 md:grid-cols-2">
					{items.map((item) => (
						<div
							key={item.id}
							className="flex min-w-0 items-center gap-2 rounded-sm border border-border/70 bg-card/65 px-2 py-1.5 dark:border-neutral-800/70 dark:bg-transparent"
						>
							<span
								className={`h-1.5 w-1.5 shrink-0 rounded-full ${
									item.status === "error"
										? "bg-red-400"
										: item.status === "success"
											? "bg-emerald-400"
											: "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.6)]"
								}`}
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate text-[10px] font-medium text-foreground dark:text-neutral-300">
									{item.label}
								</div>
								<div
									className={`truncate text-[10px] ${
										item.status === "error"
											? "text-red-600 dark:text-red-300"
											: item.status === "success"
												? "text-emerald-600 dark:text-emerald-300"
												: "text-blue-600 dark:text-blue-300"
									}`}
								>
									{item.detail}
								</div>
							</div>
							{item.total !== undefined && item.current !== undefined && (
								<span className="shrink-0 tabular-nums text-[10px] text-muted-foreground dark:text-neutral-600">
									{item.current}/{item.total}
								</span>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

interface StockMediaCandidate {
	id: string;
	provider?: string;
	type?: string;
	title?: string;
	previewUrl?: string;
	thumbnailUrl?: string;
	sourceUrl?: string;
	width?: number;
	height?: number;
	durationSeconds?: number;
	mediaAssetId?: string;
	name?: string;
	author?: {
		name?: string;
		url?: string;
	};
	license?: {
		name?: string;
		url?: string;
		attributionRequired?: boolean;
		commercialUse?: boolean;
		derivativesAllowed?: boolean;
	};
}

type StockMediaResultsLayout = "grid" | "focus";

export interface StockLicenseDisplay {
	tone: "safe" | "warning";
	label: string;
	description: string;
}

export function getStockMediaCandidates(data: unknown): StockMediaCandidate[] {
	if (!isRecord(data) || !Array.isArray(data.candidates)) return [];
	return data.candidates
		.filter(isRecord)
		.map((candidate) => {
			const author = isRecord(candidate.author) ? candidate.author : undefined;
			const license = isRecord(candidate.license)
				? candidate.license
				: undefined;
			return {
				id: typeof candidate.id === "string" ? candidate.id : "",
				provider:
					typeof candidate.provider === "string"
						? candidate.provider
						: undefined,
				type: typeof candidate.type === "string" ? candidate.type : undefined,
				title:
					typeof candidate.title === "string" ? candidate.title : undefined,
				previewUrl:
					typeof candidate.previewUrl === "string"
						? candidate.previewUrl
						: undefined,
				thumbnailUrl:
					typeof candidate.thumbnailUrl === "string"
						? candidate.thumbnailUrl
						: undefined,
				sourceUrl:
					typeof candidate.sourceUrl === "string"
						? candidate.sourceUrl
						: undefined,
				width:
					typeof candidate.width === "number" ? candidate.width : undefined,
				height:
					typeof candidate.height === "number" ? candidate.height : undefined,
				durationSeconds:
					typeof candidate.durationSeconds === "number"
						? candidate.durationSeconds
						: undefined,
				mediaAssetId:
					typeof candidate.mediaAssetId === "string"
						? candidate.mediaAssetId
						: undefined,
				name: typeof candidate.name === "string" ? candidate.name : undefined,
				author: author
					? {
							name: typeof author.name === "string" ? author.name : undefined,
							url: typeof author.url === "string" ? author.url : undefined,
						}
					: undefined,
				license: license
					? {
							name: typeof license.name === "string" ? license.name : undefined,
							url: typeof license.url === "string" ? license.url : undefined,
							attributionRequired:
								typeof license.attributionRequired === "boolean"
									? license.attributionRequired
									: undefined,
							commercialUse:
								typeof license.commercialUse === "boolean"
									? license.commercialUse
									: undefined,
							derivativesAllowed:
								typeof license.derivativesAllowed === "boolean"
									? license.derivativesAllowed
									: undefined,
						}
					: undefined,
			};
		})
		.filter((candidate) => candidate.id.length > 0);
}

export function getStockLicenseDisplay(
	candidate: StockMediaCandidate,
): StockLicenseDisplay {
	const commercialUse = candidate.license?.commercialUse;
	const attributionRequired = candidate.license?.attributionRequired;
	const derivativesAllowed = candidate.license?.derivativesAllowed;

	if (commercialUse === true && attributionRequired === false) {
		return {
			tone: "safe",
			label: "可直接商用",
			description: "平台授权可商用，无需署名",
		};
	}

	if (commercialUse === true) {
		return {
			tone: "warning",
			label: attributionRequired ? "可商用，需署名" : "可商用，需确认",
			description: attributionRequired
				? "导出或发布前保留素材来源署名"
				: "平台授权可商用，但仍建议确认条款",
		};
	}

	if (derivativesAllowed === false) {
		return {
			tone: "warning",
			label: "有版权风险",
			description: "授权不允许衍生编辑，请更换素材",
		};
	}

	return {
		tone: "warning",
		label: "需确认版权",
		description: "未能确认商用授权，导入前请检查来源条款",
	};
}

function formatDuration(seconds?: number): string {
	if (seconds === undefined) return "时长未知";
	if (seconds < 60) return `${Math.round(seconds)} 秒`;
	const minutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60)
		.toString()
		.padStart(2, "0");
	return `${minutes}:${rest}`;
}

function formatResolution({
	width,
	height,
}: {
	width?: number;
	height?: number;
}): string {
	if (!width || !height) return "分辨率未知";
	return `${width}x${height}`;
}

function formatProvider(value?: string): string {
	if (!value) return "素材源未知";
	return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function getStockMediaCandidatesFromToolCalls(
	toolCalls?: ToolCallRecord[],
): StockMediaCandidate[] {
	if (!toolCalls) return [];
	return toolCalls.flatMap((toolCall) => {
		if (
			toolCall.tool !== "stock_search_media" ||
			toolCall.result?.status !== "success"
		) {
			return [];
		}
		return getStockMediaCandidates(toolCall.result.data);
	});
}

function getPreviewButtonLabel(candidate: StockMediaCandidate): string {
	if (candidate.type === "image") return "放大图片";
	if (candidate.type === "audio") return "试听音频";
	return "预览视频";
}

function StockMediaPlaceholderIcon({ type }: { type?: string }) {
	if (type === "audio")
		return (
			<Music2
				size={28}
				className="text-muted-foreground dark:text-neutral-600"
			/>
		);
	if (type === "image")
		return (
			<ImageIcon
				size={28}
				className="text-muted-foreground dark:text-neutral-600"
			/>
		);
	return (
		<Film size={28} className="text-muted-foreground dark:text-neutral-600" />
	);
}

export function StockMediaResultsPanel({
	toolCalls,
	onToolAction,
}: {
	toolCalls?: ToolCallRecord[];
	onToolAction?: (request: ToolCallActionRequest) => Promise<ToolActionResult>;
}) {
	const [layout, setLayout] = useState<StockMediaResultsLayout>("grid");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [previewCandidate, setPreviewCandidate] =
		useState<StockMediaCandidate | null>(null);
	const candidates = useMemo(
		() => getStockMediaCandidatesFromToolCalls(toolCalls),
		[toolCalls],
	);

	if (candidates.length === 0) return null;

	const safeSelectedIndex = Math.min(selectedIndex, candidates.length - 1);
	const selectedCandidate = candidates[safeSelectedIndex] ?? candidates[0];
	const importCandidate = async (candidateId: string) =>
		await onToolAction?.({
			action: "stock-import-candidate",
			payload: { candidateId },
		});

	return (
		<div
			data-testid="stock-media-results"
			className="mt-2 w-full rounded-lg border border-border/70 bg-card/95 p-2 shadow-[0_12px_30px_rgba(14,44,56,0.08)] dark:border-neutral-800 dark:bg-neutral-950/80 dark:shadow-none"
		>
			<div className="mb-2 flex items-center justify-between gap-2 px-1">
				<div>
					<div className="text-xs font-medium text-foreground dark:text-neutral-200">
						素材结果 · {candidates.length} 项
					</div>
					<div className="mt-0.5 text-[10px] text-muted-foreground dark:text-neutral-500">
						可预览后再导入资源库
					</div>
				</div>
				<div className="flex shrink-0 rounded-md border border-border/70 bg-background/80 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
					<button
						type="button"
						onClick={() => setLayout("grid")}
						className={`flex h-7 items-center gap-1 rounded px-2 text-[10px] ${
							layout === "grid"
								? "bg-card text-foreground shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
								: "text-muted-foreground hover:text-foreground dark:text-neutral-500 dark:hover:text-neutral-200"
						}`}
						title="平铺展示"
					>
						<Grid2X2 size={12} />
						平铺
					</button>
					<button
						type="button"
						onClick={() => setLayout("focus")}
						className={`flex h-7 items-center gap-1 rounded px-2 text-[10px] ${
							layout === "focus"
								? "bg-card text-foreground shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
								: "text-muted-foreground hover:text-foreground dark:text-neutral-500 dark:hover:text-neutral-200"
						}`}
						title="单张切换"
					>
						<PanelTop size={12} />
						单张
					</button>
				</div>
			</div>

			{layout === "grid" ? (
				<div className="grid gap-2 sm:grid-cols-2">
					{candidates.map((candidate) => (
						<StockMediaCandidateCard
							key={candidate.id}
							candidate={candidate}
							onImportCandidate={importCandidate}
							onPreview={setPreviewCandidate}
						/>
					))}
				</div>
			) : (
				<div className="relative pr-5">
					{selectedCandidate && (
						<StockMediaCandidateCard
							candidate={selectedCandidate}
							onImportCandidate={importCandidate}
							onPreview={setPreviewCandidate}
						/>
					)}
					{candidates.length > 1 && (
						<div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
							{candidates.map((candidate, index) => (
								<button
									key={candidate.id}
									type="button"
									onClick={() => setSelectedIndex(index)}
									className={`size-2 rounded-full transition-colors ${
										index === safeSelectedIndex
											? "bg-blue-400"
											: "bg-muted hover:bg-muted-foreground/35 dark:bg-neutral-700 dark:hover:bg-neutral-500"
									}`}
									aria-label={`查看素材 ${index + 1}`}
									title={`查看素材 ${index + 1}`}
								/>
							))}
						</div>
					)}
				</div>
			)}

			{previewCandidate && (
				<StockMediaPreviewDialog
					candidate={previewCandidate}
					onClose={() => setPreviewCandidate(null)}
				/>
			)}
		</div>
	);
}

function StockMediaCandidateCard({
	candidate,
	onImportCandidate,
	onPreview,
}: {
	candidate: StockMediaCandidate;
	onImportCandidate?: (candidateId: string) => Promise<ToolActionResult | void>;
	onPreview?: (candidate: StockMediaCandidate) => void;
}) {
	const [status, setStatus] = useState<
		"idle" | "importing" | "imported" | "error"
	>(candidate.mediaAssetId ? "imported" : "idle");
	const [error, setError] = useState<string | null>(null);
	const licenseDisplay = getStockLicenseDisplay(candidate);
	const previewUrl = candidate.thumbnailUrl ?? candidate.previewUrl;
	const title = candidate.title ?? candidate.name ?? "未命名素材";
	const importDisabled =
		status === "importing" || status === "imported" || !onImportCandidate;

	const handleImport = async () => {
		if (!onImportCandidate || importDisabled) return;
		setStatus("importing");
		setError(null);
		const result = await onImportCandidate(candidate.id);
		if (!result || result.status === "success") {
			setStatus("imported");
			return;
		}
		setStatus("error");
		setError(result.error ?? "导入失败");
	};

	return (
		<div className="overflow-hidden rounded-md border border-border/70 bg-card shadow-[0_8px_22px_rgba(14,44,56,0.07)] dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
			<div className="relative aspect-video bg-muted/55 dark:bg-neutral-900">
				{previewUrl && candidate.type !== "audio" ? (
					<img
						src={previewUrl}
						alt={title}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<StockMediaPlaceholderIcon type={candidate.type} />
					</div>
				)}
				<div className="absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur dark:bg-neutral-950/80 dark:text-neutral-200">
					{formatProvider(candidate.provider)}
				</div>
				<div
					className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
						licenseDisplay.tone === "safe"
							? "bg-emerald-500/90 text-emerald-950"
							: "bg-yellow-400/90 text-yellow-950"
					}`}
					title={licenseDisplay.description}
				>
					{licenseDisplay.tone === "safe" ? (
						<CheckCircle2 size={11} />
					) : (
						<AlertTriangle size={11} />
					)}
					{licenseDisplay.label}
				</div>
				<button
					type="button"
					onClick={() => onPreview?.(candidate)}
					disabled={!candidate.previewUrl}
					className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1.5 rounded bg-background/90 px-2 text-xs font-medium text-foreground shadow-sm backdrop-blur hover:bg-background disabled:cursor-not-allowed disabled:opacity-45 dark:bg-neutral-950/85 dark:text-neutral-200 dark:hover:bg-neutral-900"
				>
					{candidate.type === "image" ? (
						<Expand size={13} />
					) : candidate.type === "audio" ? (
						<Music2 size={13} />
					) : (
						<PlayCircle size={13} />
					)}
					{getPreviewButtonLabel(candidate)}
				</button>
			</div>

			<div className="space-y-2 p-2">
				<div>
					<div className="line-clamp-2 text-xs font-medium leading-snug text-foreground dark:text-neutral-200">
						{title}
					</div>
					<div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground dark:text-neutral-500">
						<span>{formatDuration(candidate.durationSeconds)}</span>
						<span>{formatResolution(candidate)}</span>
						{candidate.author?.name && <span>{candidate.author.name}</span>}
					</div>
				</div>

				<div className="rounded border border-border/60 bg-background/75 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground dark:border-transparent dark:bg-neutral-900/70 dark:text-neutral-400">
					<div className="font-medium text-foreground dark:text-neutral-300">
						{candidate.license?.name ?? "授权信息未知"}
					</div>
					<div>{licenseDisplay.description}</div>
				</div>

				{candidate.type === "audio" && candidate.previewUrl && (
					<audio
						controls
						src={candidate.previewUrl}
						className="h-8 w-full"
						preload="none"
					>
						<track kind="captions" />
					</audio>
				)}

				{error && (
					<div className="text-[10px] leading-relaxed text-red-300">
						{error}
					</div>
				)}

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleImport}
						disabled={importDisabled}
						className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition-colors ${
							status === "imported"
								? "bg-emerald-600/20 text-emerald-300"
								: status === "error"
									? "bg-red-600/20 text-red-300 hover:bg-red-600/30"
									: "bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500"
						}`}
					>
						{status === "importing" ? (
							<Loader2 size={13} className="animate-spin" />
						) : status === "imported" ? (
							<CheckCircle2 size={13} />
						) : (
							<Download size={13} />
						)}
						{status === "importing"
							? "导入中"
							: status === "imported"
								? "已导入资源库"
								: "导入到资源库"}
					</button>
					{candidate.sourceUrl && (
						<a
							href={candidate.sourceUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
							aria-label="打开素材来源"
							title="打开素材来源"
						>
							<ExternalLink size={13} />
						</a>
					)}
				</div>
			</div>
		</div>
	);
}

function StockMediaPreviewDialog({
	candidate,
	onClose,
}: {
	candidate: StockMediaCandidate;
	onClose: () => void;
}) {
	const title = candidate.title ?? candidate.name ?? "素材预览";
	const previewUrl = candidate.previewUrl ?? candidate.thumbnailUrl;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
			<div className="w-full max-w-4xl overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 shadow-2xl">
				<div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-3 py-2">
					<div className="min-w-0">
						<div className="truncate text-sm font-medium text-neutral-100">
							{title}
						</div>
						<div className="text-[10px] text-neutral-500">
							{formatProvider(candidate.provider)}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex size-8 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
						aria-label="关闭预览"
						title="关闭预览"
					>
						<X size={16} />
					</button>
				</div>
				<div className="bg-black p-3">
					{candidate.type === "image" && previewUrl ? (
						<img
							src={previewUrl}
							alt={title}
							className="max-h-[70vh] w-full object-contain"
						/>
					) : candidate.type === "audio" && previewUrl ? (
						<div className="flex min-h-48 flex-col items-center justify-center gap-4">
							<Music2 size={42} className="text-neutral-500" />
							<audio controls src={previewUrl} className="w-full max-w-xl">
								<track kind="captions" />
							</audio>
						</div>
					) : previewUrl ? (
						<video
							src={previewUrl}
							poster={candidate.thumbnailUrl}
							controls
							autoPlay
							className="max-h-[70vh] w-full bg-black"
						>
							<track kind="captions" />
						</video>
					) : (
						<div className="flex min-h-48 items-center justify-center text-sm text-neutral-500">
							没有可预览的素材地址
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

interface GeneratedImage {
	id?: string;
	title?: string;
	name?: string;
	sizeBytes?: number;
	width?: number;
	height?: number;
	mediaAssetId?: string;
	previewUrl?: string;
	thumbnailUrl?: string;
}

function getGeneratedImages(data: unknown): GeneratedImage[] {
	if (!isRecord(data) || !Array.isArray(data.images)) return [];
	return data.images.filter(isRecord).map((image) => ({
		id: typeof image.id === "string" ? image.id : undefined,
		title: typeof image.title === "string" ? image.title : undefined,
		name: typeof image.name === "string" ? image.name : undefined,
		sizeBytes:
			typeof image.sizeBytes === "number" ? image.sizeBytes : undefined,
		width: typeof image.width === "number" ? image.width : undefined,
		height: typeof image.height === "number" ? image.height : undefined,
		mediaAssetId:
			typeof image.mediaAssetId === "string" ? image.mediaAssetId : undefined,
		previewUrl:
			typeof image.previewUrl === "string" ? image.previewUrl : undefined,
		thumbnailUrl:
			typeof image.thumbnailUrl === "string" ? image.thumbnailUrl : undefined,
	}));
}

function formatBytes(bytes?: number): string {
	if (bytes === undefined) return "";
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

function GeneratedImagesPreview({ data }: { data: unknown }) {
	const images = getGeneratedImages(data);
	if (images.length === 0) return null;

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{images.map((image, index) => {
				const src = image.previewUrl ?? image.thumbnailUrl;
				const label = image.title ?? image.name ?? `生成图片 ${index + 1}`;
				const size = formatBytes(image.sizeBytes);

				return (
					<div
						key={image.id ?? `${label}-${index}`}
						className="overflow-hidden rounded-md border border-border/70 bg-card dark:border-neutral-800 dark:bg-neutral-950"
					>
						<div className="flex aspect-video items-center justify-center bg-muted/60 dark:bg-neutral-950">
							{src ? (
								<img
									src={src}
									alt={label}
									className="h-full w-full object-contain"
								/>
							) : (
								<ImageIcon
									size={24}
									className="text-muted-foreground dark:text-neutral-600"
								/>
							)}
						</div>
						<div className="space-y-0.5 px-2 py-1.5">
							<div className="truncate text-xs font-medium text-foreground dark:text-neutral-200">
								{label}
							</div>
							<div className="text-[10px] text-muted-foreground dark:text-neutral-500">
								{image.width && image.height
									? `${image.width}x${image.height}`
									: "尺寸未知"}
								{size ? ` · ${size}` : ""}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function ImageGenerationLoading() {
	return (
		<div className="overflow-hidden rounded-md border border-border/70 bg-card dark:border-neutral-800 dark:bg-neutral-950">
			<div className="relative aspect-video bg-muted/60 dark:bg-neutral-950">
				<div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_0%,rgba(59,130,246,0.12)_35%,rgba(255,255,255,0.16)_50%,rgba(59,130,246,0.12)_65%,transparent_100%)]" />
				<div className="absolute inset-4 grid grid-cols-3 gap-2 opacity-80">
					<div className="rounded bg-muted-foreground/20 dark:bg-neutral-800/80" />
					<div className="rounded bg-muted-foreground/12 dark:bg-neutral-800/50" />
					<div className="rounded bg-muted-foreground/18 dark:bg-neutral-800/70" />
					<div className="col-span-2 rounded bg-muted-foreground/15 dark:bg-neutral-800/60" />
					<div className="rounded bg-muted-foreground/10 dark:bg-neutral-800/40" />
				</div>
				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 px-3 py-2 dark:from-neutral-950">
					<div className="flex items-center gap-2 text-xs text-foreground dark:text-neutral-300">
						<Loader2
							size={13}
							className="animate-spin text-blue-500 dark:text-blue-400"
						/>
						正在生成图片并保存到资源库
					</div>
				</div>
			</div>
		</div>
	);
}
