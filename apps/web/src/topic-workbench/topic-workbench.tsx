"use client";

import { useEffect, type ReactNode } from "react";
import {
	ArrowRight,
	BookOpenText,
	CheckCircle2,
	ExternalLink,
	FileText,
	History,
	LayoutTemplate,
	Lightbulb,
	Play,
	Plus,
	Radar,
	RefreshCw,
	Search,
	Sparkles,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { useTopicWorkbenchStore } from "./store";
import type {
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
		label: "选题",
		description: "把想法聊成候选方案",
		icon: Lightbulb,
	},
	{
		stage: "research",
		label: "调研",
		description: "搜索同题和资料来源",
		icon: Radar,
	},
	{
		stage: "structure",
		label: "结构",
		description: "选择视频叙事模板",
		icon: LayoutTemplate,
	},
	{
		stage: "package",
		label: "选题包",
		description: "交付脚本与发布文案",
		icon: FileText,
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
	return (
		project.packageVersions.find(
			(version) => version.id === project.activePackageVersionId,
		) ??
		project.packageVersions.at(-1) ??
		null
	);
}

export function TopicWorkbench({ editorProjectId }: { editorProjectId: string }) {
	const activeProject = useTopicWorkbenchStore((state) =>
		state.getActiveTopicProject(),
	);
	const setActiveEditorProject = useTopicWorkbenchStore(
		(state) => state.setActiveEditorProject,
	);
	const createTopicProject = useTopicWorkbenchStore(
		(state) => state.createTopicProject,
	);

	useEffect(() => {
		setActiveEditorProject({ editorProjectId });
	}, [editorProjectId, setActiveEditorProject]);

	if (!activeProject) {
		return (
			<div className="size-full overflow-hidden rounded-sm border border-border/70 bg-background">
				<TopicEmptyCanvas
					onCreate={(prompt) =>
						createTopicProject({ editorProjectId, prompt })
					}
				/>
			</div>
		);
	}

	return (
		<div className="flex size-full min-h-0 min-w-0 flex-col overflow-hidden rounded-sm border border-border/70 bg-background">
			<TopicWorkbenchHeader project={activeProject} />
			<div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
				<div className="grid min-h-full grid-cols-[minmax(0,1fr)_18rem] gap-3 p-3 max-[1180px]:grid-cols-1">
					<div className="min-w-0 space-y-3">
						<StageProgress project={activeProject} />
						<CandidatesSection project={activeProject} />
						<ResearchSection project={activeProject} />
						<StructureSection project={activeProject} />
						<PackageSection project={activeProject} />
					</div>
					<VersionRail project={activeProject} />
				</div>
			</div>
		</div>
	);
}

function TopicEmptyCanvas({ onCreate }: { onCreate: (prompt: string) => void }) {
	const starters = [
		"AI 视频生成工具最近有什么值得聊的",
		"自媒体创作者如何用 Agent 做内容生产",
		"帮我找一个科技专题，适合做 B 站 8 分钟视频",
		"我想做一个 Shotlyx 产品更新相关的选题",
	];

	return (
		<div className="flex min-h-full flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.09),transparent_28rem),linear-gradient(180deg,rgba(16,185,129,0.04),transparent_18rem)] p-8 text-center">
			<div className="flex size-14 items-center justify-center rounded-sm border border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-600 dark:text-cyan-300">
				<Sparkles size={25} />
			</div>
			<div className="max-w-xl">
				<h2 className="text-2xl font-semibold tracking-normal text-foreground">
					让创作变得非常简单
				</h2>
				<p className="mt-2 text-sm leading-6 text-muted-foreground">
					从一个模糊想法开始，Agent 会把选题、同题调研、结构设计、脚本和发布文案逐步沉淀成一个可制作的视频方案。
				</p>
			</div>
			<div className="grid w-full max-w-3xl gap-2 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
				{starters.map((starter) => (
					<button
						key={starter}
						type="button"
						onClick={() => onCreate(starter)}
						className="min-h-20 rounded-sm border border-border/80 bg-background/78 px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-accent"
					>
						{starter}
					</button>
				))}
			</div>
		</div>
	);
}

function TopicWorkbenchHeader({ project }: { project: TopicProject }) {
	const setActiveWorkbench = useTopicWorkbenchStore(
		(state) => state.setActiveWorkbench,
	);

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
			<Button
				size="sm"
				variant="outline"
				onClick={() => setActiveWorkbench({ mode: "video" })}
			>
				<Play size={14} />
				进入视频制作
			</Button>
		</header>
	);
}

function StageProgress({ project }: { project: TopicProject }) {
	const activeIndex = getStageIndex(project.stage);

	return (
		<section className="rounded-sm border border-border/75 bg-card/[0.42] p-3 dark:bg-cyan-300/[0.03]">
			<div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr))]">
				{STAGES.map(({ stage, label, description, icon: Icon }, index) => {
					const isActive = project.stage === stage;
					const isComplete = index < activeIndex;
					return (
						<div
							key={stage}
							className={cn(
								"flex items-start gap-2 rounded-sm border px-2.5 py-2",
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
						</div>
					);
				})}
			</div>
		</section>
	);
}

function CandidatesSection({ project }: { project: TopicProject }) {
	const selectCandidate = useTopicWorkbenchStore(
		(state) => state.selectCandidate,
	);
	const updateCandidate = useTopicWorkbenchStore(
		(state) => state.updateCandidate,
	);
	const confirmCandidate = useTopicWorkbenchStore(
		(state) => state.confirmCandidate,
	);
	const createTopicProject = useTopicWorkbenchStore(
		(state) => state.createTopicProject,
	);
	const hasSelection = project.selectedCandidateId !== null;

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={Lightbulb}
				title="候选选题"
				description="Agent 聊出来的方向会先在这里变成可编辑方案。"
				action={
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							createTopicProject({
								editorProjectId: project.editorProjectId,
								prompt: project.originPrompt || "重新生成一个选题方向",
							})
						}
					>
						<RefreshCw size={14} />
						新版
					</Button>
				}
			/>
			<div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
				{project.candidates.map((candidate, index) => (
					<CandidateCard
						key={candidate.id}
						candidate={candidate}
						index={index}
						isSelected={candidate.id === project.selectedCandidateId}
						onSelect={() => selectCandidate({ candidateId: candidate.id })}
						onChange={(patch) =>
							updateCandidate({ candidateId: candidate.id, patch })
						}
					/>
				))}
			</div>
			<div className="mt-3 flex justify-end">
				<Button
					size="sm"
					disabled={!hasSelection}
					onClick={() => confirmCandidate()}
				>
					确认选题
					<ArrowRight size={14} />
				</Button>
			</div>
		</section>
	);
}

function CandidateCard({
	candidate,
	index,
	isSelected,
	onSelect,
	onChange,
}: {
	candidate: TopicCandidate;
	index: number;
	isSelected: boolean;
	onSelect: () => void;
	onChange: (
		patch: Partial<Pick<TopicCandidate, "title" | "summary" | "coreViewpoint">>,
	) => void;
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
			<div className="flex items-start justify-between gap-2">
				<button
					type="button"
					onClick={onSelect}
					className="flex min-w-0 items-center gap-2 text-left"
				>
					<span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-background text-xs font-semibold text-muted-foreground">
						{index + 1}
					</span>
					<span className="text-xs font-medium text-muted-foreground">
						{isSelected ? "已选中" : "点击选择"}
					</span>
				</button>
				<div className="flex shrink-0 gap-1">
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
			<input
				value={candidate.title}
				onChange={(event) => onChange({ title: event.target.value })}
				className="mt-3 w-full bg-transparent text-sm font-semibold leading-5 text-foreground outline-none focus:rounded-sm focus:bg-background focus:px-1"
			/>
			<textarea
				value={candidate.summary}
				onChange={(event) => onChange({ summary: event.target.value })}
				rows={2}
				className="mt-2 w-full resize-none bg-transparent text-xs leading-5 text-muted-foreground outline-none focus:rounded-sm focus:bg-background focus:px-1"
			/>
			<textarea
				value={candidate.coreViewpoint}
				onChange={(event) => onChange({ coreViewpoint: event.target.value })}
				rows={2}
				className="mt-2 w-full resize-none rounded-sm border border-border/65 bg-background/55 px-2 py-1.5 text-xs leading-5 text-foreground outline-none focus:border-primary/35"
			/>
			<div className="mt-2 text-xs leading-5 text-muted-foreground">
				{candidate.durationMinutes} 分钟 · {candidate.audience}
			</div>
		</article>
	);
}

function ResearchSection({ project }: { project: TopicProject }) {
	const runResearch = useTopicWorkbenchStore((state) => state.runResearch);
	const prepareStructureOptions = useTopicWorkbenchStore(
		(state) => state.prepareStructureOptions,
	);
	const hasSelection = project.selectedCandidateId !== null;
	const canShow = project.stage !== "ideation" || project.researchSources.length > 0;

	if (!canShow) return null;

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={Radar}
				title="同题雷达与资料汇总"
				description="先判断 B 站、YouTube 和网页资料里有哪些相似选题，再找差异化切口。"
				action={
					<Button size="sm" variant="outline" disabled={!hasSelection} onClick={runResearch}>
						<Search size={14} />
						刷新调研
					</Button>
				}
			/>
			<div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
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
					disabled={project.researchSources.length === 0}
					onClick={prepareStructureOptions}
				>
					生成结构模板
					<ArrowRight size={14} />
				</Button>
			</div>
		</section>
	);
}

function StructureSection({ project }: { project: TopicProject }) {
	const selectStructureAction = useTopicWorkbenchStore(
		(state) => state.selectStructure,
	);
	const createPackageVersion = useTopicWorkbenchStore(
		(state) => state.createPackageVersion,
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
						onSelect={() =>
							selectStructureAction({ structureId: structure.id })
						}
					/>
				))}
			</div>
			<div className="mt-3 flex justify-end">
				<Button
					size="sm"
					disabled={!project.selectedStructureId}
					onClick={createPackageVersion}
				>
					生成选题包
					<ArrowRight size={14} />
				</Button>
			</div>
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

	return (
		<section className="rounded-sm border border-border/75 bg-background p-3">
			<SectionHeading
				icon={BookOpenText}
				title="完整选题包"
				description="这里会成为后续视频制作流程的输入：脚本、素材表、封面和发布文案。"
			/>
			<div className="mt-3 grid gap-3 [grid-template-columns:minmax(0,1fr)_minmax(17rem,0.9fr)] max-[980px]:grid-cols-1">
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<h3 className="text-base font-semibold tracking-normal text-foreground">
						{activePackage.title}
					</h3>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						{activePackage.summary}
					</p>
					<div className="mt-3 rounded-sm border border-border/70 bg-background px-3 py-2 text-sm leading-6">
						<div className="font-semibold text-foreground">核心观点</div>
						<div className="text-muted-foreground">
							{activePackage.coreViewpoint}
						</div>
					</div>
					<div className="mt-3">
						<div className="text-sm font-semibold text-foreground">脚本结构</div>
						<ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
							{activePackage.outline.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				</div>
				<div className="rounded-sm border border-border/75 bg-muted/[0.18] p-3">
					<div className="text-sm font-semibold text-foreground">
						发布文案与封面
					</div>
					<div className="mt-2 space-y-2">
						{activePackage.platformRecommendations.map((item) => (
							<div
								key={`${item.platform}-${item.title}`}
								className="rounded-sm border border-border/70 bg-background px-2 py-2"
							>
								<div className="text-xs font-semibold text-foreground">
									{PLATFORM_LABELS[item.platform]}
								</div>
								<div className="mt-1 text-xs leading-5 text-muted-foreground">
									{item.title}
								</div>
							</div>
						))}
					</div>
					<ul className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
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
				<div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
					{activePackage.scriptSegments.map((segment) => (
						<div
							key={`${segment.timeRange}-${segment.content}`}
							className="rounded-sm border border-border/70 bg-background px-3 py-2"
						>
							<div className="text-xs font-semibold text-primary">
								{segment.timeRange}
							</div>
							<div className="mt-1 text-sm leading-5 text-foreground">
								{segment.content}
							</div>
							<div className="mt-2 text-xs leading-5 text-muted-foreground">
								{segment.materialSuggestion}
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function VersionRail({ project }: { project: TopicProject }) {
	const setActivePackageVersion = useTopicWorkbenchStore(
		(state) => state.setActivePackageVersion,
	);
	const createPackageVersion = useTopicWorkbenchStore(
		(state) => state.createPackageVersion,
	);
	const activePackage = getActivePackage(project);

	return (
		<aside className="min-w-0 rounded-sm border border-border/75 bg-card/[0.38] p-3 dark:bg-cyan-300/[0.03]">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
					<History size={15} />
					版本管理
				</div>
				<Button
					size="icon"
					variant="ghost"
					disabled={!activePackage}
					onClick={createPackageVersion}
					title="基于当前方案生成新版本"
					aria-label="生成新版本"
				>
					<Plus size={15} />
				</Button>
			</div>
			<div className="mt-3 space-y-2">
				{project.packageVersions.length === 0 ? (
					<div className="rounded-sm border border-dashed border-border/75 bg-background/55 p-3 text-xs leading-5 text-muted-foreground">
						选题包生成后，每次重新生成都会作为新版本保存，方便回到旧方案。
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
									"w-full rounded-sm border px-3 py-2 text-left transition-colors",
									version.id === activePackage?.id
										? "border-primary/35 bg-primary/[0.07]"
										: "border-border/75 bg-background/60 hover:bg-accent",
								)}
							>
								<div className="text-sm font-semibold text-foreground">
									{version.versionName}
								</div>
								<div className="mt-1 text-xs text-muted-foreground">
									{formatDate(version.createdAt)}
								</div>
								<div className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
									{version.title}
								</div>
							</button>
						))
				)}
			</div>
			<div className="mt-4 rounded-sm border border-border/75 bg-background/55 p-3">
				<div className="text-xs font-semibold text-foreground">过程数据</div>
				<div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
					<Metric label="候选" value={project.candidates.length} />
					<Metric label="资料" value={project.researchSources.length} />
					<Metric label="结构" value={project.structures.length} />
					<Metric label="版本" value={project.packageVersions.length} />
				</div>
			</div>
			<div className="mt-3 text-xs leading-5 text-muted-foreground">
				平台 API 备注：YouTube 可接官方 Data API；B 站第一版保留搜索适配器，优先以合规公开入口和用户授权能力为准。
			</div>
		</aside>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-sm border border-border/65 bg-muted/[0.24] px-2 py-2">
			<div className="text-[0.68rem] text-muted-foreground">{label}</div>
			<div className="mt-1 text-base font-semibold text-foreground">{value}</div>
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
