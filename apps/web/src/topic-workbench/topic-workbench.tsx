"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
	ArrowRight,
	BookOpenText,
	Check,
	CheckCircle2,
	Clapperboard,
	ExternalLink,
	FileText,
	History,
	LayoutTemplate,
	Lightbulb,
	Plus,
	Radar,
	RefreshCw,
	Search,
	Video,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/utils/ui";
import { CreatorProfileDialogTrigger } from "./creator-profile-dialog";
import { useTopicWorkbenchStore } from "./store";
import { executeTopicWorkbenchTool } from "./tools";
import type {
	ProductionPlan,
	ResearchPlatform,
	TopicCandidate,
	TopicPackageVersion,
	TopicPlatform,
	TopicProject,
	TopicStage,
	VideoStructureOption,
} from "./types";

const STAGES: Array<{
	stage: TopicStage;
	label: string;
	description: string;
	icon: LucideIcon;
}> = [
	{
		stage: "ideation",
		label: "方向生成",
		description: "把想法聊成候选方案",
		icon: Lightbulb,
	},
	{
		stage: "research",
		label: "调研分析",
		description: "搜索同题和资料来源",
		icon: Radar,
	},
	{
		stage: "structure",
		label: "结构设计",
		description: "选择视频叙事模板",
		icon: LayoutTemplate,
	},
	{
		stage: "package",
		label: "选题包",
		description: "交付脚本与发布文案",
		icon: FileText,
	},
	{
		stage: "production",
		label: "制作计划",
		description: "拆解素材、配音和占位",
		icon: Clapperboard,
	},
	{
		stage: "timeline",
		label: "时间线草稿",
		description: "生成可微调草稿",
		icon: Video,
	},
];

const PLATFORM_LABELS: Record<TopicPlatform, string> = {
	bilibili: "B 站",
	youtube: "YouTube",
	xiaohongshu: "小红书",
	douyin: "抖音",
	"video-account": "视频号",
};

const RESEARCH_PLATFORM_LABELS: Record<ResearchPlatform, string> = {
	youtube: "YouTube",
	bilibili: "B 站",
	web: "网页",
	official: "官方",
};

const RESEARCH_PLATFORM_CLASS_NAMES: Record<ResearchPlatform, string> = {
	youtube: "border-red-500/20 bg-red-500/[0.07] text-red-600 dark:text-red-300",
	bilibili:
		"border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-700 dark:text-cyan-300",
	web: "border-blue-500/20 bg-blue-500/[0.07] text-blue-700 dark:text-blue-300",
	official:
		"border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300",
};

const PRODUCTION_VIDEO_TYPE_LABELS: Record<
	ProductionPlan["videoType"],
	string
> = {
	"talking-head": "口播",
	"screen-recording": "录屏演示",
	tutorial: "教程",
	review: "测评",
	vlog: "Vlog",
	explainer: "解释型",
	ad: "投放广告",
};

const PRODUCTION_ASSET_TYPE_LABELS: Record<
	ProductionPlan["requiredAssets"][number]["type"],
	string
> = {
	"user-footage": "真人素材",
	"screen-recording": "录屏",
	broll: "B-roll",
	screenshot: "截图",
	voiceover: "配音",
	subtitle: "字幕",
	mg: "MG 动画",
};

function getStageIndex(stage: TopicStage): number {
	return STAGES.findIndex((item) => item.stage === stage);
}

function formatDate(timestamp: number): string {
	return new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(timestamp));
}

function getActivePackage(project: TopicProject): TopicPackageVersion | null {
	if (project.activePackageVersionId) {
		return (
			project.packageVersions.find(
				(version) => version.id === project.activePackageVersionId,
			) ?? null
		);
	}
	if (
		project.stage === "package" ||
		project.stage === "production" ||
		project.stage === "timeline"
	) {
		return project.packageVersions.at(-1) ?? null;
	}
	return null;
}

function getActiveProductionPlan(project: TopicProject): ProductionPlan | null {
	const productionPlans = project.productionPlans ?? [];
	return (
		productionPlans.find(
			(plan) => plan.id === project.activeProductionPlanId,
		) ??
		productionPlans.at(-1) ??
		null
	);
}

function getStageLabel(stage: TopicStage): string {
	return STAGES.find((item) => item.stage === stage)?.label ?? "选题";
}

function getSelectedCandidate(project: TopicProject): TopicCandidate | null {
	return (
		project.candidates.find(
			(candidate) => candidate.id === project.selectedCandidateId,
		) ?? null
	);
}

function canAccessStage({
	project,
	stage,
}: {
	project: TopicProject;
	stage: TopicStage;
}): boolean {
	if (stage === "ideation") return true;
	if (stage === "research") return project.selectedCandidateId !== null;
	if (stage === "structure") return project.researchSources.length > 0;
	if (stage === "package") {
		return (
			project.structures.length > 0 && project.selectedStructureId !== null
		);
	}
	if (stage === "production") return getActivePackage(project) !== null;
	if (stage === "timeline") return getActiveProductionPlan(project) !== null;
	return false;
}

function buildStageForwardTask({
	project,
	stage,
}: {
	project: TopicProject;
	stage: TopicStage;
}): string {
	const selected = getSelectedCandidate(project);
	const topicText = selected
		? `当前已选题：「${selected.title}」。核心观点：${selected.coreViewpoint}`
		: `当前选题方向：「${project.title}」。`;

	if (stage === "research") {
		return `${topicText}\n请进入调研阶段：搜索 B 站、YouTube 和网页资料，判断是否有人做同类选题、他们的灵感来源和差异化空位。完成后调用 topic_set_research 写入右侧选题工作台。`;
	}
	if (stage === "structure") {
		return `${topicText}\n请进入结构设计阶段：基于当前选题和已有资料，生成 2-4 个视频结构模板。完成后调用 topic_set_structures 写入右侧选题工作台。`;
	}
	if (stage === "package") {
		return `${topicText}\n请进入选题包阶段：基于当前选题、调研和结构，调用 topic_create_package 生成标题、摘要、核心观点、脚本大纲、分段素材建议和发布文案。`;
	}
	if (stage === "production") {
		return `${topicText}\n请进入制作计划阶段：基于当前选题包调用 topic_create_production_plan，拆解视频类型、时间段、素材需求、配音/口播建议和下一步制作动作。`;
	}
	if (stage === "timeline") {
		return `${topicText}\n请先确认制作计划，再把制作计划交给视频 Agent 生成时间线草稿。`;
	}
	return "请重新生成一版候选选题，并调用 topic_set_candidates 写入右侧选题工作台。";
}

function buildStageResetTask({
	project,
	stage,
}: {
	project: TopicProject;
	stage: TopicStage;
}): string {
	if (stage === "ideation") {
		return `我已经在右侧工作台确认要回到选题阶段。请重新理解当前方向「${project.originPrompt || project.title}」，生成新一版候选选题，并调用 topic_set_candidates 写入右侧选题工作台。`;
	}
	if (stage === "research") {
		const selected = getSelectedCandidate(project);
		return `我已经在右侧工作台确认要重新调研。当前选题是「${selected?.title ?? project.title}」。请重新搜索同题内容和资料来源，并调用 topic_set_research 写入右侧选题工作台。`;
	}
	if (stage === "structure") {
		const selected = getSelectedCandidate(project);
		return `我已经在右侧工作台确认要重新设计结构。当前选题是「${selected?.title ?? project.title}」。请生成新的视频结构模板，并调用 topic_set_structures 写入右侧选题工作台。`;
	}
	return buildStageForwardTask({ project, stage });
}

function buildVideoProductionHandoffPrompt({
	project,
	topicPackage,
	productionPlan,
}: {
	project: TopicProject;
	topicPackage: TopicPackageVersion;
	productionPlan?: ProductionPlan | null;
}): string {
	const segmentText = topicPackage.scriptSegments
		.map(
			(segment, index) =>
				`${index + 1}. ${segment.timeRange}｜${segment.content}｜素材建议：${segment.materialSuggestion}`,
		)
		.join("\n");
	const platformText = topicPackage.platformRecommendations
		.map(
			(item) =>
				`${PLATFORM_LABELS[item.platform]}：${item.title}\n${item.description}`,
		)
		.join("\n\n");
	const referenceText = project.researchSources
		.map((source) => `${source.sourceName}｜${source.title}｜${source.url}`)
		.join("\n");
	const productionPlanText = productionPlan
		? `\n制作计划：\n视频类型：${productionPlan.videoType}\n目标平台：${productionPlan.targetPlatform.join("、")}\n预估时长：${productionPlan.estimatedDurationMinutes} 分钟\n素材需求：${productionPlan.requiredAssets.map((asset) => `${asset.optional ? "可选" : "必需"} ${asset.type}：${asset.description}`).join("\n")}\n制作分段：\n${productionPlan.segments.map((segment, index) => `${index + 1}. ${segment.timeRange}｜${segment.goal}｜视觉：${segment.visualNeed}｜剪辑：${segment.editSuggestion}`).join("\n")}`
		: "";

	return `请接手这个选题包，进入视频制作流程。请基于下列内容自动规划占位素材、口播/配音建议、可做 MG 动画的位置和剪辑结构，先给出制作方案，再等待我确认是否执行。

标题：${topicPackage.title}
摘要：${topicPackage.summary}
核心观点：${topicPackage.coreViewpoint}
受众：${topicPackage.audienceAnalysis}
预期时长：${topicPackage.durationMinutes} 分钟
选题缘由：${topicPackage.rationale}

脚本大纲：
${topicPackage.outline.join("\n")}

时间段、内容与素材建议：
${segmentText}

发布文案：
${platformText}

封面建议：
${topicPackage.coverIdeas.join("\n")}

参考资料：
${referenceText || "暂无资料，请先根据选题包做占位制作规划。"}${productionPlanText}`;
}

export function TopicWorkbench({
	editorProjectId,
}: {
	editorProjectId: string;
}) {
	const activeProject = useTopicWorkbenchStore((state) =>
		state.getActiveTopicProject(),
	);
	const [pendingResetStage, setPendingResetStage] = useState<TopicStage | null>(
		null,
	);
	const setActiveEditorProject = useTopicWorkbenchStore(
		(state) => state.setActiveEditorProject,
	);
	const emitAgentEvent = useTopicWorkbenchStore(
		(state) => state.emitAgentEvent,
	);

	useEffect(() => {
		setActiveEditorProject({ editorProjectId });
	}, [editorProjectId, setActiveEditorProject]);

	if (!activeProject) {
		return (
			<div className="size-full rounded-sm border border-border/70 bg-background" />
		);
	}

	const handleStageClick = (stage: TopicStage) => {
		if (stage === activeProject.stage) return;
		const targetIndex = getStageIndex(stage);
		const activeIndex = getStageIndex(activeProject.stage);
		if (targetIndex < activeIndex) {
			setPendingResetStage(stage);
			return;
		}
		if (!canAccessStage({ project: activeProject, stage })) return;
		emitAgentEvent({
			editorProjectId,
			source: "stage-forward",
			autoRun: true,
			content: buildStageForwardTask({ project: activeProject, stage }),
		});
	};

	const handleConfirmStageReset = () => {
		if (!pendingResetStage) return;
		executeTopicWorkbenchTool({
			toolName: "topic_reset_to_stage",
			editorProjectId,
			params: { stage: pendingResetStage },
		});
		emitAgentEvent({
			editorProjectId,
			source: "stage-reset",
			autoRun: true,
			content: buildStageResetTask({
				project: activeProject,
				stage: pendingResetStage,
			}),
		});
		setPendingResetStage(null);
	};

	return (
		<div className="flex size-full min-h-0 min-w-0 flex-col overflow-hidden rounded-sm border border-border/70 bg-background">
			<TopicWorkbenchHeader project={activeProject} />
			<div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
				<div className="min-h-full min-w-0 space-y-3 p-3">
					<VersionSummaryBar project={activeProject} />
					<StageProgress
						project={activeProject}
						onStageClick={handleStageClick}
					/>
					<CandidatesSection
						project={activeProject}
						onRequestStageReset={(stage) => setPendingResetStage(stage)}
					/>
					<ResearchSection project={activeProject} />
					<StructureSection project={activeProject} />
					<PackageSection project={activeProject} />
					<ProductionPlanSection project={activeProject} />
				</div>
			</div>
			<StageResetDialog
				stage={pendingResetStage}
				onOpenChange={(open) => {
					if (!open) setPendingResetStage(null);
				}}
				onConfirm={handleConfirmStageReset}
			/>
		</div>
	);
}

function StageResetDialog({
	stage,
	onOpenChange,
	onConfirm,
}: {
	stage: TopicStage | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	const label = stage ? getStageLabel(stage) : "上一步";
	const description =
		stage === "ideation"
			? "确认后，当前候选、资料、结构、当前选题包指针和制作计划会被清空，任务会发送给左侧子 Agent 从选题阶段重新生成；历史版本仍会保留在版本管理里。"
			: "确认后，当前阶段之后的临时结果会被清空，任务会发送给左侧子 Agent 重新处理，并通过工作台工具写回新的结果。已有选题包版本会保留，方便回看。";

	return (
		<AlertDialog open={stage !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent className="rounded-sm">
				<AlertDialogHeader>
					<AlertDialogTitle>确定回到{label}阶段？</AlertDialogTitle>
					<AlertDialogDescription className="leading-6">
						{description}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						确认重新处理
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function TopicWorkbenchHeader({ project }: { project: TopicProject }) {
	return (
		<header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/70 bg-card/[0.58] px-4 py-2 backdrop-blur dark:bg-background/95">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<h1 className="truncate text-base font-semibold tracking-normal text-foreground">
						选题工作台
					</h1>
					<span className="rounded-sm border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[0.68rem] font-medium text-emerald-700 dark:text-emerald-300">
						{project.status === "ready-for-video" ? "可进入制作" : "MVP"}
					</span>
				</div>
				<p className="truncate text-xs text-muted-foreground">
					{project.title} · 更新于 {formatDate(project.updatedAt)}
				</p>
			</div>
			<CreatorProfileDialogTrigger />
		</header>
	);
}

function VersionSummaryBar({ project }: { project: TopicProject }) {
	const setActivePackageVersion = useTopicWorkbenchStore(
		(state) => state.setActivePackageVersion,
	);
	const createPackageVersion = useTopicWorkbenchStore(
		(state) => state.createPackageVersion,
	);
	const activePackage = getActivePackage(project);
	const canCreateVersion =
		project.stage === "package" && activePackage !== null;

	return (
		<section className="rounded-sm border border-border/75 bg-card/[0.38] p-3 dark:bg-cyan-300/[0.03]">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<History size={15} />
						版本管理
					</div>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						过程数据会自动落库；重新生成会保留历史版本，方便回到旧方案。
					</p>
				</div>
				<div className="grid min-w-72 grid-cols-5 gap-2 max-[720px]:w-full max-[720px]:min-w-0 max-[720px]:grid-cols-2">
					<Metric label="候选" value={project.candidates.length} />
					<Metric label="资料" value={project.researchSources.length} />
					<Metric label="结构" value={project.structures.length} />
					<Metric label="版本" value={project.packageVersions.length} />
					<Metric label="制作" value={(project.productionPlans ?? []).length} />
				</div>
			</div>
			<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
				{project.packageVersions.length === 0 ? (
					<div className="min-w-72 rounded-sm border border-dashed border-border/75 bg-background/55 px-3 py-2 text-xs leading-5 text-muted-foreground">
						选题包生成后会出现在这里。
					</div>
				) : (
					project.packageVersions
						.toSorted((a, b) => b.createdAt - a.createdAt)
						.map((version) => (
							<button
								key={version.id}
								type="button"
								onClick={() =>
									setActivePackageVersion({ versionId: version.id })
								}
								className={cn(
									"min-w-56 rounded-sm border px-3 py-2 text-left transition-colors",
									version.id === activePackage?.id
										? "border-primary/35 bg-primary/[0.07]"
										: "border-border/75 bg-background/60 hover:bg-accent",
								)}
							>
								<div className="flex items-center justify-between gap-2">
									<div className="text-sm font-semibold text-foreground">
										{version.versionName}
									</div>
									<div className="text-xs text-muted-foreground">
										{formatDate(version.createdAt)}
									</div>
								</div>
								<div className="mt-1 line-clamp-1 text-xs leading-4 text-muted-foreground">
									{version.title}
								</div>
							</button>
						))
				)}
				<Button
					size="sm"
					variant="outline"
					disabled={!canCreateVersion}
					onClick={createPackageVersion}
					className="min-h-14 shrink-0 self-stretch"
					title="基于当前激活选题包复制一个独立新版本"
				>
					<Plus size={14} />
					新版本
				</Button>
			</div>
		</section>
	);
}

function StageProgress({
	project,
	onStageClick,
}: {
	project: TopicProject;
	onStageClick: (stage: TopicStage) => void;
}) {
	const activeIndex = getStageIndex(project.stage);

	return (
		<section className="rounded-sm border border-border/75 bg-card/[0.42] p-3 dark:bg-cyan-300/[0.03]">
			<div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr))]">
				{STAGES.map(({ stage, label, description, icon: Icon }, index) => {
					const isActive = project.stage === stage;
					const isComplete = index < activeIndex;
					const isAccessible = canAccessStage({ project, stage });
					return (
						<button
							type="button"
							key={stage}
							disabled={!isAccessible}
							title={
								isAccessible ? undefined : "等待前置步骤完成后再进入这一阶段"
							}
							onClick={() => onStageClick(stage)}
							className={cn(
								"flex min-h-16 items-start gap-2 rounded-sm border px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border/65 disabled:hover:bg-background/55",
								isActive
									? "border-primary/30 bg-primary/[0.08]"
									: isComplete
										? "border-emerald-500/20 bg-emerald-500/[0.06]"
										: "border-border/65 bg-background/55",
							)}
						>
							<div
								className={cn(
									"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm",
									isComplete
										? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
										: "bg-muted text-muted-foreground",
									isActive && "bg-primary/15 text-primary",
								)}
							>
								{isComplete ? <CheckCircle2 size={15} /> : <Icon size={15} />}
							</div>
							<div className="min-w-0">
								<div className="text-sm font-semibold text-foreground">
									{label}
								</div>
								<div className="mt-0.5 text-xs leading-4 text-muted-foreground">
									{description}
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</section>
	);
}

function CandidatesSection({
	project,
	onRequestStageReset,
}: {
	project: TopicProject;
	onRequestStageReset: (stage: TopicStage) => void;
}) {
	const emitAgentEvent = useTopicWorkbenchStore(
		(state) => state.emitAgentEvent,
	);
	const [evidenceCandidate, setEvidenceCandidate] =
		useState<TopicCandidate | null>(null);
	const hasSelection = project.selectedCandidateId !== null;
	const canInteract = project.stage === "ideation";
	const selectedCandidate = getSelectedCandidate(project);

	const handleSelectCandidate = (candidate: TopicCandidate) => {
		if (!canInteract) return;
		executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: project.editorProjectId,
			params: {
				candidateId: candidate.id,
				advance: false,
			},
		});
	};

	const handleConfirmCandidate = () => {
		if (!selectedCandidate) return;
		executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: project.editorProjectId,
			params: {
				candidateId: selectedCandidate.id,
				advance: true,
			},
		});
		emitAgentEvent({
			editorProjectId: project.editorProjectId,
			source: "candidate-confirm",
			autoRun: true,
			content: `我已经在右侧确认选题「${selectedCandidate.title}」。请搜索 B 站、YouTube 和网页资料，判断是否有人做同类选题、他们的灵感来源和差异化空位。完成后调用 topic_set_research 写入右侧选题工作台。`,
		});
	};

	const handleAskAdjust = (candidate: TopicCandidate) => {
		if (!canInteract) return;
		emitAgentEvent({
			editorProjectId: project.editorProjectId,
			source: "candidate-adjust",
			autoRun: false,
			content: `请基于候选选题「${candidate.title}」做一版调整。当前摘要：${candidate.summary}。当前核心观点：${candidate.coreViewpoint}。请先和我确认调整方向，完成后调用 topic_set_candidates 刷新右侧候选方案。`,
		});
	};

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={Lightbulb}
				title="候选选题"
				description="Agent 聊出来的方向会先在这里变成可查看、可选择的方案。"
				action={
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							if (
								project.candidates.length > 0 ||
								project.stage !== "ideation"
							) {
								onRequestStageReset("ideation");
								return;
							}
							emitAgentEvent({
								editorProjectId: project.editorProjectId,
								source: "stage-reset",
								autoRun: true,
								content: `请基于当前方向「${project.originPrompt || project.title}」重新生成一版候选选题，并调用 topic_set_candidates 写入右侧选题工作台。`,
							});
						}}
					>
						<RefreshCw size={14} />
						新版
					</Button>
				}
			/>
			<div className="mt-3 space-y-2">
				{project.candidates.length === 0 ? (
					<div className="rounded-sm border border-dashed border-border/75 bg-muted/[0.18] p-4 text-sm leading-6 text-muted-foreground">
						等待左侧 Agent 生成新的候选选题后写入这里。
					</div>
				) : null}
				{project.candidates.map((candidate, index) => (
					<CandidateCard
						key={candidate.id}
						candidate={candidate}
						index={index}
						canInteract={canInteract}
						isSelected={candidate.id === project.selectedCandidateId}
						onSelect={() => handleSelectCandidate(candidate)}
						onAskAdjust={() => handleAskAdjust(candidate)}
						onShowEvidence={() => setEvidenceCandidate(candidate)}
					/>
				))}
			</div>
			<div className="mt-3 flex justify-end">
				<Button
					size="sm"
					disabled={!hasSelection || !canInteract}
					onClick={handleConfirmCandidate}
				>
					确认选题并进入资料汇总
					<ArrowRight size={14} />
				</Button>
			</div>
			<AlertDialog
				open={evidenceCandidate !== null}
				onOpenChange={(open) => {
					if (!open) setEvidenceCandidate(null);
				}}
			>
				<AlertDialogContent className="rounded-sm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{evidenceCandidate?.title ?? "选题依据"}
						</AlertDialogTitle>
						<AlertDialogDescription className="space-y-3 leading-6">
							<span className="block">
								{evidenceCandidate?.rationale ?? "Agent 暂未写入依据。"}
							</span>
							{evidenceCandidate?.risks.length ? (
								<span className="block">
									<span className="font-semibold text-foreground">
										风险提示：
									</span>
									{evidenceCandidate.risks.join("；")}
								</span>
							) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction onClick={() => setEvidenceCandidate(null)}>
							知道了
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}

function CandidateCard({
	candidate,
	index,
	canInteract,
	isSelected,
	onSelect,
	onAskAdjust,
	onShowEvidence,
}: {
	candidate: TopicCandidate;
	index: number;
	canInteract: boolean;
	isSelected: boolean;
	onSelect: () => void;
	onAskAdjust: () => void;
	onShowEvidence: () => void;
}) {
	return (
		<article
			className={cn(
				"min-w-0 rounded-sm border p-3 transition-colors",
				isSelected
					? "border-primary/40 bg-primary/[0.06]"
					: "border-border/75 bg-muted/[0.22] hover:border-primary/25",
			)}
		>
			<div className="grid gap-3 [grid-template-columns:auto_minmax(0,1fr)_auto] max-[820px]:grid-cols-[auto_minmax(0,1fr)]">
				<div className="flex items-start gap-2">
					<button
						type="button"
						disabled={!canInteract}
						onClick={onSelect}
						className={cn(
							"mt-1 flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
							isSelected
								? "border-primary bg-primary text-primary-foreground"
								: "border-border/75 bg-background text-transparent",
						)}
						aria-label={`选择候选选题 ${candidate.title}`}
					>
						<Check size={13} />
					</button>
					<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-background text-xs font-semibold text-muted-foreground">
						{index + 1}
					</span>
				</div>
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs font-medium text-muted-foreground">
							{isSelected ? "已选中" : "候选方案"}
						</span>
						<div className="flex shrink-0 flex-wrap gap-1 min-[821px]:hidden">
							{candidate.platforms.map((platform) => (
								<span
									key={platform}
									className="rounded-sm border border-border/70 bg-background px-1.5 py-0.5 text-[0.68rem] text-muted-foreground"
								>
									{PLATFORM_LABELS[platform]}
								</span>
							))}
						</div>
					</div>
					<h3 className="mt-2 text-sm font-semibold leading-5 text-foreground">
						{candidate.title}
					</h3>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						{candidate.summary}
					</p>
					<div className="mt-2 rounded-sm border border-border/65 bg-background/55 px-2 py-1.5 text-xs leading-5 text-foreground">
						{candidate.coreViewpoint}
					</div>
					<div className="mt-2 text-xs leading-5 text-muted-foreground">
						{candidate.durationMinutes} 分钟 · {candidate.audience}
					</div>
				</div>
				<div className="flex max-w-full shrink-0 flex-wrap items-start justify-end gap-1 max-[820px]:col-start-2 max-[820px]:justify-start">
					{candidate.platforms.map((platform) => (
						<span
							key={platform}
							className="hidden rounded-sm border border-border/70 bg-background px-1.5 py-0.5 text-[0.68rem] text-muted-foreground min-[821px]:inline-flex"
						>
							{PLATFORM_LABELS[platform]}
						</span>
					))}
					<Button
						size="sm"
						variant={isSelected ? "default" : "outline"}
						disabled={!canInteract}
						onClick={onSelect}
					>
						{isSelected ? "已选择" : "选择这个"}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={!canInteract}
						onClick={onAskAdjust}
					>
						让 Agent 调整
					</Button>
					<Button size="sm" variant="ghost" onClick={onShowEvidence}>
						查看依据
					</Button>
				</div>
			</div>
		</article>
	);
}

function ResearchSection({ project }: { project: TopicProject }) {
	const emitAgentEvent = useTopicWorkbenchStore(
		(state) => state.emitAgentEvent,
	);
	const hasSelection = project.selectedCandidateId !== null;
	const hasResearchSources = project.researchSources.length > 0;
	const canShow =
		project.stage !== "ideation" || project.researchSources.length > 0;
	const selectedCandidate = getSelectedCandidate(project);

	if (!canShow) return null;

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={Radar}
				title="同题雷达与资料汇总"
				description="先判断 B 站、YouTube 和网页资料里有哪些相似选题，再找差异化切口。"
				action={
					<Button
						size="sm"
						variant="outline"
						disabled={!hasSelection || !hasResearchSources}
						onClick={() =>
							emitAgentEvent({
								editorProjectId: project.editorProjectId,
								source: "stage-forward",
								autoRun: true,
								content: `请重新调研当前选题「${selectedCandidate?.title ?? project.title}」。重点搜索 B 站、YouTube 和网页资料，判断同类选题、灵感来源和差异化空位，并调用 topic_set_research 写入右侧工作台。`,
							})
						}
					>
						<Search size={14} />
						重新调研
					</Button>
				}
			/>
			<div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
				{project.researchSources.length === 0 ? (
					<div className="col-span-full rounded-sm border border-dashed border-border/75 bg-muted/[0.18] p-4 text-sm leading-6 text-muted-foreground">
						等待 Agent 检索 B 站、YouTube 和网页资料后写入这里。
					</div>
				) : null}
				{project.researchSources.map((source) => (
					<a
						key={source.id}
						href={source.url}
						target="_blank"
						rel="noreferrer"
						className="rounded-sm border border-border/75 bg-muted/[0.22] p-3 transition-colors hover:border-primary/30 hover:bg-accent"
					>
						<div className="flex items-center justify-between gap-2">
							<span
								className={cn(
									"rounded-sm border px-1.5 py-0.5 text-[0.68rem] font-semibold",
									RESEARCH_PLATFORM_CLASS_NAMES[source.platform],
								)}
							>
								{RESEARCH_PLATFORM_LABELS[source.platform]}
							</span>
							<ExternalLink size={13} className="text-muted-foreground" />
						</div>
						<div className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
							{source.title}
						</div>
						<p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
							{source.angle}
						</p>
						<p className="mt-2 text-xs leading-5 text-muted-foreground">
							{source.whyRelevant}
						</p>
					</a>
				))}
			</div>
			<div className="mt-3 flex justify-end">
				<Button
					size="sm"
					disabled={!hasResearchSources}
					onClick={() =>
						emitAgentEvent({
							editorProjectId: project.editorProjectId,
							source: "stage-forward",
							autoRun: true,
							content: `请基于右侧当前选题「${selectedCandidate?.title ?? project.title}」和已有调研资料，生成 2-4 个视频结构模板，并调用 topic_set_structures 写入右侧工作台。`,
						})
					}
				>
					生成结构模板
					<ArrowRight size={14} />
				</Button>
			</div>
		</section>
	);
}

function StructureSection({ project }: { project: TopicProject }) {
	const [isPackageConfirmOpen, setPackageConfirmOpen] = useState(false);
	const selectStructureAction = useTopicWorkbenchStore(
		(state) => state.selectStructure,
	);
	const selectedStructure = project.structures.find(
		(structure) => structure.id === project.selectedStructureId,
	);

	if (project.stage === "ideation" || project.stage === "research") return null;

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={LayoutTemplate}
				title="视频结构模板"
				description="选题确定后，先选择叙事结构，再进入脚本和发布包。"
			/>
			<div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))]">
				{project.structures.map((structure) => (
					<StructureCard
						key={structure.id}
						structure={structure}
						isSelected={structure.id === project.selectedStructureId}
						onSelect={() => {
							selectStructureAction({ structureId: structure.id });
						}}
					/>
				))}
			</div>
			<div className="mt-3 flex justify-end">
				<Button
					size="sm"
					disabled={!project.selectedStructureId}
					onClick={() => setPackageConfirmOpen(true)}
				>
					生成选题包
					<ArrowRight size={14} />
				</Button>
			</div>
			<AlertDialog
				open={isPackageConfirmOpen}
				onOpenChange={setPackageConfirmOpen}
			>
				<AlertDialogContent className="rounded-sm">
					<AlertDialogHeader>
						<AlertDialogTitle>确认生成选题包？</AlertDialogTitle>
						<AlertDialogDescription className="leading-6">
							系统会基于当前选题、资料和
							{selectedStructure ? `「${selectedStructure.name}」` : "已选结构"}
							生成脚本大纲、分段内容、素材建议和发布文案。生成后可通过左侧 Agent
							调整并产出新版本。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								executeTopicWorkbenchTool({
									toolName: "topic_create_package",
									editorProjectId: project.editorProjectId,
									params: {},
								});
								setPackageConfirmOpen(false);
							}}
						>
							确认生成
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}

function StructureCard({
	structure,
	isSelected,
	onSelect,
}: {
	structure: VideoStructureOption;
	isSelected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"min-w-0 rounded-sm border p-3 text-left transition-colors",
				isSelected
					? "border-primary/40 bg-primary/[0.06]"
					: "border-border/75 bg-muted/[0.22] hover:border-primary/25",
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div>
					<div className="text-sm font-semibold text-foreground">
						{structure.name}
					</div>
					<div className="mt-1 text-xs leading-5 text-muted-foreground">
						{structure.bestFor}
					</div>
				</div>
				{isSelected ? (
					<CheckCircle2 size={17} className="shrink-0 text-primary" />
				) : null}
			</div>
			<div className="mt-3 space-y-2">
				{structure.flow.map((step, index) => (
					<div key={`${step.label}-${index}`} className="flex gap-2">
						<div className="flex flex-col items-center">
							<span className="flex size-6 items-center justify-center rounded-sm bg-background text-[0.68rem] font-semibold text-muted-foreground">
								{index + 1}
							</span>
							{index < structure.flow.length - 1 ? (
								<span className="h-5 w-px bg-border" />
							) : null}
						</div>
						<div className="min-w-0 pb-1">
							<div className="text-xs font-semibold text-foreground">
								{step.label}
							</div>
							<div className="mt-0.5 text-xs leading-4 text-muted-foreground">
								{step.description}
							</div>
						</div>
					</div>
				))}
			</div>
		</button>
	);
}

function PackageSection({ project }: { project: TopicProject }) {
	const activePackage = getActivePackage(project);
	if (!activePackage) return null;
	const activeProductionPlan = getActiveProductionPlan(project);

	const handleCreateProductionPlan = () => {
		executeTopicWorkbenchTool({
			toolName: "topic_create_production_plan",
			editorProjectId: project.editorProjectId,
			params: {},
		});
	};

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={BookOpenText}
				title="完整选题包"
				description="这里会成为后续视频制作流程的输入：脚本、素材表、封面和发布文案。"
			/>
			<div className="mt-3 grid gap-3 [grid-template-columns:minmax(0,1fr)_minmax(17rem,0.9fr)] max-[980px]:grid-cols-1">
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<div className="text-xs font-semibold text-muted-foreground">
						标题
					</div>
					<h3 className="mt-1 text-base font-semibold leading-6 tracking-normal text-foreground">
						{activePackage.title}
					</h3>
					<div className="mt-3 text-xs font-semibold text-muted-foreground">
						摘要
					</div>
					<p className="mt-1 text-sm leading-6 text-muted-foreground">
						{activePackage.summary}
					</p>
					<div className="mt-3 rounded-sm border border-border/70 bg-background px-3 py-2 text-sm leading-6">
						<div className="font-semibold text-foreground">核心观点</div>
						<p className="mt-1 text-muted-foreground">
							{activePackage.coreViewpoint}
						</p>
					</div>
					<div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
						<div className="rounded-sm border border-border/70 bg-background px-2 py-2">
							<div className="text-xs font-semibold text-muted-foreground">
								受众分析
							</div>
							<p className="mt-1 text-xs leading-5 text-muted-foreground">
								{activePackage.audienceAnalysis}
							</p>
						</div>
						<div className="rounded-sm border border-border/70 bg-background px-2 py-2">
							<div className="text-xs font-semibold text-muted-foreground">
								选题缘由
							</div>
							<p className="mt-1 text-xs leading-5 text-muted-foreground">
								{activePackage.rationale}
							</p>
						</div>
					</div>
					<div className="mt-3">
						<div className="text-sm font-semibold text-foreground">
							脚本结构
						</div>
						<ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
							{activePackage.outline.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				</div>
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Check size={14} className="text-primary" />
						发布文案与封面
					</div>
					<div className="mt-2 space-y-2">
						{activePackage.platformRecommendations.map((item) => (
							<div
								key={`${item.platform}-${item.title}`}
								className="rounded-sm border border-border/70 bg-background px-2 py-2"
							>
								<div className="flex items-center justify-between gap-2">
									<div className="text-xs font-semibold text-foreground">
										{PLATFORM_LABELS[item.platform]}
									</div>
									<span className="text-[0.68rem] text-muted-foreground">
										标题建议
									</span>
								</div>
								<div className="mt-1 text-xs font-semibold leading-5 text-foreground">
									{item.title}
								</div>
								<p className="mt-1 text-xs leading-5 text-muted-foreground">
									{item.description}
								</p>
							</div>
						))}
					</div>
					<div className="mt-3 text-xs font-semibold text-foreground">
						封面建议
					</div>
					<ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
						{activePackage.coverIdeas.map((idea) => (
							<li key={idea}>{idea}</li>
						))}
					</ul>
				</div>
			</div>
			<div className="mt-3 rounded-sm border border-border/75 bg-muted/[0.18] p-3">
				<div className="text-sm font-semibold text-foreground">
					时间段内容与素材建议
				</div>
				<div className="mt-2 space-y-2">
					{activePackage.scriptSegments.map((segment, index) => (
						<ScriptSegmentViewRow
							key={`${activePackage.id}-${index}`}
							index={index}
							segment={segment}
						/>
					))}
				</div>
			</div>
			<div className="mt-3 flex justify-end">
				<Button size="sm" onClick={handleCreateProductionPlan}>
					{activeProductionPlan ? "重新生成制作计划" : "制作视频"}
					<ArrowRight size={14} />
				</Button>
			</div>
		</section>
	);
}

function ProductionPlanSection({ project }: { project: TopicProject }) {
	const activePackage = getActivePackage(project);
	const activeProductionPlan = getActiveProductionPlan(project);
	const setActiveWorkbench = useTopicWorkbenchStore(
		(state) => state.setActiveWorkbench,
	);
	const emitAgentEvent = useTopicWorkbenchStore(
		(state) => state.emitAgentEvent,
	);
	if (!activePackage || !activeProductionPlan) return null;

	const handleHandoff = (action: string) => {
		setActiveWorkbench({ mode: "video" });
		emitAgentEvent({
			editorProjectId: project.editorProjectId,
			source: "handoff-video",
			autoRun: true,
			content: `${buildVideoProductionHandoffPrompt({
				project,
				topicPackage: activePackage,
				productionPlan: activeProductionPlan,
			})}\n\n本次优先动作：${action}`,
		});
	};

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={Clapperboard}
				title="视频制作计划"
				description="把选题包转成剪辑 Agent 可执行的素材、配音和占位计划。"
			/>
			<div className="mt-3 grid gap-3 [grid-template-columns:minmax(0,0.85fr)_minmax(0,1.15fr)] max-[980px]:grid-cols-1">
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-sm border border-primary/20 bg-primary/[0.08] px-2 py-1 text-xs font-semibold text-primary">
							{PRODUCTION_VIDEO_TYPE_LABELS[activeProductionPlan.videoType]}
						</span>
						<span className="text-xs text-muted-foreground">
							约 {activeProductionPlan.estimatedDurationMinutes} 分钟
						</span>
					</div>
					<div className="mt-3 text-sm font-semibold text-foreground">
						素材需求
					</div>
					<div className="mt-2 space-y-2">
						{activeProductionPlan.requiredAssets.map((asset, index) => (
							<div
								key={`${asset.type}-${index}`}
								className="rounded-sm border border-border/70 bg-background px-2 py-2"
							>
								<div className="flex items-center justify-between gap-2">
									<div className="text-xs font-semibold text-foreground">
										{PRODUCTION_ASSET_TYPE_LABELS[asset.type]}
									</div>
									<span className="text-[0.68rem] text-muted-foreground">
										{asset.optional ? "可选" : "必需"}
									</span>
								</div>
								<p className="mt-1 text-xs leading-5 text-muted-foreground">
									{asset.description}
								</p>
							</div>
						))}
					</div>
				</div>
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<div className="text-sm font-semibold text-foreground">
						分段制作建议
					</div>
					<div className="mt-2 space-y-2">
						{activeProductionPlan.segments.map((segment, index) => (
							<div
								key={`${activeProductionPlan.id}-${index}`}
								className="grid gap-2 rounded-sm border border-border/70 bg-background px-3 py-2 [grid-template-columns:7.5rem_minmax(0,1fr)] max-[760px]:grid-cols-1"
							>
								<div className="text-xs font-semibold text-primary">
									{segment.timeRange}
								</div>
								<div className="min-w-0">
									<div className="text-sm font-semibold leading-5 text-foreground">
										{segment.goal}
									</div>
									<p className="mt-1 text-xs leading-5 text-muted-foreground">
										{segment.script}
									</p>
									<p className="mt-1 text-xs leading-5 text-muted-foreground">
										素材：{segment.assetSuggestion}
									</p>
									<p className="mt-1 text-xs leading-5 text-muted-foreground">
										剪辑：{segment.editSuggestion}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap justify-end gap-2">
				{activeProductionPlan.nextActions.map((action) => (
					<Button
						key={action}
						size="sm"
						variant={action === "生成时间线草稿" ? "default" : "outline"}
						onClick={() => handleHandoff(action)}
					>
						{action}
						<ArrowRight size={14} />
					</Button>
				))}
			</div>
		</section>
	);
}

function ScriptSegmentViewRow({
	segment,
	index,
}: {
	segment: TopicPackageVersion["scriptSegments"][number];
	index: number;
}) {
	return (
		<div className="grid gap-2 rounded-sm border border-border/70 bg-background px-3 py-2 [grid-template-columns:8rem_minmax(0,1.1fr)_minmax(0,0.9fr)] max-[940px]:grid-cols-1">
			<div>
				<div className="text-[0.68rem] font-semibold text-muted-foreground">
					时间段 {index + 1}
				</div>
				<div className="mt-1 rounded-sm border border-primary/20 bg-primary/[0.06] px-2 py-1.5 text-xs font-semibold text-primary">
					{segment.timeRange}
				</div>
			</div>
			<div>
				<div className="text-[0.68rem] font-semibold text-muted-foreground">
					内容
				</div>
				<p className="mt-1 text-sm leading-5 text-foreground">
					{segment.content}
				</p>
			</div>
			<div>
				<div className="text-[0.68rem] font-semibold text-muted-foreground">
					素材建议
				</div>
				<p className="mt-1 text-xs leading-5 text-muted-foreground">
					{segment.materialSuggestion}
				</p>
			</div>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-sm border border-border/65 bg-muted/[0.24] px-2 py-2">
			<div className="text-[0.68rem] text-muted-foreground">{label}</div>
			<div className="mt-1 text-base font-semibold text-foreground">
				{value}
			</div>
		</div>
	);
}

function SectionHeading({
	icon: Icon,
	title,
	description,
	action,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="flex min-w-0 items-start gap-2">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/[0.08] text-primary">
					<Icon size={16} />
				</div>
				<div className="min-w-0">
					<h2 className="text-sm font-semibold tracking-normal text-foreground">
						{title}
					</h2>
					<p className="mt-0.5 text-xs leading-5 text-muted-foreground">
						{description}
					</p>
				</div>
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}
