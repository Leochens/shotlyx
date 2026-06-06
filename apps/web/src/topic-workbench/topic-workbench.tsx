"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent,
	type ReactNode,
	type Ref,
} from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { EditorContent, useEditor as useTiptapEditor } from "@tiptap/react";
import {
	ArrowRight,
	BookOpenText,
	Bold,
	BrainCircuit,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clapperboard,
	Eye,
	EyeOff,
	ExternalLink,
	FileText,
	History,
	Heading2,
	ImagePlus,
	Italic,
	LayoutTemplate,
	Lightbulb,
	List,
	ListOrdered,
	Loader2,
	Pencil,
	Plus,
	Quote,
	Radar,
	RefreshCw,
	Search,
	Table2,
	Trash2,
	Upload,
	Video,
	X,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import type { MediaAsset } from "@/media/types";
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
import {
	createDraftTiptapExtensions,
	extractDraftUploadFiles,
	draftMarkdownToTiptapHtml,
	getDraftTiptapMarkdown,
	insertUploadedAssetsIntoTiptap,
} from "./draft-markdown";
import {
	ensureTopicScriptTableMetadata,
	ensureTopicScriptTableRows,
	getTopicProjectMode,
} from "./model";
import { useTopicWorkbenchStore } from "./store";
import { executeTopicWorkbenchTool } from "./tools";
import type {
	ProductionPlan,
	ResearchInsight,
	ResearchPlatform,
	TopicCandidate,
	TopicPackageVersion,
	TopicPlatform,
	TopicProject,
	TopicScriptTableAsset,
	TopicScriptTableRow,
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

type TopicWorkbenchSectionId =
	| "inputMaterials"
	| "ideation"
	| "research"
	| "structure"
	| "package"
	| "production";

type BrainstormWorkspaceTab = "draft" | "script-table";

type CollapsedSections = Record<TopicWorkbenchSectionId, boolean>;

const DEFAULT_COLLAPSED_SECTIONS: CollapsedSections = {
	inputMaterials: false,
	ideation: false,
	research: false,
	structure: false,
	package: false,
	production: false,
};

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

const INPUT_MATERIAL_KIND_LABELS: Record<
	TopicProject["inputMaterials"][number]["kind"],
	string
> = {
	"uploaded-media": "上传素材",
	script: "脚本",
	"screen-recording": "录屏",
	note: "备注",
};

const SCRIPT_TABLE_AUTO_TIME_LABEL = "由 Agent 自动估算时间";
const SCRIPT_TABLE_GRID_CLASS =
	"[grid-template-columns:7.5rem_minmax(13rem,0.86fr)_minmax(14rem,0.94fr)_minmax(13rem,0.84fr)_2.75rem]";

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

function buildInputMaterialContext(project: TopicProject): string {
	const materials = project.inputMaterials ?? [];
	if (materials.length === 0) return "";

	const materialLines = materials.map((material, index) => {
		const meta = [
			INPUT_MATERIAL_KIND_LABELS[material.kind],
			material.mediaType,
			material.durationSeconds
				? `${Math.round(material.durationSeconds)} 秒`
				: null,
		]
			.filter(Boolean)
			.join(" / ");
		const summary = material.summary?.trim() || "用户提供的选题素材。";
		const content = material.content?.trim()
			? `\n内容摘录：${material.content.trim().slice(0, 1200)}`
			: "";
		return `${index + 1}. ${material.title}（${meta || "素材"}）\n摘要：${summary}${content}`;
	});

	return `\n\n用户提供素材上下文：\n${materialLines.join("\n")}`;
}

function hasScriptTableRowContent(row: TopicScriptTableRow): boolean {
	return Boolean(
		row.timeRange.trim() ||
			row.copy.trim() ||
			row.visualContent.trim() ||
			row.assets.length > 0,
	);
}

function formatScriptTableAssetReference(
	asset: TopicScriptTableAsset | null,
): string {
	if (!asset) return "未填写";
	const meta = asset.mediaType ? ` / ${asset.mediaType}` : "";
	return `${asset.name}${meta}（${asset.mediaAssetId}）`;
}

function hasScriptTableMetadataContent(project: TopicProject): boolean {
	const metadata = ensureTopicScriptTableMetadata({
		metadata: project.scriptTableMetadata,
	});
	return Boolean(
		metadata.title.trim() ||
			metadata.description.trim() ||
			metadata.coverAsset,
	);
}

function buildTopicScriptTableContext(project: TopicProject): string {
	const rows = ensureTopicScriptTableRows({
		rows: project.scriptTableRows,
	}).filter(hasScriptTableRowContent);
	const metadata = ensureTopicScriptTableMetadata({
		metadata: project.scriptTableMetadata,
	});
	const hasMetadata = hasScriptTableMetadataContent(project);
	if (rows.length === 0 && !hasMetadata) return "";

	const metadataLines = hasMetadata
		? [
				"脚本信息：",
				`标题：${metadata.title.trim() || "未填写"}`,
				`简介：${metadata.description.trim() || "未填写"}`,
				`封面：${formatScriptTableAssetReference(metadata.coverAsset)}`,
			].join("\n")
		: "";

	const rowLines = rows.map((row, index) => {
		const assets =
			row.assets.length > 0
				? row.assets
						.map((asset) => {
							const meta = asset.mediaType ? ` / ${asset.mediaType}` : "";
							return `${asset.name}${meta}（${asset.mediaAssetId}）`;
						})
						.join("、")
				: "无";
		return [
			`${index + 1}. 时间：${row.timeRange.trim() || SCRIPT_TABLE_AUTO_TIME_LABEL}`,
			`文案：${row.copy.trim() || "未填写"}`,
			`画面内容：${row.visualContent.trim() || "未填写"}`,
			`选择素材：${assets}`,
		].join("\n");
	});

	return [
		"\n\n脚本表格：",
		metadataLines,
		rowLines.length > 0 ? rowLines.join("\n\n") : "",
	]
		.filter(Boolean)
		.join("\n");
}

function buildDirectScriptCutPrompt(project: TopicProject): string {
	const materialContext =
		buildInputMaterialContext(project) + buildTopicScriptTableContext(project);
	return `请直接根据脚本进行剪辑，跳过候选选题、调研、结构和选题包，直接进入视频剪辑执行。

${materialContext}

执行要求：
1. 先调用 media_get_all 和 timeline_get_summary，确认素材库和当前时间线状态。
2. 以「脚本表格」为唯一脚本来源；如果某行时间为空，按“${SCRIPT_TABLE_AUTO_TIME_LABEL}”处理，请根据文案长度、画面内容、素材时长和整体节奏自动推算合理时间段，不要要求用户补时间。
3. 优先使用每行「选择素材」里的 mediaAssetId 进行剪辑；如果某行没有素材，用画面内容描述从现有素材库中匹配，必要时用文本、字幕或占位画面承接。
4. 如果脚本信息里有封面素材，请使用 project_update_cover 设置项目封面；标题和简介用于视频命名、开场字幕和发布描述参考。
5. 可以直接调用 timeline_insert_media、timeline_insert_text_overlay、subtitle 或 MG 相关工具生成时间线草稿；完成后说明哪些时间是自动估算的、哪些素材已经放入时间线。`;
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

function getResearchInsights(project: TopicProject): ResearchInsight[] {
	const insights = project.researchInsights ?? [];
	if (insights.length > 0) return insights;
	return project.researchSources.map((source) => ({
		id: `derived-${source.id}`,
		title: source.angle || source.title,
		content:
			source.whyRelevant ||
			source.angle ||
			"这条资料可作为当前选题调研和事实核查的参考。",
		sourceIds: [source.id],
		hidden: false,
		kind: "agent",
	}));
}

function getUsableResearchInsights(project: TopicProject): ResearchInsight[] {
	return getResearchInsights(project).filter((insight) => !insight.hidden);
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
	if (stage === "structure") return project.selectedCandidateId !== null;
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
	const materialContext =
		buildInputMaterialContext(project) + buildTopicScriptTableContext(project);

	if (stage === "research") {
		return `${topicText}${materialContext}\n请进入调研阶段：搜索 B 站、YouTube 和网页资料，判断是否有人做同类选题、他们的灵感来源和差异化空位。请同时总结 3-6 段可直接参考的知识点，每段绑定引用来源。完成后调用 topic_set_research，用 sources 写来源链接，用 insights 写知识脉络段落。`;
	}
	if (stage === "structure") {
		return `${topicText}${materialContext}\n请进入结构设计阶段：基于当前选题、已有资料和用户提供素材，生成 2-4 个视频结构模板。完成后调用 topic_set_structures 写入右侧选题工作台。`;
	}
	if (stage === "package") {
		return `${topicText}${materialContext}\n请进入选题包阶段：基于当前选题、调研、结构和用户提供素材，调用 topic_create_package 生成标题、摘要、核心观点、脚本大纲、分段逐字稿、分段素材建议和发布文案。注意 scriptSegments.content 必须是用户可直接照读的逐字稿，要写完整台词和句子；不要写“开场 hook：”“效果展示：”“流程拆解：”这类内容概述、段落标题或画面计划，画面和素材说明放到 materialSuggestion。`;
	}
	if (stage === "production") {
		return `${topicText}${materialContext}\n请进入制作计划阶段：基于当前选题包和用户提供素材调用 topic_create_production_plan，拆解视频类型、时间段、素材需求、配音/口播建议和下一步制作动作。`;
	}
	if (stage === "timeline") {
		return `${topicText}${materialContext}\n请先确认制作计划，再把制作计划交给视频 Agent 生成时间线草稿。`;
	}
	return `${materialContext}\n请重新生成一版候选选题，并调用 topic_set_candidates 写入右侧选题工作台。`;
}

function buildStageResetTask({
	project,
	stage,
}: {
	project: TopicProject;
	stage: TopicStage;
}): string {
	const materialContext =
		buildInputMaterialContext(project) + buildTopicScriptTableContext(project);
	if (stage === "ideation") {
		return `我已经在右侧工作台确认要回到选题阶段。请重新理解当前方向「${project.originPrompt || project.title}」和用户提供素材，生成新一版候选选题，并调用 topic_set_candidates 写入右侧选题工作台。${materialContext}`;
	}
	if (stage === "research") {
		const selected = getSelectedCandidate(project);
		return `我已经在右侧工作台确认要重新调研。当前选题是「${selected?.title ?? project.title}」。请结合用户提供素材重新搜索同题内容和资料来源，输出 3-6 段知识脉络并绑定引用来源，然后调用 topic_set_research 写入 sources 和 insights。${materialContext}`;
	}
	if (stage === "structure") {
		const selected = getSelectedCandidate(project);
		return `我已经在右侧工作台确认要重新设计结构。当前选题是「${selected?.title ?? project.title}」。请结合用户提供素材生成新的视频结构模板，并调用 topic_set_structures 写入右侧选题工作台。${materialContext}`;
	}
	return buildStageForwardTask({ project, stage });
}

function buildVideoProductionHandoffPrompt({
	topicPackage,
	action,
}: {
	topicPackage: TopicPackageVersion;
	action: string;
}): string {
	return `请接手当前选题包资源，进入视频制作流程。不要要求我重新粘贴完整选题包；请先调用 topic_get_active_package 读取结构化资源，再基于其中的脚本分段逐字稿、素材建议、调研资料、知识脉络和制作计划，规划占位素材、口播/配音建议、MG 动画位置和剪辑结构。

资源标题：${topicPackage.title}
本次优先动作：${action}

读取资源后，先给出可执行制作方案，再等我确认是否真正生成时间线或素材。`;
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
	const [collapsedSections, setCollapsedSections] = useState<CollapsedSections>(
		DEFAULT_COLLAPSED_SECTIONS,
	);
	const lastAutoCollapsedPackageIdRef = useRef<string | null>(null);
	const ideationSectionRef = useRef<HTMLElement | null>(null);
	const researchSectionRef = useRef<HTMLElement | null>(null);
	const structureSectionRef = useRef<HTMLElement | null>(null);
	const packageSectionRef = useRef<HTMLElement | null>(null);
	const productionSectionRef = useRef<HTMLElement | null>(null);
	const timelineSectionRef = useRef<HTMLElement | null>(null);
	const stageSectionRefs = useMemo(
		() => ({
			ideation: ideationSectionRef,
			research: researchSectionRef,
			structure: structureSectionRef,
			package: packageSectionRef,
			production: productionSectionRef,
			timeline: timelineSectionRef,
		}),
		[],
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

	useEffect(() => {
		if (!activeProject) return;
		const stage =
			activeProject.stage === "timeline" ? "production" : activeProject.stage;
		const section = stageSectionRefs[stage].current;
		if (!section) return;
		const frameId = requestAnimationFrame(() => {
			section.scrollIntoView({ behavior: "smooth", block: "start" });
		});
		return () => cancelAnimationFrame(frameId);
	}, [activeProject, stageSectionRefs]);

	useEffect(() => {
		const activePackageId = activeProject?.activePackageVersionId ?? null;
		if (
			!activePackageId ||
			lastAutoCollapsedPackageIdRef.current === activePackageId
		) {
			return;
		}
		lastAutoCollapsedPackageIdRef.current = activePackageId;
		setCollapsedSections((current) => ({
			...current,
			inputMaterials: true,
			ideation: true,
			research: true,
			structure: true,
			package: false,
			production: false,
		}));
	}, [activeProject?.activePackageVersionId]);

	const toggleSection = (sectionId: TopicWorkbenchSectionId) => {
		setCollapsedSections((current) => ({
			...current,
			[sectionId]: !current[sectionId],
		}));
	};

	if (!activeProject) {
		return (
			<div className="size-full rounded-sm border border-border/70 bg-background" />
		);
	}

	const isBrainstormProject =
		getTopicProjectMode(activeProject) === "brainstorm";

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
				{isBrainstormProject ? (
					<BrainstormDraftWorkspace project={activeProject} />
				) : (
					<div className="min-h-full min-w-0 space-y-3 p-3">
						<VersionSummaryBar project={activeProject} />
						<InputMaterialsSection
							project={activeProject}
							isCollapsed={collapsedSections.inputMaterials}
							onToggleCollapse={() => toggleSection("inputMaterials")}
						/>
						<StageProgress
							project={activeProject}
							onStageClick={handleStageClick}
						/>
						<CandidatesSection
							project={activeProject}
							onRequestStageReset={(stage) => setPendingResetStage(stage)}
							sectionRef={ideationSectionRef}
							isCollapsed={collapsedSections.ideation}
							onToggleCollapse={() => toggleSection("ideation")}
						/>
						<ResearchSection
							project={activeProject}
							sectionRef={researchSectionRef}
							isCollapsed={collapsedSections.research}
							onToggleCollapse={() => toggleSection("research")}
						/>
						<StructureSection
							project={activeProject}
							sectionRef={structureSectionRef}
							isCollapsed={collapsedSections.structure}
							onToggleCollapse={() => toggleSection("structure")}
						/>
						<PackageSection
							project={activeProject}
							sectionRef={packageSectionRef}
							isCollapsed={collapsedSections.package}
							onToggleCollapse={() => toggleSection("package")}
						/>
						<ProductionPlanSection
							project={activeProject}
							sectionRef={productionSectionRef}
							isCollapsed={collapsedSections.production}
							onToggleCollapse={() => toggleSection("production")}
						/>
					</div>
				)}
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
	const isBrainstormProject = getTopicProjectMode(project) === "brainstorm";
	return (
		<header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/70 bg-card/[0.58] px-4 py-2 backdrop-blur dark:bg-background/95">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<h1 className="truncate text-base font-semibold tracking-normal text-foreground">
						选题工作台
					</h1>
					<span className="rounded-sm border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[0.68rem] font-medium text-emerald-700 dark:text-emerald-300">
						{isBrainstormProject
							? "草稿"
							: project.status === "ready-for-video"
								? "可进入制作"
								: "MVP"}
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

function BrainstormDraftWorkspace({ project }: { project: TopicProject }) {
	const editor = useEditor();
	const mediaAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets(),
	);
	const [activeTab, setActiveTab] =
		useState<BrainstormWorkspaceTab>("draft");
	const updateInputMaterial = useTopicWorkbenchStore(
		(state) => state.updateInputMaterial,
	);
	const removeInputMaterial = useTopicWorkbenchStore(
		(state) => state.removeInputMaterial,
	);
	const recordInputMaterials = useTopicWorkbenchStore(
		(state) => state.recordInputMaterials,
	);
	const promoteBrainstormToWorkflow = useTopicWorkbenchStore(
		(state) => state.promoteBrainstormToWorkflow,
	);
	const setActiveWorkbench = useTopicWorkbenchStore(
		(state) => state.setActiveWorkbench,
	);
	const emitAgentEvent = useTopicWorkbenchStore(
		(state) => state.emitAgentEvent,
	);
	const materials = project.inputMaterials ?? [];
	const draftMaterials = materials.filter(
		(material) => material.kind === "note",
	);
	const attachedMaterials = materials.filter(
		(material) => material.kind !== "note",
	);
	const materialContext =
		buildInputMaterialContext(project) + buildTopicScriptTableContext(project);
	const scriptRows = useMemo(
		() => ensureTopicScriptTableRows({ rows: project.scriptTableRows }),
		[project.scriptTableRows],
	);
	const hasScriptRows = scriptRows.some(hasScriptTableRowContent);

	const uploadBrainstormMediaFiles = useCallback(
		async ({
			files,
			inputMaterialSummary,
		}: {
			files: File[];
			inputMaterialSummary: string;
		}): Promise<MediaAsset[]> => {
			const activeEditorProject = editor.project.getActiveOrNull();
			if (!activeEditorProject || files.length === 0) return [];

			const savedAssets: MediaAsset[] = [];
			try {
				await showMediaUploadToast({
					filesCount: files.length,
					promise: async () => {
						const processedAssets = await processMediaAssets({ files });
						for (const asset of processedAssets) {
							if (asset.type !== "image" && asset.type !== "video") continue;
							const saved = await editor.media.addMediaAsset({
								projectId: activeEditorProject.metadata.id,
								asset,
							});
							if (saved) {
								savedAssets.push(saved);
							}
						}
						return {
							uploadedCount: savedAssets.length,
							assetNames: savedAssets.map((asset) => asset.name),
						};
					},
				});
			} catch (error) {
				console.error("Failed to upload draft media:", error);
				return [];
			}

			if (savedAssets.length > 0) {
				recordInputMaterials({
					editorProjectId: project.editorProjectId,
					materials: savedAssets.map((asset) => ({
						id: `material-${asset.id}`,
						kind: "uploaded-media",
						title: asset.name,
						summary: inputMaterialSummary,
						mediaAssetId: asset.id,
						mediaType: asset.type,
						durationSeconds: asset.duration,
						sizeBytes: asset.file.size,
					})),
				});
			}

			return savedAssets;
		},
		[editor, project.editorProjectId, recordInputMaterials],
	);

	const handleCreateCandidates = () => {
		promoteBrainstormToWorkflow();
		emitAgentEvent({
			editorProjectId: project.editorProjectId,
			source: "stage-forward",
			autoRun: true,
			content: `请把右侧「我的草稿」和已有素材整理成 3-5 个候选选题。先提炼草稿里出现的主题、疑问、情绪和可验证线索，再调用 topic_set_candidates 写入右侧选题工作台。候选出来后请停下来等我选择，不要继续调研。${materialContext}`,
		});
	};

	const handleDirectScriptCut = () => {
		setActiveWorkbench({ mode: "video" });
		emitAgentEvent({
			editorProjectId: project.editorProjectId,
			source: "handoff-video",
			autoRun: true,
			content: buildDirectScriptCutPrompt(project),
		});
	};

	return (
		<div className="min-h-full min-w-0 space-y-3 p-3">
			<section className="rounded-sm border border-border/75 bg-card/[0.38] p-3 dark:bg-cyan-300/[0.03]">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<BookOpenText size={15} />
							选题草稿
						</div>
						<p className="mt-1 text-xs leading-5 text-muted-foreground">
							草稿和脚本表格都会自动保存；左侧可以继续头脑风暴、提问或查资料。
						</p>
					</div>
					<div className="flex flex-col items-stretch gap-2 sm:items-end">
						<Button
							size="sm"
							onClick={handleCreateCandidates}
							disabled={materials.length === 0}
							title="把右侧草稿整理成正式候选选题"
						>
							<Lightbulb size={14} />
							整理成候选选题
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onClick={handleDirectScriptCut}
							disabled={!hasScriptRows}
							title={
								hasScriptRows
									? "跳过候选选题、调研、结构和选题包，直接交给剪辑 Agent"
									: "先在脚本表格里补充至少一行脚本"
							}
						>
							<Clapperboard size={14} />
							直接根据脚本进行剪辑
						</Button>
					</div>
				</div>
				<div
					className="mt-3 inline-flex rounded-sm border border-border/75 bg-background p-1"
					role="tablist"
					aria-label="选题草稿工作区"
				>
					<BrainstormWorkspaceTabButton
						active={activeTab === "draft"}
						icon={BookOpenText}
						label="草稿"
						onClick={() => setActiveTab("draft")}
					/>
					<BrainstormWorkspaceTabButton
						active={activeTab === "script-table"}
						icon={Table2}
						label="脚本表格"
						testId="topic-script-table-tab"
						onClick={() => setActiveTab("script-table")}
					/>
				</div>
			</section>
			{activeTab === "draft" ? (
				<div className="space-y-3">
					{draftMaterials.map((material) => (
						<BrainstormDraftCard
							key={material.id}
							material={material}
							mediaAssets={mediaAssets}
							onUploadFiles={(files) =>
								uploadBrainstormMediaFiles({
									files,
									inputMaterialSummary: "草稿中上传的图片或视频素材。",
								})
							}
							onSave={(patch) =>
								updateInputMaterial({ materialId: material.id, patch })
							}
							onRemove={() => removeInputMaterial({ materialId: material.id })}
						/>
					))}
					{attachedMaterials.length > 0 ? (
						<section className="rounded-sm border border-border/75 bg-background p-3">
							<div className="mb-2 text-xs font-medium text-muted-foreground">
								草稿素材
							</div>
							<div className="space-y-1.5">
								{attachedMaterials.map((material) => (
									<div
										key={material.id}
										className="flex items-center justify-between gap-2 rounded-sm border border-border/60 bg-muted/[0.14] px-2 py-1.5"
									>
										<div className="min-w-0">
											<div className="truncate text-xs font-medium text-foreground">
												{material.title}
											</div>
											<div className="text-[0.68rem] text-muted-foreground">
												{INPUT_MATERIAL_KIND_LABELS[material.kind]}
												{material.mediaType ? ` / ${material.mediaType}` : ""}
											</div>
										</div>
										<Button
											size="icon"
											variant="ghost"
											className="size-7 shrink-0 rounded-sm"
											onClick={() =>
												removeInputMaterial({ materialId: material.id })
											}
											title="移除素材"
										>
											<Trash2 size={12} />
										</Button>
									</div>
								))}
							</div>
						</section>
					) : null}
				</div>
			) : (
				<ScriptTableWorkspace
					project={project}
					mediaAssets={mediaAssets}
					onUploadFiles={({ files, inputMaterialSummary }) =>
						uploadBrainstormMediaFiles({
							files,
							inputMaterialSummary,
						})
					}
				/>
			)}
		</div>
	);
}

function BrainstormWorkspaceTabButton({
	active,
	icon: Icon,
	label,
	testId,
	onClick,
}: {
	active: boolean;
	icon: LucideIcon;
	label: string;
	testId?: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="tab"
			data-testid={testId}
			aria-selected={active}
			onClick={onClick}
			className={cn(
				"flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs font-medium transition-colors",
				active
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			<Icon size={13} />
			{label}
		</button>
	);
}

function buildScriptTableAsset(asset: MediaAsset): TopicScriptTableAsset {
	return {
		mediaAssetId: asset.id,
		name: asset.name,
		mediaType: asset.type,
		durationSeconds: asset.duration,
		sizeBytes: asset.file.size,
		addedAt: Date.now(),
	};
}

function ScriptTableWorkspace({
	project,
	mediaAssets,
	onUploadFiles,
}: {
	project: TopicProject;
	mediaAssets: MediaAsset[];
	onUploadFiles: ({
		files,
		inputMaterialSummary,
	}: {
		files: File[];
		inputMaterialSummary: string;
	}) => Promise<MediaAsset[]>;
}) {
	const rows = useMemo(
		() => ensureTopicScriptTableRows({ rows: project.scriptTableRows }),
		[project.scriptTableRows],
	);
	const metadata = useMemo(
		() =>
			ensureTopicScriptTableMetadata({
				metadata: project.scriptTableMetadata,
			}),
		[project.scriptTableMetadata],
	);
	const updateScriptTableRow = useTopicWorkbenchStore(
		(state) => state.updateScriptTableRow,
	);
	const updateScriptTableMetadata = useTopicWorkbenchStore(
		(state) => state.updateScriptTableMetadata,
	);
	const addScriptTableRow = useTopicWorkbenchStore(
		(state) => state.addScriptTableRow,
	);
	const removeScriptTableRow = useTopicWorkbenchStore(
		(state) => state.removeScriptTableRow,
	);
	const attachScriptTableAssets = useTopicWorkbenchStore(
		(state) => state.attachScriptTableAssets,
	);
	const removeScriptTableAsset = useTopicWorkbenchStore(
		(state) => state.removeScriptTableAsset,
	);
	const mediaAssetsById = useMemo(
		() => new Map(mediaAssets.map((asset) => [asset.id, asset])),
		[mediaAssets],
	);

	const handleUploadRowFiles = async ({
		rowId,
		rowIndex,
		files,
	}: {
		rowId: string;
		rowIndex: number;
		files: File[];
	}) => {
		const savedAssets = await onUploadFiles({
			files,
			inputMaterialSummary: `脚本表格第 ${rowIndex + 1} 行选择的画面素材。`,
		});
		if (savedAssets.length === 0) return;
		attachScriptTableAssets({
			rowId,
			assets: savedAssets.map(buildScriptTableAsset),
		});
	};

	const handleUploadCoverFiles = async (files: File[]) => {
		const [coverAsset] = await onUploadFiles({
			files,
			inputMaterialSummary: "脚本表格封面素材。",
		});
		if (!coverAsset) return;
		updateScriptTableMetadata({
			patch: { coverAsset: buildScriptTableAsset(coverAsset) },
		});
	};

	return (
		<section
			data-testid="topic-script-table"
			className="overflow-hidden rounded-sm border border-border/75 bg-background"
		>
			<div className="overflow-x-auto">
				<div className="min-w-[860px]">
					<div
						className={cn(
							"grid border-b border-border/75 bg-muted/[0.2]",
							SCRIPT_TABLE_GRID_CLASS,
						)}
					>
						<div className="border-r border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
							时间
						</div>
						<div className="border-r border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
							文案
						</div>
						<div className="border-r border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
							画面内容
						</div>
						<div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
							选择素材
						</div>
						<div className="border-l border-border/70 px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
							操作
						</div>
					</div>
					{rows.map((row, index) => (
						<ScriptTableRowEditor
							key={row.id}
							row={row}
							index={index}
							mediaAssetsById={mediaAssetsById}
							canRemove={rows.length > 1}
							onUpdate={(patch) =>
								updateScriptTableRow({ rowId: row.id, patch })
							}
							onUploadFiles={(files) =>
								handleUploadRowFiles({ rowId: row.id, rowIndex: index, files })
							}
							onRemoveRow={() => removeScriptTableRow({ rowId: row.id })}
							onRemoveAsset={(mediaAssetId) =>
								removeScriptTableAsset({
									rowId: row.id,
									mediaAssetId,
								})
							}
						/>
					))}
					<button
						type="button"
						onClick={() => addScriptTableRow({})}
						className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-dashed border-border/75 bg-muted/[0.12] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						title="添加一行"
					>
						<Plus size={15} />
						添加一行
					</button>
				</div>
			</div>
			<ScriptTableMetadataPanel
				metadata={metadata}
				mediaAssetsById={mediaAssetsById}
				onUpdate={(patch) => updateScriptTableMetadata({ patch })}
				onUploadCoverFiles={handleUploadCoverFiles}
			/>
		</section>
	);
}

function ScriptTableMetadataPanel({
	metadata,
	mediaAssetsById,
	onUpdate,
	onUploadCoverFiles,
}: {
	metadata: TopicProject["scriptTableMetadata"];
	mediaAssetsById: Map<string, MediaAsset>;
	onUpdate: (patch: {
		title?: string;
		description?: string;
		coverAsset?: TopicScriptTableAsset | null;
	}) => void;
	onUploadCoverFiles: (files: File[]) => Promise<void>;
}) {
	const [isUploadingCover, setUploadingCover] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const coverMediaAsset = metadata.coverAsset
		? mediaAssetsById.get(metadata.coverAsset.mediaAssetId)
		: undefined;
	const coverPreviewUrl = coverMediaAsset?.thumbnailUrl ?? coverMediaAsset?.url;

	const handleCoverFiles = async (files: File[]) => {
		if (files.length === 0 || isUploadingCover) return;
		setUploadingCover(true);
		try {
			await onUploadCoverFiles(files.slice(0, 1));
		} finally {
			setUploadingCover(false);
		}
	};

	return (
		<div className="border-t border-border/75 bg-muted/[0.08] p-3">
			<div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
				<FileText size={14} />
				视频信息
			</div>
			<div className="grid items-stretch gap-3 [grid-template-columns:minmax(11rem,0.8fr)_minmax(13rem,0.85fr)_minmax(14rem,1fr)] max-[980px]:grid-cols-1">
				<ScriptTableMetadataField
					label="标题"
					testId="script-table-metadata-title"
				>
					<input
						value={metadata.title}
						onChange={(event) => onUpdate({ title: event.target.value })}
						placeholder="视频标题"
						className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary/45"
						aria-label="脚本标题"
					/>
				</ScriptTableMetadataField>
				<ScriptTableMetadataField
					label="脚本封面"
					testId="script-table-metadata-cover"
				>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(event) => {
							const files = Array.from(event.currentTarget.files ?? []);
							event.currentTarget.value = "";
							void handleCoverFiles(files);
						}}
					/>
					<div className="flex h-full min-h-0 w-full items-center gap-2 rounded-sm border border-border/70 bg-muted/[0.08] p-2">
						<div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/65 bg-muted/[0.18]">
							{coverPreviewUrl ? (
								<img
									src={coverPreviewUrl}
									alt=""
									className="size-full object-cover"
								/>
							) : (
								<ImagePlus size={18} className="text-muted-foreground" />
							)}
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-xs font-medium text-foreground">
								{metadata.coverAsset?.name ?? "未选择封面"}
							</div>
							<div className="mt-1 flex flex-wrap gap-1.5">
								<Button
									size="sm"
									variant="outline"
									className="h-7 rounded-sm"
									onClick={() => fileInputRef.current?.click()}
									disabled={isUploadingCover}
									title="上传脚本封面"
								>
									{isUploadingCover ? (
										<Loader2 size={13} className="animate-spin" />
									) : (
										<Upload size={13} />
									)}
									上传封面
								</Button>
								{metadata.coverAsset ? (
									<Button
										size="icon"
										variant="ghost"
										className="size-7 rounded-sm text-muted-foreground hover:text-destructive"
										onClick={() => onUpdate({ coverAsset: null })}
										title="移除脚本封面"
									>
										<X size={13} />
									</Button>
								) : null}
							</div>
						</div>
					</div>
				</ScriptTableMetadataField>
				<ScriptTableMetadataField
					label="简介"
					testId="script-table-metadata-description"
				>
					<textarea
						value={metadata.description}
						onChange={(event) =>
							onUpdate({ description: event.target.value })
						}
						placeholder="视频简介或发布描述"
						rows={3}
						className="h-full min-h-0 w-full resize-y rounded-sm border border-border bg-background px-2 py-2 text-sm leading-6 text-foreground outline-none focus:border-primary/45"
						aria-label="脚本简介"
					/>
				</ScriptTableMetadataField>
			</div>
		</div>
	);
}

function ScriptTableMetadataField({
	label,
	children,
	testId,
}: {
	label: string;
	children: ReactNode;
	testId: string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex h-full min-h-28 min-w-0 flex-col rounded-sm border border-border/70 bg-background p-2"
		>
			<span className="text-xs font-semibold text-muted-foreground">
				{label}
			</span>
			<div className="mt-1 flex min-h-0 flex-1">{children}</div>
		</div>
	);
}

function ScriptTableRowEditor({
	row,
	index,
	mediaAssetsById,
	canRemove,
	onUpdate,
	onUploadFiles,
	onRemoveRow,
	onRemoveAsset,
}: {
	row: TopicScriptTableRow;
	index: number;
	mediaAssetsById: Map<string, MediaAsset>;
	canRemove: boolean;
	onUpdate: (patch: {
		timeRange?: string;
		copy?: string;
		visualContent?: string;
	}) => void;
	onUploadFiles: (files: File[]) => Promise<void>;
	onRemoveRow: () => void;
	onRemoveAsset: (mediaAssetId: string) => void;
}) {
	const [isUploading, setUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFiles = async (files: File[]) => {
		if (files.length === 0 || isUploading) return;
		setUploading(true);
		try {
			await onUploadFiles(files);
		} finally {
			setUploading(false);
		}
	};

	return (
		<div
			className={cn(
				"grid border-b border-border/65 last:border-b-0",
				SCRIPT_TABLE_GRID_CLASS,
			)}
		>
			<div className="border-r border-border/65 bg-muted/[0.08] px-3 py-3">
				<div className="mb-1 text-[0.68rem] font-medium text-muted-foreground">
					#{index + 1}
				</div>
				<input
					value={row.timeRange}
					onChange={(event) => onUpdate({ timeRange: event.target.value })}
					placeholder="可空，自动估算"
					className="h-9 w-full rounded-sm border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus:border-primary/45"
					aria-label="脚本表格时间"
				/>
			</div>
			<div className="border-r border-border/65 px-3 py-3">
				<textarea
					value={row.copy}
					onChange={(event) => onUpdate({ copy: event.target.value })}
					placeholder="逐字文案"
					rows={5}
					className="h-full min-h-28 w-full resize-y rounded-sm border border-border bg-background px-2 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/45"
					aria-label="脚本文案"
				/>
			</div>
			<div className="border-r border-border/65 px-3 py-3">
				<textarea
					value={row.visualContent}
					onChange={(event) =>
						onUpdate({ visualContent: event.target.value })
					}
					placeholder="画面描述"
					rows={5}
					className="h-full min-h-28 w-full resize-y rounded-sm border border-border bg-background px-2 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/45"
					aria-label="画面内容"
				/>
			</div>
			<div className="flex min-h-36 flex-col gap-2 px-3 py-3">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*,video/*"
					multiple
					className="hidden"
					onChange={(event) => {
						const files = Array.from(event.currentTarget.files ?? []);
						event.currentTarget.value = "";
						void handleFiles(files);
					}}
				/>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						className="h-8 rounded-sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isUploading}
						title="选择图片或视频"
					>
						{isUploading ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<ImagePlus size={14} />
						)}
						选择素材
					</Button>
				</div>
				<div className="min-h-16 space-y-1.5">
					{row.assets.length === 0 ? (
						<div className="flex min-h-16 items-center rounded-sm border border-dashed border-border/70 bg-muted/[0.12] px-2 text-xs text-muted-foreground">
							未选择素材
						</div>
					) : (
						row.assets.map((asset) => (
							<ScriptTableAssetChip
								key={asset.mediaAssetId}
								asset={asset}
								mediaAsset={mediaAssetsById.get(asset.mediaAssetId)}
								onRemove={() => onRemoveAsset(asset.mediaAssetId)}
							/>
						))
					)}
				</div>
			</div>
			<div className="flex border-l border-border/65 px-1.5 py-3">
				<Button
					size="icon"
					variant="ghost"
					className="size-8 rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					onClick={onRemoveRow}
					disabled={!canRemove}
					title="删除这一行"
					aria-label={`删除第 ${index + 1} 行`}
				>
					<Trash2 size={14} />
				</Button>
			</div>
		</div>
	);
}

function ScriptTableAssetChip({
	asset,
	mediaAsset,
	onRemove,
}: {
	asset: TopicScriptTableAsset;
	mediaAsset?: MediaAsset;
	onRemove: () => void;
}) {
	const previewUrl = mediaAsset?.thumbnailUrl ?? mediaAsset?.url;
	return (
		<div className="flex min-w-0 items-center gap-2 rounded-sm border border-border/70 bg-muted/[0.16] px-2 py-1.5">
			<div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-background">
				{previewUrl ? (
					<img
						src={previewUrl}
						alt=""
						className="size-full object-cover"
						draggable={false}
					/>
				) : (
					<ImagePlus size={14} className="text-muted-foreground" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-medium text-foreground">
					{mediaAsset?.name ?? asset.name}
				</div>
				<div className="text-[0.68rem] text-muted-foreground">
					{mediaAsset?.type ?? asset.mediaType ?? "素材"}
				</div>
			</div>
			<Button
				size="icon"
				variant="ghost"
				className="size-7 shrink-0 rounded-sm text-muted-foreground"
				onClick={onRemove}
				title="移除素材"
			>
				<X size={13} />
			</Button>
		</div>
	);
}

function BrainstormDraftCard({
	material,
	mediaAssets,
	onUploadFiles,
	onSave,
	onRemove,
}: {
	material: TopicProject["inputMaterials"][number];
	mediaAssets: MediaAsset[];
	onUploadFiles: (files: File[]) => Promise<MediaAsset[]>;
	onSave: (patch: {
		title?: string;
		summary?: string;
		content?: string;
	}) => void;
	onRemove: () => void;
}) {
	const [isUploading, setUploading] = useState(false);
	const [isDragOver, setDragOver] = useState(false);
	const titleRef = useRef(material.title);
	const contentRef = useRef(material.content ?? "");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const tiptapExtensions = useMemo(
		() => createDraftTiptapExtensions({ mediaAssets }),
		[mediaAssets],
	);
	const draftEditor = useTiptapEditor(
		{
			extensions: tiptapExtensions,
			content: draftMarkdownToTiptapHtml(material.content ?? ""),
			editorProps: {
				attributes: {
					class: "whitespace-pre-wrap",
				},
			},
			onUpdate: ({ editor }) => {
				const nextContent = getDraftTiptapMarkdown(editor);
				contentRef.current = nextContent;
				onSave({ title: titleRef.current, content: nextContent });
			},
		},
		[tiptapExtensions],
	);

	useEffect(() => {
		const nextContent = material.content ?? "";
		titleRef.current = material.title;
		if (nextContent === contentRef.current) return;
		contentRef.current = nextContent;
		draftEditor?.commands.setContent(draftMarkdownToTiptapHtml(nextContent), {
			emitUpdate: false,
		});
	}, [draftEditor, material.content, material.title]);

	const handleTitleChange = (nextTitle: string) => {
		titleRef.current = nextTitle;
		onSave({ title: nextTitle, content: contentRef.current });
	};

	const insertUploadedFiles = async ({
		files,
	}: {
		files: File[];
	}) => {
		if (files.length === 0 || isUploading || !draftEditor) return;
		setUploading(true);
		try {
			const savedAssets = await onUploadFiles(files);
			insertUploadedAssetsIntoTiptap({
				editor: draftEditor,
				assets: savedAssets,
			});
			const nextContent = getDraftTiptapMarkdown(draftEditor);
			contentRef.current = nextContent;
			onSave({ title: titleRef.current, content: nextContent });
			requestAnimationFrame(() => {
				draftEditor.commands.focus();
			});
		} finally {
			setUploading(false);
		}
	};

	return (
		<article className="rounded-sm border border-border/75 bg-background p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<input
						value={material.title}
						onChange={(event) => handleTitleChange(event.target.value)}
						className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm font-semibold outline-none focus:border-primary/40"
						aria-label="草稿标题"
					/>
					<div className="mt-1 text-xs text-muted-foreground">
						{INPUT_MATERIAL_KIND_LABELS[material.kind]}
					</div>
				</div>
				<span className="shrink-0 rounded-sm border border-border/70 bg-muted/[0.25] px-1.5 py-0.5 text-[0.68rem] text-muted-foreground">
					{formatDate(material.createdAt)}
				</span>
			</div>

			<div className="mt-3 space-y-2">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*,video/*"
					multiple
					className="hidden"
					onChange={(event) => {
						const files = Array.from(event.currentTarget.files ?? []);
						event.currentTarget.value = "";
						void insertUploadedFiles({ files });
					}}
				/>
				<div className="space-y-2">
					<DraftTiptapToolbar
						editor={draftEditor}
						isUploading={isUploading}
						onUploadClick={() => fileInputRef.current?.click()}
					/>
					<div
						data-testid="draft-tiptap-editor"
						onPaste={(event) => {
							const files = extractDraftUploadFiles({
								dataTransfer: event.clipboardData,
							});
							if (files.length === 0) return;
							event.preventDefault();
							void insertUploadedFiles({ files });
						}}
						onDragOver={(event) => {
							const files = extractDraftUploadFiles({
								dataTransfer: event.dataTransfer,
							});
							if (files.length === 0) return;
							event.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={(event) => {
							const files = extractDraftUploadFiles({
								dataTransfer: event.dataTransfer,
							});
							if (files.length === 0) return;
							event.preventDefault();
							setDragOver(false);
							void insertUploadedFiles({ files });
						}}
						className={cn(
							"min-h-72 rounded-sm border border-border bg-background text-sm leading-6 text-foreground outline-none transition-colors focus-within:border-primary/40",
							"[&_.ProseMirror]:min-h-72 [&_.ProseMirror]:whitespace-pre-wrap [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:outline-none",
							"[&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-semibold",
							"[&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold",
							"[&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold",
							"[&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-primary/35 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground",
							"[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5",
							"[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
							"[&_.ProseMirror_p]:my-1",
							"[&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
							isDragOver && "border-primary/50 bg-primary/[0.03]",
						)}
					>
						<EditorContent editor={draftEditor} />
					</div>
				</div>
				<div className="flex justify-end gap-1">
					<Button
						size="sm"
						variant="ghost"
						onClick={onRemove}
						title="删除草稿"
					>
						<Trash2 size={13} />
						删除
					</Button>
				</div>
			</div>
		</article>
	);
}

function DraftTiptapToolbar({
	editor,
	isUploading,
	onUploadClick,
}: {
	editor: TiptapEditor | null;
	isUploading: boolean;
	onUploadClick: () => void;
}) {
	const isDisabled = !editor;
	const preventFocusLoss = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
	};
	const buttonClassName = (isActive = false) =>
		cn(
			"size-8 rounded-sm",
			isActive && "bg-muted text-foreground hover:bg-muted",
		);

	return (
		<div className="flex flex-wrap items-center gap-1 rounded-sm border border-border/65 bg-muted/[0.16] p-1">
			<Button
				size="icon"
				variant="ghost"
				className={buttonClassName(editor?.isActive("heading", { level: 2 }))}
				onMouseDown={preventFocusLoss}
				onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				disabled={isDisabled}
				title="二级标题"
			>
				<Heading2 size={14} />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className={buttonClassName(editor?.isActive("bold"))}
				onMouseDown={preventFocusLoss}
				onClick={() => editor?.chain().focus().toggleBold().run()}
				disabled={isDisabled}
				title="加粗"
			>
				<Bold size={14} />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className={buttonClassName(editor?.isActive("italic"))}
				onMouseDown={preventFocusLoss}
				onClick={() => editor?.chain().focus().toggleItalic().run()}
				disabled={isDisabled}
				title="斜体"
			>
				<Italic size={14} />
			</Button>
			<div className="mx-1 h-5 w-px bg-border/70" />
			<Button
				size="icon"
				variant="ghost"
				className={buttonClassName(editor?.isActive("bulletList"))}
				onMouseDown={preventFocusLoss}
				onClick={() => editor?.chain().focus().toggleBulletList().run()}
				disabled={isDisabled}
				title="无序列表"
			>
				<List size={14} />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className={buttonClassName(editor?.isActive("orderedList"))}
				onMouseDown={preventFocusLoss}
				onClick={() => editor?.chain().focus().toggleOrderedList().run()}
				disabled={isDisabled}
				title="有序列表"
			>
				<ListOrdered size={14} />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className={buttonClassName(editor?.isActive("blockquote"))}
				onMouseDown={preventFocusLoss}
				onClick={() => editor?.chain().focus().toggleBlockquote().run()}
				disabled={isDisabled}
				title="引用"
			>
				<Quote size={14} />
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className="ml-auto size-8 rounded-sm"
				onMouseDown={preventFocusLoss}
				onClick={onUploadClick}
				disabled={isDisabled || isUploading}
				title="上传图片或视频"
			>
				{isUploading ? (
					<Loader2 size={14} className="animate-spin" />
				) : (
					<Upload size={14} />
				)}
			</Button>
		</div>
	);
}

function InputMaterialsSection({
	project,
	isCollapsed,
	onToggleCollapse,
}: {
	project: TopicProject;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}) {
	const inputMaterials = project.inputMaterials ?? [];
	const updateInputMaterial = useTopicWorkbenchStore(
		(state) => state.updateInputMaterial,
	);
	const removeInputMaterial = useTopicWorkbenchStore(
		(state) => state.removeInputMaterial,
	);
	if (inputMaterials.length === 0) return null;

	return (
		<CollapsibleSection
			icon={FileText}
			title="素材输入"
			description="用户提供的素材、脚本和录屏说明会作为后续选题、调研、脚本包的上下文。"
			isCollapsed={isCollapsed}
			onToggleCollapse={onToggleCollapse}
			className="bg-card/[0.34] dark:bg-cyan-300/[0.03]"
		>
			<div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
				{inputMaterials.map((material) => (
					<InputMaterialCard
						key={material.id}
						material={material}
						onSave={(patch) =>
							updateInputMaterial({ materialId: material.id, patch })
						}
						onRemove={() => removeInputMaterial({ materialId: material.id })}
					/>
				))}
			</div>
		</CollapsibleSection>
	);
}

function InputMaterialCard({
	material,
	onSave,
	onRemove,
}: {
	material: TopicProject["inputMaterials"][number];
	onSave: (patch: {
		title?: string;
		summary?: string;
		content?: string;
	}) => void;
	onRemove: () => void;
}) {
	const [isEditing, setEditing] = useState(false);
	const [title, setTitle] = useState(material.title);
	const [summary, setSummary] = useState(material.summary ?? "");
	const [content, setContent] = useState(material.content ?? "");

	return (
		<article className="rounded-sm border border-border/70 bg-background px-3 py-2">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					{isEditing ? (
						<input
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							className="h-8 w-full rounded-sm border border-border bg-background px-2 text-sm font-semibold outline-none focus:border-primary/40"
							aria-label="素材标题"
						/>
					) : (
						<div className="text-sm font-semibold leading-5 text-foreground">
							{material.title}
						</div>
					)}
					<div className="mt-1 text-xs text-muted-foreground">
						{INPUT_MATERIAL_KIND_LABELS[material.kind]}
						{material.durationSeconds
							? ` · ${Math.round(material.durationSeconds)}s`
							: ""}
					</div>
				</div>
				<span className="shrink-0 rounded-sm border border-border/70 bg-muted/[0.25] px-1.5 py-0.5 text-[0.68rem] text-muted-foreground">
					{material.mediaType ?? "文本"}
				</span>
			</div>
			{isEditing ? (
				<div className="mt-2 space-y-2">
					<textarea
						value={summary}
						onChange={(event) => setSummary(event.target.value)}
						placeholder="摘要，可选"
						rows={2}
						className="w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-5 outline-none placeholder:text-muted-foreground focus:border-primary/40"
					/>
					<textarea
						value={content}
						onChange={(event) => setContent(event.target.value)}
						placeholder="内容摘录或补充说明"
						rows={4}
						className="w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-5 outline-none placeholder:text-muted-foreground focus:border-primary/40"
					/>
					<div className="flex justify-end gap-2">
						<Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
							取消
						</Button>
						<Button
							size="sm"
							onClick={() => {
								onSave({ title, summary, content });
								setEditing(false);
							}}
						>
							保存
						</Button>
					</div>
				</div>
			) : (
				<>
					{material.summary || material.content ? (
						<p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
							{material.summary ?? material.content}
						</p>
					) : null}
					<div className="mt-2 flex justify-end gap-1">
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setTitle(material.title);
								setSummary(material.summary ?? "");
								setContent(material.content ?? "");
								setEditing(true);
							}}
							title="编辑素材输入"
						>
							<Pencil size={13} />
							编辑
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={onRemove}
							title="删除素材输入"
						>
							<Trash2 size={13} />
							删除
						</Button>
					</div>
				</>
			)}
		</article>
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
					onClick={() => createPackageVersion()}
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
	sectionRef,
	isCollapsed,
	onToggleCollapse,
}: {
	project: TopicProject;
	onRequestStageReset: (stage: TopicStage) => void;
	sectionRef?: Ref<HTMLElement>;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}) {
	const emitAgentEvent = useTopicWorkbenchStore(
		(state) => state.emitAgentEvent,
	);
	const prepareStructureOptions = useTopicWorkbenchStore(
		(state) => state.prepareStructureOptions,
	);
	const [evidenceCandidate, setEvidenceCandidate] =
		useState<TopicCandidate | null>(null);
	const [showOtherCandidates, setShowOtherCandidates] = useState(false);
	const [isSkipResearchDialogOpen, setSkipResearchDialogOpen] = useState(false);
	const hasSelection = project.selectedCandidateId !== null;
	const canInteract = project.stage === "ideation";
	const selectedCandidate = getSelectedCandidate(project);
	const shouldCollapseOtherCandidates =
		!canInteract && selectedCandidate !== null;
	const selectedCandidates = selectedCandidate ? [selectedCandidate] : [];
	const otherCandidates = project.candidates.filter(
		(candidate) => candidate.id !== selectedCandidate?.id,
	);
	const visibleCandidates = shouldCollapseOtherCandidates
		? selectedCandidates
		: project.candidates;
	const materialContext = buildInputMaterialContext(project);

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
			content: `我已经在右侧确认选题「${selectedCandidate.title}」。${materialContext}\n请搜索 B 站、YouTube 和网页资料，判断是否有人做同类选题、他们的灵感来源和差异化空位。请总结 3-6 段可直接参考的知识脉络，每段绑定引用来源。完成后调用 topic_set_research，用 sources 写来源链接，用 insights 写知识点段落。`,
		});
	};

	const handleSkipResearch = () => {
		if (!selectedCandidate) return;
		executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: project.editorProjectId,
			params: {
				candidateId: selectedCandidate.id,
				advance: true,
			},
		});
		prepareStructureOptions();
		setSkipResearchDialogOpen(false);
		emitAgentEvent({
			editorProjectId: project.editorProjectId,
			source: "stage-forward",
			autoRun: true,
			content: `我已经在右侧确认选题「${selectedCandidate.title}」，并选择跳过资料搜索。${materialContext}\n请不要搜索 B 站、YouTube 或网页资料，直接基于当前选题、用户定位和用户提供素材生成 2-4 个视频结构模板。完成后调用 topic_set_structures 写入右侧选题工作台。`,
		});
	};

	const handleAskAdjust = (candidate: TopicCandidate) => {
		if (!canInteract) return;
		emitAgentEvent({
			editorProjectId: project.editorProjectId,
			source: "candidate-edit",
			autoRun: false,
			content: `请基于候选选题「${candidate.title}」和用户提供素材做一版调整。当前摘要：${candidate.summary}。当前核心观点：${candidate.coreViewpoint}。${materialContext}\n请先和我确认调整方向，完成后调用 topic_set_candidates 刷新右侧候选方案。`,
		});
	};

	return (
		<CollapsibleSection
			sectionRef={sectionRef}
			icon={Lightbulb}
			title="候选选题"
			description="Agent 聊出来的方向会先在这里变成可查看、可选择的方案。"
			action={
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						if (project.candidates.length > 0 || project.stage !== "ideation") {
							onRequestStageReset("ideation");
							return;
						}
						emitAgentEvent({
							editorProjectId: project.editorProjectId,
							source: "stage-reset",
							autoRun: true,
							content: `请基于当前方向「${project.originPrompt || project.title}」和用户提供素材重新生成一版候选选题，并调用 topic_set_candidates 写入右侧选题工作台。${materialContext}`,
						});
					}}
				>
					<RefreshCw size={14} />
					新版
				</Button>
			}
			isCollapsed={isCollapsed}
			onToggleCollapse={onToggleCollapse}
		>
			<div className="mt-3 space-y-2">
				{project.candidates.length === 0 ? (
					<div className="rounded-sm border border-dashed border-border/75 bg-muted/[0.18] p-4 text-sm leading-6 text-muted-foreground">
						等待左侧 Agent 生成新的候选选题后写入这里。
					</div>
				) : null}
				{visibleCandidates.map((candidate, index) => (
					<CandidateCard
						key={candidate.id}
						candidate={candidate}
						index={
							shouldCollapseOtherCandidates
								? project.candidates.findIndex(
										(item) => item.id === candidate.id,
									)
								: index
						}
						canInteract={canInteract}
						isSelected={candidate.id === project.selectedCandidateId}
						onSelect={() => handleSelectCandidate(candidate)}
						onAskAdjust={() => handleAskAdjust(candidate)}
						onShowEvidence={() => setEvidenceCandidate(candidate)}
					/>
				))}
				{shouldCollapseOtherCandidates && otherCandidates.length > 0 ? (
					<div className="rounded-sm border border-dashed border-border/70 bg-muted/[0.12]">
						<button
							type="button"
							onClick={() => setShowOtherCandidates((current) => !current)}
							className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
							aria-expanded={showOtherCandidates}
						>
							<span>其他候选已折叠（{otherCandidates.length}）</span>
							{showOtherCandidates ? (
								<ChevronDown size={14} />
							) : (
								<ChevronRight size={14} />
							)}
						</button>
						{showOtherCandidates ? (
							<div className="space-y-2 border-t border-border/70 p-2">
								{otherCandidates.map((candidate) => (
									<div
										key={candidate.id}
										className="rounded-sm border border-border/70 bg-background px-3 py-2"
									>
										<div className="text-sm font-semibold leading-5 text-foreground">
											{candidate.title}
										</div>
										<p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
											{candidate.summary}
										</p>
									</div>
								))}
							</div>
						) : null}
					</div>
				) : null}
			</div>
			<div className="mt-3 flex flex-wrap justify-end gap-2">
				<Button
					size="sm"
					variant="outline"
					disabled={!hasSelection || !canInteract}
					onClick={() => setSkipResearchDialogOpen(true)}
					title="不做同题搜索，直接进入结构设计"
				>
					跳过资料搜索
					<ArrowRight size={14} />
				</Button>
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
				open={isSkipResearchDialogOpen}
				onOpenChange={setSkipResearchDialogOpen}
			>
				<AlertDialogContent className="rounded-sm">
					<AlertDialogHeader>
						<AlertDialogTitle>跳过资料搜索？</AlertDialogTitle>
						<AlertDialogDescription className="leading-6">
							确认后会保留当前候选选题，直接进入结构设计阶段；资料汇总不会自动生成，你之后仍可以回到调研阶段补做资料搜索。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction onClick={handleSkipResearch}>
							确认跳过
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
		</CollapsibleSection>
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

function ResearchSection({
	project,
	sectionRef,
	isCollapsed,
	onToggleCollapse,
}: {
	project: TopicProject;
	sectionRef?: Ref<HTMLElement>;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}) {
	const emitAgentEvent = useTopicWorkbenchStore(
		(state) => state.emitAgentEvent,
	);
	const toggleResearchInsightHidden = useTopicWorkbenchStore(
		(state) => state.toggleResearchInsightHidden,
	);
	const addResearchInsight = useTopicWorkbenchStore(
		(state) => state.addResearchInsight,
	);
	const hasSelection = project.selectedCandidateId !== null;
	const hasResearchSources = project.researchSources.length > 0;
	const researchInsights = getResearchInsights(project);
	const usableResearchInsights = getUsableResearchInsights(project);
	const sourceById = new Map(
		project.researchSources.map((source) => [source.id, source]),
	);
	const materialContext = buildInputMaterialContext(project);
	const canShow =
		project.stage !== "ideation" || project.researchSources.length > 0;
	const selectedCandidate = getSelectedCandidate(project);
	const isResearchLoading =
		project.stage === "research" && hasSelection && !hasResearchSources;
	const hasSkippedResearch =
		project.stage !== "research" && hasSelection && !hasResearchSources;
	const [sourcesOpen, setSourcesOpen] = useState(false);
	const [showAddInsight, setShowAddInsight] = useState(false);
	const [customInsightTitle, setCustomInsightTitle] = useState("");
	const [customInsightContent, setCustomInsightContent] = useState("");

	if (!canShow) return null;

	return (
		<CollapsibleSection
			sectionRef={sectionRef}
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
							content: `请重新调研当前选题「${selectedCandidate?.title ?? project.title}」。${materialContext}\n重点搜索 B 站、YouTube 和网页资料，判断同类选题、灵感来源和差异化空位。请输出 3-6 段知识脉络并绑定引用来源，然后调用 topic_set_research 写入 sources 和 insights。`,
						})
					}
				>
					<Search size={14} />
					重新调研
				</Button>
			}
			isCollapsed={isCollapsed}
			onToggleCollapse={onToggleCollapse}
		>
			<div className="mt-3 space-y-3">
				{project.researchSources.length === 0 ? (
					<div className="rounded-sm border border-dashed border-border/75 bg-muted/[0.18] p-4 text-sm leading-6 text-muted-foreground">
						<div className="flex items-center gap-2">
							{isResearchLoading ? (
								<Loader2 size={15} className="animate-spin text-primary" />
							) : null}
							<span>
								{isResearchLoading
									? "Agent 正在检索同题内容、资料来源和知识脉络，写入后这里会自动更新。"
									: hasSkippedResearch
										? "已跳过资料搜索。你可以继续结构设计，也可以回到调研分析阶段补做资料搜索。"
										: "等待 Agent 检索 B 站、YouTube 和网页资料后写入这里。"}
							</span>
						</div>
					</div>
				) : null}
				{researchInsights.length > 0 ? (
					<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
								<BookOpenText size={15} />
								知识脉络
								<span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[0.68rem] font-normal text-muted-foreground">
									可用 {usableResearchInsights.length} / 全部{" "}
									{researchInsights.length}
								</span>
							</div>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setShowAddInsight((current) => !current)}
							>
								<Plus size={14} />
								补充想法
							</Button>
						</div>
						<ContentMindMap
							project={project}
							insights={usableResearchInsights}
						/>
						{showAddInsight ? (
							<div className="mt-3 rounded-sm border border-border/70 bg-background p-3">
								<input
									value={customInsightTitle}
									onChange={(event) =>
										setCustomInsightTitle(event.target.value)
									}
									placeholder="知识点标题"
									className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm outline-none focus:border-primary/40"
								/>
								<textarea
									value={customInsightContent}
									onChange={(event) =>
										setCustomInsightContent(event.target.value)
									}
									placeholder="写下你希望脚本参考的补充想法"
									rows={4}
									className="mt-2 w-full resize-y rounded-sm border border-border bg-background px-2 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:border-primary/40"
								/>
								<div className="mt-2 flex justify-end gap-2">
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setShowAddInsight(false)}
									>
										取消
									</Button>
									<Button
										size="sm"
										disabled={!customInsightContent.trim()}
										onClick={() => {
											addResearchInsight({
												title: customInsightTitle,
												content: customInsightContent,
											});
											setCustomInsightTitle("");
											setCustomInsightContent("");
											setShowAddInsight(false);
										}}
									>
										加入知识脉络
									</Button>
								</div>
							</div>
						) : null}
						<div className="mt-3 space-y-3">
							{researchInsights.map((insight, index) => {
								const citedSources = insight.sourceIds
									.map((sourceId) => sourceById.get(sourceId))
									.filter((source): source is NonNullable<typeof source> =>
										Boolean(source),
									);
								return (
									<article
										key={insight.id}
										className={cn(
											"rounded-sm border border-border/70 bg-background px-3 py-3",
											insight.hidden && "opacity-55",
										)}
									>
										<div className="flex items-start gap-2">
											<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm bg-muted text-[0.68rem] font-semibold text-muted-foreground">
												{index + 1}
											</span>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													<h3 className="text-sm font-semibold leading-5 text-foreground">
														{insight.title}
													</h3>
													{insight.kind === "custom" ? (
														<span className="rounded-sm border border-primary/20 bg-primary/[0.06] px-1.5 py-0.5 text-[0.68rem] text-primary">
															用户补充
														</span>
													) : null}
													{insight.hidden ? (
														<span className="rounded-sm border border-border/70 bg-muted/[0.24] px-1.5 py-0.5 text-[0.68rem] text-muted-foreground">
															已屏蔽
														</span>
													) : null}
												</div>
												<p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">
													{insight.content}
												</p>
												{citedSources.length > 0 ? (
													<div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
														<span className="font-medium text-foreground">
															引用
														</span>
														{citedSources.map((source) => (
															<a
																key={source.id}
																href={source.url}
																target="_blank"
																rel="noreferrer"
																className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border/70 bg-muted/[0.2] px-2 py-1 text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
															>
																<span className="truncate">
																	{source.sourceName || source.title}
																</span>
																<ExternalLink size={12} />
															</a>
														))}
													</div>
												) : null}
											</div>
											<Button
												size="sm"
												variant="ghost"
												onClick={() =>
													toggleResearchInsightHidden({
														insightId: insight.id,
													})
												}
												title={insight.hidden ? "恢复使用" : "屏蔽不用"}
											>
												{insight.hidden ? (
													<Eye size={14} />
												) : (
													<EyeOff size={14} />
												)}
												{insight.hidden ? "恢复" : "屏蔽"}
											</Button>
										</div>
									</article>
								);
							})}
						</div>
					</div>
				) : null}
				{project.researchSources.length > 0 ? (
					<div className="rounded-sm border border-border/75 bg-muted/[0.14] p-3">
						<button
							type="button"
							onClick={() => setSourcesOpen((current) => !current)}
							className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-foreground"
							aria-expanded={sourcesOpen}
						>
							<span>引用资料（{project.researchSources.length}）</span>
							{sourcesOpen ? (
								<ChevronDown size={15} />
							) : (
								<ChevronRight size={15} />
							)}
						</button>
						{sourcesOpen ? (
							<div className="scrollbar-thin mt-2 max-h-80 overflow-y-auto pr-1">
								<div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
									{project.researchSources.map((source) => (
										<a
											key={source.id}
											href={source.url}
											target="_blank"
											rel="noreferrer"
											className="rounded-sm border border-border/75 bg-background p-3 transition-colors hover:border-primary/30 hover:bg-accent"
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
												<ExternalLink
													size={13}
													className="text-muted-foreground"
												/>
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
							</div>
						) : null}
					</div>
				) : null}
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
		</CollapsibleSection>
	);
}

function ContentMindMap({
	project,
	insights,
}: {
	project: TopicProject;
	insights: ResearchInsight[];
}) {
	const selectedCandidate = getSelectedCandidate(project);
	const selectedStructure =
		project.structures.find(
			(structure) => structure.id === project.selectedStructureId,
		) ?? project.structures[0];
	const rootTitle = selectedCandidate?.title ?? project.title;
	const structureSteps = selectedStructure?.flow.slice(0, 5) ?? [];
	const insightItems = insights.slice(0, 5);

	return (
		<div className="mt-3 rounded-sm border border-border/70 bg-background px-3 py-3">
			<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
				<BrainCircuit size={15} />
				视频内容脑图
			</div>
			<div className="mt-3 grid gap-3 [grid-template-columns:minmax(0,0.9fr)_minmax(0,1.1fr)] max-[760px]:grid-cols-1">
				<div className="rounded-sm border border-primary/25 bg-primary/[0.05] px-3 py-2">
					<div className="text-[0.68rem] font-semibold text-primary">主线</div>
					<div className="mt-1 text-sm font-semibold leading-5 text-foreground">
						{rootTitle}
					</div>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						{selectedCandidate?.coreViewpoint ?? "等待选题确认后形成核心观点。"}
					</p>
				</div>
				<div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
					<div className="rounded-sm border border-border/70 bg-muted/[0.14] px-3 py-2">
						<div className="text-xs font-semibold text-foreground">
							叙事结构
						</div>
						<ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
							{structureSteps.length > 0 ? (
								structureSteps.map((step) => (
									<li key={`${step.label}-${step.description}`}>
										{step.label}
									</li>
								))
							) : (
								<li>等待结构模板生成</li>
							)}
						</ul>
					</div>
					<div className="rounded-sm border border-border/70 bg-muted/[0.14] px-3 py-2">
						<div className="text-xs font-semibold text-foreground">
							参考知识
						</div>
						<ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
							{insightItems.length > 0 ? (
								insightItems.map((insight) => (
									<li key={insight.id}>{insight.title}</li>
								))
							) : (
								<li>等待知识脉络写入</li>
							)}
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
}

function StructureSection({
	project,
	sectionRef,
	isCollapsed,
	onToggleCollapse,
}: {
	project: TopicProject;
	sectionRef?: Ref<HTMLElement>;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}) {
	const [isPackageConfirmOpen, setPackageConfirmOpen] = useState(false);
	const [showOtherStructures, setShowOtherStructures] = useState(false);
	const selectStructureAction = useTopicWorkbenchStore(
		(state) => state.selectStructure,
	);
	const selectedStructure = project.structures.find(
		(structure) => structure.id === project.selectedStructureId,
	);
	const shouldCollapseOtherStructures = selectedStructure !== undefined;
	const otherStructures = project.structures.filter(
		(structure) => structure.id !== selectedStructure?.id,
	);
	const visibleStructures =
		shouldCollapseOtherStructures && selectedStructure
			? [selectedStructure]
			: project.structures;

	if (project.stage === "ideation" || project.stage === "research") return null;

	return (
		<CollapsibleSection
			sectionRef={sectionRef}
			icon={LayoutTemplate}
			title="视频结构模板"
			description="选题确定后，先选择叙事结构，再进入脚本和发布包。"
			isCollapsed={isCollapsed}
			onToggleCollapse={onToggleCollapse}
		>
			<div className="mt-3 space-y-2">
				{visibleStructures.map((structure) => (
					<StructureCard
						key={structure.id}
						structure={structure}
						isSelected={structure.id === project.selectedStructureId}
						onSelect={() => {
							selectStructureAction({ structureId: structure.id });
						}}
					/>
				))}
				{shouldCollapseOtherStructures && otherStructures.length > 0 ? (
					<div className="rounded-sm border border-dashed border-border/70 bg-muted/[0.12]">
						<button
							type="button"
							onClick={() => setShowOtherStructures((current) => !current)}
							className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
							aria-expanded={showOtherStructures}
						>
							<span>其他结构模板已折叠（{otherStructures.length}）</span>
							{showOtherStructures ? (
								<ChevronDown size={14} />
							) : (
								<ChevronRight size={14} />
							)}
						</button>
						{showOtherStructures ? (
							<div className="space-y-2 border-t border-border/70 p-2">
								{otherStructures.map((structure) => (
									<StructureCard
										key={structure.id}
										structure={structure}
										isSelected={false}
										onSelect={() => {
											selectStructureAction({ structureId: structure.id });
											setShowOtherStructures(false);
										}}
										compact
									/>
								))}
							</div>
						) : null}
					</div>
				) : null}
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
							生成脚本大纲、分段逐字稿、素材建议和发布文案。生成后可通过左侧
							Agent 调整并产出新版本。
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
		</CollapsibleSection>
	);
}

function StructureCard({
	structure,
	isSelected,
	onSelect,
	compact = false,
}: {
	structure: VideoStructureOption;
	isSelected: boolean;
	onSelect: () => void;
	compact?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full min-w-0 rounded-sm border p-3 text-left transition-colors",
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
			<div className={cn("mt-3 space-y-2", compact && "hidden")}>
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

function PackageSection({
	project,
	sectionRef,
	isCollapsed,
	onToggleCollapse,
}: {
	project: TopicProject;
	sectionRef?: Ref<HTMLElement>;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}) {
	const activePackage = getActivePackage(project);
	const updatePackageVersion = useTopicWorkbenchStore(
		(state) => state.updatePackageVersion,
	);
	const updatePackageOutlineItem = useTopicWorkbenchStore(
		(state) => state.updatePackageOutlineItem,
	);
	const updatePackagePlatformRecommendation = useTopicWorkbenchStore(
		(state) => state.updatePackagePlatformRecommendation,
	);
	const updatePackageCoverIdea = useTopicWorkbenchStore(
		(state) => state.updatePackageCoverIdea,
	);
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
		<CollapsibleSection
			sectionRef={sectionRef}
			icon={BookOpenText}
			title="完整选题包"
			description="这里会成为后续视频制作流程的输入：脚本、素材表、封面和发布文案。"
			isCollapsed={isCollapsed}
			onToggleCollapse={onToggleCollapse}
		>
			<div className="mt-3 grid gap-3 [grid-template-columns:minmax(0,1fr)_minmax(17rem,0.9fr)] max-[980px]:grid-cols-1">
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<div className="text-xs font-semibold text-muted-foreground">
						标题
					</div>
					<input
						value={activePackage.title}
						onChange={(event) =>
							updatePackageVersion({
								versionId: activePackage.id,
								patch: { title: event.target.value },
							})
						}
						className="mt-1 h-10 w-full rounded-sm border border-border bg-background px-2 text-base font-semibold tracking-normal text-foreground outline-none focus:border-primary/40"
						aria-label="选题包标题"
					/>
					<div className="mt-3 text-xs font-semibold text-muted-foreground">
						摘要
					</div>
					<textarea
						value={activePackage.summary}
						onChange={(event) =>
							updatePackageVersion({
								versionId: activePackage.id,
								patch: { summary: event.target.value },
							})
						}
						rows={3}
						className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-2 py-2 text-sm leading-6 text-muted-foreground outline-none focus:border-primary/40"
						aria-label="选题包摘要"
					/>
					<div className="mt-3 rounded-sm border border-border/70 bg-background px-3 py-2 text-sm leading-6">
						<div className="font-semibold text-foreground">核心观点</div>
						<textarea
							value={activePackage.coreViewpoint}
							onChange={(event) =>
								updatePackageVersion({
									versionId: activePackage.id,
									patch: { coreViewpoint: event.target.value },
								})
							}
							rows={3}
							className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-2 py-2 text-sm leading-6 text-muted-foreground outline-none focus:border-primary/40"
							aria-label="核心观点"
						/>
					</div>
					<div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
						<div className="rounded-sm border border-border/70 bg-background px-2 py-2">
							<div className="text-xs font-semibold text-muted-foreground">
								受众分析
							</div>
							<textarea
								value={activePackage.audienceAnalysis}
								onChange={(event) =>
									updatePackageVersion({
										versionId: activePackage.id,
										patch: { audienceAnalysis: event.target.value },
									})
								}
								rows={4}
								className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-5 text-muted-foreground outline-none focus:border-primary/40"
								aria-label="受众分析"
							/>
						</div>
						<div className="rounded-sm border border-border/70 bg-background px-2 py-2">
							<div className="text-xs font-semibold text-muted-foreground">
								选题缘由
							</div>
							<textarea
								value={activePackage.rationale}
								onChange={(event) =>
									updatePackageVersion({
										versionId: activePackage.id,
										patch: { rationale: event.target.value },
									})
								}
								rows={4}
								className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-5 text-muted-foreground outline-none focus:border-primary/40"
								aria-label="选题缘由"
							/>
						</div>
						<div className="rounded-sm border border-border/70 bg-background px-2 py-2">
							<div className="text-xs font-semibold text-muted-foreground">
								预期时长
							</div>
							<input
								type="number"
								min={1}
								value={activePackage.durationMinutes}
								onChange={(event) =>
									updatePackageVersion({
										versionId: activePackage.id,
										patch: {
											durationMinutes: Number(event.target.value),
										},
									})
								}
								className="mt-1 h-8 w-full rounded-sm border border-border bg-background px-2 text-xs text-muted-foreground outline-none focus:border-primary/40"
								aria-label="预期时长"
							/>
						</div>
					</div>
					<div className="mt-3">
						<div className="text-sm font-semibold text-foreground">
							脚本结构
						</div>
						<div className="mt-2 space-y-2">
							{activePackage.outline.map((item, index) => (
								<textarea
									key={`${activePackage.id}-outline-${index}`}
									value={item}
									onChange={(event) =>
										updatePackageOutlineItem({
											versionId: activePackage.id,
											outlineIndex: index,
											value: event.target.value,
										})
									}
									rows={2}
									className="w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-sm leading-6 text-muted-foreground outline-none focus:border-primary/40"
									aria-label={`脚本结构 ${index + 1}`}
								/>
							))}
						</div>
					</div>
				</div>
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Check size={14} className="text-primary" />
						发布文案与封面
					</div>
					<div className="mt-2 space-y-2">
						{activePackage.platformRecommendations.map((item, index) => (
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
									<input
										value={item.title}
										onChange={(event) =>
											updatePackagePlatformRecommendation({
												versionId: activePackage.id,
												recommendationIndex: index,
												patch: { title: event.target.value },
											})
										}
										className="h-8 w-full rounded-sm border border-border bg-background px-2 text-xs font-semibold text-foreground outline-none focus:border-primary/40"
										aria-label={`${PLATFORM_LABELS[item.platform]} 标题建议`}
									/>
								</div>
								<textarea
									value={item.description}
									onChange={(event) =>
										updatePackagePlatformRecommendation({
											versionId: activePackage.id,
											recommendationIndex: index,
											patch: { description: event.target.value },
										})
									}
									rows={4}
									className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-5 text-muted-foreground outline-none focus:border-primary/40"
									aria-label={`${PLATFORM_LABELS[item.platform]} 视频描述`}
								/>
							</div>
						))}
					</div>
					<div className="mt-3 text-xs font-semibold text-foreground">
						封面建议
					</div>
					<div className="mt-2 space-y-2">
						{activePackage.coverIdeas.map((idea, index) => (
							<textarea
								key={`${activePackage.id}-cover-${index}`}
								value={idea}
								onChange={(event) =>
									updatePackageCoverIdea({
										versionId: activePackage.id,
										coverIndex: index,
										value: event.target.value,
									})
								}
								rows={2}
								className="w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-5 text-muted-foreground outline-none focus:border-primary/40"
								aria-label={`封面建议 ${index + 1}`}
							/>
						))}
					</div>
				</div>
			</div>
			<div className="mt-3 rounded-sm border border-border/75 bg-muted/[0.18] p-3">
				<div className="text-sm font-semibold text-foreground">
					时间段逐字稿与素材建议
				</div>
				<div className="mt-2 space-y-2">
					{activePackage.scriptSegments.map((segment, index) => (
						<ScriptSegmentViewRow
							key={`${activePackage.id}-${index}`}
							versionId={activePackage.id}
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
		</CollapsibleSection>
	);
}

function ProductionPlanSection({
	project,
	sectionRef,
	isCollapsed,
	onToggleCollapse,
}: {
	project: TopicProject;
	sectionRef?: Ref<HTMLElement>;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}) {
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
			content: buildVideoProductionHandoffPrompt({
				topicPackage: activePackage,
				action,
			}),
		});
	};

	return (
		<CollapsibleSection
			sectionRef={sectionRef}
			icon={Clapperboard}
			title="视频制作计划"
			description="把选题包转成剪辑 Agent 可执行的素材、配音和占位计划。"
			isCollapsed={isCollapsed}
			onToggleCollapse={onToggleCollapse}
		>
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
		</CollapsibleSection>
	);
}

function ScriptSegmentViewRow({
	segment,
	index,
	versionId,
}: {
	segment: TopicPackageVersion["scriptSegments"][number];
	index: number;
	versionId: string;
}) {
	const updateScriptSegment = useTopicWorkbenchStore(
		(state) => state.updateScriptSegment,
	);
	return (
		<div className="grid gap-2 rounded-sm border border-border/70 bg-background px-3 py-2 [grid-template-columns:8rem_minmax(0,1.1fr)_minmax(0,0.9fr)] max-[940px]:grid-cols-1">
			<div>
				<div className="text-[0.68rem] font-semibold text-muted-foreground">
					时间段 {index + 1}
				</div>
				<input
					value={segment.timeRange}
					onChange={(event) =>
						updateScriptSegment({
							versionId,
							segmentIndex: index,
							patch: { timeRange: event.target.value },
						})
					}
					className="mt-1 h-9 w-full rounded-sm border border-primary/20 bg-primary/[0.06] px-2 text-xs font-semibold text-primary outline-none focus:border-primary/50"
					aria-label={`时间段 ${index + 1}`}
				/>
			</div>
			<div>
				<div className="text-[0.68rem] font-semibold text-muted-foreground">
					逐字稿
				</div>
				<textarea
					value={segment.content}
					onChange={(event) =>
						updateScriptSegment({
							versionId,
							segmentIndex: index,
							patch: { content: event.target.value },
						})
					}
					rows={3}
					className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-sm leading-5 text-foreground outline-none focus:border-primary/40"
					aria-label={`逐字稿 ${index + 1}`}
				/>
			</div>
			<div>
				<div className="text-[0.68rem] font-semibold text-muted-foreground">
					素材建议
				</div>
				<textarea
					value={segment.materialSuggestion}
					onChange={(event) =>
						updateScriptSegment({
							versionId,
							segmentIndex: index,
							patch: { materialSuggestion: event.target.value },
						})
					}
					rows={3}
					className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-5 text-muted-foreground outline-none focus:border-primary/40"
					aria-label={`素材建议 ${index + 1}`}
				/>
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

function CollapsibleSection({
	sectionRef,
	icon,
	title,
	description,
	action,
	isCollapsed,
	onToggleCollapse,
	children,
	className,
}: {
	sectionRef?: Ref<HTMLElement>;
	icon: LucideIcon;
	title: string;
	description: string;
	action?: ReactNode;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			ref={sectionRef}
			className={cn(
				"rounded-sm border border-border/75 bg-background p-3",
				className,
			)}
		>
			<SectionHeading
				icon={icon}
				title={title}
				description={description}
				action={
					<div className="flex items-center gap-2">
						{action}
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={onToggleCollapse}
							aria-expanded={!isCollapsed}
							title={isCollapsed ? "展开" : "折叠"}
						>
							{isCollapsed ? (
								<ChevronRight size={14} />
							) : (
								<ChevronDown size={14} />
							)}
						</Button>
					</div>
				}
			/>
			{isCollapsed ? null : children}
		</section>
	);
}
