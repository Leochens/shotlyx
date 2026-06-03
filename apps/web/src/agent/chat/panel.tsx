"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useChatStore } from "./store";
import { MessageItem } from "./message-item";
import type { ToolActionResult, ToolCallActionRequest } from "./tool-call-card";
import { appendToolProgressEvent } from "./progress-history";
import { BottomToolbar, type RunningSubmitMode } from "./bottom-toolbar";
import { useEditor } from "@/editor/use-editor";
import { parseSSEStream } from "./sse-parser";
import type { SSEEvent } from "./sse-parser";
import {
	BarChart3,
	BookOpenText,
	Check,
	Copy,
	FileText,
	LineChart,
	Loader2,
	Megaphone,
	MoreHorizontal,
	Scissors,
	Sparkles,
	Trash2,
	Upload,
	type LucideIcon,
} from "lucide-react";
import type {
	AgentPlan,
	MessageAction,
	ToolCallRecord,
} from "@/agent/controller/types";
import { isClarificationRequest } from "@/agent/controller/clarification";
import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";
import {
	createMediaAssetReference,
	createSourceMaterialReference,
} from "@/agent/context/resolve-references";
import { useAgentContextStore } from "@/agent/context/store";
import type { AgentContextReference } from "@/agent/context/types";
import type { ChatMessage } from "./types";
import type { ToolProgressEvent, ToolResult } from "@/agent/mcp/types";
import type { AgentTokenUsageTotals } from "@/agent/token-usage";
import { resumeShotlyxMGJobInBackground } from "@/agent/tools/creative/creative-tools";
import {
	getShotlyxMGJobDataFromToolCall,
	getRunningShotlyxMGJobIdsFromMessages,
	isRunningShotlyxMGToolCall,
} from "./mg-job-records";
import {
	buildDuplicateToolCallResult,
	findSuppressibleDuplicateToolCall,
} from "./tool-call-dedupe";
import { formatToolCallForCopy } from "./tool-result-copy";
import { buildToolResultContext } from "./tool-context";
import { useAppLocale } from "@/i18n/use-app-locale";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import { buildTopicInputMaterialsFromReferences } from "@/topic-workbench/input-materials";
import { WorkbenchSwitcher } from "@/topic-workbench/workbench-switcher";
import { CreatorProfileDialogTrigger } from "@/topic-workbench/creator-profile-dialog";
import { useTopicWorkbenchStore } from "@/topic-workbench/store";
import {
	executeTopicWorkbenchTool,
	getTopicWorkbenchToolSchemas,
	TOPIC_WORKBENCH_TOOL_NAMES,
} from "@/topic-workbench/tools";
import {
	isRoughCutReviewResult,
	RoughCutReviewDialog,
} from "./rough-cut-review-dialog";
import type { RoughCutReviewResult } from "@/agent/mcp/rough-cut-tools";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatElapsed(ms: number): string {
	const totalSec = ms / 1000;
	if (totalSec < 60) {
		return `${totalSec.toFixed(1)}s`;
	}
	const min = Math.floor(totalSec / 60);
	const sec = (totalSec % 60).toFixed(0).padStart(2, "0");
	return `${min}m${sec}s`;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return "工具执行失败";
	}
}

function buildClientToolErrorResult({
	error,
	message,
}: {
	error?: unknown;
	message?: string;
}): ToolResult {
	return {
		status: "error",
		error: message ?? getErrorMessage(error),
		errorCategory: "system_error",
		suggestion: "请稍后重试，或先刷新编辑器状态后再执行。",
	};
}

function getClientNow(): number {
	return Date.now();
}

const STARTER_PROMPT_STYLES: Array<{
	icon: LucideIcon;
	iconClassName: string;
}> = [
	{
		icon: Scissors,
		iconClassName:
			"border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-600 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-300",
	},
	{
		icon: Sparkles,
		iconClassName:
			"border-amber-500/20 bg-amber-500/[0.08] text-amber-600 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200",
	},
	{
		icon: BarChart3,
		iconClassName:
			"border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-600 dark:border-emerald-300/25 dark:bg-emerald-300/10 dark:text-emerald-300",
	},
	{
		icon: LineChart,
		iconClassName:
			"border-blue-500/20 bg-blue-500/[0.08] text-blue-600 dark:border-blue-300/25 dark:bg-blue-300/10 dark:text-blue-300",
	},
	{
		icon: Megaphone,
		iconClassName:
			"border-rose-500/20 bg-rose-500/[0.08] text-rose-600 dark:border-rose-300/25 dark:bg-rose-300/10 dark:text-rose-300",
	},
	{
		icon: BookOpenText,
		iconClassName:
			"border-violet-500/20 bg-violet-500/[0.08] text-violet-600 dark:border-violet-300/25 dark:bg-violet-300/10 dark:text-violet-300",
	},
];

const STREAM_TEXT_FLUSH_INTERVAL_MS = 80;
const TOPIC_SUPPORT_TOOL_NAMES = new Set([
	"web_search",
	"web_fetch",
	"media_search",
	"media_get_all",
	"media_read_text_asset",
	"video_semantic_index_analyze",
	"video_semantic_index_get",
	"vision_analyze_media",
]);

type TopicStarter = {
	label: string;
	group: string;
	hint: string;
	prompt: string;
};

function buildTopicStarterPrompt({
	label,
	opening,
	focus,
	askFirst,
	materialCue,
	executionPlan,
	candidateDirection,
}: {
	label: string;
	opening: string;
	focus: string[];
	askFirst: string[];
	materialCue: string;
	executionPlan: string;
	candidateDirection: string[];
}): string {
	return `【${label}】${opening}

这个类型的判断重点：
${focus.map((item, index) => `${index + 1}. ${item}`).join("\n")}

请先问我这些问题，问清楚后再执行：
${askFirst.map((item, index) => `${index + 1}. ${item}`).join("\n")}

素材和上下文判断：
${materialCue}

资料与能力使用方式：
${executionPlan}

候选生成侧重：
${candidateDirection.map((item, index) => `${index + 1}. ${item}`).join("\n")}

执行边界：
- 不要立刻生成候选选题，也不要立刻把候选写入右侧选题工作台。
- 一次最多问 2-3 个问题，优先问会改变选题方向的问题。
- 如果我已经提供素材、脚本、录屏稿或文字备注，先判断这些内容能回答哪些问题。
- 信息足够后，生成 3-5 个候选选题，并同步写入右侧选题工作台。`;
}

const TOPIC_STARTERS: TopicStarter[] = [
	{
		label: "口播观点",
		group: "表达观点",
		hint: "需要观点",
		prompt: buildTopicStarterPrompt({
			label: "口播观点",
			opening: "先帮我把一个观点打磨成能开口讲、能引发讨论的视频选题。",
			focus: [
				"观点锋利度：一句话能不能说清楚立场。",
				"受众共鸣：观众为什么现在需要听这段表达。",
				"表达结构：开场钩子、反常识、个人经验和论据如何串起来。",
			],
			askFirst: [
				"我最想表达或反驳的核心观点是什么？",
				"这个观点来自经验、吐槽、反常识判断，还是行业趋势？",
				"我希望观众看完后认同、评论、收藏还是转发？",
			],
			materialCue:
				"这类内容不一定先要素材；如果没有素材，优先问观点和经历。如果有脚本或口播稿，先帮我提炼更锋利的主张。",
			executionPlan:
				"涉及事实、热点或行业判断时，再去检索和核验外部资料；不要为了口播观点强行先找素材。",
			candidateDirection: [
				"每个候选都要有明确立场，而不是泛泛科普。",
				"标题要适合直接作为口播开场。",
				"给出可展开的论据、故事线或冲突点。",
			],
		}),
	},
	{
		label: "产品展示",
		group: "展示产品",
		hint: "需要素材",
		prompt: buildTopicStarterPrompt({
			label: "产品展示",
			opening: "先帮我把产品卖点变成观众愿意看的展示型视频方向。",
			focus: [
				"产品利益点：它解决什么具体问题。",
				"使用场景：观众在哪个瞬间会需要它。",
				"信任证据：素材、截图、数据或用户反馈能证明什么。",
			],
			askFirst: [
				"产品或服务是什么，主要卖给谁？",
				"最想突出的 1-3 个卖点分别是什么？",
				"我有没有图片、视频、官网、说明文档、截图或客户反馈？",
			],
			materialCue:
				"这类通常需要素材或产品资料；如果我上传了素材，先理解素材。没有素材时先问卖点、受众和证明材料。",
			executionPlan:
				"有视频素材时先理解素材内容；有官网或资料链接时核验卖点；需要统一表达时结合品牌套件。",
			candidateDirection: [
				"功能亮点型：快速展示核心能力。",
				"场景代入型：从用户痛点切入。",
				"前后对比型：展示使用前后的变化。",
				"证据证明型：用数据或反馈建立信任。",
			],
		}),
	},
	{
		label: "教程演示",
		group: "传授知识",
		hint: "需要步骤",
		prompt: buildTopicStarterPrompt({
			label: "教程演示",
			opening: "先帮我把一个操作过程拆成清晰、可跟做的教程选题。",
			focus: [
				"任务结果：观众跟着做完能得到什么。",
				"步骤断点：哪几步最容易卡住或需要重点解释。",
				"新手误区：哪些地方要提前避坑。",
			],
			askFirst: [
				"观众要完成的具体任务是什么？",
				"目标观众是新手、进阶用户还是专业用户？",
				"我有没有录屏、步骤文档、脚本、截图或参考链接？",
			],
			materialCue:
				"这类优先需要步骤或演示素材；有录屏先看操作链路，有文字步骤先读取文本。缺素材时先问任务目标和步骤难点。",
			executionPlan:
				"有录屏时先理解操作链路；有文字资料或参考链接时先读取和核验；再把步骤转成适合平台的视频结构。",
			candidateDirection: [
				"新手入门型：降低理解门槛。",
				"问题解决型：围绕一个具体卡点。",
				"效率提升型：突出更快、更稳、更省事。",
			],
		}),
	},
	{
		label: "生活记录",
		group: "记录过程",
		hint: "需要主题",
		prompt: buildTopicStarterPrompt({
			label: "生活记录",
			opening: "先帮我从一段日常经历里找到值得被观看的主题和情绪线。",
			focus: [
				"情绪主线：治愈、搞笑、成长、松弛、反差还是疲惫。",
				"时间线：素材发生的顺序和关键转折。",
				"可共鸣细节：哪些小片段能让观众代入。",
			],
			askFirst: [
				"这段经历大概发生在什么场景，想表达什么情绪？",
				"我已有的视频、照片或文字记录有哪些？",
				"更想做 Vlog、纪实、治愈、搞笑，还是经验分享？",
			],
			materialCue:
				"这类非常依赖素材里的真实细节；如果素材不够清楚，先让我补一句背景和时间线，不要直接编剧情。",
			executionPlan:
				"优先理解上传素材里的场景和时间顺序；如果素材语义不足，再询问是否补充文字说明或做更深的画面理解。",
			candidateDirection: [
				"每个候选都要有一个情绪关键词。",
				"尽量保留真实生活细节，不要做成营销口吻。",
				"给出开头 3 秒的生活化切入点。",
			],
		}),
	},
	{
		label: "产品测评",
		group: "展示产品",
		hint: "需要体验",
		prompt: buildTopicStarterPrompt({
			label: "产品测评",
			opening: "先帮我把真实体验整理成有判断、有证据的测评选题。",
			focus: [
				"测评结论：值不值得买、适合谁、不适合谁。",
				"体验证据：优缺点来自什么场景或素材。",
				"对比维度：单品、合集、横评或场景推荐。",
			],
			askFirst: [
				"测评对象是什么，使用场景是什么？",
				"我现在已有的体验结论或疑问是什么？",
				"这次更想做单品测评、合集对比、横评还是场景推荐？",
			],
			materialCue:
				"这类最好有体验素材、照片、参数或使用记录；没有素材时先问体验结论和评价维度，避免空泛推荐。",
			executionPlan:
				"有素材时先理解素材或读取文字内容；需要同类对比时，再检索竞品信息和同题内容。",
			candidateDirection: [
				"单品深测：围绕真实体验下判断。",
				"横向对比：用清晰维度帮助选择。",
				"场景推荐：把产品放进具体人群和使用时刻。",
			],
		}),
	},
	{
		label: "实时资讯",
		group: "追踪热点",
		hint: "需要事件",
		prompt: buildTopicStarterPrompt({
			label: "实时资讯",
			opening: "先帮我把正在发生的事件整理成快、准、有立场的视频选题。",
			focus: [
				"事实时间线：发生了什么、谁说了什么、最新进展是什么。",
				"可信来源：官网、公告、权威媒体或一手资料。",
				"表达角度：快讯、解读、影响分析或个人观点。",
			],
			askFirst: [
				"具体事件、关键词或链接是什么？",
				"这条内容更想做快讯、深度解读、影响分析还是观点评论？",
				"我是否已有自己的判断或想强调的立场？",
			],
			materialCue:
				"这类可以没有用户素材，但必须有可信资料；如果我提供链接，先核验链接内容，再判断是否需要补充搜索。",
			executionPlan:
				"先检索和核验最新资料，优先高可信来源；再区分事实、观点和争议点，把引用沉淀到资料汇总。",
			candidateDirection: [
				"快讯型：最快说清事实。",
				"影响型：讲清对谁有什么影响。",
				"观点型：明确我赞成、质疑或提醒什么。",
			],
		}),
	},
	{
		label: "案例拆解",
		group: "传授知识",
		hint: "需要案例",
		prompt: buildTopicStarterPrompt({
			label: "案例拆解",
			opening: "先帮我把一个案例拆成事实、原因和可复用方法。",
			focus: [
				"案例边界：拆哪家公司、人物、产品、账号或事件。",
				"成败原因：哪些决策或条件导致结果。",
				"可复用启发：观众能带走什么方法。",
			],
			askFirst: [
				"想拆解的案例对象是谁，成功或失败在哪里？",
				"我希望观众得到方法、避坑、趋势判断还是灵感？",
				"我有没有案例资料、链接、截图或自己的观察？",
			],
			materialCue:
				"这类需要事实底座；如果只给了案例名，要先找公开资料，不能直接凭印象生成结论。",
			executionPlan:
				"如果案例涉及公开信息，先检索并核验事实底座；如果有本地资料，先读取后再补充外部资料。",
			candidateDirection: [
				"方法论拆解：提炼可复制动作。",
				"失败复盘：指出关键误判。",
				"趋势观察：把个案放到行业变化里。",
			],
		}),
	},
	{
		label: "清单盘点",
		group: "传授知识",
		hint: "需要范围",
		prompt: buildTopicStarterPrompt({
			label: "清单盘点",
			opening: "先帮我把一组资源整理成可收藏、可转发的清单型选题。",
			focus: [
				"盘点范围：工具、方法、书单、店铺、资源还是经验。",
				"筛选标准：为什么这些值得进入清单。",
				"使用场景：观众收藏后怎么用。",
			],
			askFirst: [
				"我想盘点的对象是什么，范围有多大？",
				"筛选标准是什么：便宜、好用、新手友好、专业、效率高，还是小众？",
				"我是否已有清单、链接、截图或素材？",
			],
			materialCue:
				"这类可以从已有清单出发，也可以从搜索补全；关键是先定筛选标准，不然会变成随机罗列。",
			executionPlan:
				"先确认筛选标准；需要补充资料时再检索和核验，输出候选前说明每个选题的差异化。",
			candidateDirection: [
				"收藏价值：一眼知道为什么值得保存。",
				"人群分层：新手、进阶、专业各自不同。",
				"差异化：避免和普通榜单重复。",
			],
		}),
	},
	{
		label: "对比选择",
		group: "展示产品",
		hint: "需要对象",
		prompt: buildTopicStarterPrompt({
			label: "对比选择",
			opening: "先帮我把多个选择变成观众能快速做决定的对比型选题。",
			focus: [
				"决策场景：观众为什么要在这些对象中选择。",
				"评价维度：价格、效率、风险、体验、适配人群。",
				"结论表达：不是都不错，而是谁适合谁。",
			],
			askFirst: [
				"要对比的对象分别是什么？",
				"观众最关心的决策标准是什么？",
				"目标平台、预期时长和希望给出的结论强度是什么？",
			],
			materialCue:
				"这类不一定需要视频素材，但需要对象信息和评价维度；如果对象是公开产品，要核验关键参数。",
			executionPlan:
				"先确定评价维度；如果对象是公开产品，再核验关键参数和同题参考内容。",
			candidateDirection: [
				"选择建议型：直接告诉观众怎么选。",
				"误区纠偏型：反驳常见选择误区。",
				"场景分流型：按人群和预算给结论。",
			],
		}),
	},
	{
		label: "幕后过程",
		group: "记录过程",
		hint: "需要素材",
		prompt: buildTopicStarterPrompt({
			label: "幕后过程",
			opening: "先帮我把一个作品或项目背后的过程整理成有起伏的内容。",
			focus: [
				"过程节点：起点、卡点、转折、结果。",
				"幕后价值：观众为什么会关心过程而不只是结果。",
				"表达重心：方法、情绪、成果或反差。",
			],
			askFirst: [
				"这个过程的起点、关键节点和最终结果是什么？",
				"我有没有录屏、照片、视频、项目素材或过程记录？",
				"更想突出方法、情绪、成果，还是过程里的反差？",
			],
			materialCue:
				"这类通常需要过程素材；如果素材已经上传，先理解时间线和关键场景。素材不完整时先让我补关键节点。",
			executionPlan:
				"优先理解素材时间线和关键场景，再把过程整理成故事线或教程线。",
			candidateDirection: [
				"从无到有型：强调完成过程。",
				"踩坑修正型：突出问题和解决。",
				"成果揭晓型：用结果反推过程价值。",
			],
		}),
	},
	{
		label: "长视频拆短",
		group: "长内容再利用",
		hint: "需要长素材",
		prompt: buildTopicStarterPrompt({
			label: "长视频拆短",
			opening: "先帮我从长视频里拆出多个可独立发布的短视频选题。",
			focus: [
				"可独立性：切出来后不依赖上下文也能看懂。",
				"传播点：高光、金句、争议点、知识点或情绪点。",
				"平台适配：不同平台对节奏和长度的要求不同。",
			],
			askFirst: [
				"长内容是什么类型：直播、访谈、课程、播客还是会议？",
				"目标平台是什么，希望拆成几个短视频？",
				"更想找高光、金句、争议点、知识点还是转化片段？",
			],
			materialCue:
				"这类必须依赖长素材或转写稿；如果还没上传素材，先提示我上传或粘贴转写稿，不要凭空生成切片。",
			executionPlan:
				"必须优先理解长素材内容，再基于转写文本和语义片段生成候选；必要时补充查看具体片段依据。",
			candidateDirection: [
				"高光切片：情绪或观点最强。",
				"知识切片：单个知识点完整闭环。",
				"争议切片：有讨论空间但不断章取义。",
			],
		}),
	},
	{
		label: "直播切片",
		group: "长内容再利用",
		hint: "需要长素材",
		prompt: buildTopicStarterPrompt({
			label: "直播切片",
			opening: "先帮我从直播里找到能单独成片、还能带动互动的切片方向。",
			focus: [
				"直播目标：带货、涨粉、答疑、观点传播或知识沉淀。",
				"互动信号：弹幕问题、情绪波动、强观点和成交瞬间。",
				"上下文保留：切片不能让观众听不懂前因后果。",
			],
			askFirst: [
				"直播主题是什么，观众主要是谁？",
				"切片目标更偏带货、涨粉、观点传播还是知识沉淀？",
				"是否需要保留上下文、口播连贯性或商品信息？",
			],
			materialCue:
				"这类必须先有直播素材或转写稿；如果我只描述主题，先提醒我补素材，否则只能做切片策略，不能做真实片段选择。",
			executionPlan:
				"先理解直播素材的语义内容；优先找强开场、明确观点、情绪波动和可独立成片的片段。",
			candidateDirection: [
				"带货转化型：问题、卖点、证据、行动连贯。",
				"涨粉观点型：一句话观点能立住。",
				"答疑知识型：问题和答案完整闭环。",
			],
		}),
	},
	{
		label: "访谈播客",
		group: "长内容再利用",
		hint: "需要文本/素材",
		prompt: buildTopicStarterPrompt({
			label: "访谈播客",
			opening: "先帮我从访谈或播客里提炼人物、观点和故事型选题。",
			focus: [
				"人物价值：嘉宾身份、经历和稀缺视角。",
				"观点单元：哪段话能独立成立。",
				"故事张力：冲突、转折、失败、选择或金句。",
			],
			askFirst: [
				"嘉宾是谁，访谈主题是什么？",
				"更想突出人物故事、行业观点、金句，还是争议讨论？",
				"我有没有转写稿、音视频素材或时间点标记？",
			],
			materialCue:
				"这类最适合从转写稿或音频语义里找观点单元；如果没有素材，先问嘉宾背景和想表达的主题。",
			executionPlan:
				"有转写稿时先读取文本；有音视频时先理解内容，再筛选可独立传播的观点单元。",
			candidateDirection: [
				"人物故事型：突出经历和转折。",
				"金句观点型：一句话能被转发。",
				"行业洞察型：让观众获得新判断。",
			],
		}),
	},
	{
		label: "广告投放",
		group: "展示产品",
		hint: "需要卖点",
		prompt: buildTopicStarterPrompt({
			label: "广告投放",
			opening: "先帮我把卖点变成可以投放测试的广告视频方向。",
			focus: [
				"转化目标：下载、咨询、购买、留资或关注。",
				"痛点表达：开头几秒能不能击中目标用户。",
				"证明材料：卖点是否有素材、数据、案例或用户反馈支撑。",
			],
			askFirst: [
				"产品或服务是什么，目标用户是谁？",
				"核心痛点、卖点和行动号召分别是什么？",
				"投放平台、视频时长、证据素材或用户反馈有哪些？",
			],
			materialCue:
				"这类需要卖点和证据；如果有素材，先识别可用于证明卖点的片段。没有素材时先补痛点、承诺和 CTA。",
			executionPlan:
				"优先读取素材和品牌套件；有产品页或资料时进行核验；候选要区分痛点型、证明型、场景型和强 CTA 型。",
			candidateDirection: [
				"痛点直击型：前 3 秒先说问题。",
				"证据证明型：素材或反馈建立信任。",
				"场景转化型：把产品放到真实使用时刻。",
				"强 CTA 型：明确下一步动作。",
			],
		}),
	},
	{
		label: "复盘总结",
		group: "记录过程",
		hint: "需要经历",
		prompt: buildTopicStarterPrompt({
			label: "复盘总结",
			opening: "先帮我把一次经历复盘成有结论、有启发的视频选题。",
			focus: [
				"事实链：做了什么、结果如何、关键节点是什么。",
				"因果判断：成功或失败真正来自哪里。",
				"可迁移经验：观众能学到什么或避开什么坑。",
			],
			askFirst: [
				"复盘对象是什么，最后结果如何？",
				"我认为成功/失败的关键原因是什么？",
				"目标受众是谁，希望他们学到什么？",
			],
			materialCue:
				"这类不一定需要视频素材，但需要真实经历和结果；如果有项目记录、截图或数据，先读取后再总结。",
			executionPlan:
				"先补齐事实链和结论；如果有本地资料先读取，如果涉及公开项目再联网核验背景。",
			candidateDirection: [
				"经验型：告诉观众我做对了什么。",
				"避坑型：告诉观众哪里容易错。",
				"方法型：沉淀成可执行流程。",
				"故事型：用转折带出结论。",
			],
		}),
	},
	{
		label: "挑战实验",
		group: "记录过程",
		hint: "需要规则",
		prompt: buildTopicStarterPrompt({
			label: "挑战实验",
			opening: "先帮我把一个挑战或实验设计成有悬念、有结果的视频选题。",
			focus: [
				"挑战规则：时间、限制、成功标准。",
				"过程张力：中途发生了什么不确定性。",
				"结果反差：最后是否超出预期。",
			],
			askFirst: [
				"挑战目标、规则和时间限制是什么？",
				"我有没有过程素材、实验记录或结果数据？",
				"更想突出结果反差、过程困难还是方法论？",
			],
			materialCue:
				"这类最好有过程素材或记录；如果素材缺失，先问实验过程和结果，再判断能否生成可信选题。",
			executionPlan:
				"优先理解素材里的过程节点；如果缺素材，先问实验记录和结果，再生成候选。",
			candidateDirection: [
				"悬念型：观众想知道能不能成功。",
				"反差型：结果和预期形成冲突。",
				"方法型：实验后沉淀可复制经验。",
			],
		}),
	},
	{
		label: "情景短剧",
		group: "剧情场景",
		hint: "需要冲突",
		prompt: buildTopicStarterPrompt({
			label: "情景短剧",
			opening: "先帮我把一个场景冲突发展成可拍、可演、可反转的短剧选题。",
			focus: [
				"人物关系：谁和谁之间发生冲突。",
				"戏剧钩子：开头要立刻让观众知道矛盾。",
				"表达目的：生活洞察、品牌卖点或情绪共鸣。",
			],
			askFirst: [
				"场景、人物关系和核心冲突是什么？",
				"想传达的观点、情绪或产品卖点是什么？",
				"目标平台、视频时长和表演风格是什么？",
			],
			materialCue:
				"这类不一定先需要素材，但需要场景和冲突；如果有产品或品牌素材，先判断它应自然出现在剧情哪个位置。",
			executionPlan:
				"先补齐场景和冲突；需要产品资料时读取素材或品牌套件；候选要给出可拍的开场钩子、反转和结尾动作。",
			candidateDirection: [
				"冲突开场型：前三秒建立矛盾。",
				"反转结尾型：结尾带来记忆点。",
				"软植入型：产品或观点自然嵌入剧情。",
			],
		}),
	},
	{
		label: "品牌故事",
		group: "剧情场景",
		hint: "需要定位",
		prompt: buildTopicStarterPrompt({
			label: "品牌故事",
			opening: "先帮我把品牌、个人 IP 或产品背后的故事讲得可信、有记忆点。",
			focus: [
				"定位清晰度：品牌是谁，为谁解决什么问题。",
				"记忆点：经历、价值观、独特优势或反差。",
				"可信表达：素材、官网、过往内容和品牌套件是否一致。",
			],
			askFirst: [
				"品牌、人物或产品定位是什么，核心受众是谁？",
				"最想被记住的经历、价值观或差异化优势是什么？",
				"我有没有品牌套件、图片、官网、过往内容或客户案例？",
			],
			materialCue:
				"这类要优先结合全局品牌套件和已有素材；没有素材时先补品牌自我介绍，避免写成空泛宣言。",
			executionPlan:
				"优先读取品牌套件和素材；需要公开资料时再检索和核验，然后生成故事型候选。",
			candidateDirection: [
				"创始故事型：用经历建立信任。",
				"价值观型：让观众理解为什么做。",
				"差异化型：说清和别人不一样在哪里。",
			],
		}),
	},
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): string | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return typeof nextValue === "string" ? nextValue : undefined;
}

function getBooleanField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): boolean | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return typeof nextValue === "boolean" ? nextValue : undefined;
}

function getNumberField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): number | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return typeof nextValue === "number" ? nextValue : undefined;
}

function getTokenCountField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): number {
	const numberValue = getNumberField({ value, key });
	if (
		numberValue === undefined ||
		!Number.isFinite(numberValue) ||
		numberValue < 0
	) {
		return 0;
	}
	return Math.round(numberValue);
}

function getRecordField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): Record<string, unknown> | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return isRecord(nextValue) ? nextValue : undefined;
}

function patchStockCandidateImportResult({
	data,
	candidateId,
	importData,
}: {
	data: unknown;
	candidateId: string;
	importData: unknown;
}): unknown {
	if (!isRecord(data) || !Array.isArray(data.candidates)) return data;

	return {
		...data,
		candidates: data.candidates.map((candidate) => {
			if (
				!isRecord(candidate) ||
				typeof candidate.id !== "string" ||
				candidate.id !== candidateId
			) {
				return candidate;
			}

			return {
				...candidate,
				mediaAssetId:
					getStringField({ value: importData, key: "mediaAssetId" }) ??
					getStringField({ value: candidate, key: "mediaAssetId" }),
				name:
					getStringField({ value: importData, key: "name" }) ??
					getStringField({ value: candidate, key: "name" }),
				previewUrl:
					getStringField({ value: importData, key: "previewUrl" }) ??
					getStringField({ value: candidate, key: "previewUrl" }),
				thumbnailUrl:
					getStringField({ value: importData, key: "thumbnailUrl" }) ??
					getStringField({ value: candidate, key: "thumbnailUrl" }),
				sizeBytes:
					getNumberField({ value: importData, key: "sizeBytes" }) ??
					getNumberField({ value: candidate, key: "sizeBytes" }),
				width:
					getNumberField({ value: importData, key: "width" }) ??
					getNumberField({ value: candidate, key: "width" }),
				height:
					getNumberField({ value: importData, key: "height" }) ??
					getNumberField({ value: candidate, key: "height" }),
				durationSeconds:
					getNumberField({ value: importData, key: "durationSeconds" }) ??
					getNumberField({ value: candidate, key: "durationSeconds" }),
			};
		}),
	};
}

function cancelShotlyxMGJobs({ jobIds }: { jobIds: string[] }): void {
	void Promise.all(
		jobIds.map(async (jobId) => {
			try {
				await fetch(`/api/agent/creative/mg-jobs/${jobId}`, {
					method: "DELETE",
				});
			} catch {
				// Stopping the chat flow should not be blocked by a best-effort job cancel.
			}
		}),
	);
}

function isStepRisk(
	value: unknown,
): value is AgentPlan["steps"][number]["risk"] {
	return (
		value === "none" || value === "destructive" || value === "irreversible"
	);
}

function isAgentStep(value: unknown): value is AgentPlan["steps"][number] {
	if (!isRecord(value)) return false;
	return (
		typeof value.tool === "string" &&
		isRecord(value.params) &&
		typeof value.description === "string" &&
		isStepRisk(value.risk)
	);
}

function isActionVariant(value: unknown): value is MessageAction["variant"] {
	return value === "primary" || value === "secondary" || value === "danger";
}

function isMessageAction(value: unknown): value is MessageAction {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.label === "string" &&
		isActionVariant(value.variant) &&
		(value.value === undefined || typeof value.value === "string") &&
		(value.description === undefined ||
			typeof value.description === "string") &&
		(value.isOption === undefined || typeof value.isOption === "boolean")
	);
}

function parsePlanEventData(value: unknown): {
	reasoning?: string;
	steps: AgentPlan["steps"];
	displayContent?: string;
	needsConfirmation?: boolean;
	actions?: MessageAction[];
} | null {
	if (!isRecord(value) || !Array.isArray(value.steps)) return null;
	const steps = value.steps.filter(isAgentStep);
	if (steps.length !== value.steps.length) return null;
	const rawActions = Array.isArray(value.actions) ? value.actions : undefined;
	const actions = rawActions?.filter(isMessageAction);
	if (rawActions && actions?.length !== rawActions.length) return null;

	return {
		reasoning:
			typeof value.reasoning === "string" ? value.reasoning : undefined,
		steps,
		displayContent:
			typeof value.displayContent === "string"
				? value.displayContent
				: undefined,
		needsConfirmation: getBooleanField({ value, key: "needsConfirmation" }),
		actions,
	};
}

function parseTokenUsageEventData(
	value: unknown,
): AgentTokenUsageTotals | null {
	const usage = getRecordField({ value, key: "usage" });
	if (!usage) return null;
	const rawSources = Array.isArray(usage.sources) ? usage.sources : [];
	const sources = rawSources.filter(
		(source): source is AgentTokenUsageTotals["sources"][number] =>
			source === "api" || source === "local-cli",
	);

	return {
		inputTokens: getTokenCountField({ value: usage, key: "inputTokens" }),
		outputTokens: getTokenCountField({ value: usage, key: "outputTokens" }),
		reasoningTokens: getTokenCountField({
			value: usage,
			key: "reasoningTokens",
		}),
		totalTokens: getTokenCountField({ value: usage, key: "totalTokens" }),
		cachedInputTokens: getTokenCountField({
			value: usage,
			key: "cachedInputTokens",
		}),
		cacheWriteTokens: getTokenCountField({
			value: usage,
			key: "cacheWriteTokens",
		}),
		approximate: getBooleanField({ value: usage, key: "approximate" }) ?? false,
		sources,
		updatedAt:
			getTokenCountField({ value: usage, key: "updatedAt" }) || getClientNow(),
	};
}

type QueuedPrompt = {
	id: string;
	content: string;
	mode: RunningSubmitMode;
	sessionId: string | null;
};

export function ChatPanel() {
	const { copy, locale } = useAppLocale();
	const [input, setInput] = useState("");
	const [runningSubmitMode, setRunningSubmitMode] =
		useState<RunningSubmitMode>("queue");
	const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
	const [topicSourceMaterialOpen, setTopicSourceMaterialOpen] = useState(false);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const [copied, setCopied] = useState(false);
	const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
	const isSelecting = selectedMsgIds.size > 0;
	const runAbortRef = useRef<AbortController | null>(null);
	const streamAbortRef = useRef<AbortController | null>(null);
	const topicMaterialFileInputRef = useRef<HTMLInputElement | null>(null);
	const toolAbortControllersRef = useRef<Map<string, AbortController>>(
		new Map(),
	);
	const resumedMGJobsRef = useRef<Set<string>>(new Set());
	const resumedMGJobAbortControllersRef = useRef<Map<string, AbortController>>(
		new Map(),
	);
	const isSendingQueuedPromptRef = useRef(false);
	const [startTime, setStartTime] = useState<number | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const [roughCutReview, setRoughCutReview] =
		useState<RoughCutReviewResult | null>(null);
	const [roughCutReviewOpen, setRoughCutReviewOpen] = useState(false);
	const { draftReferences, addReference, clearDraftReferences } =
		useAgentContextStore();
	const activeWorkbench = useTopicWorkbenchStore(
		(state) => state.activeWorkbench,
	);
	const pendingTopicAgentEvent = useTopicWorkbenchStore(
		(state) => state.pendingAgentEvent,
	);
	const creatorProfile = useTopicWorkbenchStore(
		(state) => state.creatorProfile,
	);
	const recordTopicInputMaterials = useTopicWorkbenchStore(
		(state) => state.recordInputMaterials,
	);
	const setActiveEditorProject = useTopicWorkbenchStore(
		(state) => state.setActiveEditorProject,
	);
	const consumeTopicAgentEvent = useTopicWorkbenchStore(
		(state) => state.consumeAgentEvent,
	);
	const submitPromptRef = useRef<
		(args: {
			prompt: string;
			references?: AgentContextReference[];
		}) => Promise<void>
	>(async () => {});

	useEffect(() => {
		if (startTime === null) return;
		const interval = setInterval(() => {
			setElapsedMs(getClientNow() - startTime);
		}, 1_000);
		return () => clearInterval(interval);
	}, [startTime]);

	const {
		getActiveMessages,
		addMessage,
		isLoading,
		setLoading,
		mode,
		setMode,
		selectedAgent,
		setSelectedAgent,
		pendingPlan,
		setPendingPlan,
		streamingMessageId,
		setStreamingMessageId,
		updateMessageContent,
		updateMessageThought,
		updateMessageActions,
		updateMessageClarification,
		updateMessageToolCalls,
		updateMessageTokenUsage,
		activeSessionId,
		isHydrated,
		setActiveProject,
		clearSessionMessages,
		removeMessage,
	} = useChatStore();
	const editor = useEditor();
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const mediaAssetCount = useEditor(
		(editor) =>
			editor.media.getAssets().filter((asset) => !asset.ephemeral).length,
	);
	const messages = getActiveMessages();
	const queuedPromptsForSession = queuedPrompts.filter(
		(prompt) => prompt.sessionId === activeSessionId,
	);
	const visibleMessages = useMemo(
		() => messages.filter((msg) => !msg.hidden),
		[messages],
	);
	const toRequestMessage = (
		message: Pick<ChatMessage, "role" | "content" | "toolCalls"> & {
			references?: AgentContextReference[];
		},
	) => ({
		role: message.role,
		content: `${message.content}${buildToolResultContext({
			toolCalls: message.toolCalls,
		})}`,
		references: message.references,
	});

	useEffect(() => {
		if (isHydrated && projectId) {
			setActiveProject(projectId);
			setActiveEditorProject({ editorProjectId: projectId });
		}
	}, [isHydrated, projectId, setActiveEditorProject, setActiveProject]);

	useEffect(() => {
		if (activeWorkbench === "topic" && selectedAgent !== "default") {
			setSelectedAgent("default");
		}
	}, [activeWorkbench, selectedAgent, setSelectedAgent]);

	useEffect(() => {
		const abortControllers = resumedMGJobAbortControllersRef.current;
		const resumedJobs = resumedMGJobsRef.current;
		return () => {
			for (const controller of abortControllers.values()) {
				controller.abort();
			}
			abortControllers.clear();
			resumedJobs.clear();
		};
	}, []);

	useEffect(() => {
		if (!activeSessionId || isLoading) return;

		for (const message of messages) {
			for (const [toolIndex, toolCall] of (message.toolCalls ?? []).entries()) {
				if (!isRunningShotlyxMGToolCall(toolCall)) continue;
				const jobData = getShotlyxMGJobDataFromToolCall({ toolCall });
				if (!jobData) continue;

				const resumeKey = `${activeSessionId}:${message.id}:${
					toolCall.callId ?? `${jobData.jobId}:${toolIndex}`
				}`;
				if (resumedMGJobsRef.current.has(resumeKey)) continue;

				const abort = new AbortController();
				resumedMGJobsRef.current.add(resumeKey);
				resumedMGJobAbortControllersRef.current.set(resumeKey, abort);

				const appendProgress = (event: ToolProgressEvent) => {
					const session = useChatStore
						.getState()
						.sessions.find((item) => item.id === activeSessionId);
					const currentMessage = session?.messages.find(
						(item) => item.id === message.id,
					);
					if (!currentMessage?.toolCalls) return;

					let didRecordProgress = false;
					const nextToolCalls = currentMessage.toolCalls.map(
						(currentToolCall) => {
							const isSameCall =
								(toolCall.callId &&
									currentToolCall.callId === toolCall.callId) ||
								(!toolCall.callId &&
									currentToolCall.tool === toolCall.tool &&
									JSON.stringify(currentToolCall.params) ===
										JSON.stringify(toolCall.params));
							if (!isSameCall) return currentToolCall;

							const nextProgress = appendToolProgressEvent({
								progress: currentToolCall.progress ?? [],
								event,
							});
							if (nextProgress === currentToolCall.progress) {
								return currentToolCall;
							}
							didRecordProgress = true;

							return {
								...currentToolCall,
								progress: nextProgress,
							};
						},
					);

					if (didRecordProgress) {
						updateMessageToolCalls(
							{ id: message.id, toolCalls: nextToolCalls },
							activeSessionId,
						);
					}

					if (
						event.status === "error" ||
						event.stage === "completed" ||
						event.stage === "complete" ||
						event.stage === "cancelled"
					) {
						resumedMGJobAbortControllersRef.current.delete(resumeKey);
					}
				};

				resumeShotlyxMGJobInBackground({
					editor,
					jobId: jobData.jobId,
					sourcePrompt: jobData.sourcePrompt,
					startTimeSeconds: jobData.startTimeSeconds,
					insertToTimeline: jobData.insertToTimeline,
					signal: abort.signal,
					onProgress: appendProgress,
				});
			}
		}
	}, [activeSessionId, editor, isLoading, messages, updateMessageToolCalls]);

	const handleSSEEvent = ({
		sseEvent,
		accumulated,
		currentAssistantMsgIdRef,
		runSessionIdRef,
		runSignal,
		queueMessageContentUpdate,
		flushMessageContentUpdate,
	}: {
		sseEvent: SSEEvent;
		accumulated: { text: string; thought: string };
		currentAssistantMsgIdRef: { current: string | null };
		runSessionIdRef: { current: string | null };
		runSignal: AbortSignal;
		queueMessageContentUpdate: (args: {
			id: string;
			content: string;
			immediate?: boolean;
		}) => void;
		flushMessageContentUpdate: () => void;
	}) => {
		if (runSignal.aborted) return;
		const data: unknown = JSON.parse(sseEvent.data);

		// Ensure a single assistant message exists for this turn.
		// All content (thinking, text, tool calls) accumulates here.
		const ensureAssistantMessage = (): string => {
			if (!currentAssistantMsgIdRef.current) {
				const mid = `assistant-${getClientNow()}`;
				addMessage({
					id: mid,
					role: "assistant",
					content: accumulated.text,
					thought: accumulated.thought,
					timestamp: getClientNow(),
				});
				currentAssistantMsgIdRef.current = mid;
				setStreamingMessageId(mid);
			}
			return currentAssistantMsgIdRef.current;
		};

		if (sseEvent.event === "init") {
			runSessionIdRef.current =
				getStringField({ value: data, key: "sessionId" }) ?? null;
			return;
		}

		if (sseEvent.event === "done") {
			flushMessageContentUpdate();
			return;
		}

		if (sseEvent.event === "reasoning-start") {
			ensureAssistantMessage();
			return;
		}

		if (sseEvent.event === "reasoning-delta") {
			const text = getStringField({ value: data, key: "text" }) ?? "";
			accumulated.thought += text;
			const mid = ensureAssistantMessage();
			updateMessageThought({ id: mid, thought: accumulated.thought });
			return;
		}

		if (sseEvent.event === "reasoning-end") {
			return;
		}

		if (sseEvent.event === "text-start") {
			ensureAssistantMessage();
			return;
		}

		if (sseEvent.event === "text-delta") {
			const text = getStringField({ value: data, key: "text" }) ?? "";
			accumulated.text += text;
			const mid = ensureAssistantMessage();
			queueMessageContentUpdate({ id: mid, content: accumulated.text });
			return;
		}

		if (sseEvent.event === "text-end") {
			flushMessageContentUpdate();
			return;
		}

		if (sseEvent.event === "tool-call") {
			const callId = getStringField({ value: data, key: "callId" });
			const tool = getStringField({ value: data, key: "tool" });
			if (!callId || !tool) return;
			const params = getRecordField({ value: data, key: "params" }) ?? {};

			const mid = ensureAssistantMessage();
			const currentMsgs = getActiveMessages();
			const currentMsg = currentMsgs.find((m) => m.id === mid);
			const existingToolCalls = currentMsg?.toolCalls ?? [];

			if (existingToolCalls.some((toolCall) => toolCall.callId === callId)) {
				return;
			}

			const postToolResult = async ({
				modelToolResult,
				abortSignal,
			}: {
				modelToolResult: unknown;
				abortSignal?: AbortSignal;
			}) => {
				const sid = runSessionIdRef.current;
				if (!sid) return;

				try {
					const response = await fetch(`/api/agent/chat/${sid}/tool-result`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ callId, result: modelToolResult }),
					});
					if (!response.ok) {
						const errorBody = await response.json().catch(() => null);
						const errorDetail =
							getStringField({ value: errorBody, key: "error" }) ??
							`HTTP ${response.status}`;
						throw new Error(`HTTP ${response.status}: ${errorDetail}`);
					}
				} catch (error) {
					if (runSignal.aborted || abortSignal?.aborted) return;
					addMessage({
						id: `tool-result-post-error-${getClientNow()}`,
						role: "assistant",
						content: `工具 ${tool} 已执行，但结果回传失败：${getErrorMessage(error)}`,
						timestamp: getClientNow(),
					});
				}
			};

			const duplicateToolCall = findSuppressibleDuplicateToolCall({
				existingToolCalls,
				tool,
				params,
			});
			if (duplicateToolCall) {
				const duplicateResult = buildDuplicateToolCallResult({
					duplicate: duplicateToolCall,
				});
				const modelToolResult = sanitizeToolResultForModel({
					toolName: tool,
					result: duplicateResult,
				});
				void postToolResult({ modelToolResult });
				return;
			}

			const pendingRecord: ToolCallRecord = { callId, tool, params };
			const toolAbort = new AbortController();
			toolAbortControllersRef.current.set(callId, toolAbort);
			const appendToolProgress = (event: ToolProgressEvent) => {
				const updatedMsgs = getActiveMessages();
				const updatedMsg = updatedMsgs.find((m) => m.id === mid);
				let didRecordProgress = false;
				const currentToolCalls = (updatedMsg?.toolCalls ?? []).map((tc) => {
					if (tc.callId !== callId) return tc;
					const nextProgress = appendToolProgressEvent({
						progress: tc.progress ?? [],
						event,
					});
					if (nextProgress === tc.progress) {
						return tc;
					}
					didRecordProgress = true;
					return {
						...tc,
						progress: nextProgress,
					};
				});
				if (!didRecordProgress) return;
				updateMessageToolCalls({
					id: mid,
					toolCalls: currentToolCalls,
				});
			};

			updateMessageToolCalls({
				id: mid,
				toolCalls: [...existingToolCalls, pendingRecord],
			});

			void (async () => {
				let toolResult: ToolResult;
				try {
					if (
						activeWorkbench === "topic" &&
						TOPIC_WORKBENCH_TOOL_NAMES.has(tool)
					) {
						toolResult = executeTopicWorkbenchTool({
							toolName: tool,
							params,
							editorProjectId: projectId ?? "default-project",
						});
					} else if (!editor) {
						toolResult = {
							status: "error",
							error: "编辑器尚未准备好，无法执行工具",
							errorCategory: "state_error",
							suggestion: "请稍后重试，或刷新编辑器后再执行。",
						};
					} else {
						toolResult = await editor.mcp.execute({
							toolName: tool,
							params,
							signal: toolAbort.signal,
							onProgress: appendToolProgress,
						});
					}
				} catch (error) {
					if (runSignal.aborted || toolAbort.signal.aborted) return;
					toolResult = buildClientToolErrorResult({ error });
				}

				if (runSignal.aborted || toolAbort.signal.aborted) return;

				const modelToolResult = sanitizeToolResultForModel({
					toolName: tool,
					result: toolResult,
				});
				if (
					tool === "rough_cut_create_review" &&
					toolResult.status === "success" &&
					isRoughCutReviewResult(toolResult.data)
				) {
					setRoughCutReview(toolResult.data);
					setRoughCutReviewOpen(true);
				}
				const updatedMsgs = getActiveMessages();
				const updatedMsg = updatedMsgs.find((m) => m.id === mid);
				const currentToolCalls = (updatedMsg?.toolCalls ?? []).map((tc) => {
					const isSameCall =
						tc.callId === callId ||
						(tc.callId === undefined &&
							tc.tool === tool &&
							JSON.stringify(tc.params) === JSON.stringify(params) &&
							!tc.result);
					if (isSameCall) {
						return {
							...tc,
							result: {
								status: toolResult.status,
								data: toolResult.data,
								error: toolResult.error,
							},
						} as ToolCallRecord;
					}
					return tc;
				});
				updateMessageToolCalls({
					id: mid,
					toolCalls: currentToolCalls,
				});

				await postToolResult({
					modelToolResult,
					abortSignal: toolAbort.signal,
				});
			})().finally(() => {
				toolAbortControllersRef.current.delete(callId);
			});

			return;
		}

		if (sseEvent.event === "tool-result") {
			return;
		}

		if (sseEvent.event === "token-usage") {
			const usage = parseTokenUsageEventData(data);
			if (!usage || usage.totalTokens <= 0) return;
			const mid = ensureAssistantMessage();
			updateMessageTokenUsage({ id: mid, tokenUsage: usage });
			return;
		}

		if (sseEvent.event === "plan") {
			const planData = parsePlanEventData(data);
			if (!planData) return;

			const plan: AgentPlan = {
				complexity:
					planData.steps.length > 3
						? "complex"
						: planData.steps.length > 1
							? "medium"
							: "simple",
				reasoning: planData.reasoning ?? "",
				steps: planData.steps,
				needsConfirmation: planData.needsConfirmation ?? false,
				actions: planData.actions,
			};

			setPendingPlan(plan);

			if (planData.reasoning) {
				accumulated.thought = planData.reasoning;
				const mid = ensureAssistantMessage();
				updateMessageThought({
					id: mid,
					thought: planData.reasoning,
				});
			}
			if (planData.displayContent) {
				accumulated.text = planData.displayContent;
				const mid = ensureAssistantMessage();
				queueMessageContentUpdate({
					id: mid,
					content: planData.displayContent,
					immediate: true,
				});
			}
			if (planData.actions !== undefined) {
				const mid = ensureAssistantMessage();
				updateMessageActions({
					id: mid,
					actions: planData.actions,
				});
			}
		}
		if (sseEvent.event === "message-actions") {
			const rawActions =
				isRecord(data) && Array.isArray(data.actions)
					? data.actions
					: undefined;
			const actions = rawActions?.filter(isMessageAction);
			if (!rawActions || actions?.length !== rawActions.length) return;
			const mid = ensureAssistantMessage();
			updateMessageActions({ id: mid, actions });
			return;
		}
		if (sseEvent.event === "clarification-request") {
			const clarification = getRecordField({
				value: data,
				key: "clarification",
			});
			if (!isClarificationRequest(clarification)) return;
			const mid = ensureAssistantMessage();
			updateMessageClarification({ id: mid, clarification });
			return;
		}
		if (sseEvent.event === "error") {
			flushMessageContentUpdate();
			const message =
				getStringField({ value: data, key: "message" }) ?? "未知错误";
			const category =
				getStringField({ value: data, key: "category" }) ?? "unknown";
			const isRetryable = category === "network" || category === "rate_limit";

			addMessage({
				id: `error-${getClientNow()}`,
				role: "assistant",
				content: "",
				error: { message, category, isRetryable },
				timestamp: getClientNow(),
			});

			setLoading(false);
			setStreamingMessageId(null);
			setStartTime(null);
			return;
		}
	};

	const runSSEAgent = async ({
		msgsToSend,
		extra,
	}: {
		msgsToSend: Array<{
			role: string;
			content: string;
			references?: AgentContextReference[];
		}>;
		extra?: { action?: string; plan?: AgentPlan };
	}) => {
		setStartTime(getClientNow());
		const runAbort = new AbortController();
		runAbortRef.current = runAbort;

		const accumulated = { text: "", thought: "" };
		const currentAssistantMsgIdRef: { current: string | null } = {
			current: null,
		};
		const runSessionIdRef: { current: string | null } = {
			current: null,
		};
		const pendingContentUpdateRef: {
			id: string | null;
			content: string;
			timer: ReturnType<typeof setTimeout> | null;
		} = {
			id: null,
			content: "",
			timer: null,
		};
		const flushMessageContentUpdate = () => {
			if (pendingContentUpdateRef.timer !== null) {
				clearTimeout(pendingContentUpdateRef.timer);
				pendingContentUpdateRef.timer = null;
			}
			if (pendingContentUpdateRef.id === null) return;
			updateMessageContent({
				id: pendingContentUpdateRef.id,
				content: pendingContentUpdateRef.content,
			});
			pendingContentUpdateRef.id = null;
		};
		const queueMessageContentUpdate = ({
			id,
			content,
			immediate = false,
		}: {
			id: string;
			content: string;
			immediate?: boolean;
		}) => {
			pendingContentUpdateRef.id = id;
			pendingContentUpdateRef.content = content;

			if (immediate) {
				flushMessageContentUpdate();
				return;
			}

			if (pendingContentUpdateRef.timer !== null) return;

			pendingContentUpdateRef.timer = setTimeout(() => {
				flushMessageContentUpdate();
			}, STREAM_TEXT_FLUSH_INTERVAL_MS);
		};

		try {
			const body: Record<string, unknown> = {
				messages: msgsToSend,
				mode,
				toolSchemas:
					activeWorkbench === "topic"
						? [
								...getTopicWorkbenchToolSchemas(),
								...editor.mcp
									.getToolSchemas()
									.filter((schema) =>
										TOPIC_SUPPORT_TOOL_NAMES.has(schema.name),
									),
							]
						: editor.mcp.getToolSchemas(),
				context: {
					activeBrandKit: editor.project.getActiveBrandKit(),
					activeWorkbench,
					topicCreatorProfile:
						activeWorkbench === "topic" ? creatorProfile : undefined,
				},
			};

			if (extra?.action) body.action = extra.action;
			if (extra?.plan)
				body.plan = {
					reasoning: extra.plan.reasoning,
					steps: extra.plan.steps.map((s) => ({
						tool: s.tool,
						params: s.params,
						description: s.description,
						risk: s.risk,
					})),
				};

			const response = await fetch("/api/agent/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: runAbort.signal,
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({ error: "Unknown" }));
				throw new Error(
					getStringField({ value: err, key: "error" }) ??
						`HTTP ${response.status}`,
				);
			}

			const resBody = response.body;
			if (!resBody) throw new Error("No response body");

			await new Promise<void>((resolve, reject) => {
				const streamAbort = parseSSEStream({
					stream: resBody,
					onEvent: (sseEvent) => {
						handleSSEEvent({
							sseEvent,
							accumulated,
							currentAssistantMsgIdRef,
							runSessionIdRef,
							runSignal: runAbort.signal,
							queueMessageContentUpdate,
							flushMessageContentUpdate,
						});
					},
					onComplete: () => {
						flushMessageContentUpdate();
						resolve();
					},
					onError: (error) => {
						flushMessageContentUpdate();
						addMessage({
							id: `err-${getClientNow()}`,
							role: "assistant",
							content: `SSE 流错误: ${error.message}`,
							timestamp: getClientNow(),
						});
						reject(error);
					},
				});
				streamAbortRef.current = streamAbort;
			});
		} catch (err) {
			if (runAbort.signal.aborted) {
				return;
			}
			if (activeWorkbench === "topic") {
				addMessage({
					id: `topic-offline-${getClientNow()}`,
					role: "assistant",
					content:
						"这次 Agent 没能完成选题生成。请检查模型和联网工具配置后重试，右侧工作台会在 Agent 产出候选选题后出现。",
					timestamp: getClientNow(),
				});
				return;
			}
			addMessage({
				id: `err-${getClientNow()}`,
				role: "assistant",
				content: `调用失败: ${err instanceof Error ? err.message : String(err)}`,
				timestamp: getClientNow(),
			});
		} finally {
			flushMessageContentUpdate();
			setStreamingMessageId(null);
			setLoading(false);
			setStartTime(null);
			if (runAbortRef.current === runAbort) {
				runAbortRef.current = null;
				streamAbortRef.current = null;
			}
		}
	};

	const handleStop = () => {
		const activeMessages = getActiveMessages();
		const runningMGJobIds = getRunningShotlyxMGJobIdsFromMessages({
			messages: activeMessages,
		});
		if (runningMGJobIds.length > 0) {
			cancelShotlyxMGJobs({ jobIds: runningMGJobIds });
		}
		runAbortRef.current?.abort();
		streamAbortRef.current?.abort();
		for (const controller of toolAbortControllersRef.current.values()) {
			controller.abort();
		}
		toolAbortControllersRef.current.clear();
		for (const message of activeMessages) {
			if (
				!message.toolCalls?.some(
					(toolCall) =>
						!toolCall.result || isRunningShotlyxMGToolCall(toolCall),
				)
			) {
				continue;
			}
			updateMessageToolCalls({
				id: message.id,
				toolCalls: message.toolCalls.map((toolCall) =>
					isRunningShotlyxMGToolCall(toolCall)
						? {
								...toolCall,
								progress: [
									...(toolCall.progress ?? []),
									{
										stage: "cancelled",
										label: "MG 子智能体已停止",
										status: "error",
										timestamp: getClientNow(),
									},
								],
								result: {
									status: "error",
									data: toolCall.result?.data,
									error: "已停止",
								},
							}
						: toolCall.result
							? toolCall
							: {
									...toolCall,
									result: {
										status: "error",
										error: "已停止",
									},
								},
				),
			});
		}
		setStreamingMessageId(null);
		setLoading(false);
		setStartTime(null);
		addMessage({
			id: `stop-${getClientNow()}`,
			role: "assistant",
			content: "已停止当前 Agent 流程。你可以直接输入新的需求重新开始。",
			timestamp: getClientNow(),
		});
	};

	const recordReferencesAsTopicMaterials = ({
		references,
	}: {
		references: AgentContextReference[];
	}) => {
		if (activeWorkbench !== "topic" || references.length === 0) return;
		const materials = buildTopicInputMaterialsFromReferences({ references });
		if (materials.length === 0) return;
		recordTopicInputMaterials({
			editorProjectId: projectId ?? "default-project",
			materials,
		});
	};

	const primeTopicMaterialPrompt = (prompt: string) => {
		if (activeWorkbench !== "topic") return;
		setInput((current) => (current.trim() ? current : prompt));
	};

	const handleTopicMaterialFilesSelected = async (files: File[]) => {
		if (files.length === 0 || !editor) return;
		const activeProject = editor.project.getActiveOrNull();
		if (!activeProject) return;

		const addedReferences: AgentContextReference[] = [];
		try {
			await showMediaUploadToast({
				filesCount: files.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({ files });
					const savedAssetNames: string[] = [];

					for (const asset of processedAssets) {
						const saved = await editor.media.addMediaAsset({
							projectId: activeProject.metadata.id,
							asset,
						});
						if (!saved) continue;
						savedAssetNames.push(saved.name);

						if (saved.type === "text" || saved.type === "subtitle") {
							const content = await saved.file.text();
							const reference = createSourceMaterialReference({
								materialType:
									saved.type === "subtitle" ? "screen-recording" : "script",
								name: saved.name,
								summary:
									saved.type === "subtitle"
										? "用户上传的字幕或录屏转写文本。"
										: "用户上传的脚本或文稿文本。",
								content,
								mediaAssetId: saved.id,
								mediaType: saved.type,
								sizeBytes: saved.file.size,
								source: "topic-material",
							});
							addReference(reference);
							addedReferences.push(reference);
							continue;
						}

						const reference = createMediaAssetReference({
							asset: saved,
							source: "topic-material",
						});
						addReference(reference);
						addedReferences.push(reference);
					}

					return {
						uploadedCount: savedAssetNames.length,
						assetNames: savedAssetNames,
					};
				},
			});
		} catch (error) {
			console.error("Failed to add topic materials:", error);
		}

		recordReferencesAsTopicMaterials({ references: addedReferences });
		primeTopicMaterialPrompt(
			"请根据我提供的素材，先理解素材内容和可用信息，再生成 3-5 个适合自媒体视频的选题方向，并同步写入右侧工作台。",
		);
	};

	const handleTopicSourceMaterialAdd = ({
		materialType,
		name,
		content,
	}: {
		materialType: "script" | "screen-recording" | "note";
		name: string;
		content: string;
	}) => {
		const reference = createSourceMaterialReference({
			materialType,
			name,
			content,
			summary:
				materialType === "screen-recording"
					? "用户提供的录屏说明、字幕或转写稿。"
					: materialType === "script"
						? "用户提供的脚本或口播稿。"
						: "用户提供的选题素材备注。",
			source: "topic-material",
		});
		addReference(reference);
		recordReferencesAsTopicMaterials({ references: [reference] });
		primeTopicMaterialPrompt(
			materialType === "screen-recording"
				? "请根据我提供的录屏内容，先梳理关键步骤和可讲述的场景，再生成 3-5 个可拍的视频方向，并同步写入右侧工作台。"
				: "请根据我提供的脚本内容，先提炼主题、观点和可拍素材线索，再生成 3-5 个可拍的视频方向，并同步写入右侧工作台。",
		);
	};

	const submitPrompt = async ({
		prompt,
		references = draftReferences,
	}: {
		prompt: string;
		references?: AgentContextReference[];
	}) => {
		const trimmed = prompt.trim();
		if (!trimmed || isLoading || !editor) return;
		recordReferencesAsTopicMaterials({ references });

		const userMsg = {
			id: `u-${getClientNow()}`,
			role: "user" as const,
			content: trimmed,
			references,
			timestamp: getClientNow(),
		};
		addMessage(userMsg);
		setInput("");
		clearDraftReferences();
		setLoading(true);

		const allMsgs = [...getActiveMessages(), userMsg];
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
		});
	};

	useEffect(() => {
		submitPromptRef.current = submitPrompt;
	});

	useEffect(() => {
		const nextPrompt = queuedPrompts.find(
			(prompt) => prompt.sessionId === activeSessionId,
		);
		if (
			isLoading ||
			!editor ||
			!nextPrompt ||
			isSendingQueuedPromptRef.current ||
			nextPrompt.sessionId !== activeSessionId
		) {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			isSendingQueuedPromptRef.current = true;
			setQueuedPrompts((items) =>
				items.filter((item) => item.id !== nextPrompt.id),
			);
			const prompt =
				nextPrompt.mode === "guide"
					? `[引导当前任务]\n${nextPrompt.content}`
					: nextPrompt.content;
			void submitPromptRef.current({ prompt, references: [] }).finally(() => {
				isSendingQueuedPromptRef.current = false;
			});
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [activeSessionId, editor, isLoading, queuedPrompts]);

	useEffect(() => {
		if (!pendingTopicAgentEvent || isLoading || !editor) {
			return;
		}
		const canRunEvent =
			activeWorkbench === "topic" ||
			pendingTopicAgentEvent.source === "handoff-video";
		if (!canRunEvent) return;

		consumeTopicAgentEvent({ eventId: pendingTopicAgentEvent.id });
		if (pendingTopicAgentEvent.autoRun) {
			void submitPromptRef.current({
				prompt: pendingTopicAgentEvent.content,
				references: [],
			});
			return;
		}

		addMessage({
			id: `topic-workbench-event-${getClientNow()}`,
			role: "user",
			content: `[选题工作台]\n${pendingTopicAgentEvent.content}`,
			timestamp: getClientNow(),
		});
	}, [
		activeWorkbench,
		addMessage,
		consumeTopicAgentEvent,
		editor,
		isLoading,
		pendingTopicAgentEvent,
	]);

	const handleSubmit = async () => {
		const trimmed = input.trim();
		if (!trimmed) return;
		if (isLoading) {
			setInput("");
			setQueuedPrompts((items) => {
				const queuedPrompt: QueuedPrompt = {
					id: `queued-${items.length}-${trimmed.slice(0, 24)}`,
					content: trimmed,
					mode: runningSubmitMode,
					sessionId: activeSessionId,
				};
				return runningSubmitMode === "guide"
					? [queuedPrompt, ...items]
					: [...items, queuedPrompt];
			});
			if (runningSubmitMode === "guide") handleStop();
			return;
		}
		await submitPrompt({ prompt: input, references: draftReferences });
	};

	const handleGuideQueuedPrompt = (promptId: string) => {
		let shouldStop = false;
		setQueuedPrompts((items) => {
			const target = items.find((item) => item.id === promptId);
			if (!target) return items;
			shouldStop = isLoading;
			return [
				{ ...target, mode: "guide" },
				...items.filter((item) => item.id !== promptId),
			];
		});
		if (shouldStop) handleStop();
	};

	const handleStarterPrompt = (prompt: string) => {
		setInput(prompt);
	};

	const handleClarificationAnswer = async (answer: string) => {
		const trimmed = answer.trim();
		if (!trimmed || isLoading || !editor) return;

		const userMsg = {
			id: `u-clarification-${getClientNow()}`,
			role: "user" as const,
			content: trimmed,
			timestamp: getClientNow(),
		};
		addMessage(userMsg);
		setLoading(true);

		const allMsgs = [...getActiveMessages(), userMsg];
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
		});
	};

	const handleActionClick = async ({
		actionId,
		action,
	}: {
		actionId: string;
		action?: MessageAction;
	}) => {
		if (!editor) return;

		if (actionId.startsWith("option-")) {
			const selectedValue = actionId.slice("option-".length);
			const currentMessages = getActiveMessages();
			const lastAssistant = [...currentMessages]
				.reverse()
				.find(
					(m) => m.role === "assistant" && m.actions?.some((a) => a.isOption),
				);
			const selectedAction =
				action?.isOption === true
					? action
					: lastAssistant?.actions?.find((a) => a.id === actionId);
			const label = selectedAction?.label ?? selectedValue;
			if (selectedAction?.value === "__other__") {
				setInput("");
				return;
			}

			const userMsg = {
				id: `u-option-${getClientNow()}`,
				role: "user" as const,
				content:
					typeof selectedAction?.value === "string" && selectedAction.value
						? selectedAction.value
						: label,
				timestamp: getClientNow(),
			};
			addMessage(userMsg);
			setLoading(true);

			const allMsgs = [...getActiveMessages(), userMsg];
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
			});
			return;
		}

		if (actionId === "confirm") {
			if (!pendingPlan) return;
			setLoading(true);

			const allMsgs = getActiveMessages();
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
				extra: { action: "confirm", plan: pendingPlan },
			});
			setPendingPlan(null);
			return;
		}

		if (actionId === "continue") {
			if (!pendingPlan) {
				setLoading(true);
				const allMsgs = getActiveMessages();
				await runSSEAgent({
					msgsToSend: allMsgs.map(toRequestMessage),
				});
				return;
			}
			setLoading(true);

			const allMsgs = getActiveMessages();
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
				extra: { action: "continue", plan: pendingPlan },
			});
			setPendingPlan(null);
			return;
		}

		if (actionId === "modify") {
			if (!pendingPlan) {
				addMessage({
					id: `modify-${getClientNow()}`,
					role: "assistant",
					content: "当前没有待确认的计划。请告诉我你想怎么修改？",
					timestamp: getClientNow(),
				});
				return;
			}
			addMessage({
				id: `modify-${getClientNow()}`,
				role: "assistant",
				content: `当前计划：\n${pendingPlan.steps.map((s, i) => `${i + 1}. ${s.description}`).join("\n")}\n\n告诉我你想怎么修改`,
				timestamp: getClientNow(),
			});
			setPendingPlan(null);
		}
	};

	const handleToolAction = async ({
		messageId,
		request,
	}: {
		messageId: string;
		request: ToolCallActionRequest;
	}): Promise<ToolActionResult> => {
		if (!editor) {
			return {
				status: "error",
				error: "编辑器尚未准备好，无法导入素材",
			};
		}

		if (request.action !== "stock-import-candidate") {
			return {
				status: "error",
				error: "未知的工具卡片操作",
			};
		}

		const result = await editor.mcp.execute({
			toolName: "stock_import_media",
			params: { candidateId: request.payload.candidateId },
		});

		if (result.status === "success") {
			const currentMessages = getActiveMessages();
			const currentMessage = currentMessages.find(
				(msg) => msg.id === messageId,
			);
			if (currentMessage?.toolCalls) {
				updateMessageToolCalls(
					{
						id: messageId,
						toolCalls: currentMessage.toolCalls.map((toolCall) => {
							if (
								toolCall.tool !== "stock_search_media" ||
								toolCall.result?.status !== "success"
							) {
								return toolCall;
							}

							return {
								...toolCall,
								result: {
									...toolCall.result,
									data: patchStockCandidateImportResult({
										data: toolCall.result.data,
										candidateId: request.payload.candidateId,
										importData: result.data,
									}),
								},
							};
						}),
					},
					activeSessionId ?? undefined,
				);
			}
		}

		return {
			status: result.status,
			data: result.data,
			error: result.error,
		};
	};

	const handleRetry = async () => {
		if (!editor || isLoading) return;

		const msgs = getActiveMessages();
		const lastMsg = msgs[msgs.length - 1];
		if (lastMsg?.error) {
			removeMessage(lastMsg.id);
		}

		setLoading(true);

		const allMsgs = getActiveMessages();
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
		});
	};
	const handleClearConfirm = () => {
		clearSessionMessages();
		if (activeSessionId !== null) {
			editor?.command.agentSession.endSession(activeSessionId);
		}
		setShowClearConfirm(false);
	};

	const handleCopyChat = async () => {
		const visibleMessages = messages.filter((msg) => !msg.hidden);
		const text = formatMessagesForCopy(visibleMessages);
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const formatMessagesForCopy = (msgs: typeof messages) => {
		return msgs
			.map((msg) => {
				const role =
					msg.role === "user"
						? locale === "zh-CN"
							? "用户"
							: "User"
						: locale === "zh-CN"
							? "助手"
							: "Assistant";
				let line = `[${role}]`;
				if (msg.thought) {
					line += `\n  思考: ${msg.thought}`;
				}
				if (msg.content) {
					line += `\n  ${msg.content}`;
				}
				if (msg.toolCalls && msg.toolCalls.length > 0) {
					const calls = msg.toolCalls
						.map((toolCall) => formatToolCallForCopy(toolCall))
						.join("\n");
					line += `\n${calls}`;
				}
				if (msg.references && msg.references.length > 0) {
					line += `\n  引用: ${msg.references
						.map((reference) => `${reference.kind}:${reference.label}`)
						.join(", ")}`;
				}
				return line;
			})
			.join("\n\n");
	};

	const handleToggleSelect = (msgId: string) => {
		setSelectedMsgIds((prev) => {
			const next = new Set(prev);
			if (next.has(msgId)) {
				next.delete(msgId);
			} else {
				next.add(msgId);
			}
			return next;
		});
	};

	const handleMessageClick = ({
		msgId,
		isToggleGesture,
	}: {
		msgId: string;
		isToggleGesture: boolean;
	}) => {
		if (!isSelecting && !isToggleGesture) return;
		if (window.getSelection()?.toString()) return;
		handleToggleSelect(msgId);
	};

	const handleCopySelected = async () => {
		const selected = messages.filter((msg) => selectedMsgIds.has(msg.id));
		const text = formatMessagesForCopy(selected);
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setSelectedMsgIds(new Set());
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			data-testid="chat-panel"
			className="flex h-full bg-background text-foreground"
		>
			<input
				ref={topicMaterialFileInputRef}
				type="file"
				accept="image/*,video/*,audio/*,.srt,.vtt,.ass,.ssa,.txt,text/plain,text/vtt"
				multiple
				className="hidden"
				onChange={(event) => {
					const files = Array.from(event.currentTarget.files ?? []);
					event.currentTarget.value = "";
					void handleTopicMaterialFilesSelected(files);
				}}
			/>
			{/* Multi-session UI is intentionally disabled for the compact Agent surface. */}
			<div className="flex flex-1 flex-col overflow-hidden">
				<div className="flex min-h-10 min-w-0 items-center justify-between gap-2 border-b border-border/70 bg-card/[0.65] px-2 py-1.5 backdrop-blur dark:bg-background/95">
					<WorkbenchSwitcher compact />
					<div className="flex min-w-0 shrink-0 items-center gap-1">
						{showClearConfirm ? (
							<div className="flex min-w-0 items-center gap-1">
								<span className="hidden text-xs text-muted-foreground min-[420px]:inline">
									{copy.editor.chat.confirmClear}
								</span>
								<button
									type="button"
									data-testid="clear-confirm-button"
									onClick={handleClearConfirm}
									className="rounded-sm bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
								>
									{copy.editor.chat.confirm}
								</button>
								<button
									type="button"
									onClick={() => setShowClearConfirm(false)}
									className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
								>
									{copy.editor.chat.cancel}
								</button>
							</div>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										data-testid="chat-more-menu-button"
										className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										aria-label={copy.editor.chat.moreActions}
										title={copy.editor.chat.moreActions}
									>
										<MoreHorizontal size={15} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-44">
									<DropdownMenuItem
										onSelect={() => {
											void handleCopyChat();
										}}
										icon={copied ? <Check size={14} /> : <Copy size={14} />}
									>
										{copy.editor.chat.copyChat}
									</DropdownMenuItem>
									<DropdownMenuItem
										data-testid="clear-session-button"
										onSelect={() => setShowClearConfirm(true)}
										icon={<Trash2 size={14} />}
										variant="destructive"
									>
										{copy.editor.chat.clearChat}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</div>

				<div className="scrollbar-thin min-w-0 flex-1 select-text overflow-y-auto overflow-x-hidden bg-[linear-gradient(180deg,rgba(8,145,178,0.025),rgba(255,255,255,0)_14rem)] p-3 dark:bg-[linear-gradient(180deg,rgba(34,211,238,0.045),transparent_18rem)]">
					{visibleMessages.length === 0 && !isLoading ? (
						<AgentEmptyState
							disabled={isLoading || !editor}
							hasMedia={activeWorkbench === "video" && mediaAssetCount > 0}
							workbench={activeWorkbench}
							onPromptSelect={handleStarterPrompt}
							onMaterialUploadClick={() =>
								topicMaterialFileInputRef.current?.click()
							}
							onSourceMaterialClick={() => setTopicSourceMaterialOpen(true)}
						/>
					) : null}
					{visibleMessages.map((msg) => (
						<div
							key={msg.id}
							className={`relative select-text ${isSelecting ? "cursor-pointer" : "cursor-text"} ${selectedMsgIds.has(msg.id) ? "rounded bg-primary/10 ring-1 ring-primary/40" : ""}`}
							style={{
								contentVisibility: "auto",
								containIntrinsicSize: "0 220px",
							}}
							onClick={(event) =>
								handleMessageClick({
									msgId: msg.id,
									isToggleGesture: event.metaKey || event.ctrlKey,
								})
							}
							onKeyDown={undefined}
							role={isSelecting ? "button" : undefined}
							tabIndex={isSelecting ? 0 : undefined}
						>
							<MessageItem
								message={msg}
								onActionClick={(request) => {
									void handleActionClick(request);
								}}
								onOptionCustomAnswer={handleClarificationAnswer}
								onClarificationAnswer={handleClarificationAnswer}
								onToolAction={(request) =>
									handleToolAction({ messageId: msg.id, request })
								}
								onRetry={handleRetry}
								isStreaming={msg.id === streamingMessageId}
							/>
						</div>
					))}
					{isLoading && (
						<div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
							<Loader2 size={14} className="animate-spin" />
							<span>
								{copy.editor.chat.running}{" "}
								{startTime !== null ? `(${formatElapsed(elapsedMs)})` : ""}
							</span>
						</div>
					)}
				</div>
				{isSelecting && (
					<div className="flex items-center justify-between border-t bg-muted px-3 py-2">
						<span className="text-xs text-muted-foreground">
							{copy.editor.chat.selectedCount} {selectedMsgIds.size}
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setSelectedMsgIds(new Set())}
								className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								{copy.editor.chat.cancel}
							</button>
							<button
								type="button"
								onClick={handleCopySelected}
								className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
							>
								{copy.editor.chat.copySelected}
							</button>
						</div>
					</div>
				)}
				{queuedPromptsForSession.length > 0 ? (
					<div className="border-t border-border/70 bg-muted/[0.18] px-3 py-2">
						<div className="flex items-center justify-between gap-2">
							<div className="text-xs font-medium text-muted-foreground">
								排队中 {queuedPromptsForSession.length}
							</div>
						</div>
						<div className="mt-1.5 space-y-1">
							{queuedPromptsForSession.map((prompt) => (
								<div
									key={prompt.id}
									className="flex items-center gap-2 rounded-sm border border-border/70 bg-background/70 px-2 py-1.5"
								>
									<div className="min-w-0 flex-1 truncate text-xs text-foreground">
										{prompt.content}
									</div>
									<span className="shrink-0 rounded-sm border border-border/70 px-1.5 py-0.5 text-[0.68rem] text-muted-foreground">
										{prompt.mode === "guide" ? "引导" : "排队"}
									</span>
									<button
										type="button"
										onClick={() => handleGuideQueuedPrompt(prompt.id)}
										className="shrink-0 rounded-sm px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
									>
										引导
									</button>
								</div>
							))}
						</div>
					</div>
				) : null}
				<BottomToolbar
					input={input}
					selectedAgent={selectedAgent}
					agents={
						activeWorkbench === "topic"
							? ["default"]
							: ["default", "editor", "media", "mg"]
					}
					executionMode={mode}
					disabled={isLoading}
					runningSubmitMode={runningSubmitMode}
					placeholder={
						activeWorkbench === "topic"
							? "今天想做点什么？可以先说一个模糊方向"
							: undefined
					}
					onAgentChange={setSelectedAgent}
					onExecutionModeChange={setMode}
					onRunningSubmitModeChange={setRunningSubmitMode}
					onInputChange={setInput}
					onSubmit={handleSubmit}
					workbench={activeWorkbench}
					topicSourceMaterialOpen={topicSourceMaterialOpen}
					onTopicSourceMaterialOpenChange={setTopicSourceMaterialOpen}
					onTopicMaterialUploadClick={() =>
						topicMaterialFileInputRef.current?.click()
					}
					onTopicSourceMaterialAdd={handleTopicSourceMaterialAdd}
					onMediaSubmit={(prompt) => {
						void submitPrompt({ prompt, references: draftReferences });
					}}
					onMGSubmit={(prompt) => {
						void submitPrompt({ prompt, references: draftReferences });
					}}
					onStop={handleStop}
				/>
				<RoughCutReviewDialog
					key={roughCutReview?.reviewId ?? "rough-cut-empty"}
					review={roughCutReview}
					open={roughCutReviewOpen}
					onOpenChange={setRoughCutReviewOpen}
				/>
			</div>
		</div>
	);
}

function AgentEmptyState({
	disabled,
	hasMedia,
	workbench,
	onPromptSelect,
	onMaterialUploadClick,
	onSourceMaterialClick,
}: {
	disabled: boolean;
	hasMedia: boolean;
	workbench: "video" | "topic";
	onPromptSelect: (prompt: string) => void;
	onMaterialUploadClick: () => void;
	onSourceMaterialClick: () => void;
}) {
	const { copy } = useAppLocale();
	const emptyKicker =
		workbench === "topic" ? "Topic workbench" : copy.editor.chat.emptyKicker;
	const emptyTitle =
		workbench === "topic" ? "今天想做点什么？" : copy.editor.chat.emptyTitle;
	const emptyBody =
		workbench === "topic"
			? "先介绍账号定位，再选一个创作类型；胶囊只会载入输入框，改完后再交给 Agent。"
			: copy.editor.chat.emptyBody;

	return (
		<div className="flex min-h-full flex-col justify-center gap-4 py-4">
			<div className="mx-auto max-w-md text-center">
				<div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-primary/[0.55] dark:text-cyan-300/80">
					{emptyKicker}
				</div>
				<h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
					{emptyTitle}
				</h2>
				<p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
					{emptyBody}
				</p>
				{workbench === "topic" ? (
					<div className="mt-3 flex flex-wrap justify-center gap-2">
						<CreatorProfileDialogTrigger label="全局用户画像" />
						<button
							type="button"
							disabled={disabled}
							onClick={onMaterialUploadClick}
							className="inline-flex h-9 items-center gap-2 rounded-sm border border-border/75 bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Upload size={15} />
							上传素材
						</button>
						<button
							type="button"
							disabled={disabled}
							onClick={onSourceMaterialClick}
							className="inline-flex h-9 items-center gap-2 rounded-sm border border-border/75 bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
						>
							<FileText size={15} />
							粘贴脚本/录屏稿
						</button>
					</div>
				) : null}
			</div>

			{workbench === "video" && !hasMedia && (
				<div className="rounded-sm border border-border/75 bg-card/[0.45] px-3 py-2 text-sm dark:border-cyan-300/20 dark:bg-cyan-300/5">
					<div className="font-medium text-foreground dark:text-cyan-200">
						{copy.editor.chat.emptyNoMediaTitle}
					</div>
					<p className="mt-1 leading-5 text-muted-foreground">
						{copy.editor.chat.emptyNoMediaBody}
					</p>
				</div>
			)}

			{workbench === "topic" ? (
				<TopicIntentCapsules
					disabled={disabled}
					onPromptSelect={onPromptSelect}
				/>
			) : (
				<VideoStarterCards
					disabled={disabled}
					starters={copy.editor.chat.starters}
					onPromptSelect={onPromptSelect}
				/>
			)}
		</div>
	);
}

function TopicIntentCapsules({
	disabled,
	onPromptSelect,
}: {
	disabled: boolean;
	onPromptSelect: (prompt: string) => void;
}) {
	return (
		<div className="mx-auto w-full max-w-3xl min-w-0">
			<div className="mb-3 text-center">
				<div className="text-xs font-semibold text-muted-foreground">
					选择一个创作类型
				</div>
				<div className="mt-1 text-[0.68rem] text-muted-foreground/75">
					气泡只会载入问询流程，你可以先改再发送
				</div>
			</div>
			<div className="flex flex-wrap justify-center gap-2.5 px-1 pb-1">
				{TOPIC_STARTERS.map((starter) => (
					<button
						key={starter.label}
						type="button"
						disabled={disabled}
						onClick={() => onPromptSelect(starter.prompt)}
						className="group relative inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 text-left text-xs shadow-[0_6px_18px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.55)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.06] hover:shadow-[0_10px_22px_rgba(8,145,178,0.10),inset_0_1px_0_rgba(255,255,255,0.7)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-cyan-300/12 dark:bg-cyan-300/[0.045] dark:shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-cyan-300/30 dark:hover:bg-cyan-300/[0.09]"
						title={`${starter.label}：${starter.hint}`}
					>
						<span className="max-w-16 truncate text-[0.65rem] font-medium text-muted-foreground/80 group-hover:text-primary">
							{starter.group}
						</span>
						<span className="size-1 rounded-full bg-primary/35" />
						<span className="whitespace-nowrap font-semibold text-foreground">
							{starter.label}
						</span>
						<span className="hidden rounded-full bg-muted/70 px-1.5 py-0.5 text-[0.62rem] text-muted-foreground md:inline">
							{starter.hint}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}

function VideoStarterCards({
	disabled,
	starters,
	onPromptSelect,
}: {
	disabled: boolean;
	starters: Array<{ label: string; hint: string; prompt: string }>;
	onPromptSelect: (prompt: string) => void;
}) {
	return (
		<div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
			{starters.map(({ label, hint, prompt }, index) => {
				const { icon: Icon, iconClassName } =
					STARTER_PROMPT_STYLES[index] ?? STARTER_PROMPT_STYLES[0];
				return (
					<button
						key={label}
						type="button"
						disabled={disabled}
						onClick={() => onPromptSelect(prompt)}
						className="group flex min-h-[4.8rem] w-full cursor-pointer items-center gap-3 rounded-md border border-border/75 bg-muted/[0.38] px-3 py-2.5 text-left transition-colors hover:border-primary/25 hover:bg-muted/[0.55] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:border-cyan-300/30 dark:hover:bg-accent"
					>
						<span
							className={`flex size-10 shrink-0 items-center justify-center rounded-md border ${iconClassName} group-hover:text-foreground`}
						>
							<Icon size={19} />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm font-semibold text-foreground">
								{label}
							</span>
							<span className="mt-0.5 block truncate text-xs text-muted-foreground">
								{hint}
							</span>
						</span>
					</button>
				);
			})}
		</div>
	);
}
