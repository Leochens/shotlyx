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
import { getTopicProjectMode } from "@/topic-workbench/model";
import type { TopicInputMaterial } from "@/topic-workbench/types";
import { WorkbenchSwitcher } from "@/topic-workbench/workbench-switcher";
import { CreatorProfileDialogTrigger } from "@/topic-workbench/creator-profile-dialog";
import { useTopicWorkbenchStore } from "@/topic-workbench/store";
import {
	executeTopicWorkbenchTool,
	getTopicPackageResourceToolSchemas,
	getTopicWorkbenchToolSchemas,
	TOPIC_PACKAGE_RESOURCE_TOOL_NAMES,
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
import { cn } from "@/utils/ui";

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

const EMPTY_TOPIC_INPUT_MATERIALS: TopicInputMaterial[] = [];

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

type TopicPromptSection = {
	title: string;
	intro?: string;
	items: string[];
};

const PROMPT_STEP_LABELS = [
	"第一步",
	"第二步",
	"第三步",
	"第四步",
	"第五步",
	"第六步",
];

function formatPromptList(items: string[]): string {
	return items.map((item) => `- ${item}`).join("\n");
}

function buildTopicStarterPrompt({
	label,
	opening,
	role,
	sections,
	candidateRequirements,
	candidateAngles,
	afterConfirm,
}: {
	label: string;
	opening: string;
	role: string;
	sections: TopicPromptSection[];
	candidateRequirements: string[];
	candidateAngles: string[];
	afterConfirm: string[];
}): string {
	const sectionText = sections
		.map((section, index) => {
			const stepLabel = PROMPT_STEP_LABELS[index] ?? `第${index + 1}步`;
			const intro = section.intro ? `\n${section.intro}` : "";
			return `${stepLabel}：${section.title}${intro}\n${formatPromptList(section.items)}`;
		})
		.join("\n\n");

	return `我想做一个「${label}」类视频，请你像${role}一样，${opening}

先不要直接写完整脚本，也不要一上来就给结论。请先进入需求确认阶段，一次最多问 2-3 个最关键的问题；如果我已经提供素材、脚本、录屏稿、链接或文字备注，请先判断这些内容能回答哪些问题，再继续追问。

${sectionText}

候选选题产出要求：
当信息足够后，请生成 3-5 个候选选题，并同步展示到右侧选题工作台。每个候选选题都必须包含：
${formatPromptList(candidateRequirements)}

候选方向至少覆盖：
${formatPromptList(candidateAngles)}

候选出来后，请先停下来等我选择、修改或要求重新生成。不要继续写完整脚本。

我确认选题之后，你再继续：
${formatPromptList(afterConfirm)}`;
}

const TOPIC_STARTERS: TopicStarter[] = [
	{
		label: "口播观点",
		group: "表达观点",
		hint: "需要观点",
		prompt: buildTopicStarterPrompt({
			label: "口播观点",
			role: "内容策划导演和表达教练",
			opening:
				"带我把一个模糊想法、口播素材或个人观点，整理成可以拍、可以讲、可以发布的视频选题。",
			sections: [
				{
					title: "先理解我的账号和表达风格",
					items: [
						"确认我的账号定位、目标受众和过往内容风格。",
						"判断我更适合犀利观点、经验分享、理性分析、吐槽反讽、真诚陪伴，还是知识型讲解。",
						"确认发布平台、预期时长，以及这条视频想带来的结果：涨粉、评论讨论、建立专业感、转化咨询，还是单纯表达。",
					],
				},
				{
					title: "判断我现在提供了什么",
					items: [
						"如果我已经上传口播素材、录音、视频、草稿、文字稿或零散笔记，先总结里面已有的观点、情绪、故事、金句和可用片段。",
						"如果素材里观点不够明确，先问我到底想表达什么，不要急着替我下结论。",
						"如果素材里有多个方向，帮我拆成几个可能的表达主题，并说明它们分别适合什么平台和时长。",
					],
				},
				{
					title: "帮我提炼观点和表达边界",
					items: [
						"追问我最想表达的一句话观点，以及它来自亲身经历、行业观察、反常识判断，还是对某个现象的不满。",
						"判断这个观点有没有具体故事、案例、场景或冲突可以承载。",
						"如果涉及热点、行业趋势或事实判断，补充必要资料，并区分事实、观点和推测。",
						"确认哪些说法我不想碰，哪些表达边界需要注意。",
					],
				},
				{
					title: "把观点变成可选择的选题",
					items: [
						"不要只给标题，要把每个候选都写成一个可执行的视频方向。",
						"每个方向都要说明它的开头钩子、论证路径、表达语气和需要补充的个人经历或资料。",
						"如果某个方向太泛，请主动压缩到更具体的人群、场景或争议点。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"一句话核心观点",
				"适合平台和预期时长",
				"目标受众",
				"开头 3 秒钩子",
				"视频结构建议",
				"适合的表达语气",
				"为什么这个选题值得做",
				"需要补充的素材、资料或个人经历",
			],
			candidateAngles: [
				"反常识观点型",
				"个人经历型",
				"热点借势型",
				"争议讨论型",
				"方法建议型",
			],
			afterConfirm: [
				"汇总资料和可引用依据",
				"完善观点论证",
				"设计视频结构",
				"撰写口播稿大纲",
				"输出完整选题包",
			],
		}),
	},
	{
		label: "产品展示",
		group: "展示产品",
		hint: "需要素材",
		prompt: buildTopicStarterPrompt({
			label: "产品展示",
			role: "产品营销策划和视觉导演",
			opening:
				"把一个产品、功能或服务拆成观众愿意看的展示视频，而不是生硬的功能说明书。",
			sections: [
				{
					title: "确认产品和商业目标",
					items: [
						"先问清楚产品是什么、面向谁、解决什么痛点，以及这条视频希望观众采取什么行动。",
						"确认展示重点是新品介绍、功能讲解、场景种草、品牌展示，还是转化引导。",
						"如果我只给了产品名，先问我能否补充官网、截图、演示视频、用户反馈或卖点资料。",
					],
				},
				{
					title: "盘点可用素材和品牌线索",
					items: [
						"如果我上传了 logo、截图、录屏、产品照片、视频素材或说明文档，先梳理哪些能证明卖点。",
						"如果素材不足，告诉我最需要补什么：界面截图、使用场景、前后对比、用户评价，还是产品细节。",
						"结合品牌调性判断视频应该更精致、可信、年轻、有科技感，还是更生活化。",
					],
				},
				{
					title: "选择展示路径",
					items: [
						"帮我判断适合从用户痛点切入、从使用场景切入、从核心功能切入，还是从结果对比切入。",
						"如果产品复杂，先把卖点按重要性排序，不要一条视频塞太多信息。",
						"如果产品适合视觉化展示，请建议哪些地方用实拍、录屏、素材库镜头、MG 动画或 AI 生成片段。",
					],
				},
				{
					title: "形成可执行展示方案",
					items: [
						"每个候选都要说明开场画面、核心卖点、证明方式、结尾行动和所需素材。",
						"如果面向不同平台，请分别考虑节奏、字幕密度、信息量和 CTA 的强度。",
						"避免空泛夸产品，要让每个候选都有具体使用场景和可信证据。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"产品和目标人群",
				"核心利益点",
				"开头场景或视觉钩子",
				"视频结构建议",
				"画面和素材建议",
				"信任证据",
				"平台、时长和 CTA",
				"还缺哪些素材",
			],
			candidateAngles: [
				"痛点直击型",
				"场景代入型",
				"功能亮点型",
				"前后对比型",
				"证据证明型",
				"品牌质感型",
			],
			afterConfirm: [
				"整理卖点和证明材料",
				"设计分镜和画面节奏",
				"撰写宣传脚本",
				"生成素材清单",
				"准备进入视频制作流程",
			],
		}),
	},
	{
		label: "教程演示",
		group: "传授知识",
		hint: "需要步骤",
		prompt: buildTopicStarterPrompt({
			label: "教程演示",
			role: "课程设计师和教程视频导演",
			opening: "把一个操作过程拆成观众能听懂、能跟做、能得到结果的教程视频。",
			sections: [
				{
					title: "确认教学任务和用户水平",
					items: [
						"先问清楚观众要完成什么具体任务，做完后能得到什么结果。",
						"判断目标用户是新手、进阶用户还是专业用户，是否需要解释前置概念。",
						"确认平台和时长，判断适合做短平快技巧、完整流程，还是系列教程。",
					],
				},
				{
					title: "理解步骤资料和演示素材",
					items: [
						"如果我提供录屏、截图、步骤文档、脚本或参考链接，先整理出完整操作链路。",
						"标出哪些步骤必须展示画面，哪些步骤可以用口播、字幕、示意图或 MG 动画解释。",
						"如果资料不足，先问我最容易卡住的步骤和观众最常问的问题。",
					],
				},
				{
					title: "设计教程结构",
					items: [
						"帮我把教程拆成开场目标、准备条件、核心步骤、常见错误、结果验证和下一步建议。",
						"判断是否需要先展示最终效果，再倒推操作流程。",
						"如果步骤太多，主动建议拆成系列或压缩成一个关键问题。",
					],
				},
				{
					title: "让候选方向更可拍",
					items: [
						"每个候选都要明确观众为什么会点开、看完能学会什么、需要准备什么素材。",
						"避免只写知识点，要说明画面如何呈现、哪些地方需要重点放大或暂停讲解。",
						"如果涉及复杂概念，请建议用类比、示意图或动画降低理解成本。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"学习目标",
				"适合人群和前置基础",
				"步骤结构",
				"关键卡点和避坑提示",
				"画面呈现方式",
				"平台和预期时长",
				"所需素材清单",
			],
			candidateAngles: [
				"新手入门型",
				"单点问题解决型",
				"效率提升型",
				"避坑纠错型",
				"完整流程型",
			],
			afterConfirm: [
				"梳理教学大纲",
				"细化每一步讲解",
				"生成分镜和素材表",
				"撰写口播稿",
				"准备制作教程成片",
			],
		}),
	},
	{
		label: "生活记录",
		group: "记录过程",
		hint: "需要主题",
		prompt: buildTopicStarterPrompt({
			label: "生活记录",
			role: "Vlog 策划和纪实故事剪辑师",
			opening:
				"从一段日常、旅行、工作或成长经历里，找到真实、有情绪、有主题的视频方向。",
			sections: [
				{
					title: "确认生活场景和情绪基调",
					items: [
						"先问这段经历发生在哪里、持续多久、我想表达什么情绪。",
						"判断它更适合治愈、搞笑、松弛、成长、忙碌、反差，还是纪实观察。",
						"确认我希望观众看到的是生活方式、个人变化、审美氛围，还是某个具体故事。",
					],
				},
				{
					title: "梳理素材时间线",
					items: [
						"如果我上传了视频、照片或文字记录，先按时间线整理场景、人物、事件和情绪变化。",
						"标出哪些素材是开场钩子、哪些是过渡、哪些适合做情绪高潮或结尾。",
						"如果素材断裂，先问我缺失的背景，不要凭空编造剧情。",
					],
				},
				{
					title: "提炼主题和叙事角度",
					items: [
						"帮我从真实细节里提炼一个主题，比如独处、效率、旅行反差、工作日常、成长记录或生活审美。",
						"判断适合按时间顺序讲，还是按情绪变化、问题解决、地点转换来讲。",
						"保留生活感，不要把它写成过度营销或过度煽情的文案。",
					],
				},
				{
					title: "生成可剪辑的选题方向",
					items: [
						"每个候选都要说明开场画面、情绪关键词、叙事线和音乐/字幕风格。",
						"如果适合平台差异化，请分别考虑长视频的叙事完整度和短视频的前 3 秒吸引力。",
						"如果素材不足以支撑某个方向，要明确提醒需要补拍什么。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"情绪关键词",
				"故事摘要",
				"开场画面建议",
				"叙事结构",
				"可用素材类型",
				"音乐、字幕和节奏建议",
				"平台和预期时长",
				"需要补充的镜头或说明",
			],
			candidateAngles: [
				"治愈日常型",
				"搞笑反差型",
				"成长记录型",
				"旅行/探店纪实型",
				"工作生活方式型",
				"情绪独白型",
			],
			afterConfirm: [
				"整理素材时间线",
				"设计叙事结构",
				"生成剪辑节奏建议",
				"撰写旁白或字幕文案",
				"输出完整生活记录选题包",
			],
		}),
	},
	{
		label: "产品测评",
		group: "展示产品",
		hint: "需要体验",
		prompt: buildTopicStarterPrompt({
			label: "产品测评",
			role: "测评编辑、体验研究员和消费决策顾问",
			opening:
				"把真实体验、参数信息和使用场景整理成有判断、有证据、能帮助观众做选择的视频选题。",
			sections: [
				{
					title: "确认测评对象和使用场景",
					items: [
						"先问清楚测评对象是什么，是单品、合集、横评，还是某个场景下的推荐。",
						"确认目标观众是谁，他们最关心价格、性能、体验、可靠性、颜值，还是售后。",
						"问我目前有没有明确结论：值得买、不值得买、适合某类人，还是还在观察。",
					],
				},
				{
					title: "梳理体验证据和评价维度",
					items: [
						"如果我提供了使用素材、照片、参数表、订单信息或体验笔记，先提炼可证明优缺点的证据。",
						"帮我建立评价维度，比如外观、性能、易用性、稳定性、价格、场景适配、竞品对比。",
						"如果我没有足够证据，先提醒哪些结论不能轻易下，哪些需要补充体验或资料。",
					],
				},
				{
					title: "选择测评叙事方式",
					items: [
						"判断更适合直接给结论、先讲体验故事、做对比表，还是从一个真实痛点切入。",
						"如果是合集或横评，帮我设计公平的比较规则，不要让视频变成简单罗列。",
						"如果涉及同类产品，补充必要资料，但要把外部信息和我的真实体验分开。",
					],
				},
				{
					title: "生成有判断力的候选选题",
					items: [
						"每个候选都要有明确判断，不要只写“体验不错”。",
						"说明这个选题的证据来源、争议点和可能被观众质疑的地方。",
						"如果适合种草或避坑，分别给出不同表达强度。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"测评对象和使用场景",
				"一句话结论或待验证问题",
				"目标受众",
				"评价维度",
				"关键证据",
				"视频结构建议",
				"适合平台和预期时长",
				"争议点或补充资料需求",
			],
			candidateAngles: [
				"单品深测型",
				"横向对比型",
				"场景推荐型",
				"避坑劝退型",
				"真香反转型",
				"购买决策型",
			],
			afterConfirm: [
				"整理测评资料和证据",
				"搭建评价维度表",
				"设计视频结构",
				"撰写测评脚本大纲",
				"输出测评选题包和素材表",
			],
		}),
	},
	{
		label: "实时资讯",
		group: "追踪热点",
		hint: "需要事件",
		prompt: buildTopicStarterPrompt({
			label: "实时资讯",
			role: "快讯编辑、事实核查员和热点解读策划",
			opening:
				"把正在发生的事件整理成快、准、有信息层次的视频选题，并避免把未经核实的说法当成事实。",
			sections: [
				{
					title: "确认事件和内容目标",
					items: [
						"先问我具体事件、关键词、链接或我已经看到的信息来源。",
						"确认我想做快讯、时间线梳理、影响分析、观点评论，还是谣言澄清。",
						"问清楚目标平台、视频时长，以及我是否已有明确立场或只想客观梳理。",
					],
				},
				{
					title: "建立事实底座",
					items: [
						"优先核验事件的时间、地点、相关人物/机构、已确认事实和最新进展。",
						"把信息分成确定事实、外部观点、未经证实说法和我的分析判断。",
						"如果资料来源互相冲突，先提示冲突点，不要强行给出单一结论。",
					],
				},
				{
					title: "选择解读角度",
					items: [
						"判断这个事件对谁有影响：普通用户、创作者、企业、行业从业者，还是某个圈层。",
						"帮我找到观众最关心的问题：发生了什么、为什么重要、接下来会怎样、我该怎么看。",
						"如果做观点评论，先确认表达边界和风险点。",
					],
				},
				{
					title: "生成可快速发布的候选方向",
					items: [
						"每个候选都要标注适合的发布速度：立即快讯、当天解读、后续深度。",
						"说明哪些信息需要持续更新，哪些部分可以稳定写入脚本。",
						"避免标题党，尤其不要夸大未经确认的影响。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"事件摘要",
				"信息确定性说明",
				"核心问题或观点",
				"目标受众",
				"视频结构建议",
				"适合平台和时长",
				"引用资料类型",
				"风险点和需要继续跟进的信息",
			],
			candidateAngles: [
				"快讯速览型",
				"时间线梳理型",
				"影响分析型",
				"观点评论型",
				"谣言澄清型",
				"后续预测型",
			],
			afterConfirm: [
				"汇总并核验参考资料",
				"整理事实时间线",
				"形成知识脉络和观点边界",
				"设计视频结构",
				"撰写快讯或解读脚本",
			],
		}),
	},
	{
		label: "案例拆解",
		group: "传授知识",
		hint: "需要案例",
		prompt: buildTopicStarterPrompt({
			label: "案例拆解",
			role: "研究员、内容策划和视频导演",
			opening:
				"带我把一个公司、产品、品牌、创作者、项目或事件，拆成有事实、有判断、有方法论的视频选题。",
			sections: [
				{
					title: "确认我要拆的案例",
					items: [
						"先问我要拆解的案例对象是什么，它最吸引我的地方是成功、失败、增长、翻车、争议、转型、爆款，还是关键决策。",
						"确认我想让观众获得方法、避坑、趋势判断、商业启发、创作灵感，还是情绪共鸣。",
						"问清目标观众、发布平台和预期时长。",
					],
				},
				{
					title: "判断已有资料",
					items: [
						"如果我提供了文章、截图、视频、录屏、链接、文档或自己的观察，先提炼关键事实、时间线、人物关系、产品变化、关键动作和核心矛盾。",
						"如果我只给了案例名，先围绕这个案例补充公开资料，优先关注原始信息、官方信息、采访、公告、公开报道和可信分析。",
						"把确定事实、外部观点和你的分析判断分开；如果资料不完整，告诉我还缺哪些信息。",
					],
				},
				{
					title: "建立案例拆解框架",
					items: [
						"解释这个案例到底发生了什么，以及为什么值得做成视频。",
						"梳理关键时间线、核心矛盾、转折点、成败原因和大多数人可能误解的地方。",
						"提炼这个案例背后的行业变化、用户需求或可复用方法。",
						"识别争议点、风险点和需要谨慎表达的地方。",
					],
				},
				{
					title: "生成可选的拆解角度",
					items: [
						"每个候选都要有清晰观点，而不是只介绍案例。",
						"说明这个角度适合哪些观众、需要哪些资料支撑、可能会有什么争议。",
						"如果案例很复杂，主动建议拆成系列或聚焦一个关键转折。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"摘要",
				"核心观点",
				"拆解对象",
				"目标受众",
				"发布平台建议和预期时长",
				"选题缘由",
				"关键事实依据",
				"视频结构建议",
				"争议点或表达风险",
			],
			candidateAngles: [
				"成功方法论拆解",
				"失败复盘/避坑",
				"行业趋势观察",
				"普通人可复制经验",
				"争议反转型解读",
			],
			afterConfirm: [
				"汇总参考资料",
				"形成知识脉络",
				"设计视频结构",
				"撰写脚本大纲",
				"输出完整选题包",
			],
		}),
	},
	{
		label: "清单盘点",
		group: "传授知识",
		hint: "需要范围",
		prompt: buildTopicStarterPrompt({
			label: "清单盘点",
			role: "资料策展人、信息架构师和清单型内容策划",
			opening:
				"把一组工具、资源、方法、店铺、书单或经验整理成可收藏、可转发、可执行的清单型视频。",
			sections: [
				{
					title: "确认盘点范围和筛选标准",
					items: [
						"先问我要盘点什么，范围有多大，是工具、方法、资源、店铺、书单、产品，还是经验。",
						"明确筛选标准：便宜、好用、新手友好、专业、效率高、小众、颜值高，还是经过亲测。",
						"确认观众收藏后要怎么用，而不是只看热闹。",
					],
				},
				{
					title: "整理已有清单和补充资料",
					items: [
						"如果我已有清单、链接、截图、表格或素材，先去重、分类、补充说明和使用场景。",
						"如果需要补充资料，按筛选标准查漏补缺，不要把随机结果塞进清单。",
						"对于不确定的信息，标注需要核验，避免误导观众。",
					],
				},
				{
					title: "设计清单结构",
					items: [
						"帮我判断适合按人群、场景、价格、难度、使用频率，还是推荐优先级排序。",
						"每个清单项都要有一句推荐理由和适用场景。",
						"如果清单太长，建议拆成系列或分层版本。",
					],
				},
				{
					title: "提升收藏和转发价值",
					items: [
						"每个候选都要说明观众为什么要收藏，以及看完能马上做什么。",
						"避免普通榜单式标题，尽量给出独特筛选视角。",
						"如果适合做图文配套或评论区补充，也一并说明。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"盘点范围",
				"筛选标准",
				"目标受众",
				"清单结构",
				"示例条目类型",
				"收藏价值",
				"平台和预期时长",
				"需要补充或核验的信息",
			],
			candidateAngles: [
				"新手必备型",
				"小众宝藏型",
				"高性价比型",
				"效率工具型",
				"避坑筛选型",
				"进阶收藏型",
			],
			afterConfirm: [
				"整理清单资料",
				"建立分类和筛选标准",
				"补充引用和说明",
				"设计视频结构",
				"输出清单型选题包",
			],
		}),
	},
	{
		label: "对比选择",
		group: "展示产品",
		hint: "需要对象",
		prompt: buildTopicStarterPrompt({
			label: "对比选择",
			role: "消费决策顾问、产品分析师和对比型内容策划",
			opening:
				"把多个产品、方案、工具或路径之间的差异讲清楚，帮助观众在真实场景里做决定。",
			sections: [
				{
					title: "确认对比对象和决策场景",
					items: [
						"先问我要对比的对象分别是什么，以及观众为什么会在它们之间犹豫。",
						"确认目标观众最关心价格、性能、学习成本、风险、体验、售后，还是适配场景。",
						"问清楚我想给强结论，还是按不同人群分流建议。",
					],
				},
				{
					title: "建立公平的评价维度",
					items: [
						"帮我把评价维度拆清楚，避免只凭个人喜好比较。",
						"如果对象是公开产品或方案，补充必要参数、价格、限制和同题参考。",
						"如果我有真实体验素材，先区分真实体验、公开资料和主观判断。",
					],
				},
				{
					title: "设计对比表达方式",
					items: [
						"判断适合做 A vs B、多人群分流、预算分层、场景分流，还是误区纠偏。",
						"每个对比点都要尽量落到具体使用场景，不要只堆参数。",
						"如果结论复杂，请用表格化逻辑或分段建议降低理解成本。",
					],
				},
				{
					title: "生成能帮观众做决定的候选",
					items: [
						"每个候选都要说明谁适合谁、不适合谁。",
						"明确这条视频的最终决策建议，而不是所有对象都说一遍。",
						"指出可能影响结论的变量，比如预算、平台、使用频率或专业程度。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"对比对象",
				"决策场景",
				"目标受众",
				"核心评价维度",
				"初步结论",
				"视频结构建议",
				"资料或体验依据",
				"平台和预期时长",
			],
			candidateAngles: [
				"A vs B 决策型",
				"预算分层型",
				"新手/专业分流型",
				"场景选择型",
				"误区纠偏型",
				"风险提示型",
			],
			afterConfirm: [
				"整理对比资料",
				"建立评价维度",
				"设计对比结构",
				"撰写脚本大纲",
				"输出决策型选题包",
			],
		}),
	},
	{
		label: "幕后过程",
		group: "记录过程",
		hint: "需要素材",
		prompt: buildTopicStarterPrompt({
			label: "幕后过程",
			role: "幕后纪录片导演和项目叙事策划",
			opening:
				"把一个作品、产品、项目或服务背后的真实过程，整理成有起点、有转折、有成果的视频选题。",
			sections: [
				{
					title: "确认过程对象和最终成果",
					items: [
						"先问我要展示什么过程：作品制作、产品开发、活动筹备、服务交付、个人训练，还是团队协作。",
						"确认过程的起点、关键节点、最终结果，以及我希望观众记住成果、方法、情绪还是反差。",
						"判断这条内容更像纪录片、教程、复盘，还是成果展示。",
					],
				},
				{
					title: "梳理过程素材",
					items: [
						"如果我上传了录屏、照片、视频、项目文件或过程记录，先按时间线整理关键节点。",
						"标出哪些素材适合做开场悬念、过程推进、困难展示、成果揭晓。",
						"如果素材不完整，先问我缺失的关键节点，不要把过程写得过于顺滑。",
					],
				},
				{
					title: "提炼幕后价值",
					items: [
						"帮我判断观众为什么会关心幕后：想学方法、看反差、看困难、看成果，还是看真实工作流。",
						"把过程中的卡点、取舍、失败尝试和关键决策提炼出来。",
						"如果过程偏专业，建议哪些地方用字幕、旁白、示意图或动画解释。",
					],
				},
				{
					title: "形成可剪辑的幕后选题",
					items: [
						"每个候选都要说明起点、转折、高潮和结果。",
						"如果更适合系列内容，请建议拆分方式。",
						"避免只展示成果，要让观众看到过程中的真实成本和判断。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"过程对象",
				"起点和最终结果",
				"关键节点",
				"开场钩子",
				"叙事结构",
				"素材使用建议",
				"表达重心",
				"平台和预期时长",
			],
			candidateAngles: [
				"从无到有型",
				"踩坑修正型",
				"成果揭晓型",
				"工作流展示型",
				"团队协作型",
				"真实成本型",
			],
			afterConfirm: [
				"整理过程时间线",
				"筛选关键素材",
				"设计幕后叙事结构",
				"撰写旁白或字幕",
				"输出幕后过程选题包",
			],
		}),
	},
	{
		label: "长视频拆短",
		group: "长内容再利用",
		hint: "需要长素材",
		prompt: buildTopicStarterPrompt({
			label: "长视频拆短",
			role: "短视频再创作剪辑师和内容分发策划",
			opening:
				"从直播、课程、访谈、播客、发布会或长视频里拆出多个能独立发布的短视频方向。",
			sections: [
				{
					title: "确认长内容类型和分发目标",
					items: [
						"先问长内容是什么类型，目标平台是什么，希望拆成几个短视频。",
						"确认我更想找高光、金句、知识点、争议点、故事片段，还是转化片段。",
						"如果我还没上传长素材或转写稿，先提醒我补充素材，不要凭空生成切片。",
					],
				},
				{
					title: "理解长素材内容",
					items: [
						"先梳理长内容主题、章节、重点观点、情绪波动和可独立成片的片段。",
						"标出哪些片段不依赖上下文也能看懂，哪些片段必须补前情。",
						"如果长内容信息密度很高，先按主题分组，再生成候选。",
					],
				},
				{
					title: "制定切片标准",
					items: [
						"优先选择有强开场、明确观点、完整信息闭环、情绪变化或实用价值的片段。",
						"判断不同平台需要的节奏、字幕密度、标题风格和时长。",
						"避免断章取义；如果片段可能误解，要说明需要补充的上下文。",
					],
				},
				{
					title: "生成切片选题包",
					items: [
						"每个候选都要说明来源片段的大致位置、独立发布理由和二次包装方向。",
						"如果适合拆成系列，请建议顺序和每条视频的定位。",
						"如果素材质量不足，提醒我哪些片段需要补录旁白或加解释字幕。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"来源片段主题",
				"独立成片理由",
				"开头钩子",
				"目标平台和建议时长",
				"需要保留的上下文",
				"二次包装建议",
				"字幕/封面方向",
				"素材风险或补充需求",
			],
			candidateAngles: [
				"高光观点型",
				"金句传播型",
				"知识闭环型",
				"争议讨论型",
				"故事片段型",
				"转化引导型",
			],
			afterConfirm: [
				"定位具体片段",
				"设计短视频标题和封面方向",
				"补充上下文和字幕重点",
				"生成剪辑建议",
				"准备进入视频制作流程",
			],
		}),
	},
	{
		label: "直播切片",
		group: "长内容再利用",
		hint: "需要长素材",
		prompt: buildTopicStarterPrompt({
			label: "直播切片",
			role: "直播内容运营和切片剪辑策划",
			opening:
				"从一场直播里找到能单独成片、能带动互动、能服务涨粉或转化目标的切片方向。",
			sections: [
				{
					title: "确认直播目标和切片用途",
					items: [
						"先问直播主题、观众是谁，以及切片目标是带货、涨粉、答疑、观点传播还是知识沉淀。",
						"确认是否需要保留商品信息、活动信息、上下文和主播口播连贯性。",
						"如果我没有提供直播素材或转写稿，先提醒我补充，否则只能做切片策略，不能做真实片段选择。",
					],
				},
				{
					title: "识别直播里的高价值瞬间",
					items: [
						"梳理直播中的强开场、用户问题、主播情绪波动、明确观点、成交解释和高互动片段。",
						"区分能独立发布的片段和必须补上下文的片段。",
						"如果是带货直播，关注问题、卖点、证明、价格/权益、行动召唤是否完整。",
					],
				},
				{
					title: "设计切片包装方式",
					items: [
						"判断每个片段适合做问答、观点、冲突、种草、避坑、福利提醒还是知识总结。",
						"给出标题、字幕强调、开头补充语和结尾引导方向。",
						"避免把直播原片原封不动搬运，要说明哪里需要压缩、重排或补字幕。",
					],
				},
				{
					title: "生成直播切片候选",
					items: [
						"每个候选都要说明切片目标、适合平台、预计长度和独立传播理由。",
						"如果片段存在误解风险，标出必须保留的前后文。",
						"如果适合连续发布，建议发布顺序和账号运营目的。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"切片目标",
				"来源片段内容",
				"独立开场方式",
				"适合平台和建议时长",
				"需要保留的上下文",
				"字幕和封面方向",
				"结尾行动建议",
				"风险或补充信息",
			],
			candidateAngles: [
				"带货转化型",
				"答疑知识型",
				"强观点涨粉型",
				"用户痛点型",
				"高能互动型",
				"福利提醒型",
			],
			afterConfirm: [
				"定位直播片段",
				"设计切片结构",
				"生成标题和封面建议",
				"输出字幕重点",
				"准备剪辑和发布文案",
			],
		}),
	},
	{
		label: "访谈播客",
		group: "长内容再利用",
		hint: "需要文本/素材",
		prompt: buildTopicStarterPrompt({
			label: "访谈播客",
			role: "访谈制作人、播客剪辑师和人物故事策划",
			opening:
				"从访谈、播客或长对谈里提炼人物故事、行业观点、金句片段和可独立传播的视频选题。",
			sections: [
				{
					title: "确认嘉宾和访谈价值",
					items: [
						"先问嘉宾是谁、访谈主题是什么，以及嘉宾最有价值的身份、经历或稀缺视角。",
						"确认我想突出人物故事、行业观点、金句、争议讨论，还是情绪共鸣。",
						"问清平台、时长和目标观众。",
					],
				},
				{
					title: "理解访谈素材",
					items: [
						"如果我提供转写稿、音视频或时间点标记，先提炼主要话题、观点单元、故事节点和金句。",
						"标出哪些片段能脱离访谈上下文独立成立，哪些需要补充嘉宾背景。",
						"如果没有素材，先问嘉宾背景和我想强调的主题，不要假装已经听过访谈。",
					],
				},
				{
					title: "设计剪辑叙事",
					items: [
						"判断适合用嘉宾金句开场、主持人提问开场、故事冲突开场，还是行业判断开场。",
						"把人物故事、观点逻辑和情绪节奏分开整理。",
						"如果片段可能引发误解，说明需要保留的前后语境。",
					],
				},
				{
					title: "生成访谈切片候选",
					items: [
						"每个候选都要说明它的传播点：人物、观点、故事、金句或争议。",
						"给出标题、开场字幕、上下文补充和适合平台。",
						"如果可以形成系列，建议每条的主题顺序。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"嘉宾/人物角度",
				"核心观点或金句",
				"目标受众",
				"开场方式",
				"片段结构",
				"需要补充的上下文",
				"平台和建议时长",
				"素材或时间点线索",
			],
			candidateAngles: [
				"人物故事型",
				"金句观点型",
				"行业洞察型",
				"争议讨论型",
				"情绪共鸣型",
				"主持人追问型",
			],
			afterConfirm: [
				"整理访谈资料",
				"定位观点片段",
				"设计切片结构",
				"生成标题和字幕重点",
				"输出访谈播客选题包",
			],
		}),
	},
	{
		label: "广告投放",
		group: "展示产品",
		hint: "需要卖点",
		prompt: buildTopicStarterPrompt({
			label: "广告投放",
			role: "效果广告创意导演和增长营销策划",
			opening:
				"把产品卖点、用户痛点和证据素材转成可以投放测试的短视频广告方向。",
			sections: [
				{
					title: "确认投放目标和产品承诺",
					items: [
						"先问产品或服务是什么、目标用户是谁，以及转化目标是下载、咨询、购买、留资还是关注。",
						"确认核心痛点、核心卖点、用户承诺和行动号召。",
						"问清投放平台、视频时长、预算阶段和是否需要多版本测试。",
					],
				},
				{
					title: "梳理证据和素材",
					items: [
						"如果我提供产品页、截图、用户反馈、案例、演示视频或品牌素材，先识别哪些能证明卖点。",
						"如果没有证据素材，先提醒我补充可验证材料，不要写空泛夸张承诺。",
						"判断能否用真实场景、前后对比、用户证言、功能演示或数据结果建立信任。",
					],
				},
				{
					title: "设计广告创意假设",
					items: [
						"把候选拆成不同创意假设：痛点、场景、证明、对比、反常识、福利或强 CTA。",
						"每个方向都要说明前 3 秒怎么抓住用户，以及为什么可能转化。",
						"如果平台不同，分别考虑竖屏节奏、字幕密度、口播强度和结尾引导。",
					],
				},
				{
					title: "生成可测试的广告方向",
					items: [
						"每个候选都要能独立投放测试，不要只给品牌宣传口号。",
						"说明需要哪些素材才能制作，以及如果素材不足可以用什么替代方案。",
						"提醒可能的合规、夸大宣传或承诺风险。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"广告创意假设",
				"目标用户",
				"痛点和卖点",
				"前 3 秒钩子",
				"视频结构",
				"证明材料",
				"行动号召",
				"所需素材和风险点",
			],
			candidateAngles: [
				"痛点直击型",
				"证据证明型",
				"场景转化型",
				"前后对比型",
				"用户证言型",
				"强 CTA 型",
			],
			afterConfirm: [
				"整理卖点和证据",
				"设计广告脚本",
				"生成分镜和素材表",
				"准备多版本测试方向",
				"进入广告视频制作流程",
			],
		}),
	},
	{
		label: "复盘总结",
		group: "记录过程",
		hint: "需要经历",
		prompt: buildTopicStarterPrompt({
			label: "复盘总结",
			role: "复盘教练、经验萃取专家和故事策划",
			opening:
				"把一次项目、阶段、失败、成功或个人经历，复盘成有事实链、有判断、有启发的视频选题。",
			sections: [
				{
					title: "确认复盘对象和结果",
					items: [
						"先问我要复盘什么：项目、产品、创作、运营、学习、创业经历，还是一次失败。",
						"确认最终结果是什么，有哪些关键数据、外部反馈或个人感受。",
						"问清目标观众是谁，他们应该从这个复盘里学到什么。",
					],
				},
				{
					title: "梳理事实链和关键节点",
					items: [
						"如果我提供项目记录、截图、数据、素材或笔记，先按时间线整理发生了什么。",
						"标出关键决策、转折点、意外情况、成功动作和失败原因。",
						"如果事实链不完整，先追问关键节点，不要直接写鸡汤式总结。",
					],
				},
				{
					title: "提炼可迁移经验",
					items: [
						"帮助我区分表面原因和真正原因，避免把偶然结果包装成万能方法。",
						"把经验拆成观众能复制的行动、需要避开的坑、以及适用条件。",
						"如果涉及他人或公司信息，提醒表达边界和隐私风险。",
					],
				},
				{
					title: "生成复盘选题方向",
					items: [
						"每个候选都要有明确结论，而不是只讲经历。",
						"说明它是经验分享、失败避坑、方法论沉淀，还是故事型复盘。",
						"如果复盘内容很多，建议聚焦一个最有价值的转折点。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"复盘对象",
				"关键结果",
				"核心教训或经验",
				"目标受众",
				"关键时间线",
				"视频结构建议",
				"可引用素材或数据",
				"表达风险和边界",
			],
			candidateAngles: [
				"成功经验型",
				"失败避坑型",
				"方法论沉淀型",
				"故事转折型",
				"数据复盘型",
				"成长反思型",
			],
			afterConfirm: [
				"整理事实链",
				"提炼方法论",
				"设计视频结构",
				"撰写复盘脚本大纲",
				"输出复盘选题包",
			],
		}),
	},
	{
		label: "挑战实验",
		group: "记录过程",
		hint: "需要规则",
		prompt: buildTopicStarterPrompt({
			label: "挑战实验",
			role: "实验节目策划、挑战导演和悬念结构设计师",
			opening:
				"把一个挑战、测试、实验或限时任务，设计成有规则、有悬念、有结果反差的视频选题。",
			sections: [
				{
					title: "确认挑战规则和成功标准",
					items: [
						"先问挑战目标是什么、规则是什么、时间限制是什么，以及什么算成功或失败。",
						"确认我想突出过程困难、结果反差、方法论，还是娱乐性。",
						"问清目标平台、时长和观众为什么会关心这个挑战。",
					],
				},
				{
					title: "梳理过程素材和实验记录",
					items: [
						"如果我提供过程视频、记录、数据、截图或结果素材，先整理实验节点和关键变化。",
						"标出悬念点、失败点、反转点和最终结果。",
						"如果没有过程素材，先问我具体发生了什么，不要只根据挑战标题编过程。",
					],
				},
				{
					title: "设计悬念和观看动力",
					items: [
						"帮我判断开头应该先展示最终结果、设置问题，还是直接抛出挑战规则。",
						"把过程拆成阶段目标、困难升级、临时调整和结果揭晓。",
						"如果结果不够戏剧化，找出可表达的学习、失败或反差价值。",
					],
				},
				{
					title: "生成挑战实验选题",
					items: [
						"每个候选都要说明挑战规则、看点、悬念、结果表达和素材需求。",
						"避免夸大实验结论；如果样本不足，要说明只是个人实验或娱乐测试。",
						"如果适合系列化，建议下一期挑战方向。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"挑战目标和规则",
				"成功标准",
				"过程看点",
				"结果或待验证问题",
				"悬念结构",
				"所需素材",
				"平台和预期时长",
				"可信度和风险提示",
			],
			candidateAngles: [
				"限时挑战型",
				"结果反差型",
				"数据实验型",
				"失败也有用型",
				"极限条件型",
				"系列挑战型",
			],
			afterConfirm: [
				"整理挑战规则",
				"梳理过程节点",
				"设计悬念结构",
				"撰写脚本大纲",
				"输出挑战实验选题包",
			],
		}),
	},
	{
		label: "情景短剧",
		group: "剧情场景",
		hint: "需要冲突",
		prompt: buildTopicStarterPrompt({
			label: "情景短剧",
			role: "短剧编剧、场景导演和商业创意策划",
			opening:
				"把一个生活洞察、产品卖点或情绪冲突，设计成可拍、可演、可反转的情景短剧选题。",
			sections: [
				{
					title: "确认场景、人物和表达目的",
					items: [
						"先问故事发生在什么场景，人物是谁，他们之间有什么关系。",
						"确认核心冲突是什么，以及我想表达生活洞察、情绪共鸣、品牌卖点，还是搞笑反转。",
						"问清目标平台、视频时长、表演风格和拍摄条件。",
					],
				},
				{
					title: "设计戏剧钩子",
					items: [
						"帮我把冲突压缩到开头几秒，让观众立刻知道矛盾。",
						"判断适合用误会、反差、选择困境、尴尬场面、夸张设定，还是现实痛点开场。",
						"如果要植入产品或观点，先判断它应该自然出现在剧情哪个位置。",
					],
				},
				{
					title: "搭建剧情结构",
					items: [
						"把剧情拆成开场冲突、升级、转折、反转和结尾动作。",
						"确认每个角色的动机和台词风格，避免只有段子没有人物。",
						"如果需要低成本拍摄，优先设计少人物、少场景、强台词的方案。",
					],
				},
				{
					title: "生成可拍的短剧选题",
					items: [
						"每个候选都要说明人物、场景、冲突、反转和结尾。",
						"如果是商业植入，要说明如何避免硬广感。",
						"如果适合系列化，建议固定人设或固定场景。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"场景设定",
				"人物关系",
				"核心冲突",
				"开头钩子",
				"剧情反转",
				"结尾动作",
				"产品/观点植入方式",
				"拍摄素材和道具需求",
			],
			candidateAngles: [
				"冲突开场型",
				"反转结尾型",
				"软植入型",
				"职场场景型",
				"亲密关系型",
				"荒诞搞笑型",
			],
			afterConfirm: [
				"完善剧情结构",
				"设计人物台词",
				"生成分镜和拍摄清单",
				"撰写短剧脚本",
				"准备进入视频制作流程",
			],
		}),
	},
	{
		label: "品牌故事",
		group: "剧情场景",
		hint: "需要定位",
		prompt: buildTopicStarterPrompt({
			label: "品牌故事",
			role: "品牌策略师、纪录片导演和个人 IP 策划",
			opening:
				"把品牌、个人 IP、产品或团队背后的故事讲得可信、有记忆点，并能服务长期定位。",
			sections: [
				{
					title: "确认品牌定位和受众",
					items: [
						"先问品牌、人物或产品是谁，核心受众是谁，为他们解决什么问题。",
						"确认最想被记住的是经历、价值观、专业能力、审美气质、差异化优势，还是客户结果。",
						"如果有全局用户画像或品牌套件，先结合它们判断表达风格。",
					],
				},
				{
					title: "梳理故事素材和可信证据",
					items: [
						"如果我提供图片、官网、过往内容、客户案例、产品资料或创始经历，先提炼能证明品牌承诺的素材。",
						"如果素材不足，先问品牌为什么成立、经历过什么转折、服务过什么人、和别人有什么不同。",
						"避免写成空泛宣言，所有价值观都尽量落到具体故事或证据上。",
					],
				},
				{
					title: "选择品牌叙事路径",
					items: [
						"判断适合讲创始故事、客户改变、产品诞生、价值观坚持、团队幕后，还是差异化定位。",
						"设计情绪节奏：先建立问题，再讲选择和坚持，最后落到可信承诺。",
						"如果面向转化，判断结尾是否需要轻 CTA；如果面向品牌建设，优先强化记忆点。",
					],
				},
				{
					title: "生成品牌故事选题",
					items: [
						"每个候选都要说明品牌想被记住的关键词和证据。",
						"给出视觉风格、叙事语气和适合平台。",
						"如果故事涉及夸张表述或未经证实的成绩，提醒需要谨慎表达。",
					],
				},
			],
			candidateRequirements: [
				"标题",
				"品牌/人物定位",
				"目标受众",
				"核心记忆点",
				"故事主线",
				"可信证据",
				"视觉风格建议",
				"平台和预期时长",
				"结尾行动或品牌印象",
			],
			candidateAngles: [
				"创始故事型",
				"价值观型",
				"客户改变型",
				"产品诞生型",
				"差异化定位型",
				"团队幕后型",
			],
			afterConfirm: [
				"整理品牌资料",
				"提炼品牌记忆点",
				"设计故事结构",
				"撰写品牌故事脚本",
				"输出品牌故事选题包",
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
	const startBrainstormDraft = useTopicWorkbenchStore(
		(state) => state.startBrainstormDraft,
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
		getSessionMessages,
	} = useChatStore();
	const editor = useEditor();
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const editorProjectId = projectId ?? "default-project";
	const chatProjectId = useMemo(
		() => `${editorProjectId}::${activeWorkbench}`,
		[activeWorkbench, editorProjectId],
	);
	const activeTopicProject = useTopicWorkbenchStore((state) => {
		const topicProjectId =
			state.activeTopicProjectIdByEditorProject[editorProjectId];
		if (!topicProjectId) return null;
		return (
			state.topicProjects.find((project) => project.id === topicProjectId) ??
			null
		);
	});
	const pendingTopicInputMaterials = useTopicWorkbenchStore(
		(state) =>
			(state.pendingInputMaterialsByEditorProject ?? {})[editorProjectId] ??
			EMPTY_TOPIC_INPUT_MATERIALS,
	);
	const updateTopicInputMaterial = useTopicWorkbenchStore(
		(state) => state.updateInputMaterial,
	);
	const removeTopicInputMaterial = useTopicWorkbenchStore(
		(state) => state.removeInputMaterial,
	);
	const mediaAssetCount = useEditor(
		(editor) =>
			editor.media.getAssets().filter((asset) => !asset.ephemeral).length,
	);
	const messages = getActiveMessages();
	const activeChatSession = useChatStore((state) =>
		state.sessions.find((session) => session.id === state.activeSessionId),
	);
	const queuedPromptsForSession = queuedPrompts.filter(
		(prompt) => prompt.sessionId === activeSessionId,
	);
	const visibleMessages = useMemo(
		() => messages.filter((msg) => !msg.hidden),
		[messages],
	);
	const isFocusedTopicChat =
		activeWorkbench === "topic" && activeTopicProject === null;
	const isTopicBrainstorming =
		activeWorkbench === "topic" &&
		activeTopicProject !== null &&
		getTopicProjectMode(activeTopicProject) === "brainstorm";
	const topicBrainstormDraft = useMemo(() => {
		if (!isTopicBrainstorming || !activeTopicProject) return undefined;
		const noteMaterials = (activeTopicProject.inputMaterials ?? []).filter(
			(material) => material.kind === "note",
		);
		const lines = noteMaterials.flatMap((material, index) => {
			const content = material.content?.trim();
			const summary = material.summary?.trim();
			if (!content && !summary) return [];
			return `${index + 1}. ${material.title}\n${content || summary}`;
		});
		return lines.length > 0 ? lines.join("\n\n") : undefined;
	}, [activeTopicProject, isTopicBrainstorming]);
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
			setActiveProject(chatProjectId);
			setActiveEditorProject({ editorProjectId: projectId });
		}
	}, [
		chatProjectId,
		isHydrated,
		projectId,
		setActiveEditorProject,
		setActiveProject,
	]);

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
		chatSessionId,
		runSignal,
		queueMessageContentUpdate,
		flushMessageContentUpdate,
	}: {
		sseEvent: SSEEvent;
		accumulated: { text: string; thought: string };
		currentAssistantMsgIdRef: { current: string | null };
		runSessionIdRef: { current: string | null };
		chatSessionId: string;
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
				addMessage(
					{
						id: mid,
						role: "assistant",
						content: accumulated.text,
						thought: accumulated.thought,
						timestamp: getClientNow(),
					},
					chatSessionId,
				);
				currentAssistantMsgIdRef.current = mid;
				setStreamingMessageId(mid, chatSessionId);
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
			updateMessageThought(
				{ id: mid, thought: accumulated.thought },
				chatSessionId,
			);
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
			const currentMsgs = getSessionMessages(chatSessionId);
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
					addMessage(
						{
							id: `tool-result-post-error-${getClientNow()}`,
							role: "assistant",
							content: `工具 ${tool} 已执行，但结果回传失败：${getErrorMessage(error)}`,
							timestamp: getClientNow(),
						},
						chatSessionId,
					);
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
				const updatedMsgs = getSessionMessages(chatSessionId);
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
				updateMessageToolCalls(
					{
						id: mid,
						toolCalls: currentToolCalls,
					},
					chatSessionId,
				);
			};

			updateMessageToolCalls(
				{
					id: mid,
					toolCalls: [...existingToolCalls, pendingRecord],
				},
				chatSessionId,
			);

			void (async () => {
				let toolResult: ToolResult;
				try {
					if (
						(activeWorkbench === "topic" &&
							TOPIC_WORKBENCH_TOOL_NAMES.has(tool)) ||
						TOPIC_PACKAGE_RESOURCE_TOOL_NAMES.has(tool)
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
				const updatedMsgs = getSessionMessages(chatSessionId);
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
				updateMessageToolCalls(
					{
						id: mid,
						toolCalls: currentToolCalls,
					},
					chatSessionId,
				);

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
			updateMessageTokenUsage({ id: mid, tokenUsage: usage }, chatSessionId);
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

			setPendingPlan(plan, chatSessionId);

			if (planData.reasoning) {
				accumulated.thought = planData.reasoning;
				const mid = ensureAssistantMessage();
				updateMessageThought(
					{
						id: mid,
						thought: planData.reasoning,
					},
					chatSessionId,
				);
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
				updateMessageActions(
					{
						id: mid,
						actions: planData.actions,
					},
					chatSessionId,
				);
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
			updateMessageActions({ id: mid, actions }, chatSessionId);
			return;
		}
		if (sseEvent.event === "clarification-request") {
			const clarification = getRecordField({
				value: data,
				key: "clarification",
			});
			if (!isClarificationRequest(clarification)) return;
			const mid = ensureAssistantMessage();
			updateMessageClarification({ id: mid, clarification }, chatSessionId);
			return;
		}
		if (sseEvent.event === "error") {
			flushMessageContentUpdate();
			const message =
				getStringField({ value: data, key: "message" }) ?? "未知错误";
			const category =
				getStringField({ value: data, key: "category" }) ?? "unknown";
			const isRetryable = category === "network" || category === "rate_limit";

			addMessage(
				{
					id: `error-${getClientNow()}`,
					role: "assistant",
					content: "",
					error: { message, category, isRetryable },
					timestamp: getClientNow(),
				},
				chatSessionId,
			);

			setLoading(false, chatSessionId);
			setStreamingMessageId(null, chatSessionId);
			setStartTime(null);
			return;
		}
	};

	const runSSEAgent = async ({
		msgsToSend,
		chatSessionId,
		extra,
	}: {
		msgsToSend: Array<{
			role: string;
			content: string;
			references?: AgentContextReference[];
		}>;
		chatSessionId: string;
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
			updateMessageContent(
				{
					id: pendingContentUpdateRef.id,
					content: pendingContentUpdateRef.content,
				},
				chatSessionId,
			);
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
			const getBrainstormToolSchemas = () =>
				editor.mcp
					.getToolSchemas()
					.filter((schema) => TOPIC_SUPPORT_TOOL_NAMES.has(schema.name));
			const topicContext = isTopicBrainstorming
				? {
						topicInteractionMode: "brainstorm",
						topicBrainstormDraft,
					}
				: {
						topicInteractionMode: "workflow",
						topicBrainstormDraft: undefined,
					};
			const body: Record<string, unknown> = {
				messages: msgsToSend,
				mode,
				toolSchemas:
					activeWorkbench === "topic"
						? isTopicBrainstorming
							? getBrainstormToolSchemas()
							: [
									...getTopicWorkbenchToolSchemas(),
									...getBrainstormToolSchemas(),
								]
						: [
								...editor.mcp.getToolSchemas(),
								...getTopicPackageResourceToolSchemas(),
							],
				context: {
					activeBrandKit: editor.project.getActiveBrandKit(),
					activeWorkbench,
					...topicContext,
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
							chatSessionId,
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
						addMessage(
							{
								id: `err-${getClientNow()}`,
								role: "assistant",
								content: `SSE 流错误: ${error.message}`,
								timestamp: getClientNow(),
							},
							chatSessionId,
						);
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
				addMessage(
					{
						id: `topic-offline-${getClientNow()}`,
						role: "assistant",
						content:
							"这次 Agent 没能完成选题生成。请检查模型和联网工具配置后重试，右侧工作台会在 Agent 产出候选选题后出现。",
						timestamp: getClientNow(),
					},
					chatSessionId,
				);
				return;
			}
			addMessage(
				{
					id: `err-${getClientNow()}`,
					role: "assistant",
					content: `调用失败: ${err instanceof Error ? err.message : String(err)}`,
					timestamp: getClientNow(),
				},
				chatSessionId,
			);
		} finally {
			flushMessageContentUpdate();
			setStreamingMessageId(null, chatSessionId);
			setLoading(false, chatSessionId);
			setStartTime(null);
			if (runAbortRef.current === runAbort) {
				runAbortRef.current = null;
				streamAbortRef.current = null;
			}
		}
	};

	const handleStop = () => {
		const chatSessionId = activeSessionId;
		const activeMessages = chatSessionId
			? getSessionMessages(chatSessionId)
			: getActiveMessages();
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
			updateMessageToolCalls(
				{
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
				},
				chatSessionId ?? undefined,
			);
		}
		setStreamingMessageId(null, chatSessionId);
		setLoading(false, chatSessionId);
		setStartTime(null);
		addMessage(
			{
				id: `stop-${getClientNow()}`,
				role: "assistant",
				content: "已停止当前 Agent 流程。你可以直接输入新的需求重新开始。",
				timestamp: getClientNow(),
			},
			chatSessionId ?? undefined,
		);
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

	const handleStartTopicDraft = () => {
		recordReferencesAsTopicMaterials({ references: draftReferences });
		startBrainstormDraft({
			editorProjectId,
			draft: input,
		});
		setInput("");
		clearDraftReferences();
	};

	const submitPrompt = async ({
		prompt,
		references = draftReferences,
	}: {
		prompt: string;
		references?: AgentContextReference[];
	}) => {
		const trimmed = prompt.trim();
		const chatSessionId = activeSessionId;
		if (!trimmed || isLoading || !editor || !chatSessionId) return;
		recordReferencesAsTopicMaterials({ references });

		const userMsg = {
			id: `u-${getClientNow()}`,
			role: "user" as const,
			content: trimmed,
			references,
			timestamp: getClientNow(),
		};
		addMessage(userMsg, chatSessionId);
		setInput("");
		clearDraftReferences();
		setLoading(true, chatSessionId);

		const allMsgs = [...getSessionMessages(chatSessionId), userMsg];
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
			chatSessionId,
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
		if (
			pendingTopicAgentEvent.source === "handoff-video" &&
			activeChatSession?.projectId !== chatProjectId
		) {
			return;
		}

		consumeTopicAgentEvent({ eventId: pendingTopicAgentEvent.id });
		if (pendingTopicAgentEvent.autoRun) {
			void submitPromptRef.current({
				prompt: pendingTopicAgentEvent.content,
				references: [],
			});
			return;
		}

		addMessage(
			{
				id: `topic-workbench-event-${getClientNow()}`,
				role: "user",
				content: `[选题工作台]\n${pendingTopicAgentEvent.content}`,
				timestamp: getClientNow(),
			},
			activeSessionId ?? undefined,
		);
	}, [
		activeWorkbench,
		activeChatSession?.projectId,
		activeSessionId,
		addMessage,
		chatProjectId,
		consumeTopicAgentEvent,
		editor,
		isLoading,
		pendingTopicAgentEvent,
	]);

	const handleSubmit = async () => {
		if (isFocusedTopicChat) {
			handleStartTopicDraft();
			return;
		}
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
		const chatSessionId = activeSessionId;
		if (!trimmed || isLoading || !editor || !chatSessionId) return;

		const userMsg = {
			id: `u-clarification-${getClientNow()}`,
			role: "user" as const,
			content: trimmed,
			timestamp: getClientNow(),
		};
		addMessage(userMsg, chatSessionId);
		setLoading(true, chatSessionId);

		const allMsgs = [...getSessionMessages(chatSessionId), userMsg];
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
			chatSessionId,
		});
	};

	const handleActionClick = async ({
		actionId,
		action,
	}: {
		actionId: string;
		action?: MessageAction;
	}) => {
		const chatSessionId = activeSessionId;
		if (!editor || !chatSessionId) return;

		if (actionId.startsWith("option-")) {
			const selectedValue = actionId.slice("option-".length);
			const currentMessages = getSessionMessages(chatSessionId);
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
			addMessage(userMsg, chatSessionId);
			setLoading(true, chatSessionId);

			const allMsgs = [...getSessionMessages(chatSessionId), userMsg];
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
				chatSessionId,
			});
			return;
		}

		if (actionId === "confirm") {
			if (!pendingPlan) return;
			setLoading(true, chatSessionId);

			const allMsgs = getSessionMessages(chatSessionId);
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
				chatSessionId,
				extra: { action: "confirm", plan: pendingPlan },
			});
			setPendingPlan(null, chatSessionId);
			return;
		}

		if (actionId === "continue") {
			if (!pendingPlan) {
				setLoading(true, chatSessionId);
				const allMsgs = getSessionMessages(chatSessionId);
				await runSSEAgent({
					msgsToSend: allMsgs.map(toRequestMessage),
					chatSessionId,
				});
				return;
			}
			setLoading(true, chatSessionId);

			const allMsgs = getSessionMessages(chatSessionId);
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
				chatSessionId,
				extra: { action: "continue", plan: pendingPlan },
			});
			setPendingPlan(null, chatSessionId);
			return;
		}

		if (actionId === "modify") {
			if (!pendingPlan) {
				addMessage(
					{
						id: `modify-${getClientNow()}`,
						role: "assistant",
						content: "当前没有待确认的计划。请告诉我你想怎么修改？",
						timestamp: getClientNow(),
					},
					chatSessionId,
				);
				return;
			}
			addMessage(
				{
					id: `modify-${getClientNow()}`,
					role: "assistant",
					content: `当前计划：\n${pendingPlan.steps.map((s, i) => `${i + 1}. ${s.description}`).join("\n")}\n\n告诉我你想怎么修改`,
					timestamp: getClientNow(),
				},
				chatSessionId,
			);
			setPendingPlan(null, chatSessionId);
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
		const chatSessionId = activeSessionId;
		if (!editor || isLoading || !chatSessionId) return;

		const msgs = getSessionMessages(chatSessionId);
		const lastMsg = msgs[msgs.length - 1];
		if (lastMsg?.error) {
			removeMessage(lastMsg.id, chatSessionId);
		}

		setLoading(true, chatSessionId);

		const allMsgs = getSessionMessages(chatSessionId);
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
			chatSessionId,
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
					<div
						className={cn(
							"min-h-full",
							isFocusedTopicChat &&
								"mx-auto flex w-full max-w-4xl flex-col justify-center",
						)}
					>
						{visibleMessages.length === 0 && !isLoading ? (
							<AgentEmptyState
								disabled={isLoading || !editor}
								hasMedia={activeWorkbench === "video" && mediaAssetCount > 0}
								workbench={activeWorkbench}
								isTopicBrainstorming={isTopicBrainstorming}
								onPromptSelect={handleStarterPrompt}
								onMaterialUploadClick={() =>
									topicMaterialFileInputRef.current?.click()
								}
								onSourceMaterialClick={() => setTopicSourceMaterialOpen(true)}
							/>
						) : null}
						{isFocusedTopicChat && pendingTopicInputMaterials.length > 0 ? (
							<PendingTopicMaterialsPanel
								materials={pendingTopicInputMaterials}
								onUpdate={({ materialId, patch }) =>
									updateTopicInputMaterial({ materialId, patch })
								}
								onRemove={({ materialId }) =>
									removeTopicInputMaterial({ materialId })
								}
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
						isTopicBrainstorming
							? "继续提问、查资料，或者让 AI 帮你扩展右侧草稿"
							: activeWorkbench === "topic"
								? "今天想做点什么？可以先说一个模糊方向"
								: undefined
					}
					onAgentChange={setSelectedAgent}
					onExecutionModeChange={setMode}
					onRunningSubmitModeChange={setRunningSubmitMode}
					onInputChange={setInput}
					onSubmit={handleSubmit}
					primaryActionLabel={
						isFocusedTopicChat ? "我先自己打打草稿" : undefined
					}
					allowEmptySubmit={isFocusedTopicChat}
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
					centered={isFocusedTopicChat}
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
	isTopicBrainstorming,
	onPromptSelect,
	onMaterialUploadClick,
	onSourceMaterialClick,
}: {
	disabled: boolean;
	hasMedia: boolean;
	workbench: "video" | "topic";
	isTopicBrainstorming: boolean;
	onPromptSelect: (prompt: string) => void;
	onMaterialUploadClick: () => void;
	onSourceMaterialClick: () => void;
}) {
	const { copy } = useAppLocale();
	const emptyKicker =
		workbench === "topic"
			? isTopicBrainstorming
				? "Brainstorm"
				: "Topic workbench"
			: copy.editor.chat.emptyKicker;
	const emptyTitle =
		workbench === "topic"
			? isTopicBrainstorming
				? "头脑风暴模式"
				: "今天想做点什么？"
			: copy.editor.chat.emptyTitle;
	const emptyBody =
		workbench === "topic"
			? isTopicBrainstorming
				? "可以像普通聊天一样继续提问、查资料、扩展想法；右侧草稿不会自动进入选题流程。"
				: "先介绍账号定位，再选一个创作类型；胶囊只会载入输入框，改完后再交给 Agent。"
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
				isTopicBrainstorming ? null : (
					<TopicIntentCapsules
						disabled={disabled}
						onPromptSelect={onPromptSelect}
					/>
				)
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

function PendingTopicMaterialsPanel({
	materials,
	onUpdate,
	onRemove,
}: {
	materials: TopicInputMaterial[];
	onUpdate: (args: {
		materialId: string;
		patch: { title?: string; summary?: string; content?: string };
	}) => void;
	onRemove: (args: { materialId: string }) => void;
}) {
	return (
		<div className="mx-auto mb-4 w-full max-w-3xl rounded-sm border border-border/70 bg-background/88 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:border-cyan-300/15 dark:bg-cyan-300/[0.04]">
			<div className="flex items-center justify-between gap-2">
				<div>
					<div className="text-sm font-semibold text-foreground">素材输入</div>
					<p className="mt-0.5 text-xs leading-5 text-muted-foreground">
						分析过程中也可以修改或移除，后续选题会使用这里的最新内容。
					</p>
				</div>
				<span className="shrink-0 rounded-sm border border-border/70 px-2 py-1 text-xs text-muted-foreground">
					{materials.length}
				</span>
			</div>
			<div className="mt-3 space-y-2">
				{materials.map((material) => (
					<div
						key={material.id}
						className="rounded-sm border border-border/65 bg-muted/[0.22] p-2 dark:bg-background/45"
					>
						<div className="flex items-start gap-2">
							<div className="min-w-0 flex-1 space-y-2">
								<input
									value={material.title}
									onChange={(event) =>
										onUpdate({
											materialId: material.id,
											patch: { title: event.target.value },
										})
									}
									className="h-8 w-full rounded-sm border border-border/70 bg-background px-2 text-sm font-medium text-foreground outline-none focus:border-primary/50"
									aria-label="素材标题"
								/>
								<input
									value={material.summary ?? ""}
									onChange={(event) =>
										onUpdate({
											materialId: material.id,
											patch: { summary: event.target.value },
										})
									}
									className="h-8 w-full rounded-sm border border-border/70 bg-background px-2 text-xs text-muted-foreground outline-none focus:border-primary/50"
									aria-label="素材摘要"
									placeholder="补充素材摘要"
								/>
								<textarea
									value={material.content ?? ""}
									onChange={(event) =>
										onUpdate({
											materialId: material.id,
											patch: { content: event.target.value },
										})
									}
									className="max-h-32 min-h-16 w-full resize-y rounded-sm border border-border/70 bg-background px-2 py-1.5 text-xs leading-5 text-foreground outline-none focus:border-primary/50"
									aria-label="素材内容"
									placeholder="补充脚本、转写、链接或素材说明"
								/>
							</div>
							<button
								type="button"
								onClick={() => onRemove({ materialId: material.id })}
								className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								aria-label={`删除素材 ${material.title}`}
								title="删除素材"
							>
								<Trash2 size={15} />
							</button>
						</div>
					</div>
				))}
			</div>
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
	starters: ReadonlyArray<{ label: string; hint: string; prompt: string }>;
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
