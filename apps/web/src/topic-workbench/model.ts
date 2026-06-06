import type {
	PlatformRecommendation,
	ProductionPlan,
	ProductionPlanAssetType,
	ProductionPlanVideoType,
	ResearchInsight,
	ResearchPlatform,
	ResearchSource,
	ScriptSegment,
	TopicCandidate,
	TopicInputMaterial,
	TopicInputMaterialKind,
	TopicPackageVersion,
	TopicPlatform,
	TopicProject,
	TopicProjectMode,
	TopicScriptTableAsset,
	TopicScriptTableRow,
	TopicStage,
	VideoStructureOption,
} from "./types";

const DEFAULT_PLATFORMS: TopicPlatform[] = ["bilibili", "youtube"];
const PARAMETER_HINT_PATTERN =
	/(B\s*站|bilibili|YouTube|油管|小红书|抖音|视频号|分钟|时长|平台|口播|竖屏|横屏)/i;
const REVISION_INTENT_PATTERN =
	/(重新|再来|换成|换一个|改成|调整|新选题|另一个|第二版|新版|重做|不对|不是这个)/;
const TOPIC_CONTEXT_PATTERN = /(选题|方向|候选|方案|标题|主题)/;
const MAX_INPUT_MATERIAL_CONTENT_LENGTH = 12_000;
const BRAINSTORM_DRAFT_MATERIAL_ID = "material-brainstorm-draft";

export interface TopicCandidateDraft {
	title: string;
	summary?: string;
	coreViewpoint?: string;
	audience?: string;
	platforms?: TopicPlatform[];
	durationMinutes?: number;
	rationale?: string;
	risks?: string[];
}

export interface TopicInputMaterialDraft {
	id?: string;
	kind?: TopicInputMaterialKind;
	title?: string;
	name?: string;
	summary?: string;
	content?: string;
	mediaAssetId?: string;
	mediaType?: string;
	durationSeconds?: number;
	sizeBytes?: number;
	createdAt?: number;
}

interface TopicCandidateSuggestion {
	title: string;
	detail?: string;
}

export interface ResearchSourceDraft {
	platform?: ResearchPlatform;
	title: string;
	url: string;
	sourceName?: string;
	angle?: string;
	whyRelevant?: string;
	confidence?: ResearchSource["confidence"];
}

export interface ResearchInsightDraft {
	id?: string;
	title?: string;
	content: string;
	sourceIndexes?: number[];
	sourceUrls?: string[];
	sourceTitles?: string[];
	hidden?: boolean;
	kind?: ResearchInsight["kind"];
}

export interface VideoStructureOptionDraft {
	name: string;
	bestFor?: string;
	rationale?: string;
	flow: Array<{
		label: string;
		description: string;
	}>;
}

export interface ProductionPlanDraft {
	videoType?: ProductionPlanVideoType;
	targetPlatform?: string[];
	estimatedDurationMinutes?: number;
	segments?: Array<{
		timeRange?: string;
		goal?: string;
		script?: string;
		visualNeed?: string;
		assetSuggestion?: string;
		editSuggestion?: string;
	}>;
	requiredAssets?: Array<{
		type?: ProductionPlanAssetType;
		description?: string;
		optional?: boolean;
	}>;
	nextActions?: string[];
}

export interface TopicPackageDraft {
	title?: string;
	summary?: string;
	coreViewpoint?: string;
	audienceAnalysis?: string;
	durationMinutes?: number;
	rationale?: string;
	outline?: string[];
	scriptSegments?: Array<{
		timeRange?: string;
		content?: string;
		materialSuggestion?: string;
	}>;
	platformRecommendations?: Array<{
		platform?: TopicPlatform;
		title?: string;
		description?: string;
	}>;
	coverIdeas?: string[];
}

export interface TopicPackagePatch {
	title?: string;
	summary?: string;
	coreViewpoint?: string;
	audienceAnalysis?: string;
	durationMinutes?: number;
	rationale?: string;
}

export interface TopicPackagePlatformRecommendationPatch {
	title?: string;
	description?: string;
}

export interface TopicInputMaterialPatch {
	title?: string;
	summary?: string;
	content?: string;
}

export interface TopicScriptTableRowPatch {
	timeRange?: string;
	copy?: string;
	visualContent?: string;
}

function createId(prefix: string): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTopicScriptTableRow({
	index,
	now,
}: {
	index: number;
	now: number;
}): TopicScriptTableRow {
	return {
		id: `script-row-${index + 1}`,
		timeRange: "",
		copy: "",
		visualContent: "",
		assets: [],
		updatedAt: now,
	};
}

export function createDefaultScriptTableRows({
	now = Date.now(),
}: {
	now?: number;
} = {}): TopicScriptTableRow[] {
	return Array.from({ length: 3 }, (_, index) =>
		createTopicScriptTableRow({ index, now }),
	);
}

function normalizeScriptTableAsset({
	asset,
	now,
}: {
	asset: TopicScriptTableAsset;
	now: number;
}): TopicScriptTableAsset | null {
	const mediaAssetId = asset.mediaAssetId.trim();
	const name = asset.name.trim();
	if (!mediaAssetId || !name) return null;
	return {
		mediaAssetId,
		name: clampText({ value: name, maxLength: 120 }),
		mediaType: asset.mediaType?.trim() || undefined,
		durationSeconds:
			typeof asset.durationSeconds === "number" &&
			Number.isFinite(asset.durationSeconds)
				? asset.durationSeconds
				: undefined,
		sizeBytes:
			typeof asset.sizeBytes === "number" && Number.isFinite(asset.sizeBytes)
				? asset.sizeBytes
				: undefined,
		addedAt:
			typeof asset.addedAt === "number" && Number.isFinite(asset.addedAt)
				? asset.addedAt
				: now,
	};
}

function normalizeScriptTableRow({
	row,
	index,
	now,
}: {
	row: Partial<TopicScriptTableRow> | null | undefined;
	index: number;
	now: number;
}): TopicScriptTableRow {
	const fallback = createTopicScriptTableRow({ index, now });
	if (!row) return fallback;

	const assets = new Map<string, TopicScriptTableAsset>();
	for (const asset of row.assets ?? []) {
		const normalized = normalizeScriptTableAsset({ asset, now });
		if (!normalized) continue;
		assets.set(normalized.mediaAssetId, normalized);
	}

	return {
		id: row.id?.trim() || fallback.id,
		timeRange: row.timeRange?.slice(0, 80) ?? "",
		copy: row.copy?.slice(0, 6000) ?? "",
		visualContent: row.visualContent?.slice(0, 6000) ?? "",
		assets: [...assets.values()],
		updatedAt:
			typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt)
				? row.updatedAt
				: now,
	};
}

export function ensureTopicScriptTableRows({
	rows,
	now = Date.now(),
}: {
	rows?: TopicScriptTableRow[];
	now?: number;
}): TopicScriptTableRow[] {
	if (!rows || rows.length === 0) return createDefaultScriptTableRows({ now });
	return rows.map((row, index) =>
		normalizeScriptTableRow({ row, index, now }),
	);
}

export function getTopicProjectMode(project: TopicProject): TopicProjectMode {
	return project.mode === "brainstorm" ? "brainstorm" : "workflow";
}

function clampPrompt(prompt: string): string {
	const trimmed = prompt.trim().replace(/\s+/g, " ");
	if (!trimmed) return "一个值得拆解的新内容方向";
	return trimmed.length > 34 ? `${trimmed.slice(0, 34)}...` : trimmed;
}

function clampText({
	value,
	maxLength,
}: {
	value: string;
	maxLength: number;
}): string {
	const trimmed = value.trim().replace(/\s+/g, " ");
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, maxLength)}...`;
}

function isTopicInputMaterialKind(
	value: string,
): value is TopicInputMaterialKind {
	return (
		value === "uploaded-media" ||
		value === "script" ||
		value === "screen-recording" ||
		value === "note"
	);
}

function clampMaterialContent(value?: string): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	if (trimmed.length <= MAX_INPUT_MATERIAL_CONTENT_LENGTH) return trimmed;
	return `${trimmed.slice(0, MAX_INPUT_MATERIAL_CONTENT_LENGTH)}...`;
}

function createMaterialDedupKey(material: TopicInputMaterial): string {
	if (material.mediaAssetId) return `media:${material.mediaAssetId}`;
	const contentKey = material.content?.slice(0, 180) ?? material.summary ?? "";
	return `${material.kind}:${material.title}:${contentKey}`;
}

function normalizeInputMaterial({
	material,
	now,
}: {
	material: TopicInputMaterialDraft;
	now: number;
}): TopicInputMaterial | null {
	const rawKind = material.kind ?? "note";
	const kind = isTopicInputMaterialKind(rawKind) ? rawKind : "note";
	const title = (material.title ?? material.name ?? "").trim();
	if (!title) return null;
	const content = clampMaterialContent(material.content);
	const summary = material.summary?.trim() || undefined;

	return {
		id: material.id?.trim() || createId("material"),
		kind,
		title: clampText({ value: title, maxLength: 80 }),
		summary,
		content,
		mediaAssetId: material.mediaAssetId?.trim() || undefined,
		mediaType: material.mediaType?.trim() || undefined,
		durationSeconds:
			typeof material.durationSeconds === "number" &&
			Number.isFinite(material.durationSeconds)
				? material.durationSeconds
				: undefined,
		sizeBytes:
			typeof material.sizeBytes === "number" &&
			Number.isFinite(material.sizeBytes)
				? material.sizeBytes
				: undefined,
		createdAt:
			typeof material.createdAt === "number" &&
			Number.isFinite(material.createdAt)
				? material.createdAt
				: now,
	};
}

export function mergeTopicInputMaterials({
	existing = [],
	incoming = [],
	now = Date.now(),
}: {
	existing?: TopicInputMaterial[];
	incoming?: TopicInputMaterialDraft[];
	now?: number;
}): TopicInputMaterial[] {
	const nextMaterials = new Map<string, TopicInputMaterial>();
	for (const material of existing) {
		nextMaterials.set(createMaterialDedupKey(material), material);
	}
	for (const draft of incoming) {
		const material = normalizeInputMaterial({ material: draft, now });
		if (!material) continue;
		nextMaterials.set(createMaterialDedupKey(material), material);
	}
	return [...nextMaterials.values()].slice(-12);
}

export function updateTopicScriptTableRow({
	project,
	rowId,
	patch,
	now = Date.now(),
}: {
	project: TopicProject;
	rowId: string;
	patch: TopicScriptTableRowPatch;
	now?: number;
}): TopicProject {
	const rows = ensureTopicScriptTableRows({
		rows: project.scriptTableRows,
		now,
	});
	return {
		...project,
		scriptTableRows: rows.map((row) =>
			row.id === rowId
				? {
						...row,
						timeRange:
							patch.timeRange !== undefined
								? patch.timeRange.slice(0, 80)
								: row.timeRange,
						copy:
							patch.copy !== undefined ? patch.copy.slice(0, 6000) : row.copy,
						visualContent:
							patch.visualContent !== undefined
								? patch.visualContent.slice(0, 6000)
								: row.visualContent,
						updatedAt: now,
					}
				: row,
		),
		updatedAt: now,
	};
}

export function addTopicScriptTableRow({
	project,
	afterRowId,
	now = Date.now(),
}: {
	project: TopicProject;
	afterRowId?: string;
	now?: number;
}): TopicProject {
	const rows = ensureTopicScriptTableRows({
		rows: project.scriptTableRows,
		now,
	});
	const nextRow: TopicScriptTableRow = {
		...createTopicScriptTableRow({ index: rows.length, now }),
		id: createId("script-row"),
	};
	if (!afterRowId) {
		return {
			...project,
			scriptTableRows: [...rows, nextRow],
			updatedAt: now,
		};
	}
	const insertIndex = rows.findIndex((row) => row.id === afterRowId);
	if (insertIndex < 0) {
		return {
			...project,
			scriptTableRows: [...rows, nextRow],
			updatedAt: now,
		};
	}
	return {
		...project,
		scriptTableRows: [
			...rows.slice(0, insertIndex + 1),
			nextRow,
			...rows.slice(insertIndex + 1),
		],
		updatedAt: now,
	};
}

export function removeTopicScriptTableRow({
	project,
	rowId,
	now = Date.now(),
}: {
	project: TopicProject;
	rowId: string;
	now?: number;
}): TopicProject {
	const rows = ensureTopicScriptTableRows({
		rows: project.scriptTableRows,
		now,
	}).filter((row) => row.id !== rowId);
	return {
		...project,
		scriptTableRows:
			rows.length > 0 ? rows : createDefaultScriptTableRows({ now }),
		updatedAt: now,
	};
}

export function attachTopicScriptTableAssets({
	project,
	rowId,
	assets,
	now = Date.now(),
}: {
	project: TopicProject;
	rowId: string;
	assets: TopicScriptTableAsset[];
	now?: number;
}): TopicProject {
	if (assets.length === 0) return project;
	const rows = ensureTopicScriptTableRows({
		rows: project.scriptTableRows,
		now,
	});
	return {
		...project,
		scriptTableRows: rows.map((row) => {
			if (row.id !== rowId) return row;
			const nextAssets = new Map<string, TopicScriptTableAsset>();
			for (const asset of row.assets) {
				nextAssets.set(asset.mediaAssetId, asset);
			}
			for (const asset of assets) {
				const normalized = normalizeScriptTableAsset({ asset, now });
				if (!normalized) continue;
				nextAssets.set(normalized.mediaAssetId, normalized);
			}
			return {
				...row,
				assets: [...nextAssets.values()],
				updatedAt: now,
			};
		}),
		updatedAt: now,
	};
}

export function removeTopicScriptTableAsset({
	project,
	rowId,
	mediaAssetId,
	now = Date.now(),
}: {
	project: TopicProject;
	rowId: string;
	mediaAssetId: string;
	now?: number;
}): TopicProject {
	const rows = ensureTopicScriptTableRows({
		rows: project.scriptTableRows,
		now,
	});
	return {
		...project,
		scriptTableRows: rows.map((row) =>
			row.id === rowId
				? {
						...row,
						assets: row.assets.filter(
							(asset) => asset.mediaAssetId !== mediaAssetId,
						),
						updatedAt: now,
					}
				: row,
		),
		updatedAt: now,
	};
}

function encodeQuery(query: string): string {
	return encodeURIComponent(query.trim());
}

function appendPromptHistory({
	promptHistory,
	prompt,
}: {
	promptHistory: string[];
	prompt: string;
}): string[] {
	return [...promptHistory, prompt].slice(-12);
}

function appendOptionalPromptHistory({
	promptHistory,
	prompt,
}: {
	promptHistory: string[];
	prompt?: string;
}): string[] {
	const trimmed = prompt?.trim();
	if (!trimmed) return promptHistory;
	return appendPromptHistory({ promptHistory, prompt: trimmed });
}

function shouldRefreshCandidatesFromText({
	project,
	text,
}: {
	project: TopicProject;
	text: string;
}): boolean {
	if (project.candidates.length === 0) return true;
	if (project.stage === "ideation") return true;
	return REVISION_INTENT_PATTERN.test(text);
}

function buildRevisionPrompt({
	project,
	prompt,
}: {
	project: TopicProject;
	prompt: string;
}): string {
	if (
		PARAMETER_HINT_PATTERN.test(prompt) &&
		!REVISION_INTENT_PATTERN.test(prompt)
	) {
		const base = project.originPrompt || project.title;
		return `${base} ${prompt}`.trim();
	}
	return prompt;
}

function normalizeSuggestionText(value: string): string {
	return value
		.replace(/\*\*/g, "")
		.replace(/[`_]/g, "")
		.replace(/^["'“”《]+|["'“”》]+$/g, "")
		.trim();
}

function parseSuggestionLine(line: string): TopicCandidateSuggestion | null {
	const match = line.match(
		/^\s*(?:[-*]\s*)?(?:(?:\d{1,2}|[一二三四五六七八九十])[).、]|方案\s*(?:\d{1,2}|[一二三四五六七八九十])[:：]|选题\s*(?:\d{1,2}|[一二三四五六七八九十])?[:：]|方向\s*(?:\d{1,2}|[一二三四五六七八九十])?[:：])\s*(.+)$/,
	);
	if (!match?.[1]) return null;

	const cleaned = normalizeSuggestionText(match[1]);
	if (cleaned.length < 4) return null;
	if (
		/^(脚本|大纲|素材|发布文案|视频描述|封面|参考资料|调研|结构|开场|结尾)[:：]/.test(
			cleaned,
		)
	) {
		return null;
	}

	const separatorMatch = cleaned.match(/^(.{4,58}?)[：:]\s*(.+)$/);
	if (!separatorMatch?.[1]) {
		return { title: clampText({ value: cleaned, maxLength: 72 }) };
	}

	return {
		title: clampText({
			value: normalizeSuggestionText(separatorMatch[1]),
			maxLength: 72,
		}),
		detail: separatorMatch[2]
			? clampText({
					value: normalizeSuggestionText(separatorMatch[2]),
					maxLength: 120,
				})
			: undefined,
	};
}

export function extractTopicCandidateSuggestions(
	content: string,
): TopicCandidateSuggestion[] {
	if (!TOPIC_CONTEXT_PATTERN.test(content)) return [];

	const suggestions: TopicCandidateSuggestion[] = [];
	const seenTitles = new Set<string>();
	for (const line of content.split(/\r?\n/)) {
		const suggestion = parseSuggestionLine(line);
		if (!suggestion || seenTitles.has(suggestion.title)) continue;
		seenTitles.add(suggestion.title);
		suggestions.push(suggestion);
		if (suggestions.length >= 5) break;
	}
	return suggestions;
}

export function createTopicCandidatesFromPrompt({
	prompt,
	inputMaterials = [],
	now = Date.now(),
}: {
	prompt: string;
	inputMaterials?: TopicInputMaterial[];
	now?: number;
}): TopicCandidate[] {
	const brief = clampPrompt(prompt);
	const platformDefaults = DEFAULT_PLATFORMS;
	const materialRationale =
		inputMaterials.length > 0
			? `基于用户提供的 ${inputMaterials.length} 个素材输入生成，适合继续把素材里的场景、脚本或录屏内容转成可执行选题。`
			: null;

	return [
		{
			id: createId("candidate"),
			title: `${brief}：最近为什么值得关注`,
			summary: "从最新变化切入，解释它和普通创作者、广告主、工具用户的关系。",
			coreViewpoint: "不是追热点，而是判断这个变化会如何影响真实创作工作流。",
			audience: "关注 AI、科技工具和内容生产效率的创作者。",
			platforms: platformDefaults,
			durationMinutes: 6,
			rationale:
				materialRationale ?? "适合做成趋势解读，能自然承接同题调研和资料引用。",
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
			rationale:
				materialRationale ??
				"自测类选题更容易形成可信度，也方便后续转入视频制作。",
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
			rationale:
				materialRationale ?? "结构清晰，适合后续做分段脚本、MG 动画和素材表。",
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
			rationale:
				materialRationale ??
				"非常适合同题雷达：先看别人怎么做，再设计自己的切入点。",
			risks: ["需要引用充分，避免把推测说成事实。"],
			status: "draft",
			updatedAt: now,
		},
		{
			id: createId("candidate"),
			title: `${brief} 能不能变成一次小型投放实验`,
			summary: "站在小广告主视角，把选题转成可测试的短视频创意包。",
			coreViewpoint:
				"内容不是一次性作品，而是可以被测试、复用和迭代的广告资产。",
			audience: "小型广告主、独立开发者、希望做内容增长的产品团队。",
			platforms: ["douyin", "xiaohongshu", "video-account"],
			durationMinutes: 3,
			rationale:
				materialRationale ??
				"和 Shotlyx 的长远定位最贴近，能自然进入发布和复盘闭环。",
			risks: ["需要明确转化目标，否则会像普通宣传片。"],
			status: "draft",
			updatedAt: now,
		},
	];
}

function createTopicCandidatesFromSuggestions({
	suggestions,
	now,
}: {
	suggestions: TopicCandidateSuggestion[];
	now: number;
}): TopicCandidate[] {
	const platformSets: TopicPlatform[][] = [
		["bilibili", "youtube"],
		["bilibili", "xiaohongshu"],
		["youtube", "bilibili", "douyin"],
		["bilibili", "youtube"],
		["douyin", "xiaohongshu", "video-account"],
	];
	const audiences = [
		"关注 AI、科技工具和内容生产效率的创作者。",
		"想少走弯路、寻找真实工具体验的个人创作者。",
		"想把新技术用于具体产出的创作者、小团队和小广告主。",
		"喜欢观点、行业判断和深度分析的观众。",
		"小型广告主、独立开发者、希望做内容增长的产品团队。",
	];

	return suggestions.map((suggestion, index) => ({
		id: createId("candidate"),
		title: suggestion.title,
		summary:
			suggestion.detail ??
			`围绕「${suggestion.title}」展开，把左侧 Agent 聊出的方向沉淀成可继续调研的视频选题。`,
		coreViewpoint:
			"这个选题的价值不只在热点本身，而在它如何影响创作者的真实工作流和发布策略。",
		audience: audiences[index] ?? audiences[0],
		platforms: platformSets[index] ?? DEFAULT_PLATFORMS,
		durationMinutes: index === 4 ? 3 : index === 3 ? 10 : 6 + index,
		rationale:
			"来自当前选题对话，可在右侧选择、确认，并通过左侧 Agent 调整后进入同题调研与结构设计。",
		risks: ["需要继续做同题搜索和事实核验，避免只停留在概念判断。"],
		status: "draft",
		updatedAt: now,
	}));
}

export function createTopicCandidatesFromDrafts({
	drafts,
	fallbackPrompt,
	inputMaterials = [],
	now = Date.now(),
}: {
	drafts: TopicCandidateDraft[];
	fallbackPrompt: string;
	inputMaterials?: TopicInputMaterial[];
	now?: number;
}): TopicCandidate[] {
	const templateCandidates = createTopicCandidatesFromPrompt({
		prompt: fallbackPrompt,
		inputMaterials,
		now,
	});
	const materialRationale =
		inputMaterials.length > 0
			? `基于用户提供的 ${inputMaterials.length} 个素材输入生成，后续调研和脚本应继续围绕这些素材里的场景、脚本或录屏内容展开。`
			: null;

	if (drafts.length === 0) return templateCandidates;

	return drafts.slice(0, 5).map((draft, index) => {
		const template = templateCandidates[index] ?? templateCandidates[0];
		return {
			id: createId("candidate"),
			title: clampText({
				value: draft.title || template.title,
				maxLength: 72,
			}),
			summary:
				draft.summary?.trim() ||
				template.summary ||
				"Agent 已把左侧对话沉淀成这个可继续调研的视频选题。",
			coreViewpoint:
				draft.coreViewpoint?.trim() ||
				template.coreViewpoint ||
				"先找到同题内容里的空位，再形成自己的差异化观点。",
			audience:
				draft.audience?.trim() ||
				template.audience ||
				"关注内容生产效率和创作者工作流的用户。",
			platforms:
				draft.platforms && draft.platforms.length > 0
					? draft.platforms
					: template.platforms,
			durationMinutes:
				typeof draft.durationMinutes === "number" &&
				Number.isFinite(draft.durationMinutes) &&
				draft.durationMinutes > 0
					? Math.round(draft.durationMinutes)
					: template.durationMinutes,
			rationale:
				draft.rationale?.trim() ||
				materialRationale ||
				template.rationale ||
				"这个方向适合继续展开同题搜索、调研引用和脚本结构设计。",
			risks:
				draft.risks && draft.risks.length > 0 ? draft.risks : template.risks,
			status: "draft",
			updatedAt: now,
		};
	});
}

export function replaceTopicCandidates({
	project,
	prompt,
	candidates,
	inputMaterials,
	now = Date.now(),
}: {
	project: TopicProject;
	prompt?: string;
	candidates: TopicCandidateDraft[];
	inputMaterials?: TopicInputMaterialDraft[];
	now?: number;
}): TopicProject {
	const fallbackPrompt =
		prompt?.trim() || project.originPrompt || project.title;
	const nextInputMaterials = mergeTopicInputMaterials({
		existing: project.inputMaterials ?? [],
		incoming: inputMaterials,
		now,
	});
	return {
		...project,
		mode: "workflow",
		title: clampPrompt(fallbackPrompt),
		originPrompt: fallbackPrompt,
		stage: "ideation",
		status: "active",
		candidates: createTopicCandidatesFromDrafts({
			drafts: candidates,
			fallbackPrompt,
			inputMaterials: nextInputMaterials,
			now,
		}),
		inputMaterials: nextInputMaterials,
		selectedCandidateId: null,
		researchSources: [],
		researchInsights: [],
		structures: [],
		selectedStructureId: null,
		activePackageVersionId: null,
		activeProductionPlanId: null,
		promptHistory: appendOptionalPromptHistory({
			promptHistory: project.promptHistory,
			prompt,
		}),
		updatedAt: now,
	};
}

function resolveInsightSourceIds({
	draft,
	sources,
}: {
	draft: ResearchInsightDraft;
	sources: ResearchSource[];
}): string[] {
	const sourceIds = new Set<string>();
	const addSource = (source?: ResearchSource) => {
		if (source) sourceIds.add(source.id);
	};

	for (const rawIndex of draft.sourceIndexes ?? []) {
		if (!Number.isFinite(rawIndex)) continue;
		const index = Math.trunc(rawIndex);
		addSource(sources[index > 0 ? index - 1 : index]);
	}

	for (const url of draft.sourceUrls ?? []) {
		const normalizedUrl = url.trim();
		if (!normalizedUrl) continue;
		addSource(sources.find((source) => source.url === normalizedUrl));
	}

	for (const title of draft.sourceTitles ?? []) {
		const normalizedTitle = title.trim();
		if (!normalizedTitle) continue;
		addSource(
			sources.find(
				(source) =>
					source.title === normalizedTitle ||
					source.title.includes(normalizedTitle),
			),
		);
	}

	return [...sourceIds];
}

function createResearchInsightsFromDrafts({
	insights,
	sources,
}: {
	insights?: ResearchInsightDraft[];
	sources: ResearchSource[];
}): ResearchInsight[] {
	const parsedInsights = (insights ?? []).slice(0, 10).flatMap((insight) => {
		const content = insight.content?.trim();
		if (!content) return [];
		return [
			{
				id: insight.id?.trim() || createId("insight"),
				title:
					insight.title?.trim() ||
					`知识点 ${Math.min((insights ?? []).indexOf(insight) + 1, 10)}`,
				content,
				sourceIds: resolveInsightSourceIds({ draft: insight, sources }),
				hidden: insight.hidden ?? false,
				kind: insight.kind ?? "agent",
			},
		];
	});
	if (parsedInsights.length > 0) return parsedInsights;

	return sources.slice(0, 8).map((source) => ({
		id: createId("insight"),
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

export function applyResearchSources({
	project,
	sources,
	insights,
	now = Date.now(),
}: {
	project: TopicProject;
	sources: ResearchSourceDraft[];
	insights?: ResearchInsightDraft[];
	now?: number;
}): TopicProject {
	const researchSources = sources.slice(0, 12).map((source) => ({
		id: createId("source"),
		platform: source.platform ?? "web",
		title: source.title,
		url: source.url,
		sourceName: source.sourceName ?? source.platform ?? "Web",
		angle: source.angle ?? "Agent 调研得到的相关资料。",
		whyRelevant:
			source.whyRelevant ?? "用于判断同题内容、灵感来源和差异化切口。",
		confidence: source.confidence ?? "medium",
	}));
	const researchInsights = createResearchInsightsFromDrafts({
		insights,
		sources: researchSources,
	});

	return {
		...project,
		stage: "research",
		status: "active",
		researchSources,
		researchInsights,
		structures: [],
		selectedStructureId: null,
		activePackageVersionId: null,
		activeProductionPlanId: null,
		updatedAt: now,
	};
}

export function applyStructureOptions({
	project,
	structures,
	now = Date.now(),
}: {
	project: TopicProject;
	structures: VideoStructureOptionDraft[];
	now?: number;
}): TopicProject {
	const structureOptions = structures.slice(0, 5).map((structure) => ({
		id: createId("structure"),
		name: structure.name,
		bestFor: structure.bestFor ?? "适合当前选题继续拆解脚本和素材表。",
		flow: structure.flow.length > 0 ? structure.flow : [],
		rationale:
			structure.rationale ??
			"由 Agent 根据当前选题和调研资料生成，可在右侧选择后进入选题包。",
	}));

	return {
		...project,
		stage: "structure",
		status: "active",
		structures: structureOptions,
		selectedStructureId: null,
		activePackageVersionId: null,
		activeProductionPlanId: null,
		updatedAt: now,
	};
}

export function resetTopicProjectToStage({
	project,
	stage,
	now = Date.now(),
}: {
	project: TopicProject;
	stage: TopicStage;
	now?: number;
}): TopicProject {
	if (stage === "timeline") {
		return {
			...project,
			stage: "timeline",
			updatedAt: now,
		};
	}

	if (stage === "production") {
		return {
			...project,
			stage: "production",
			activeProductionPlanId: null,
			updatedAt: now,
		};
	}

	if (stage === "package") {
		return {
			...project,
			stage: "package",
			activeProductionPlanId: null,
			updatedAt: now,
		};
	}

	if (stage === "structure") {
		return {
			...project,
			stage: "structure",
			status: "active",
			structures: [],
			selectedStructureId: null,
			activePackageVersionId: null,
			activeProductionPlanId: null,
			updatedAt: now,
		};
	}

	if (stage === "research") {
		return {
			...project,
			stage: "research",
			status: "active",
			researchSources: [],
			researchInsights: [],
			structures: [],
			selectedStructureId: null,
			activePackageVersionId: null,
			activeProductionPlanId: null,
			updatedAt: now,
		};
	}

	return {
		...project,
		stage: "ideation",
		status: "active",
		candidates: [],
		selectedCandidateId: null,
		researchSources: [],
		researchInsights: [],
		structures: [],
		selectedStructureId: null,
		activePackageVersionId: null,
		activeProductionPlanId: null,
		updatedAt: now,
	};
}

export function createTopicProjectFromPrompt({
	editorProjectId,
	prompt,
	inputMaterials,
	now = Date.now(),
}: {
	editorProjectId: string;
	prompt: string;
	inputMaterials?: TopicInputMaterialDraft[];
	now?: number;
}): TopicProject {
	const normalizedInputMaterials = mergeTopicInputMaterials({
		incoming: inputMaterials,
		now,
	});
	const candidates = createTopicCandidatesFromPrompt({
		prompt,
		inputMaterials: normalizedInputMaterials,
		now,
	});

	return {
		id: createId("topic-project"),
		editorProjectId,
		mode: "workflow",
		title: clampPrompt(prompt),
		originPrompt: prompt.trim(),
		stage: "ideation",
		status: "active",
		createdAt: now,
		updatedAt: now,
		promptHistory: [prompt.trim()].filter(Boolean),
		inputMaterials: normalizedInputMaterials,
		scriptTableRows: createDefaultScriptTableRows({ now }),
		candidates,
		selectedCandidateId: null,
		researchSources: [],
		researchInsights: [],
		structures: [],
		selectedStructureId: null,
		packageVersions: [],
		activePackageVersionId: null,
		productionPlans: [],
		activeProductionPlanId: null,
	};
}

export function createTopicProjectFromDraft({
	editorProjectId,
	draft,
	inputMaterials,
	now = Date.now(),
}: {
	editorProjectId: string;
	draft: string;
	inputMaterials?: TopicInputMaterialDraft[];
	now?: number;
}): TopicProject {
	const trimmed = draft.trim();
	const normalizedInputMaterials = mergeTopicInputMaterials({
		incoming: [
			...(inputMaterials ?? []),
			{
				id: BRAINSTORM_DRAFT_MATERIAL_ID,
				kind: "note",
				title: "我的草稿",
				summary: "选题前的自由草稿。",
				content: trimmed || undefined,
				createdAt: now,
			},
		],
		now,
	});

	return {
		id: createId("topic-project"),
		editorProjectId,
		mode: "brainstorm",
		title: clampPrompt(trimmed || "自由草稿"),
		originPrompt: trimmed,
		stage: "ideation",
		status: "draft",
		createdAt: now,
		updatedAt: now,
		promptHistory: [],
		inputMaterials: normalizedInputMaterials,
		scriptTableRows: createDefaultScriptTableRows({ now }),
		candidates: [],
		selectedCandidateId: null,
		researchSources: [],
		researchInsights: [],
		structures: [],
		selectedStructureId: null,
		packageVersions: [],
		activePackageVersionId: null,
		productionPlans: [],
		activeProductionPlanId: null,
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
	const promptHistory = appendPromptHistory({
		promptHistory: project.promptHistory,
		prompt: trimmed,
	});

	if (!shouldRefreshCandidatesFromText({ project, text: trimmed })) {
		return {
			...project,
			promptHistory,
			updatedAt: now,
		};
	}

	const revisionPrompt = buildRevisionPrompt({ project, prompt: trimmed });
	return {
		...project,
		mode: "workflow",
		title: clampPrompt(revisionPrompt),
		originPrompt: revisionPrompt,
		stage: "ideation",
		status: "active",
		candidates: createTopicCandidatesFromPrompt({
			prompt: revisionPrompt,
			inputMaterials: project.inputMaterials ?? [],
			now,
		}),
		selectedCandidateId: null,
		researchSources: [],
		researchInsights: [],
		structures: [],
		selectedStructureId: null,
		activePackageVersionId: null,
		activeProductionPlanId: null,
		promptHistory,
		updatedAt: now,
	};
}

export function mergeAssistantTopicOutputIntoProject({
	project,
	content,
	now = Date.now(),
}: {
	project: TopicProject;
	content: string;
	now?: number;
}): TopicProject {
	const trimmed = content.trim();
	if (!trimmed) return project;
	if (!shouldRefreshCandidatesFromText({ project, text: trimmed })) {
		return project;
	}

	const suggestions = extractTopicCandidateSuggestions(trimmed);
	if (suggestions.length === 0) return project;

	return {
		...project,
		mode: "workflow",
		title: clampPrompt(suggestions[0]?.title ?? project.title),
		stage: "ideation",
		status: "active",
		candidates:
			suggestions.length >= 2
				? createTopicCandidatesFromSuggestions({ suggestions, now })
				: createTopicCandidatesFromPrompt({
						prompt: suggestions[0]?.title ?? trimmed,
						now,
					}),
		selectedCandidateId: null,
		researchSources: [],
		researchInsights: [],
		structures: [],
		selectedStructureId: null,
		activePackageVersionId: null,
		activeProductionPlanId: null,
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

export function updateTopicInputMaterial({
	project,
	materialId,
	patch,
	now = Date.now(),
}: {
	project: TopicProject;
	materialId: string;
	patch: TopicInputMaterialPatch;
	now?: number;
}): TopicProject {
	return {
		...project,
		inputMaterials: (project.inputMaterials ?? []).map((material) =>
			material.id === materialId
				? {
						...material,
						title: patch.title
							? clampText({ value: patch.title, maxLength: 80 })
							: material.title,
						summary:
							patch.summary !== undefined
								? patch.summary.trim() || undefined
								: material.summary,
						content:
							patch.content !== undefined
								? clampMaterialContent(patch.content)
								: material.content,
					}
				: material,
		),
		updatedAt: now,
	};
}

export function removeTopicInputMaterial({
	project,
	materialId,
	now = Date.now(),
}: {
	project: TopicProject;
	materialId: string;
	now?: number;
}): TopicProject {
	return {
		...project,
		inputMaterials: (project.inputMaterials ?? []).filter(
			(material) => material.id !== materialId,
		),
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

export function toggleResearchInsightHidden({
	project,
	insightId,
	hidden,
	now = Date.now(),
}: {
	project: TopicProject;
	insightId: string;
	hidden?: boolean;
	now?: number;
}): TopicProject {
	return {
		...project,
		researchInsights: (project.researchInsights ?? []).map((insight) =>
			insight.id === insightId
				? { ...insight, hidden: hidden ?? !insight.hidden }
				: insight,
		),
		updatedAt: now,
	};
}

export function addResearchInsight({
	project,
	title,
	content,
	sourceIds = [],
	now = Date.now(),
}: {
	project: TopicProject;
	title: string;
	content: string;
	sourceIds?: string[];
	now?: number;
}): TopicProject {
	const trimmedContent = content.trim();
	if (!trimmedContent) return project;
	return {
		...project,
		researchInsights: [
			...(project.researchInsights ?? []),
			{
				id: createId("insight"),
				title: title.trim() || "我的补充想法",
				content: trimmedContent,
				sourceIds,
				hidden: false,
				kind: "custom",
			},
		],
		updatedAt: now,
	};
}

export function updateResearchInsight({
	project,
	insightId,
	patch,
	now = Date.now(),
}: {
	project: TopicProject;
	insightId: string;
	patch: Partial<Pick<ResearchInsight, "title" | "content" | "sourceIds">>;
	now?: number;
}): TopicProject {
	return {
		...project,
		researchInsights: (project.researchInsights ?? []).map((insight) =>
			insight.id === insightId
				? {
						...insight,
						title:
							patch.title !== undefined
								? patch.title.trim() || insight.title
								: insight.title,
						content:
							patch.content !== undefined
								? patch.content.trim() || insight.content
								: insight.content,
						sourceIds: patch.sourceIds ?? insight.sourceIds,
					}
				: insight,
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
		researchSources: [],
		researchInsights: [],
		structures: [],
		selectedStructureId: null,
		activePackageVersionId: null,
		activeProductionPlanId: null,
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
				{
					label: "钩子",
					description: "用反常识问题开场，说明为什么现在要看。",
				},
				{ label: "背景", description: "快速交代事件、产品或趋势的基本事实。" },
				{
					label: "判断",
					description: `围绕「${candidate.coreViewpoint}」展开论证。`,
				},
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
				{
					label: "失败路径",
					description: "展示传统做法为什么慢、贵或不稳定。",
				},
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

function stripEndingPunctuation(value: string): string {
	return value.trim().replace(/[。！？!?.,，、；;：:]+$/u, "");
}

function createVerbatimScriptDraft({
	candidate,
	step,
	index,
	totalSteps,
}: {
	candidate: TopicCandidate;
	step: VideoStructureOption["flow"][number];
	index: number;
	totalSteps: number;
}): string {
	const title = stripEndingPunctuation(candidate.title);
	const viewpoint = stripEndingPunctuation(candidate.coreViewpoint);
	const audience = stripEndingPunctuation(candidate.audience);
	const description = stripEndingPunctuation(step.description);

	if (index === 0) {
		return `今天这期我们先从一个很具体的问题开始：「${title}」到底值不值得做成一条内容？我的判断是，${viewpoint}。如果你是${audience}，先别急着找素材，我们先看第一个关键点：${description}。只要这个点成立，后面的案例和结论就都有了基础。`;
	}

	if (index === totalSteps - 1) {
		return `最后我们把整条视频收回来。围绕「${title}」，这期最想留下的观点是：${viewpoint}。你可以把「${step.label}」理解成看完后的行动入口：${description}。所以这里不再扩散新信息，我们直接落到下一步：你可以怎么验证、怎么尝试，以及为什么现在就应该关注这个变化。`;
	}

	return `接下来我们看「${step.label}」。${description}。它放在「${title}」这个选题里真正重要的地方是：它在支撑这条主线，${viewpoint}。所以我不会只给你一个抽象判断，我会把它拆成一个可观察的画面：你看到什么、对比什么，最后应该得出什么结论。`;
}

function createScriptSegments({
	candidate,
	structure,
	durationMinutes,
}: {
	candidate: TopicCandidate;
	structure: VideoStructureOption;
	durationMinutes: number;
}): ScriptSegment[] {
	const segmentLength = Math.max(
		30,
		Math.round((durationMinutes * 60) / structure.flow.length),
	);
	return structure.flow.map((step, index) => {
		const start = index * segmentLength;
		const end =
			index === structure.flow.length - 1
				? durationMinutes * 60
				: start + segmentLength;
		return {
			timeRange: `${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")} - ${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`,
			content: createVerbatimScriptDraft({
				candidate,
				step,
				index,
				totalSteps: structure.flow.length,
			}),
			materialSuggestion:
				index === 0
					? "使用高冲击标题画面、录屏或问题式口播开场。"
					: "匹配同题案例截图、产品录屏、资料引用或简洁 MG 说明。",
		};
	});
}

function normalizePackageScriptSegments({
	baseSegments,
	draftSegments,
}: {
	baseSegments: ScriptSegment[];
	draftSegments?: TopicPackageDraft["scriptSegments"];
}): ScriptSegment[] {
	if (!draftSegments?.length) return baseSegments;
	const segments = draftSegments.flatMap((segment, index) => {
		const base = baseSegments[index] ?? baseSegments.at(-1);
		const content = segment.content?.trim();
		if (!content) return [];
		return [
			{
				timeRange: segment.timeRange?.trim() || base?.timeRange || "",
				content,
				materialSuggestion:
					segment.materialSuggestion?.trim() ||
					base?.materialSuggestion ||
					"根据这一段逐字稿匹配录屏、截图、B-roll 或 MG 说明。",
			},
		];
	});
	return segments.length > 0 ? segments : baseSegments;
}

function normalizePackagePlatformRecommendations({
	baseRecommendations,
	draftRecommendations,
}: {
	baseRecommendations: PlatformRecommendation[];
	draftRecommendations?: TopicPackageDraft["platformRecommendations"];
}): PlatformRecommendation[] {
	if (!draftRecommendations?.length) return baseRecommendations;
	const recommendations = draftRecommendations.flatMap(
		(recommendation, index) => {
			const base = baseRecommendations[index];
			const title = recommendation.title?.trim() || base?.title;
			const description =
				recommendation.description?.trim() || base?.description;
			const platform = recommendation.platform ?? base?.platform;
			if (!platform || !title || !description) return [];
			return [{ platform, title, description }];
		},
	);
	return recommendations.length > 0 ? recommendations : baseRecommendations;
}

function applyTopicPackageDraft({
	version,
	draft,
}: {
	version: TopicPackageVersion;
	draft?: TopicPackageDraft;
}): TopicPackageVersion {
	if (!draft) return version;
	const outline = draft.outline?.map((item) => item.trim()).filter(Boolean);
	const coverIdeas = draft.coverIdeas
		?.map((item) => item.trim())
		.filter(Boolean);
	return {
		...version,
		title: draft.title?.trim() || version.title,
		summary: draft.summary?.trim() || version.summary,
		coreViewpoint: draft.coreViewpoint?.trim() || version.coreViewpoint,
		audienceAnalysis:
			draft.audienceAnalysis?.trim() || version.audienceAnalysis,
		durationMinutes:
			typeof draft.durationMinutes === "number" &&
			Number.isFinite(draft.durationMinutes) &&
			draft.durationMinutes > 0
				? Math.round(draft.durationMinutes)
				: version.durationMinutes,
		rationale: draft.rationale?.trim() || version.rationale,
		outline: outline && outline.length > 0 ? outline : version.outline,
		scriptSegments: normalizePackageScriptSegments({
			baseSegments: version.scriptSegments,
			draftSegments: draft.scriptSegments,
		}),
		platformRecommendations: normalizePackagePlatformRecommendations({
			baseRecommendations: version.platformRecommendations,
			draftRecommendations: draft.platformRecommendations,
		}),
		coverIdeas:
			coverIdeas && coverIdeas.length > 0 ? coverIdeas : version.coverIdeas,
	};
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
	draft,
	now = Date.now(),
}: {
	project: TopicProject;
	draft?: TopicPackageDraft;
	now?: number;
}): TopicPackageVersion | null {
	const candidate = getSelectedCandidate(project);
	const structure =
		project.structures.find(
			(item) => item.id === project.selectedStructureId,
		) ?? project.structures[0];
	if (!candidate || !structure) return null;

	const versionNumber = project.packageVersions.length + 1;
	const version: TopicPackageVersion = {
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
			candidate,
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
	return applyTopicPackageDraft({ version, draft });
}

function getActivePackageVersion(
	project: TopicProject,
): TopicPackageVersion | null {
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

function cloneTopicPackageVersion({
	project,
	version,
	now,
}: {
	project: TopicProject;
	version: TopicPackageVersion;
	now: number;
}): TopicPackageVersion {
	const versionNumber = project.packageVersions.length + 1;
	return {
		...version,
		id: createId("topic-package"),
		versionName: `V${versionNumber}`,
		createdAt: now,
		outline: [...version.outline],
		scriptSegments: version.scriptSegments.map((segment) => ({ ...segment })),
		platformRecommendations: version.platformRecommendations.map(
			(recommendation) => ({ ...recommendation }),
		),
		coverIdeas: [...version.coverIdeas],
		referenceSourceIds: [...version.referenceSourceIds],
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
		selectedStructureId:
			project.selectedStructureId ?? structures[0]?.id ?? null,
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
	draft,
	now = Date.now(),
}: {
	project: TopicProject;
	draft?: TopicPackageDraft;
	now?: number;
}): TopicProject {
	const activePackage =
		project.stage === "package" ? getActivePackageVersion(project) : null;
	const version = draft
		? createTopicPackageVersion({ project, draft, now })
		: activePackage
			? cloneTopicPackageVersion({ project, version: activePackage, now })
			: createTopicPackageVersion({ project, now });
	if (!version) return project;
	return {
		...project,
		stage: "package",
		status: "ready-for-video",
		packageVersions: [...project.packageVersions, version],
		activePackageVersionId: version.id,
		activeProductionPlanId: null,
		updatedAt: now,
	};
}

function getTargetPackageVersionId({
	project,
	versionId,
}: {
	project: TopicProject;
	versionId?: string;
}): string | null {
	return (
		versionId ??
		project.activePackageVersionId ??
		project.packageVersions.at(-1)?.id ??
		null
	);
}

export function updateTopicPackageVersion({
	project,
	versionId,
	patch,
	now = Date.now(),
}: {
	project: TopicProject;
	versionId?: string;
	patch: TopicPackagePatch;
	now?: number;
}): TopicProject {
	const targetVersionId = getTargetPackageVersionId({ project, versionId });
	if (!targetVersionId) return project;
	return {
		...project,
		packageVersions: project.packageVersions.map((version) =>
			version.id === targetVersionId
				? {
						...version,
						title: patch.title !== undefined ? patch.title : version.title,
						summary:
							patch.summary !== undefined ? patch.summary : version.summary,
						coreViewpoint:
							patch.coreViewpoint !== undefined
								? patch.coreViewpoint
								: version.coreViewpoint,
						audienceAnalysis:
							patch.audienceAnalysis !== undefined
								? patch.audienceAnalysis
								: version.audienceAnalysis,
						durationMinutes:
							typeof patch.durationMinutes === "number" &&
							Number.isFinite(patch.durationMinutes) &&
							patch.durationMinutes > 0
								? Math.round(patch.durationMinutes)
								: version.durationMinutes,
						rationale:
							patch.rationale !== undefined
								? patch.rationale
								: version.rationale,
					}
				: version,
		),
		updatedAt: now,
	};
}

export function updateTopicPackageOutlineItem({
	project,
	versionId,
	outlineIndex,
	value,
	now = Date.now(),
}: {
	project: TopicProject;
	versionId?: string;
	outlineIndex: number;
	value: string;
	now?: number;
}): TopicProject {
	const targetVersionId = getTargetPackageVersionId({ project, versionId });
	if (!targetVersionId || outlineIndex < 0) return project;
	return {
		...project,
		packageVersions: project.packageVersions.map((version) =>
			version.id === targetVersionId
				? {
						...version,
						outline: version.outline.map((item, index) =>
							index === outlineIndex ? value : item,
						),
					}
				: version,
		),
		updatedAt: now,
	};
}

export function updateTopicPackagePlatformRecommendation({
	project,
	versionId,
	recommendationIndex,
	patch,
	now = Date.now(),
}: {
	project: TopicProject;
	versionId?: string;
	recommendationIndex: number;
	patch: TopicPackagePlatformRecommendationPatch;
	now?: number;
}): TopicProject {
	const targetVersionId = getTargetPackageVersionId({ project, versionId });
	if (!targetVersionId || recommendationIndex < 0) return project;
	return {
		...project,
		packageVersions: project.packageVersions.map((version) =>
			version.id === targetVersionId
				? {
						...version,
						platformRecommendations: version.platformRecommendations.map(
							(recommendation, index) =>
								index === recommendationIndex
									? {
											...recommendation,
											title:
												patch.title !== undefined
													? patch.title
													: recommendation.title,
											description:
												patch.description !== undefined
													? patch.description
													: recommendation.description,
										}
									: recommendation,
						),
					}
				: version,
		),
		updatedAt: now,
	};
}

export function updateTopicPackageCoverIdea({
	project,
	versionId,
	coverIndex,
	value,
	now = Date.now(),
}: {
	project: TopicProject;
	versionId?: string;
	coverIndex: number;
	value: string;
	now?: number;
}): TopicProject {
	const targetVersionId = getTargetPackageVersionId({ project, versionId });
	if (!targetVersionId || coverIndex < 0) return project;
	return {
		...project,
		packageVersions: project.packageVersions.map((version) =>
			version.id === targetVersionId
				? {
						...version,
						coverIdeas: version.coverIdeas.map((idea, index) =>
							index === coverIndex ? value : idea,
						),
					}
				: version,
		),
		updatedAt: now,
	};
}

export function updateTopicPackageScriptSegment({
	project,
	versionId,
	segmentIndex,
	patch,
	now = Date.now(),
}: {
	project: TopicProject;
	versionId?: string;
	segmentIndex: number;
	patch: Partial<ScriptSegment>;
	now?: number;
}): TopicProject {
	const targetVersionId = getTargetPackageVersionId({ project, versionId });
	if (!targetVersionId || segmentIndex < 0) return project;
	return {
		...project,
		packageVersions: project.packageVersions.map((version) =>
			version.id === targetVersionId
				? {
						...version,
						scriptSegments: version.scriptSegments.map((segment, index) =>
							index === segmentIndex
								? {
										...segment,
										timeRange:
											patch.timeRange !== undefined
												? patch.timeRange
												: segment.timeRange,
										content:
											patch.content !== undefined
												? patch.content
												: segment.content,
										materialSuggestion:
											patch.materialSuggestion !== undefined
												? patch.materialSuggestion
												: segment.materialSuggestion,
									}
								: segment,
						),
					}
				: version,
		),
		updatedAt: now,
	};
}

function inferProductionVideoType(
	topicPackage: TopicPackageVersion,
): ProductionPlanVideoType {
	const text =
		`${topicPackage.title} ${topicPackage.summary} ${topicPackage.rationale}`.toLowerCase();
	if (/测评|review|对比|工具/.test(text)) return "review";
	if (/教程|教学|怎么|workflow|工作流/.test(text)) return "tutorial";
	if (/录屏|实操|演示/.test(text)) return "screen-recording";
	if (/广告|投放|转化|营销/.test(text)) return "ad";
	return "explainer";
}

function createDefaultRequiredAssets({
	videoType,
}: {
	videoType: ProductionPlanVideoType;
}): ProductionPlan["requiredAssets"] {
	const baseAssets: ProductionPlan["requiredAssets"] = [
		{
			type: "voiceover",
			description: "口播或 AI 配音，用于串联每个段落的核心观点。",
			optional: false,
		},
		{
			type: "subtitle",
			description: "自动字幕和重点词强调，适配 B 站、YouTube 与短视频切片。",
			optional: false,
		},
		{
			type: "screenshot",
			description: "同题内容、官方资料或产品界面截图，用于支撑事实和观点。",
			optional: false,
		},
		{
			type: "mg",
			description: "用于解释抽象流程、对比关系或关键数据的简洁 MG 动画。",
			optional: true,
		},
	];

	if (videoType === "screen-recording" || videoType === "tutorial") {
		return [
			{
				type: "screen-recording",
				description: "产品操作录屏或流程演示，作为教程/实操段落的主视觉。",
				optional: false,
			},
			...baseAssets,
		];
	}

	if (videoType === "talking-head") {
		return [
			{
				type: "user-footage",
				description: "创作者口播画面，用作开场、过渡和结论段落。",
				optional: false,
			},
			...baseAssets,
		];
	}

	return [
		{
			type: "broll",
			description: "与案例、工具、场景相关的 B-roll 或占位素材。",
			optional: true,
		},
		...baseAssets,
	];
}

function createProductionPlanFromPackage({
	topicPackage,
	now,
}: {
	topicPackage: TopicPackageVersion;
	now: number;
}): ProductionPlan {
	const videoType = inferProductionVideoType(topicPackage);
	return {
		id: createId("production-plan"),
		createdAt: now,
		basedOnPackageVersionId: topicPackage.id,
		videoType,
		targetPlatform: topicPackage.platformRecommendations.map(
			(recommendation) => recommendation.platform,
		),
		estimatedDurationMinutes: topicPackage.durationMinutes,
		segments: topicPackage.scriptSegments.map((segment, index) => ({
			timeRange: segment.timeRange,
			goal:
				index === 0
					? "快速建立观看动机，说明这个选题为什么现在值得看。"
					: "推进核心论证，并让观众看到可验证的案例或操作。",
			script: segment.content,
			visualNeed: segment.materialSuggestion,
			assetSuggestion: segment.materialSuggestion,
			editSuggestion:
				index === 0
					? "使用快节奏冷开场、标题字卡和 1-2 个高信息量画面。"
					: "以口播为主线，穿插截图、录屏、资料引用和轻量 MG 解释。",
		})),
		requiredAssets: createDefaultRequiredAssets({ videoType }),
		nextActions: [
			"生成时间线草稿",
			"我来口播",
			"AI 生成配音",
			"先用占位素材搭骨架",
		],
	};
}

export function createProductionPlan({
	project,
	now = Date.now(),
	draft,
}: {
	project: TopicProject;
	now?: number;
	draft?: ProductionPlanDraft;
}): TopicProject {
	const activePackage = getActivePackageVersion(project);
	if (!activePackage) return project;
	const basePlan = createProductionPlanFromPackage({
		topicPackage: activePackage,
		now,
	});
	const plan: ProductionPlan = {
		...basePlan,
		videoType: draft?.videoType ?? basePlan.videoType,
		targetPlatform:
			draft?.targetPlatform && draft.targetPlatform.length > 0
				? draft.targetPlatform
				: basePlan.targetPlatform,
		estimatedDurationMinutes:
			typeof draft?.estimatedDurationMinutes === "number" &&
			Number.isFinite(draft.estimatedDurationMinutes) &&
			draft.estimatedDurationMinutes > 0
				? Math.round(draft.estimatedDurationMinutes)
				: basePlan.estimatedDurationMinutes,
		segments:
			draft?.segments && draft.segments.length > 0
				? draft.segments.map((segment, index) => ({
						timeRange:
							segment.timeRange ??
							basePlan.segments[index]?.timeRange ??
							`${index}:00 - ${index + 1}:00`,
						goal:
							segment.goal ??
							basePlan.segments[index]?.goal ??
							"推进视频叙事。",
						script:
							segment.script ??
							basePlan.segments[index]?.script ??
							"补充脚本内容。",
						visualNeed:
							segment.visualNeed ??
							basePlan.segments[index]?.visualNeed ??
							"补充主视觉。",
						assetSuggestion:
							segment.assetSuggestion ??
							basePlan.segments[index]?.assetSuggestion ??
							"补充素材建议。",
						editSuggestion:
							segment.editSuggestion ??
							basePlan.segments[index]?.editSuggestion ??
							"保持节奏清晰，避免信息堆叠。",
					}))
				: basePlan.segments,
		requiredAssets:
			draft?.requiredAssets && draft.requiredAssets.length > 0
				? draft.requiredAssets.map((asset) => ({
						type: asset.type ?? "broll",
						description: asset.description ?? "补充制作素材。",
						optional: asset.optional ?? true,
					}))
				: basePlan.requiredAssets,
		nextActions:
			draft?.nextActions && draft.nextActions.length > 0
				? draft.nextActions
				: basePlan.nextActions,
	};

	return {
		...project,
		stage: "production",
		status: "ready-for-video",
		productionPlans: [...(project.productionPlans ?? []), plan],
		activeProductionPlanId: plan.id,
		updatedAt: now,
	};
}
