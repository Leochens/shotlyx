import type {
	PlatformRecommendation,
	ResearchSource,
	ScriptSegment,
	TopicCandidate,
	TopicPackageVersion,
	TopicPlatform,
	TopicProject,
	VideoStructureOption,
} from "./types";

const DEFAULT_PLATFORMS: TopicPlatform[] = ["bilibili", "youtube"];

function createId(prefix: string): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampPrompt(prompt: string): string {
	const trimmed = prompt.trim().replace(/\s+/g, " ");
	if (!trimmed) return "一个值得拆解的新内容方向";
	return trimmed.length > 34 ? `${trimmed.slice(0, 34)}...` : trimmed;
}

function encodeQuery(query: string): string {
	return encodeURIComponent(query.trim());
}

export function createTopicCandidatesFromPrompt({
	prompt,
	now = Date.now(),
}: {
	prompt: string;
	now?: number;
}): TopicCandidate[] {
	const brief = clampPrompt(prompt);
	const platformDefaults = DEFAULT_PLATFORMS;

	return [
		{
			id: createId("candidate"),
			title: `${brief}：最近为什么值得关注`,
			summary: "从最新变化切入，解释它和普通创作者、广告主、工具用户的关系。",
			coreViewpoint: "不是追热点，而是判断这个变化会如何影响真实创作工作流。",
			audience: "关注 AI、科技工具和内容生产效率的创作者。",
			platforms: platformDefaults,
			durationMinutes: 6,
			rationale: "适合做成趋势解读，能自然承接同题调研和资料引用。",
			risks: ["容易泛泛而谈，需要找到一个具体案例或对比对象。"],
			status: "draft",
			updatedAt: now,
		},
		{
			id: createId("candidate"),
			title: `我实测了 ${brief}，结论和想象不一样`,
			summary: "用创作者自己的实验视角，把抽象话题变成真实体验。",
			coreViewpoint: "观众更愿意相信经过试错的判断，而不是纯概念介绍。",
			audience: "想少走弯路、寻找真实工具体验的个人创作者。",
			platforms: ["bilibili", "xiaohongshu"],
			durationMinutes: 8,
			rationale: "自测类选题更容易形成可信度，也方便后续转入视频制作。",
			risks: ["需要真实素材、录屏或过程记录，否则说服力不足。"],
			status: "draft",
			updatedAt: now,
		},
		{
			id: createId("candidate"),
			title: `${brief} 的 3 种玩法：从灵感到发布`,
			summary: "把话题拆成几个可复用场景，适合做成合集或教程。",
			coreViewpoint: "好工具的价值不在功能清单，而在能否嵌入完整创作流程。",
			audience: "想把新技术用于具体产出的创作者、小团队和小广告主。",
			platforms: ["youtube", "bilibili", "douyin"],
			durationMinutes: 5,
			rationale: "结构清晰，适合后续做分段脚本、MG 动画和素材表。",
			risks: ["案例太多会变散，需要控制在 3 个以内。"],
			status: "draft",
			updatedAt: now,
		},
		{
			id: createId("candidate"),
			title: `别人都在讲 ${brief}，但漏掉了这个角度`,
			summary: "先搜索同类内容，再找一个差异化切口形成观点型视频。",
			coreViewpoint: "同题内容不是避开，而是找出别人没有讲透的空位。",
			audience: "喜欢观点、行业判断和深度分析的观众。",
			platforms: ["bilibili", "youtube"],
			durationMinutes: 10,
			rationale: "非常适合同题雷达：先看别人怎么做，再设计自己的切入点。",
			risks: ["需要引用充分，避免把推测说成事实。"],
			status: "draft",
			updatedAt: now,
		},
		{
			id: createId("candidate"),
			title: `${brief} 能不能变成一次小型投放实验`,
			summary: "站在小广告主视角，把选题转成可测试的短视频创意包。",
			coreViewpoint: "内容不是一次性作品，而是可以被测试、复用和迭代的广告资产。",
			audience: "小型广告主、独立开发者、希望做内容增长的产品团队。",
			platforms: ["douyin", "xiaohongshu", "video-account"],
			durationMinutes: 3,
			rationale: "和 Shotlyx 的长远定位最贴近，能自然进入发布和复盘闭环。",
			risks: ["需要明确转化目标，否则会像普通宣传片。"],
			status: "draft",
			updatedAt: now,
		},
	];
}

export function createTopicProjectFromPrompt({
	editorProjectId,
	prompt,
	now = Date.now(),
}: {
	editorProjectId: string;
	prompt: string;
	now?: number;
}): TopicProject {
	const candidates = createTopicCandidatesFromPrompt({ prompt, now });

	return {
		id: createId("topic-project"),
		editorProjectId,
		title: clampPrompt(prompt),
		originPrompt: prompt.trim(),
		stage: "ideation",
		status: "active",
		createdAt: now,
		updatedAt: now,
		promptHistory: [prompt.trim()].filter(Boolean),
		candidates,
		selectedCandidateId: null,
		researchSources: [],
		structures: [],
		selectedStructureId: null,
		packageVersions: [],
		activePackageVersionId: null,
	};
}

export function mergePromptIntoProject({
	project,
	prompt,
	now = Date.now(),
}: {
	project: TopicProject;
	prompt: string;
	now?: number;
}): TopicProject {
	const trimmed = prompt.trim();
	if (!trimmed) return project;
	if (project.candidates.length === 0) {
		return {
			...project,
			candidates: createTopicCandidatesFromPrompt({ prompt: trimmed, now }),
			originPrompt: trimmed,
			title: clampPrompt(trimmed),
			promptHistory: [...project.promptHistory, trimmed],
			updatedAt: now,
		};
	}

	return {
		...project,
		promptHistory: [...project.promptHistory, trimmed].slice(-12),
		updatedAt: now,
	};
}

export function selectCandidate({
	project,
	candidateId,
	now = Date.now(),
}: {
	project: TopicProject;
	candidateId: string;
	now?: number;
}): TopicProject {
	return {
		...project,
		selectedCandidateId: candidateId,
		candidates: project.candidates.map((candidate) => ({
			...candidate,
			status: candidate.id === candidateId ? "selected" : "draft",
			updatedAt: candidate.id === candidateId ? now : candidate.updatedAt,
		})),
		updatedAt: now,
	};
}

export function updateCandidate({
	project,
	candidateId,
	patch,
	now = Date.now(),
}: {
	project: TopicProject;
	candidateId: string;
	patch: Partial<Pick<TopicCandidate, "title" | "summary" | "coreViewpoint">>;
	now?: number;
}): TopicProject {
	return {
		...project,
		candidates: project.candidates.map((candidate) =>
			candidate.id === candidateId
				? { ...candidate, ...patch, updatedAt: now }
				: candidate,
		),
		updatedAt: now,
	};
}

function getSelectedCandidate(project: TopicProject): TopicCandidate | null {
	return (
		project.candidates.find(
			(candidate) => candidate.id === project.selectedCandidateId,
		) ?? null
	);
}

export function confirmSelectedCandidate({
	project,
	now = Date.now(),
}: {
	project: TopicProject;
	now?: number;
}): TopicProject {
	const selected = getSelectedCandidate(project);
	if (!selected) return project;
	return {
		...project,
		stage: "research",
		candidates: project.candidates.map((candidate) => ({
			...candidate,
			status: candidate.id === selected.id ? "confirmed" : "draft",
			updatedAt: candidate.id === selected.id ? now : candidate.updatedAt,
		})),
		researchSources:
			project.researchSources.length > 0
				? project.researchSources
				: createResearchSources({ candidate: selected }),
		updatedAt: now,
	};
}

export function createResearchSources({
	candidate,
}: {
	candidate: TopicCandidate;
}): ResearchSource[] {
	const query = `${candidate.title} ${candidate.coreViewpoint}`;
	const encoded = encodeQuery(query);

	return [
		{
			id: createId("source"),
			platform: "youtube",
			title: `YouTube 同题搜索：${candidate.title}`,
			url: `https://www.youtube.com/results?search_query=${encoded}`,
			sourceName: "YouTube",
			angle: "查看同类视频标题、缩略图和频道定位，判断海外创作者怎么切入。",
			whyRelevant: "用于识别是否已有成熟叙事，以及哪些角度过于拥挤。",
			confidence: "medium",
		},
		{
			id: createId("source"),
			platform: "bilibili",
			title: `B 站同题搜索：${candidate.title}`,
			url: `https://search.bilibili.com/all?keyword=${encoded}`,
			sourceName: "Bilibili",
			angle: "观察中文创作者的标题表达、弹幕/评论语境和受众期待。",
			whyRelevant: "B 站更适合判断深度内容是否有人持续讨论。",
			confidence: "medium",
		},
		{
			id: createId("source"),
			platform: "web",
			title: `网页资讯检索：${candidate.coreViewpoint}`,
			url: `https://www.google.com/search?q=${encoded}`,
			sourceName: "Web Search",
			angle: "查找新闻、测评、博客和第三方分析，补足事实背景。",
			whyRelevant: "用于给脚本提供可核验的公开来源。",
			confidence: "medium",
		},
		{
			id: createId("source"),
			platform: "official",
			title: "官方文档 / 官网 / 发布说明",
			url: `https://www.google.com/search?q=${encodeQuery(`${candidate.title} official docs announcement`)}`,
			sourceName: "Official sources",
			angle: "优先核查产品能力、发布时间、定价、限制和引用原文。",
			whyRelevant: "事实核查阶段应优先引用官方材料，而不是二手解读。",
			confidence: "high",
		},
	];
}

export function createStructureOptions({
	candidate,
}: {
	candidate: TopicCandidate;
}): VideoStructureOption[] {
	return [
		{
			id: createId("structure"),
			name: "单点深挖",
			bestFor: "观点清晰、想做深度解释的选题",
			rationale: "适合把一个核心观点讲透，避免内容变成资料堆砌。",
			flow: [
				{ label: "钩子", description: "用反常识问题开场，说明为什么现在要看。" },
				{ label: "背景", description: "快速交代事件、产品或趋势的基本事实。" },
				{ label: "判断", description: `围绕「${candidate.coreViewpoint}」展开论证。` },
				{ label: "案例", description: "加入同题雷达或实测案例，降低空泛感。" },
				{ label: "结论", description: "给创作者一个明确行动建议。" },
			],
		},
		{
			id: createId("structure"),
			name: "合集对比",
			bestFor: "工具、产品、平台或方案比较",
			rationale: "适合做成信息密度高的横向比较，便于拆成短视频片段。",
			flow: [
				{ label: "痛点", description: "先给出用户为什么需要比较。" },
				{ label: "维度", description: "定义 3-4 个比较维度，避免主观乱评。" },
				{ label: "对比", description: "逐项比较方案、优缺点和适用人群。" },
				{ label: "推荐", description: "给不同用户分层推荐，不做万能结论。" },
			],
		},
		{
			id: createId("structure"),
			name: "场景软引流",
			bestFor: "产品推广、小广告主、个人品牌",
			rationale: "先讲真实问题，再自然引出工具或产品，避免硬广感。",
			flow: [
				{ label: "真实场景", description: "描述一个观众熟悉的创作困境。" },
				{ label: "失败路径", description: "展示传统做法为什么慢、贵或不稳定。" },
				{ label: "新方案", description: "引入产品/方法，展示关键变化。" },
				{ label: "结果", description: "用前后对比或时间成本说明价值。" },
				{ label: "行动", description: "给出轻 CTA 或下一步尝试建议。" },
			],
		},
		{
			id: createId("structure"),
			name: "实验记录",
			bestFor: "创作者亲测、过程展示、可复盘内容",
			rationale: "强调真实过程和可验证结果，非常适合形成系列内容。",
			flow: [
				{ label: "目标", description: "明确这次实验想验证什么。" },
				{ label: "过程", description: "记录关键步骤、失败点和调整。" },
				{ label: "结果", description: "展示产出、数据或主观体验。" },
				{ label: "复盘", description: "总结适合谁、不适合谁、下一版怎么做。" },
			],
		},
	];
}

function createOutline({
	structure,
}: {
	structure: VideoStructureOption;
}): string[] {
	return structure.flow.map(
		(step, index) => `${index + 1}. ${step.label}：${step.description}`,
	);
}

function createScriptSegments({
	structure,
	durationMinutes,
}: {
	structure: VideoStructureOption;
	durationMinutes: number;
}): ScriptSegment[] {
	const segmentLength = Math.max(30, Math.round((durationMinutes * 60) / structure.flow.length));
	return structure.flow.map((step, index) => {
		const start = index * segmentLength;
		const end = index === structure.flow.length - 1 ? durationMinutes * 60 : start + segmentLength;
		return {
			timeRange: `${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")} - ${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`,
			content: `${step.label}：${step.description}`,
			materialSuggestion:
				index === 0
					? "使用高冲击标题画面、录屏或问题式口播开场。"
					: "匹配同题案例截图、产品录屏、资料引用或简洁 MG 说明。",
		};
	});
}

function createPlatformRecommendations({
	candidate,
}: {
	candidate: TopicCandidate;
}): PlatformRecommendation[] {
	return candidate.platforms.map((platform) => ({
		platform,
		title:
			platform === "youtube"
				? `${candidate.title} | What creators should notice`
				: candidate.title,
		description:
			platform === "bilibili"
				? `${candidate.summary}\n\n核心观点：${candidate.coreViewpoint}`
				: `${candidate.summary} 适合 ${candidate.audience}，建议控制在 ${candidate.durationMinutes} 分钟左右。`,
	}));
}

export function createTopicPackageVersion({
	project,
	now = Date.now(),
}: {
	project: TopicProject;
	now?: number;
}): TopicPackageVersion | null {
	const candidate = getSelectedCandidate(project);
	const structure =
		project.structures.find(
			(item) => item.id === project.selectedStructureId,
		) ?? project.structures[0];
	if (!candidate || !structure) return null;

	const versionNumber = project.packageVersions.length + 1;
	return {
		id: createId("topic-package"),
		versionName: `V${versionNumber}`,
		createdAt: now,
		basedOnCandidateId: candidate.id,
		basedOnStructureId: structure.id,
		title: candidate.title,
		summary: candidate.summary,
		coreViewpoint: candidate.coreViewpoint,
		audienceAnalysis: candidate.audience,
		durationMinutes: candidate.durationMinutes,
		rationale: candidate.rationale,
		outline: createOutline({ structure }),
		scriptSegments: createScriptSegments({
			structure,
			durationMinutes: candidate.durationMinutes,
		}),
		platformRecommendations: createPlatformRecommendations({ candidate }),
		coverIdeas: [
			"反差式封面：左侧放用户痛点，右侧放新方案结果。",
			"同题雷达封面：用 3 个竞品标题截图做背景，突出你的差异化问题。",
			"口播封面：人物半身 + 大号问题句，保留平台安全边距。",
		],
		referenceSourceIds: project.researchSources.map((source) => source.id),
	};
}

export function advanceToStructureStage({
	project,
	now = Date.now(),
}: {
	project: TopicProject;
	now?: number;
}): TopicProject {
	const candidate = getSelectedCandidate(project);
	if (!candidate) return project;
	const structures =
		project.structures.length > 0
			? project.structures
			: createStructureOptions({ candidate });
	return {
		...project,
		stage: "structure",
		structures,
		selectedStructureId: project.selectedStructureId ?? structures[0]?.id ?? null,
		updatedAt: now,
	};
}

export function selectStructure({
	project,
	structureId,
	now = Date.now(),
}: {
	project: TopicProject;
	structureId: string;
	now?: number;
}): TopicProject {
	return {
		...project,
		selectedStructureId: structureId,
		stage: "structure",
		updatedAt: now,
	};
}

export function addPackageVersion({
	project,
	now = Date.now(),
}: {
	project: TopicProject;
	now?: number;
}): TopicProject {
	const version = createTopicPackageVersion({ project, now });
	if (!version) return project;
	return {
		...project,
		stage: "package",
		status: "ready-for-video",
		packageVersions: [...project.packageVersions, version],
		activePackageVersionId: version.id,
		updatedAt: now,
	};
}
