"use client";

import Link from "@/platform/link";
import { useSearchParams } from "@/platform/router";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
	ArrowLeft,
	Bot,
	ChevronDown,
	ImageIcon,
	Eye,
	EyeOff,
	ExternalLink,
	Globe2,
	KeyRound,
	Mic,
	Palette,
	RefreshCw,
	Save,
	Settings,
	Sparkles,
	Terminal,
	Video,
	X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ShotlyxLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import {
	DESKTOP_API_GROUPS,
	type DesktopApiField,
	type DesktopApiGroup,
	isSecretDesktopApiField,
} from "@/desktop/config/catalog";
import { useAppLocale } from "@/i18n/use-app-locale";
import type { AppLocale } from "@/i18n/locales";
import { PRODUCT_NAME } from "@/site/brand";

type StatusGroup = {
	id: string;
	title: string;
	tier: "core" | "experimental";
	configured: boolean;
	required: boolean;
	fields: Array<{
		key: string;
		label: string;
		configured: boolean;
		secret: boolean;
	}>;
};

type ConfigResponse = {
	desktop: boolean;
	configPath?: string;
	updatedAt?: string;
	groups: DesktopApiGroup[];
	values: Record<string, string>;
	status: StatusGroup[];
	error?: string;
};

type LocalCliAgent = {
	id: "claude" | "codex";
	name: string;
	bin: string;
	binPath: string | null;
	available: boolean;
	version: string | null;
	models: Array<{ id: string; label: string }>;
};

type AgentsResponse = {
	desktop: boolean;
	agents: LocalCliAgent[];
	error?: string;
};

type ModelsResponse = {
	desktop: boolean;
	provider: string;
	baseUrl: string;
	models: string[];
	error?: string;
};

const LOCAL_RUNTIME = "local-cli";
const API_RUNTIME = "api";
const PRIMARY_GROUP_IDS = new Set(["agent-runtime", "agent-llm"]);

type LocalizedGroupText = Partial<
	Pick<
		DesktopApiGroup,
		"title" | "purpose" | "recommendedProvider" | "requiredFor"
	>
>;

type LocalizedFieldText = Partial<
	Pick<DesktopApiField, "label" | "help" | "placeholder">
>;

type DesktopSetupCopy = {
	headerTitle: string;
	status: {
		loading: string;
		ready: string;
		needsSetup: string;
		configured: string;
		optional: string;
		core: string;
		experimental: string;
	};
	actions: {
		apply: string;
		save: string;
		saving: string;
		openProjects: string;
		backToProjects: string;
	};
	hero: {
		title: string;
		body: string;
	};
	runtime: {
		localTitle: string;
		localSelected: string;
		localBody: string;
		apiTitle: string;
		apiSelected: string;
		apiBody: string;
	};
	localCli: {
		title: string;
		body: string;
		rescan: string;
		scanning: string;
		empty: string;
		notFound: string;
	};
	apiMode: {
		title: string;
		body: string;
		recommended: string;
		required: string;
	};
	optional: {
		title: string;
		body: string;
		howToTitle: string;
	};
	footer: {
		storage: string;
		localConfig: string;
		desktopWarningStart: string;
		desktopWarningEnd: string;
	};
	secret: {
		savedPlaceholder: string;
		show: string;
		hide: string;
		showTitle: string;
		hideTitle: string;
		clear: string;
		clearTitle: string;
	};
	toasts: {
		desktopInactive: string;
		loadFailed: string;
		scanSuccess: string;
		scanFailed: string;
		scanInvalid: string;
		saveSuccess: string;
		saveSuccessDescription: string;
		saveFailed: string;
		unknownError: string;
	};
	groups: Record<string, LocalizedGroupText>;
	fields: Record<string, LocalizedFieldText>;
};

const DESKTOP_SETUP_COPY: Record<AppLocale, DesktopSetupCopy> = {
	en: {
		headerTitle: "AI integrations",
		status: {
			loading: "Loading...",
			ready: "Agent ready",
			needsSetup: "Agent optional",
			configured: "Configured",
			optional: "Optional",
			core: "Core",
			experimental: "Experimental",
		},
		actions: {
			apply: "Apply",
			save: "Save setup",
			saving: "Saving...",
			openProjects: "Open projects",
			backToProjects: "Open projects",
		},
		hero: {
			title: "Optional AI integrations",
			body: "Shotlyx editing works offline without an account, API key, or Agent. Configure a local CLI or bring your own API key only when you want AI-assisted workflows; switching runtimes keeps previously saved API preferences.",
		},
		runtime: {
			localTitle: "Local Agent",
			localSelected: "Local Agent selected",
			localBody:
				"Use Claude Code or Codex CLI from the local machine. This keeps the first-run experience fast because the user can reuse CLI login state and local credentials.",
			apiTitle: "API BYOK",
			apiSelected: "API BYOK selected",
			apiBody:
				"Use the user's model API key directly in the local desktop server. This is best when no coding CLI is installed or when a specific model endpoint is required.",
		},
		localCli: {
			title: "Local CLI scan",
			body: "Shotlyx scans PATH and the optional CLI path below. Pick the CLI that should drive planning, reasoning, and editor tool calls.",
			rescan: "Rescan local CLIs",
			scanning: "Scanning...",
			empty:
				"No CLI scan result yet. Use Rescan local CLIs or set an absolute path below.",
			notFound: "Not found",
		},
		apiMode: {
			title: "Bring your own model API",
			body: "Configure the model provider used for prompt operations, planning, task generation, and editor tool orchestration. Keys are encrypted with the operating system credential store.",
			recommended: "Recommended",
			required: "Required in API mode",
		},
		optional: {
			title: "Optional API integrations",
			body: "Voice, video, image, visual understanding, transcription, web search, and stock media are optional for first launch. Configure them when users want to try those specific tools.",
			howToTitle: "How to configure",
		},
		footer: {
			storage:
				"API keys are encrypted with Electron safeStorage. The readable config file contains only non-secret preferences.",
			localConfig: "Local config",
			desktopWarningStart: "Start with",
			desktopWarningEnd: "to enable the local settings API.",
		},
		secret: {
			savedPlaceholder: "************",
			show: "Show",
			hide: "Hide",
			showTitle: "Show the value entered now",
			hideTitle: "Hide the value entered now",
			clear: "Remove",
			clearTitle: "Remove the saved value on the next save",
		},
		toasts: {
			desktopInactive: "Desktop local mode is not active",
			loadFailed: "Failed to load desktop setup",
			scanSuccess: "Local CLIs scanned",
			scanFailed: "Failed to scan local CLIs",
			scanInvalid: "Invalid local CLI scan response",
			saveSuccess: "Setup saved",
			saveSuccessDescription:
				"The local Agent server can use the new values now.",
			saveFailed: "Failed to save setup",
			unknownError: "Unknown error",
		},
		groups: {},
		fields: {},
	},
	"zh-CN": {
		headerTitle: "AI 集成",
		status: {
			loading: "加载中...",
			ready: "Agent 已就绪",
			needsSetup: "Agent 可选",
			configured: "已配置",
			optional: "可选",
			core: "核心",
			experimental: "实验性",
		},
		actions: {
			apply: "申请",
			save: "保存设置",
			saving: "保存中...",
			openProjects: "打开项目",
			backToProjects: "打开项目",
		},
		hero: {
			title: "可选 AI 集成",
			body: "无需账号、API Key 或 Agent，Shotlyx 也能离线完成剪辑。需要 AI 辅助时再配置本地 CLI 或自己的 API；切换运行方式不会丢弃已保存的 API 偏好。",
		},
		runtime: {
			localTitle: "本地 Agent",
			localSelected: "已选择本地 Agent",
			localBody:
				"使用本机的 Claude Code 或 Codex CLI。这样首轮体验更快，用户可以复用 CLI 的登录状态和本地凭证。",
			apiTitle: "API BYOK",
			apiSelected: "已选择 API BYOK",
			apiBody:
				"把用户自己的模型 API Key 配到本地桌面服务里。当没有安装本地 CLI，或需要指定模型服务时使用这个模式。",
		},
		localCli: {
			title: "本地 CLI 扫描",
			body: "Shotlyx 会扫描 PATH 和下面填写的可选 CLI 路径。选择一个 CLI，用来驱动计划、推理和编辑器工具调用。",
			rescan: "重新扫描本地 CLI",
			scanning: "扫描中...",
			empty: "还没有 CLI 扫描结果。可以重新扫描，或在下面填写绝对路径。",
			notFound: "未找到",
		},
		apiMode: {
			title: "使用自己的模型 API",
			body: "配置用于 Prompt 操作、计划、任务生成和编辑器工具编排的模型服务。密钥由操作系统凭据存储加密保护。",
			recommended: "推荐",
			required: "API 模式必填",
		},
		optional: {
			title: "可选 API 集成",
			body: "语音、视频、图片、视觉理解、转写、网页搜索和素材库都不是首次启动必填项。用户想体验对应工具时，再展开配置即可。",
			howToTitle: "如何配置",
		},
		footer: {
			storage:
				"API 密钥通过 Electron safeStorage 加密；可读配置文件只保存非敏感偏好。",
			localConfig: "本地配置",
			desktopWarningStart: "请使用",
			desktopWarningEnd: "启动，以启用本地设置 API。",
		},
		secret: {
			savedPlaceholder: "************",
			show: "显示",
			hide: "隐藏",
			showTitle: "显示本次输入的值",
			hideTitle: "隐藏本次输入的值",
			clear: "移除",
			clearTitle: "下次保存时移除已保存的值",
		},
		toasts: {
			desktopInactive: "桌面本地模式未启用",
			loadFailed: "加载桌面设置失败",
			scanSuccess: "本地 CLI 扫描完成",
			scanFailed: "扫描本地 CLI 失败",
			scanInvalid: "本地 CLI 扫描响应无效",
			saveSuccess: "设置已保存",
			saveSuccessDescription: "本地 Agent 服务现在可以使用新的配置。",
			saveFailed: "保存设置失败",
			unknownError: "未知错误",
		},
		groups: {
			"agent-runtime": {
				title: "Agent 运行方式",
				purpose:
					"选择 Shotlyx Agent 直接调用模型 API，还是把推理委托给本地 Coding CLI。",
				requiredFor: "Agent 聊天、计划和编辑器工具编排",
				recommendedProvider: "桌面演示优先本地 CLI；线上使用优先 API 模式",
			},
			"agent-llm": {
				title: "Agent 模型",
				purpose: "用于 Prompt 操作、工具计划和任务生成的可选 AI 能力。",
				requiredFor: "Agent 聊天和自然语言编辑时间线",
				recommendedProvider:
					"OpenAI、Gemini、Anthropic，或任何 OpenAI 兼容代理",
			},
			"motion-graphics": {
				title: "动态图形生成",
				purpose: "用于生成可编辑的 MG 组件，可选。",
				requiredFor: "Shotlyx MG 生成",
				recommendedProvider:
					"优先复用 Agent 模型，也可以配置更快或更便宜的 MG 模型",
			},
			"image-generation": {
				title: "图片生成",
				purpose: "通过 OpenAI 兼容接口按提示词生成静态素材。",
				requiredFor: "图片生成工具",
				recommendedProvider: "OpenAI 图片生成或兼容图片接口",
			},
			"visual-understanding": {
				title: "视觉理解",
				purpose:
					"使用 Kimi K2.6 分析图片或视频内容，用于视觉验证、视频理解和剪辑建议。",
				requiredFor: "视觉分析、视觉验证和视频剪辑建议",
				recommendedProvider: "Kimi K2.6 / Moonshot",
			},
			"video-generation": {
				title: "视频生成",
				purpose: "通过火山引擎 Ark 创建 Seedance 视频任务。",
				requiredFor: "Seedance 视频生成",
				recommendedProvider: "火山引擎 Ark",
			},
			voiceover: {
				title: "配音 / TTS",
				purpose: "为时间线生成旁白音频。",
				requiredFor: "配音和 TTS 工具",
				recommendedProvider: "OpenAI 兼容 TTS、Edge TTS 或火山引擎语音",
			},
			transcription: {
				title: "转写 / ASR",
				purpose: "把音频转成可编辑字幕。",
				requiredFor: "ASR 字幕和音频分析工作流",
				recommendedProvider: "火山引擎 ASR 或 OpenAI 兼容转写服务",
			},
			"web-tools": {
				title: "网页搜索 / 抓取",
				purpose: "让 Agent 可以搜索结果并读取网页内容。",
				requiredFor: "Agent 的 web_search 和 web_fetch 工具",
				recommendedProvider: "Tavily 用于搜索，Jina 或 Firecrawl 用于抓取",
			},
			"stock-media": {
				title: "素材库",
				purpose: "搜索并导入第三方图片、视频和音效素材。",
				requiredFor: "素材搜索和导入工具",
				recommendedProvider: "Pexels、Pixabay 和 Freesound",
			},
		},
		fields: {
			AGENT_RUNTIME: {
				label: "运行方式",
				help: "使用 local-cli 时，会通过本机安装的 Claude Code 或 Codex CLI 执行 Agent 推理。",
			},
			AGENT_CLI_ID: {
				label: "CLI",
				help: "本地 CLI 模式下，用于计划和 ReAct 工具调用的 CLI。",
			},
			AGENT_CLI_MODEL: {
				label: "CLI 模型",
				help: "保留 default 会使用 CLI 自己的模型配置；也可以填写所选 CLI 支持的别名或模型名。",
			},
			AGENT_CLI_PATH: {
				label: "CLI 路径",
				placeholder: "/opt/homebrew/bin/claude",
				help: "当 CLI 无法从 PATH 中发现时，可以填写绝对路径。",
			},
			AGENT_LLM_PROVIDER: {
				label: "服务商",
				help: "可填写 openai、google、anthropic 或 openai-compatible。",
			},
			AGENT_LLM_KEY: {
				label: "API 密钥",
				help: "本地 Agent 服务使用的主密钥。",
			},
			AGENT_LLM_MODEL: {
				label: "模型",
				help: "需要支持工具调用的模型。Gemini 可用 gemini-2.5-pro/flash。",
			},
			AGENT_LLM_HOST: {
				label: "Base URL",
				help: "官方服务通常可留空；OpenAI 兼容代理通常需要填写。",
			},
			AGENT_MG_PROVIDER: {
				label: "服务商",
				help: "留空则复用 Agent 模型服务。",
			},
			AGENT_MG_KEY: {
				label: "API 密钥",
				placeholder: "可选的 MG 专用密钥",
				help: "留空则复用 AGENT_LLM_KEY。",
			},
			AGENT_MG_MODEL: {
				label: "模型",
				help: "留空则复用 AGENT_LLM_MODEL。",
			},
			AGENT_MG_HOST: {
				label: "Base URL",
				help: "MG 生成服务的可选 endpoint 覆盖。",
			},
			IMAGE_GENERATION_BASE_URL: {
				label: "Base URL",
				help: "需要提供 /images/generations 的接口地址。",
			},
			IMAGE_GENERATION_API_KEY: {
				label: "API 密钥",
				help: "图片生成服务密钥。",
			},
			IMAGE_GENERATION_MODEL: {
				label: "模型",
				help: "图片服务支持的模型名。",
			},
			AGENT_VISION_PROVIDER: {
				label: "服务商",
				help: "视觉理解服务使用 OpenAI 兼容的 chat completions 格式；推荐 Kimi K2.6。",
			},
			AGENT_VISION_KEY: {
				label: "Kimi / Moonshot API 密钥",
				placeholder: "sk-...",
				help: "用于图片和视频视觉理解的 Moonshot API Key。",
			},
			AGENT_VISION_MODEL: {
				label: "视觉模型",
				help: "用于图片和视频内容理解的模型。",
			},
			AGENT_VISION_HOST: {
				label: "视觉 Base URL",
				help: "推荐使用 Moonshot API 基础地址：https://api.moonshot.cn/v1。",
			},
			VOLCENGINE_ARK_API_KEY: {
				label: "Ark API 密钥",
				help: "用于创建和轮询 Seedance 任务。",
			},
			VOLCENGINE_ARK_BASE_URL: {
				label: "Ark Base URL",
				help: "火山引擎 Ark API 基础地址。",
			},
			SEEDANCE_VIDEO_MODEL: {
				label: "Seedance 模型",
				help: "已在 Ark 开通的 Seedance 模型标识。",
			},
			VOICEOVER_PROVIDER: {
				label: "服务商",
				help: "可填写 openai、edge-tts 或 volcengine。",
			},
			TTS_GENERATION_API_KEY: {
				label: "OpenAI 兼容 TTS 密钥",
				help: "当 VOICEOVER_PROVIDER=openai 时使用。",
			},
			TTS_GENERATION_BASE_URL: {
				label: "TTS Base URL",
				help: "OpenAI 兼容语音生成接口地址。",
			},
			TTS_GENERATION_MODEL: {
				label: "TTS 模型",
				help: "语音模型名称。",
			},
			VOLCENGINE_TTS_API_KEY: {
				label: "火山 TTS 密钥",
				placeholder: "可选火山语音密钥",
				help: "当 VOICEOVER_PROVIDER=volcengine 时使用。",
			},
			VOLCENGINE_TTS_RESOURCE_ID: {
				label: "火山 TTS 模型",
				placeholder: "seed-tts-2.0",
				help: "火山语音使用的资源或模型标识。",
			},
			ASR_PROVIDER: {
				label: "服务商",
				help: "可填写 volcengine 或 openai-compatible。",
			},
			VOLCENGINE_ASR_API_KEY: {
				label: "火山 ASR 密钥",
				placeholder: "火山语音密钥",
				help: "中文 ASR 工作流推荐使用的密钥。",
			},
			VOLCENGINE_ASR_RESOURCE_ID: {
				label: "火山 ASR 模型",
				placeholder: "volc.bigasr.auc_turbo",
				help: "火山转写使用的资源或模型标识。",
			},
			ASR_API_KEY: {
				label: "OpenAI 兼容 ASR 密钥",
				help: "当 ASR_PROVIDER=openai-compatible 时使用。",
			},
			ASR_BASE_URL: {
				label: "ASR Base URL",
				help: "OpenAI 兼容转写接口地址。",
			},
			ASR_MODEL: {
				label: "ASR 模型",
				help: "转写模型名称。",
			},
			TAVILY_API_KEY: {
				label: "Tavily 密钥",
				help: "推荐的通用搜索服务。",
			},
			FIRECRAWL_API_KEY: {
				label: "Firecrawl 密钥",
				help: "可选的搜索和动态网页抓取服务。",
			},
			BRAVE_SEARCH_API_KEY: {
				label: "Brave Search 密钥",
				help: "可选的独立网页搜索服务。",
			},
			JINA_API_KEY: {
				label: "Jina 密钥",
				help: "可选抓取服务，可提升 Jina Reader 限额。",
			},
			PEXELS_API_KEY: {
				label: "Pexels 密钥",
				help: "视频和图片素材搜索。",
			},
			PIXABAY_API_KEY: {
				label: "Pixabay 密钥",
				help: "图片和视频素材搜索。",
			},
			FREESOUND_API_KEY: {
				label: "Freesound 密钥",
				help: "音效搜索和导入。",
			},
			FREESOUND_CLIENT_ID: {
				label: "Freesound client id",
				help: "可选的 Freesound 应用 client id。",
			},
		},
	},
};

type AgentProviderTabId = "anthropic" | "openai" | "google";

type AgentProviderPreset = {
	id: string;
	tab: AgentProviderTabId;
	label: string;
	provider: "openai" | "openai-compatible" | "anthropic" | "google";
	baseUrl: string;
	models: string[];
	defaultModel: string;
	keyUrl: string;
};

type ModelProvider = AgentProviderPreset["provider"];

type AdvancedModelProviderPreset = {
	id: string;
	label: string;
	provider: ModelProvider;
	baseUrl: string;
	models: string[];
	defaultModel: string;
	keyUrl: string;
	description?: string;
};

type SimpleProviderOption = {
	id: string;
	label: string;
	description?: string;
};

const AGENT_PROVIDER_TABS: Array<{
	id: AgentProviderTabId;
	label: string;
}> = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai", label: "OpenAI" },
	{ id: "google", label: "Google Gemini" },
];

const AGENT_PROVIDER_PRESETS: AgentProviderPreset[] = [
	{
		id: "anthropic",
		tab: "anthropic",
		label: "Anthropic",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com/v1",
		models: [
			"claude-3-5-sonnet-latest",
			"claude-3-5-haiku-latest",
			"claude-3-opus-latest",
		],
		defaultModel: "claude-3-5-sonnet-latest",
		keyUrl: "https://console.anthropic.com/settings/keys",
	},
	{
		id: "openai",
		tab: "openai",
		label: "OpenAI Official",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
		defaultModel: "gpt-4o",
		keyUrl: "https://platform.openai.com/api-keys",
	},
	{
		id: "deepseek",
		tab: "openai",
		label: "DeepSeek - OpenAI",
		provider: "openai-compatible",
		baseUrl: "https://api.deepseek.com",
		models: ["deepseek-chat", "deepseek-reasoner"],
		defaultModel: "deepseek-chat",
		keyUrl: "https://platform.deepseek.com/api_keys",
	},
	{
		id: "minimax",
		tab: "openai",
		label: "MiniMax - OpenAI",
		provider: "openai-compatible",
		baseUrl: "https://api.minimax.chat/v1",
		models: ["MiniMax-Text-01", "abab6.5s-chat"],
		defaultModel: "MiniMax-Text-01",
		keyUrl:
			"https://platform.minimaxi.com/user-center/basic-information/interface-key",
	},
	{
		id: "qwen",
		tab: "openai",
		label: "Qwen - OpenAI",
		provider: "openai-compatible",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		models: ["qwen-plus", "qwen-max", "qwen-turbo"],
		defaultModel: "qwen-plus",
		keyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
	},
	{
		id: "moonshot",
		tab: "openai",
		label: "Moonshot - OpenAI",
		provider: "openai-compatible",
		baseUrl: "https://api.moonshot.cn/v1",
		models: [
			"kimi-k2.6",
			"moonshot-v1-8k",
			"moonshot-v1-32k",
			"moonshot-v1-128k",
		],
		defaultModel: "kimi-k2.6",
		keyUrl: "https://platform.moonshot.cn/console/api-keys",
	},
	{
		id: "openrouter",
		tab: "openai",
		label: "OpenRouter - OpenAI",
		provider: "openai-compatible",
		baseUrl: "https://openrouter.ai/api/v1",
		models: [
			"openai/gpt-4o",
			"anthropic/claude-3.5-sonnet",
			"google/gemini-pro",
		],
		defaultModel: "openai/gpt-4o",
		keyUrl: "https://openrouter.ai/settings/keys",
	},
	{
		id: "siliconflow",
		tab: "openai",
		label: "SiliconFlow - OpenAI",
		provider: "openai-compatible",
		baseUrl: "https://api.siliconflow.cn/v1",
		models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
		defaultModel: "deepseek-ai/DeepSeek-V3",
		keyUrl: "https://cloud.siliconflow.cn/account/ak",
	},
	{
		id: "google",
		tab: "google",
		label: "Google Gemini",
		provider: "google",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
		defaultModel: "gemini-2.5-flash",
		keyUrl: "https://aistudio.google.com/app/apikey",
	},
];

const MODEL_PROVIDER_PRESETS: AdvancedModelProviderPreset[] =
	AGENT_PROVIDER_PRESETS.map(
		({ id, label, provider, baseUrl, models, defaultModel, keyUrl }) => ({
			id,
			label,
			provider,
			baseUrl,
			models,
			defaultModel,
			keyUrl,
		}),
	);

const CUSTOM_OPENAI_COMPATIBLE_PRESET_ID = "custom-openai-compatible";
const REUSE_AGENT_PRESET_ID = "reuse-agent";

const IMAGE_PROVIDER_PRESETS: AdvancedModelProviderPreset[] = [
	{
		id: "openai",
		label: "OpenAI",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		models: ["gpt-image-1", "dall-e-3", "dall-e-2"],
		defaultModel: "gpt-image-1",
		keyUrl: "https://platform.openai.com/api-keys",
	},
	{
		id: "openai-compatible",
		label: "OpenAI Compatible",
		provider: "openai-compatible",
		baseUrl: "https://api.openai.com/v1",
		models: ["gpt-image-1"],
		defaultModel: "gpt-image-1",
		keyUrl: "https://platform.openai.com/api-keys",
		description: "Use this for providers that expose /images/generations.",
	},
];

const TTS_PROVIDER_OPTIONS: SimpleProviderOption[] = [
	{
		id: "openai",
		label: "OpenAI",
		description: "OpenAI-compatible speech API.",
	},
	{
		id: "volcengine",
		label: "火山引擎",
		description: "Doubao / Volcengine speech synthesis.",
	},
];

const ASR_PROVIDER_OPTIONS: SimpleProviderOption[] = [
	{
		id: "volcengine",
		label: "火山引擎",
		description: "Recommended for Chinese speech recognition workflows.",
	},
	{
		id: "openai-compatible",
		label: "OpenAI Compatible",
		description: "Use a Whisper-compatible transcription endpoint.",
	},
];

const WEB_TOOL_PROVIDER_OPTIONS: SimpleProviderOption[] = [
	{
		id: "tavily",
		label: "Tavily",
		description: "General web search provider.",
	},
	{
		id: "firecrawl",
		label: "Firecrawl",
		description: "Search plus richer page crawling.",
	},
	{
		id: "brave",
		label: "Brave Search",
		description: "Independent search API.",
	},
];

const STOCK_VISUAL_PROVIDER_OPTIONS: SimpleProviderOption[] = [
	{
		id: "pexels",
		label: "Pexels",
		description: "Photos and videos.",
	},
	{
		id: "pixabay",
		label: "Pixabay",
		description: "Images and videos.",
	},
];

const STOCK_AUDIO_PROVIDER_OPTIONS: SimpleProviderOption[] = [
	{
		id: "freesound",
		label: "Freesound",
		description: "Sound effects and audio clips.",
	},
];

const OPTIONAL_GROUP_ICONS: Record<string, LucideIcon> = {
	"motion-graphics": Sparkles,
	"image-generation": ImageIcon,
	"video-generation": Video,
	voiceover: Mic,
	transcription: Bot,
	"web-tools": Globe2,
	"stock-media": Palette,
};

function normalizeBaseUrl(value: string | undefined): string {
	return (value ?? "").replace(/\/+$/, "").toLowerCase();
}

function getDefaultPresetForTab(tab: AgentProviderTabId): AgentProviderPreset {
	return (
		AGENT_PROVIDER_PRESETS.find((preset) => preset.tab === tab) ??
		AGENT_PROVIDER_PRESETS[0]!
	);
}

function findAgentProviderPreset(values: Record<string, string>) {
	const provider = values.AGENT_LLM_PROVIDER || "openai";
	const baseUrl = normalizeBaseUrl(values.AGENT_LLM_HOST);
	const exact = AGENT_PROVIDER_PRESETS.find(
		(preset) =>
			preset.provider === provider &&
			normalizeBaseUrl(preset.baseUrl) === baseUrl,
	);
	if (exact) return exact;
	if (provider === "openai-compatible") return undefined;
	return AGENT_PROVIDER_PRESETS.find((preset) => preset.provider === provider);
}

function findProviderPreset({
	provider,
	baseUrl,
	fallbackId,
	presets,
}: {
	provider?: string;
	baseUrl?: string;
	fallbackId: string;
	presets: AdvancedModelProviderPreset[];
}) {
	const normalizedBase = normalizeBaseUrl(baseUrl);
	const exact = presets.find(
		(preset) =>
			preset.provider === provider &&
			normalizeBaseUrl(preset.baseUrl) === normalizedBase,
	);
	if (exact) return exact;
	const providerMatch = presets.find((preset) => preset.provider === provider);
	if (providerMatch) return providerMatch;
	return presets.find((preset) => preset.id === fallbackId) ?? presets[0]!;
}

function getAgentProviderTab(
	values: Record<string, string>,
): AgentProviderTabId {
	const preset = findAgentProviderPreset(values);
	if (preset) return preset.tab;
	const provider = values.AGENT_LLM_PROVIDER;
	if (provider === "anthropic") return "anthropic";
	if (provider === "google") return "google";
	return "openai";
}

function getAgentModelCacheKey(values: Record<string, string>) {
	return getModelCacheKey({
		scope: "agent",
		provider: values.AGENT_LLM_PROVIDER || "openai",
		baseUrl: values.AGENT_LLM_HOST,
	});
}

function getModelCacheKey({
	scope,
	provider,
	baseUrl,
}: {
	scope: string;
	provider: string;
	baseUrl?: string;
}) {
	return [scope, provider || "openai", normalizeBaseUrl(baseUrl)].join("|");
}

function normalizeModelProvider(value: string | undefined): ModelProvider {
	if (
		value === "openai" ||
		value === "openai-compatible" ||
		value === "anthropic" ||
		value === "google"
	) {
		return value;
	}
	return "openai";
}

type EmbeddedSettingsSection = "agent" | "advanced-api" | "other";

function normalizeEmbeddedSection(
	value: string | null,
): EmbeddedSettingsSection {
	if (value === "advanced-api" || value === "other") return value;
	if (value === "agent-page") return "agent";
	return "agent";
}

function isConfigResponse(value: unknown): value is ConfigResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"desktop" in value &&
		"groups" in value &&
		"values" in value &&
		"status" in value &&
		Array.isArray(value.groups) &&
		Array.isArray(value.status) &&
		typeof value.values === "object" &&
		value.values !== null
	);
}

function isAgentsResponse(value: unknown): value is AgentsResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"desktop" in value &&
		"agents" in value &&
		Array.isArray(value.agents)
	);
}

function isModelsResponse(value: unknown): value is ModelsResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"desktop" in value &&
		"provider" in value &&
		"baseUrl" in value &&
		"models" in value &&
		typeof value.provider === "string" &&
		typeof value.baseUrl === "string" &&
		Array.isArray(value.models) &&
		value.models.every((model) => typeof model === "string")
	);
}

async function readConfigResponse(response: Response): Promise<ConfigResponse> {
	const data: unknown = await response.json();
	if (!isConfigResponse(data)) {
		throw new Error("Invalid desktop config response");
	}
	return data;
}

function readErrorMessage(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || !("error" in value)) {
		return undefined;
	}
	const error = value.error;
	return typeof error === "string" ? error : undefined;
}

function getInitialValues(groups: DesktopApiGroup[]) {
	const values = Object.fromEntries(
		groups.flatMap((group) =>
			group.fields.map((field) => [
				field.key,
				field.secret ? "" : (field.defaultValue ?? ""),
			]),
		),
	) as Record<string, string>;
	return applyWelcomeDefaults({ values, responseValues: {} });
}

function applyWelcomeDefaults({
	values,
	responseValues,
}: {
	values: Record<string, string>;
	responseValues: Record<string, string>;
}) {
	const next = { ...values };
	if (!responseValues.AGENT_RUNTIME) next.AGENT_RUNTIME = LOCAL_RUNTIME;
	if (!responseValues.AGENT_CLI_ID) next.AGENT_CLI_ID = "claude";
	if (!responseValues.AGENT_CLI_MODEL) next.AGENT_CLI_MODEL = "default";
	return next;
}

function mergeResponseValues({
	groups,
	values,
}: {
	groups: DesktopApiGroup[];
	values: Record<string, string>;
}) {
	const merged = Object.fromEntries(
		groups.flatMap((group) =>
			group.fields.map((field) => [
				field.key,
				field.secret ? "" : values[field.key] || field.defaultValue || "",
			]),
		),
	) as Record<string, string>;
	return applyWelcomeDefaults({ values: merged, responseValues: values });
}

function getGroupStatus({
	status,
	group,
}: {
	status: StatusGroup[];
	group?: DesktopApiGroup;
}) {
	if (!group) return undefined;
	return status.find((item) => item.id === group.id);
}

function isMeaningfullyConfigured({
	group,
	groupStatus,
}: {
	group: DesktopApiGroup;
	groupStatus?: StatusGroup;
}) {
	if (!groupStatus) return false;
	if (PRIMARY_GROUP_IDS.has(group.id)) return groupStatus.configured;
	return group.fields.some((field) => {
		const fieldStatus = groupStatus.fields.find(
			(item) => item.key === field.key,
		);
		if (!fieldStatus?.configured) return false;
		return Boolean(field.secret || field.required || !field.defaultValue);
	});
}

function getLocalizedGroup({
	group,
	pageCopy,
}: {
	group: DesktopApiGroup;
	pageCopy: DesktopSetupCopy;
}) {
	const localized = pageCopy.groups[group.id] ?? {};
	return {
		title: localized.title ?? group.title,
		purpose: localized.purpose ?? group.purpose,
		recommendedProvider:
			localized.recommendedProvider ?? group.recommendedProvider,
		requiredFor: localized.requiredFor ?? group.requiredFor,
	};
}

function getLocalizedField({
	field,
	pageCopy,
}: {
	field: DesktopApiField;
	pageCopy: DesktopSetupCopy;
}) {
	const localized = pageCopy.fields[field.key] ?? {};
	return {
		label: localized.label ?? field.label,
		help: localized.help ?? field.help,
		placeholder: localized.placeholder ?? field.placeholder,
	};
}

function formatConfiguredCount({
	locale,
	configured,
	total,
}: {
	locale: AppLocale;
	configured: number;
	total: number;
}) {
	return locale === "zh-CN"
		? `${configured}/${total} 已配置`
		: `${configured}/${total} configured`;
}

function formatHowTo({
	locale,
	recommendedProvider,
	requiredFor,
}: {
	locale: AppLocale;
	recommendedProvider: string;
	requiredFor: string;
}) {
	if (locale === "zh-CN") {
		return `在 ${recommendedProvider} 创建密钥，粘贴到下面的字段，然后保存设置。用于：${requiredFor}。`;
	}
	return `Create a key with ${recommendedProvider}, paste the values below, then save this setup. Required for: ${requiredFor}.`;
}

export default function DesktopApiSettingsPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
					Loading settings...
				</div>
			}
		>
			<DesktopApiSettingsPageContent />
		</Suspense>
	);
}

function DesktopApiSettingsPageContent() {
	const { locale } = useAppLocale();
	const pageCopy = DESKTOP_SETUP_COPY[locale];
	const searchParams = useSearchParams();
	const isEmbedded = searchParams.get("embedded") === "1";
	const embeddedSection = normalizeEmbeddedSection(searchParams.get("section"));
	const [groups, setGroups] = useState<DesktopApiGroup[]>(DESKTOP_API_GROUPS);
	const [values, setValues] = useState<Record<string, string>>(() =>
		getInitialValues(DESKTOP_API_GROUPS),
	);
	const [status, setStatus] = useState<StatusGroup[]>([]);
	const [configPath, setConfigPath] = useState<string | null>(null);
	const [isDesktop, setDesktop] = useState(true);
	const [isLoading, setLoading] = useState(true);
	const [isSaving, setSaving] = useState(false);
	const [localAgents, setLocalAgents] = useState<LocalCliAgent[]>([]);
	const [isScanningAgents, setScanningAgents] = useState(false);
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
		{},
	);
	const [revealedSecrets, setRevealedSecrets] = useState<
		Record<string, boolean>
	>({});
	const [modelOptionsByKey, setModelOptionsByKey] = useState<
		Record<string, string[]>
	>({});
	const [fetchingModelListKey, setFetchingModelListKey] = useState<
		string | null
	>(null);
	const [advancedSelections, setAdvancedSelections] = useState<
		Record<string, string>
	>({});
	const [pendingClearKeys, setPendingClearKeys] = useState<string[]>([]);

	const runtime =
		values.AGENT_RUNTIME === API_RUNTIME ? API_RUNTIME : LOCAL_RUNTIME;
	const agentRuntimeGroup = groups.find(
		(group) => group.id === "agent-runtime",
	);
	const agentLlmGroup = groups.find((group) => group.id === "agent-llm");
	const agentLlmStatus = getGroupStatus({ status, group: agentLlmGroup });
	const optionalGroups = groups.filter(
		(group) => !PRIMARY_GROUP_IDS.has(group.id),
	);
	const coreOptionalGroups = optionalGroups.filter(
		(group) => group.tier === "core",
	);
	const experimentalOptionalGroups = optionalGroups.filter(
		(group) => group.tier === "experimental",
	);
	const configuredOptionalCount = optionalGroups.filter((group) =>
		isMeaningfullyConfigured({
			group,
			groupStatus: getGroupStatus({ status, group }),
		}),
	).length;
	const showAgentPage = !isEmbedded || embeddedSection === "agent";
	const showAgentConfig =
		Boolean(agentRuntimeGroup) && showAgentPage && runtime === LOCAL_RUNTIME;
	const showApiConfig =
		Boolean(agentLlmGroup) && showAgentPage && runtime === API_RUNTIME;
	const showOptionalConfig = !isEmbedded || embeddedSection === "advanced-api";
	const showOtherConfig = isEmbedded && embeddedSection === "other";
	const requiredReady = useMemo(() => {
		const requiredGroups = status.filter((group) => group.required);
		return (
			!isLoading &&
			requiredGroups.length > 0 &&
			requiredGroups.every((group) => group.configured)
		);
	}, [isLoading, status]);

	const updateConfigValues = ({
		values: patch,
		clearWhenEmpty = false,
		clearKeys = [],
	}: {
		values: Record<string, string>;
		clearWhenEmpty?: boolean;
		clearKeys?: string[];
	}) => {
		setValues((current) => ({
			...current,
			...patch,
		}));
		setPendingClearKeys((current) => {
			const next = new Set(current);
			for (const key of clearKeys) {
				next.add(key);
			}
			for (const [key, value] of Object.entries(patch)) {
				if (value.trim()) {
					next.delete(key);
				} else if (clearWhenEmpty) {
					next.add(key);
				}
			}
			return Array.from(next);
		});
	};

	const clearConfigValues = (keys: string[]) => {
		updateConfigValues({
			values: Object.fromEntries(keys.map((key) => [key, ""])),
			clearKeys: keys,
		});
	};

	const setAdvancedSelection = ({
		key,
		value,
	}: {
		key: string;
		value: string;
	}) => {
		setAdvancedSelections((current) => ({
			...current,
			[key]: value,
		}));
	};

	useEffect(() => {
		let cancelled = false;
		async function loadAgents() {
			setScanningAgents(true);
			try {
				const response = await fetch("/api/desktop/agents", {
					cache: "no-store",
				});
				if (!response.ok) return;
				const data: unknown = await response.json();
				if (!cancelled && isAgentsResponse(data)) {
					setLocalAgents(data.agents);
				}
			} catch {
				if (!cancelled) setLocalAgents([]);
			} finally {
				if (!cancelled) setScanningAgents(false);
			}
		}
		async function loadConfig() {
			setLoading(true);
			try {
				const response = await fetch("/api/desktop/config", {
					cache: "no-store",
				});
				if (!response.ok) {
					if (cancelled) return;
					setDesktop(false);
					toast.error(pageCopy.toasts.desktopInactive);
					return;
				}
				const data = await readConfigResponse(response);
				if (cancelled) return;
				setDesktop(data.desktop);
				setGroups(data.groups);
				setStatus(data.status);
				setConfigPath(data.configPath ?? null);
				setValues(
					mergeResponseValues({
						groups: data.groups,
						values: data.values ?? {},
					}),
				);
				void loadAgents();
			} catch (error) {
				if (!cancelled) {
					toast.error(pageCopy.toasts.loadFailed, {
						description:
							error instanceof Error
								? error.message
								: pageCopy.toasts.unknownError,
					});
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		loadConfig();
		return () => {
			cancelled = true;
		};
	}, [
		pageCopy.toasts.desktopInactive,
		pageCopy.toasts.loadFailed,
		pageCopy.toasts.unknownError,
	]);

	const handleSelectRuntime = (
		nextRuntime: typeof LOCAL_RUNTIME | typeof API_RUNTIME,
	) => {
		const availableAgent = localAgents.find((agent) => agent.available);
		updateConfigValues({
			values: {
				AGENT_RUNTIME: nextRuntime,
				...(nextRuntime === LOCAL_RUNTIME
					? {
							AGENT_CLI_ID:
								values.AGENT_CLI_ID || availableAgent?.id || "claude",
							AGENT_CLI_MODEL: values.AGENT_CLI_MODEL || "default",
						}
					: {}),
			},
		});
	};

	const handleApplyAgentProviderPreset = (preset: AgentProviderPreset) => {
		updateConfigValues({
			values: {
				AGENT_RUNTIME: API_RUNTIME,
				AGENT_LLM_PROVIDER: preset.provider,
				AGENT_LLM_HOST: preset.baseUrl,
				AGENT_LLM_MODEL: preset.defaultModel,
			},
		});
	};

	const handleScanAgents = async () => {
		setScanningAgents(true);
		try {
			const response = await fetch("/api/desktop/agents", {
				cache: "no-store",
			});
			if (!response.ok) throw new Error(pageCopy.toasts.scanFailed);
			const data: unknown = await response.json();
			if (!isAgentsResponse(data)) {
				throw new Error(pageCopy.toasts.scanInvalid);
			}
			setLocalAgents(data.agents);
			toast.success(pageCopy.toasts.scanSuccess);
		} catch (error) {
			toast.error(pageCopy.toasts.scanFailed, {
				description:
					error instanceof Error ? error.message : pageCopy.toasts.unknownError,
			});
		} finally {
			setScanningAgents(false);
		}
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const payloadValues = Object.fromEntries(
				Object.entries(values).filter(([key, value]) => {
					if (isSecretDesktopApiField(key)) return value.trim().length > 0;
					return true;
				}),
			);
			const response = await fetch("/api/desktop/config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					values: payloadValues,
					clear: pendingClearKeys.filter((key) => !payloadValues[key]?.trim()),
				}),
			});
			if (!response.ok) {
				const data: unknown = await response.json();
				throw new Error(readErrorMessage(data) ?? pageCopy.toasts.saveFailed);
			}
			const data = await readConfigResponse(response);
			setGroups(data.groups);
			setStatus(data.status);
			setConfigPath(data.configPath ?? null);
			setValues(
				mergeResponseValues({
					groups: data.groups,
					values: data.values ?? {},
				}),
			);
			setPendingClearKeys([]);
			setRevealedSecrets({});
			toast.success(pageCopy.toasts.saveSuccess, {
				description: pageCopy.toasts.saveSuccessDescription,
			});
		} catch (error) {
			toast.error(pageCopy.toasts.saveFailed, {
				description:
					error instanceof Error ? error.message : pageCopy.toasts.unknownError,
			});
		} finally {
			setSaving(false);
		}
	};

	const handleToggleSecret = ({ key }: { key: string }) => {
		if (!(values[key] ?? "").trim()) return;
		setRevealedSecrets((current) => ({
			...current,
			[key]: !current[key],
		}));
	};

	const handleFetchModels = async ({
		cacheKey,
		provider,
		baseUrl,
		apiKey,
		apiKeyConfigKey,
		modelKey,
	}: {
		cacheKey: string;
		provider: ModelProvider;
		baseUrl: string;
		apiKey?: string;
		apiKeyConfigKey?: string;
		modelKey: string;
	}) => {
		setFetchingModelListKey(cacheKey);
		try {
			const response = await fetch("/api/desktop/models", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider,
					baseUrl,
					apiKey,
					apiKeyConfigKey,
				}),
			});
			const data: unknown = await response.json();
			if (!response.ok) {
				throw new Error(readErrorMessage(data) ?? "Failed to fetch models");
			}
			if (!isModelsResponse(data)) {
				throw new Error("Invalid model list response");
			}
			const models = data.models.filter(Boolean);
			setModelOptionsByKey((current) => ({
				...current,
				[cacheKey]: models,
			}));
			if (models.length > 0 && !values[modelKey]) {
				updateConfigValues({
					values: {
						[modelKey]: models[0]!,
					},
				});
			}
			toast.success(
				locale === "zh-CN" ? "模型列表已更新" : "Model list updated",
			);
		} catch (error) {
			toast.error(
				locale === "zh-CN" ? "获取模型列表失败" : "Failed to fetch models",
				{
					description:
						error instanceof Error
							? error.message
							: pageCopy.toasts.unknownError,
				},
			);
		} finally {
			setFetchingModelListKey(null);
		}
	};

	const handleFetchAgentModels = async () => {
		const provider = normalizeModelProvider(values.AGENT_LLM_PROVIDER);
		await handleFetchModels({
			cacheKey: getAgentModelCacheKey(values),
			provider,
			baseUrl: values.AGENT_LLM_HOST,
			apiKey: values.AGENT_LLM_KEY,
			apiKeyConfigKey: "AGENT_LLM_KEY",
			modelKey: "AGENT_LLM_MODEL",
		});
	};

	const renderConfigField = ({
		field,
		groupStatus,
		applyLabel,
	}: {
		field: DesktopApiField;
		groupStatus: StatusGroup | undefined;
		applyLabel?: string;
	}) => {
		const fieldText = getLocalizedField({ field, pageCopy });
		const savedOnDisk = groupStatus?.fields.find(
			(item) => item.key === field.key,
		)?.configured;
		const saved = savedOnDisk && !pendingClearKeys.includes(field.key);
		const secretVisible = Boolean(field.secret && revealedSecrets[field.key]);
		const canToggleSecret = Boolean(
			field.secret && (values[field.key] ?? "").trim(),
		);

		return (
			<div key={field.key} className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor={field.key}>{fieldText.label}</Label>
					<a
						href={field.applyUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-500"
					>
						{applyLabel ?? pageCopy.actions.apply}
						<ExternalLink className="size-3" />
					</a>
				</div>
				{field.options ? (
					<Select
						value={values[field.key] ?? field.defaultValue ?? ""}
						disabled={isLoading || isSaving}
						onValueChange={(value) =>
							updateConfigValues({
								values: {
									[field.key]: value,
								},
							})
						}
					>
						<SelectTrigger
							id={field.key}
							aria-label={fieldText.label}
							className="h-9 w-full"
							variant="outline"
						>
							<SelectValue placeholder={fieldText.placeholder} />
						</SelectTrigger>
						<SelectContent>
							{field.options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<div className="relative">
						<Input
							id={field.key}
							name={field.key}
							type={field.secret && !secretVisible ? "password" : "text"}
							className={field.secret ? "pr-16" : undefined}
							placeholder={
								field.secret && saved
									? pageCopy.secret.savedPlaceholder
									: fieldText.placeholder
							}
							value={values[field.key] ?? ""}
							disabled={isLoading || isSaving}
							onChange={(event) =>
								updateConfigValues({
									values: {
										[field.key]: event.target.value,
									},
									clearWhenEmpty: true,
								})
							}
							autoComplete="off"
						/>
						{field.secret && saved ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="absolute right-8 top-1 size-7"
								aria-label={`${pageCopy.secret.clear} ${field.env}`}
								title={pageCopy.secret.clearTitle}
								disabled={isLoading || isSaving}
								onClick={() => clearConfigValues([field.key])}
							>
								<X className="size-4" />
							</Button>
						) : null}
						{field.secret && (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="absolute right-1 top-1 size-7"
								aria-label={
									secretVisible
										? `${pageCopy.secret.hide} ${field.env}`
										: `${pageCopy.secret.show} ${field.env}`
								}
								title={
									secretVisible
										? pageCopy.secret.hideTitle
										: pageCopy.secret.showTitle
								}
								disabled={isLoading || isSaving || !canToggleSecret}
								onClick={() =>
									handleToggleSecret({
										key: field.key,
									})
								}
							>
								{secretVisible ? (
									<EyeOff className="size-4" />
								) : (
									<Eye className="size-4" />
								)}
							</Button>
						)}
					</div>
				)}
				<p className="text-xs leading-5 text-muted-foreground">
					{fieldText.help}
					<span className="ml-1 font-mono text-[0.7rem]">{field.env}</span>
				</p>
			</div>
		);
	};

	const renderConfigFields = ({
		group,
		fields,
	}: {
		group: DesktopApiGroup | undefined;
		fields?: DesktopApiField[];
	}) => {
		if (!group) return null;
		const groupStatus = getGroupStatus({ status, group });
		const visibleFields = fields ?? group.fields;
		return (
			<div className="grid gap-4 md:grid-cols-2">
				{visibleFields.map((field) =>
					renderConfigField({ field, groupStatus }),
				)}
			</div>
		);
	};

	const findField = ({ group, key }: { group: DesktopApiGroup; key: string }) =>
		group.fields.find((field) => field.key === key);

	const renderProviderSelect = ({
		label,
		options,
		value,
		onChange,
	}: {
		label: string;
		options: SimpleProviderOption[];
		value: string;
		onChange: (value: string) => void;
	}) => {
		const selectedOption =
			options.find((option) => option.id === value) ?? options[0];
		const selectValue = selectedOption?.id ?? value;
		return (
			<div className="flex flex-col gap-2">
				<Label>{label}</Label>
				<Select
					value={selectValue}
					disabled={isLoading || isSaving || options.length <= 1}
					onValueChange={onChange}
				>
					<SelectTrigger
						aria-label={label}
						className="h-10 w-full"
						variant="outline"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{options.map((option) => (
							<SelectItem key={option.id} value={option.id}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{selectedOption?.description && (
					<p className="text-xs leading-5 text-muted-foreground">
						{selectedOption.description}
					</p>
				)}
			</div>
		);
	};

	const getImagePreset = () => {
		const selectedId =
			advancedSelections["image-generation"] ??
			(normalizeBaseUrl(values.IMAGE_GENERATION_BASE_URL) ===
			normalizeBaseUrl("https://api.openai.com/v1")
				? "openai"
				: "openai-compatible");
		return (
			IMAGE_PROVIDER_PRESETS.find((preset) => preset.id === selectedId) ??
			IMAGE_PROVIDER_PRESETS[0]!
		);
	};

	const renderModelProviderFields = ({
		group,
		preset,
		presets = IMAGE_PROVIDER_PRESETS,
		keyField,
		modelField,
		baseUrlField,
		scope,
		onPresetChange,
	}: {
		group: DesktopApiGroup;
		preset: AdvancedModelProviderPreset;
		presets?: AdvancedModelProviderPreset[];
		keyField: DesktopApiField;
		modelField: DesktopApiField;
		baseUrlField: DesktopApiField;
		scope: string;
		onPresetChange: (preset: AdvancedModelProviderPreset) => void;
	}) => {
		const groupStatus = getGroupStatus({ status, group });
		const currentModel = values[modelField.key] ?? "";
		const modelCacheKey = getModelCacheKey({
			scope,
			provider: preset.provider,
			baseUrl: values[baseUrlField.key] || preset.baseUrl,
		});
		const fetchedModels = modelOptionsByKey[modelCacheKey] ?? [];
		const sourceModels =
			fetchedModels.length > 0 ? fetchedModels : preset.models;
		const modelOptions = Array.from(
			new Set([currentModel, ...sourceModels].filter(Boolean)),
		);
		const isFetchingModels = fetchingModelListKey === modelCacheKey;

		return (
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label>{locale === "zh-CN" ? "服务商" : "Provider"}</Label>
					<Select
						value={preset.id}
						disabled={isLoading || isSaving}
						onValueChange={(value) => {
							const nextPreset = presets.find((item) => item.id === value);
							if (nextPreset) onPresetChange(nextPreset);
						}}
					>
						<SelectTrigger
							aria-label={locale === "zh-CN" ? "服务商" : "Provider"}
							className="h-10 w-full"
							variant="outline"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{presets.map((item) => (
								<SelectItem key={item.id} value={item.id}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{preset.description && (
						<p className="text-xs leading-5 text-muted-foreground">
							{preset.description}
						</p>
					)}
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					{renderConfigField({
						field: {
							...keyField,
							applyUrl: preset.keyUrl,
						},
						groupStatus,
						applyLabel:
							locale === "zh-CN"
								? `去 ${preset.label} 获取 Key`
								: `Get key from ${preset.label}`,
					})}

					<div key={modelField.key} className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<Label htmlFor={modelField.key}>
								{getLocalizedField({ field: modelField, pageCopy }).label}
							</Label>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="h-7 gap-1.5 px-2 text-xs"
								disabled={isLoading || isSaving || isFetchingModels}
								onClick={() =>
									handleFetchModels({
										cacheKey: modelCacheKey,
										provider: preset.provider,
										baseUrl: values[baseUrlField.key] || preset.baseUrl,
										apiKey: values[keyField.key],
										apiKeyConfigKey: keyField.key,
										modelKey: modelField.key,
									})
								}
							>
								<RefreshCw
									className={`size-3.5 ${isFetchingModels ? "animate-spin" : ""}`}
								/>
								{locale === "zh-CN" ? "获取模型列表" : "Fetch models"}
							</Button>
						</div>
						<Select
							value={values[modelField.key] ?? ""}
							disabled={isLoading || isSaving}
							onValueChange={(value) =>
								updateConfigValues({
									values: {
										[modelField.key]: value,
									},
								})
							}
						>
							<SelectTrigger
								id={modelField.key}
								aria-label={
									getLocalizedField({ field: modelField, pageCopy }).label
								}
								className="h-9 w-full"
								variant="outline"
							>
								<SelectValue
									placeholder={
										preset.defaultModel ??
										getLocalizedField({ field: modelField, pageCopy })
											.placeholder
									}
								/>
							</SelectTrigger>
							<SelectContent>
								{modelOptions.map((model) => (
									<SelectItem key={model} value={model}>
										{model}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs leading-5 text-muted-foreground">
							{getLocalizedField({ field: modelField, pageCopy }).help}
							<span className="ml-1">
								{fetchedModels.length > 0
									? locale === "zh-CN"
										? "已获取："
										: "Fetched: "
									: locale === "zh-CN"
										? "推荐："
										: "Recommended: "}
								{sourceModels.slice(0, 4).join(", ")}
							</span>
							<span className="ml-1 font-mono text-[0.7rem]">
								{modelField.env}
							</span>
						</p>
					</div>

					{renderConfigField({
						field: {
							...baseUrlField,
							applyUrl: preset.keyUrl,
						},
						groupStatus,
					})}
				</div>
			</div>
		);
	};

	const renderMotionGraphicsConfig = (group: DesktopApiGroup) => {
		const providerField = findField({ group, key: "AGENT_MG_PROVIDER" });
		const keyField = findField({ group, key: "AGENT_MG_KEY" });
		const modelField = findField({ group, key: "AGENT_MG_MODEL" });
		const hostField = findField({ group, key: "AGENT_MG_HOST" });
		if (!providerField || !keyField || !modelField || !hostField) {
			return renderConfigFields({ group });
		}
		const hasDedicatedConfig = Boolean(
			values.AGENT_MG_PROVIDER ||
			values.AGENT_MG_KEY ||
			values.AGENT_MG_MODEL ||
			values.AGENT_MG_HOST,
		);
		const mode =
			advancedSelections["motion-graphics"] ??
			(hasDedicatedConfig ? "custom" : REUSE_AGENT_PRESET_ID);
		const selectedPreset = findProviderPreset({
			provider: values.AGENT_MG_PROVIDER,
			baseUrl: values.AGENT_MG_HOST,
			fallbackId: "openai",
			presets: MODEL_PROVIDER_PRESETS,
		});

		return (
			<div className="flex flex-col gap-4">
				{renderProviderSelect({
					label: locale === "zh-CN" ? "配置方式" : "Mode",
					value: mode,
					options: [
						{
							id: REUSE_AGENT_PRESET_ID,
							label:
								locale === "zh-CN" ? "复用子 Agent 配置" : "Reuse Agent config",
							description:
								locale === "zh-CN"
									? "MG 生成直接使用 Agent 的服务商、密钥和模型。"
									: "Motion graphics generation uses the Agent provider, key, and model.",
						},
						{
							id: "custom",
							label: locale === "zh-CN" ? "单独配置" : "Configure separately",
							description:
								locale === "zh-CN"
									? "为 MG 生成指定单独的服务商和模型。"
									: "Use a dedicated provider and model for motion graphics.",
						},
					],
					onChange: (value) => {
						setAdvancedSelection({
							key: "motion-graphics",
							value,
						});
						if (value === REUSE_AGENT_PRESET_ID) {
							clearConfigValues([
								"AGENT_MG_PROVIDER",
								"AGENT_MG_KEY",
								"AGENT_MG_MODEL",
								"AGENT_MG_HOST",
							]);
						}
					},
				})}
				{mode === REUSE_AGENT_PRESET_ID ? (
					<div className="rounded-md border bg-background p-3 text-sm leading-6 text-muted-foreground">
						{locale === "zh-CN"
							? "当前会复用 Agent 配置；保存后会清除之前单独保存的 MG 服务商、密钥、模型和 Base URL。"
							: "This reuses the Agent config. Saving clears any previously saved dedicated MG provider, key, model, and Base URL."}
					</div>
				) : (
					renderModelProviderFields({
						group,
						preset: selectedPreset,
						presets: MODEL_PROVIDER_PRESETS,
						keyField,
						modelField,
						baseUrlField: hostField,
						scope: "motion-graphics",
						onPresetChange: (preset) =>
							updateConfigValues({
								values: {
									AGENT_MG_PROVIDER: preset.provider,
									AGENT_MG_HOST: preset.baseUrl,
									AGENT_MG_MODEL: preset.defaultModel,
								},
							}),
					})
				)}
			</div>
		);
	};

	const renderImageGenerationConfig = (group: DesktopApiGroup) => {
		const keyField = findField({ group, key: "IMAGE_GENERATION_API_KEY" });
		const modelField = findField({ group, key: "IMAGE_GENERATION_MODEL" });
		const baseUrlField = findField({
			group,
			key: "IMAGE_GENERATION_BASE_URL",
		});
		if (!keyField || !modelField || !baseUrlField) {
			return renderConfigFields({ group });
		}
		const preset = getImagePreset();
		return renderModelProviderFields({
			group,
			preset,
			keyField,
			modelField,
			baseUrlField,
			scope: "image-generation",
			onPresetChange: (nextPreset) => {
				setAdvancedSelection({
					key: "image-generation",
					value: nextPreset.id,
				});
				updateConfigValues({
					values: {
						IMAGE_GENERATION_BASE_URL: nextPreset.baseUrl,
						IMAGE_GENERATION_MODEL: nextPreset.defaultModel,
					},
				});
			},
		});
	};

	const renderVideoGenerationConfig = (group: DesktopApiGroup) => (
		<div className="flex flex-col gap-4">
			{renderProviderSelect({
				label: locale === "zh-CN" ? "视频 Provider" : "Video provider",
				value: "volcengine",
				options: [
					{
						id: "volcengine",
						label: "火山引擎 Ark",
						description:
							locale === "zh-CN"
								? "当前视频生成 Provider 固定为火山引擎，后续可以扩展。"
								: "Video generation currently uses Volcengine Ark and can be extended later.",
					},
				],
				onChange: () => undefined,
			})}
			{renderConfigFields({ group })}
		</div>
	);

	const renderVoiceoverConfig = (group: DesktopApiGroup) => {
		const selectedProvider =
			values.VOICEOVER_PROVIDER === "volcengine" ? "volcengine" : "openai";
		const openAiFields = [
			"TTS_GENERATION_API_KEY",
			"TTS_GENERATION_BASE_URL",
			"TTS_GENERATION_MODEL",
		]
			.map((key) => findField({ group, key }))
			.filter((field): field is DesktopApiField => Boolean(field));
		const volcengineFields = [
			"VOLCENGINE_TTS_API_KEY",
			"VOLCENGINE_TTS_RESOURCE_ID",
		]
			.map((key) => findField({ group, key }))
			.filter((field): field is DesktopApiField => Boolean(field));

		return (
			<div className="flex flex-col gap-4">
				{renderProviderSelect({
					label: locale === "zh-CN" ? "TTS Provider" : "TTS provider",
					value: selectedProvider,
					options: TTS_PROVIDER_OPTIONS,
					onChange: (value) =>
						updateConfigValues({
							values: {
								VOICEOVER_PROVIDER: value,
							},
						}),
				})}
				{renderConfigFields({
					group,
					fields:
						selectedProvider === "volcengine" ? volcengineFields : openAiFields,
				})}
			</div>
		);
	};

	const renderTranscriptionConfig = (group: DesktopApiGroup) => {
		const selectedProvider =
			values.ASR_PROVIDER === "openai-compatible"
				? "openai-compatible"
				: "volcengine";
		const openAiFields = ["ASR_API_KEY", "ASR_BASE_URL", "ASR_MODEL"]
			.map((key) => findField({ group, key }))
			.filter((field): field is DesktopApiField => Boolean(field));
		const volcengineFields = [
			"VOLCENGINE_ASR_API_KEY",
			"VOLCENGINE_ASR_RESOURCE_ID",
		]
			.map((key) => findField({ group, key }))
			.filter((field): field is DesktopApiField => Boolean(field));

		return (
			<div className="flex flex-col gap-4">
				{renderProviderSelect({
					label: locale === "zh-CN" ? "ASR Provider" : "ASR provider",
					value: selectedProvider,
					options: ASR_PROVIDER_OPTIONS,
					onChange: (value) =>
						updateConfigValues({
							values: {
								ASR_PROVIDER: value,
							},
						}),
				})}
				{renderConfigFields({
					group,
					fields:
						selectedProvider === "volcengine" ? volcengineFields : openAiFields,
				})}
			</div>
		);
	};

	const renderWebToolsConfig = (group: DesktopApiGroup) => {
		const selectedProvider =
			advancedSelections["web-tools-provider"] ??
			(values.FIRECRAWL_API_KEY
				? "firecrawl"
				: values.BRAVE_SEARCH_API_KEY
					? "brave"
					: "tavily");
		const selectedFieldKey =
			selectedProvider === "firecrawl"
				? "FIRECRAWL_API_KEY"
				: selectedProvider === "brave"
					? "BRAVE_SEARCH_API_KEY"
					: "TAVILY_API_KEY";
		const providerField = findField({ group, key: selectedFieldKey });
		const jinaField = findField({ group, key: "JINA_API_KEY" });

		return (
			<div className="flex flex-col gap-4">
				{renderProviderSelect({
					label: locale === "zh-CN" ? "网页 Provider" : "Web provider",
					value: selectedProvider,
					options: WEB_TOOL_PROVIDER_OPTIONS,
					onChange: (value) =>
						setAdvancedSelection({
							key: "web-tools-provider",
							value,
						}),
				})}
				{providerField &&
					renderConfigFields({
						group,
						fields: [providerField],
					})}
				{jinaField && (
					<div className="rounded-md border bg-background p-3">
						<div className="mb-2 flex items-center gap-2 text-sm font-medium">
							<KeyRound className="size-4 text-muted-foreground" />
							{locale === "zh-CN" ? "Jina 可选增强" : "Optional Jina boost"}
						</div>
						<p className="mb-3 text-xs leading-5 text-muted-foreground">
							{locale === "zh-CN"
								? "配置 Jina Key 后，网页读取和 Reader 抓取的限额会更稳定；不配置也不影响 Tavily、Firecrawl 或 Brave 的基础使用。"
								: "Adding a Jina key improves reader/fetch quota stability. Leaving it empty is fine and does not block Tavily, Firecrawl, or Brave."}
						</p>
						{renderConfigFields({
							group,
							fields: [jinaField],
						})}
					</div>
				)}
			</div>
		);
	};

	const renderStockMediaConfig = (group: DesktopApiGroup) => {
		const selectedVisualProvider =
			advancedSelections["stock-visual-provider"] ??
			(values.PIXABAY_API_KEY ? "pixabay" : "pexels");
		const visualField = findField({
			group,
			key:
				selectedVisualProvider === "pixabay"
					? "PIXABAY_API_KEY"
					: "PEXELS_API_KEY",
		});
		const audioField = findField({ group, key: "FREESOUND_API_KEY" });

		return (
			<div className="flex flex-col gap-5">
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<ImageIcon className="size-4 text-muted-foreground" />
						{locale === "zh-CN"
							? "图片 / 视频素材 Provider"
							: "Image / video stock provider"}
					</div>
					{renderProviderSelect({
						label:
							locale === "zh-CN"
								? "图片 / 视频素材 Provider"
								: "Image / video stock provider",
						value: selectedVisualProvider,
						options: STOCK_VISUAL_PROVIDER_OPTIONS,
						onChange: (value) =>
							setAdvancedSelection({
								key: "stock-visual-provider",
								value,
							}),
					})}
					{visualField &&
						renderConfigFields({
							group,
							fields: [visualField],
						})}
				</div>
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Mic className="size-4 text-muted-foreground" />
						{locale === "zh-CN" ? "音频素材 Provider" : "Audio stock provider"}
					</div>
					{renderProviderSelect({
						label:
							locale === "zh-CN" ? "音频素材 Provider" : "Audio stock provider",
						value: "freesound",
						options: STOCK_AUDIO_PROVIDER_OPTIONS,
						onChange: () => undefined,
					})}
					{audioField &&
						renderConfigFields({
							group,
							fields: [audioField],
						})}
				</div>
			</div>
		);
	};

	const renderOptionalGroupConfig = ({ group }: { group: DesktopApiGroup }) => {
		if (group.id === "motion-graphics")
			return renderMotionGraphicsConfig(group);
		if (group.id === "image-generation")
			return renderImageGenerationConfig(group);
		if (group.id === "video-generation")
			return renderVideoGenerationConfig(group);
		if (group.id === "voiceover") return renderVoiceoverConfig(group);
		if (group.id === "transcription") return renderTranscriptionConfig(group);
		if (group.id === "web-tools") return renderWebToolsConfig(group);
		if (group.id === "stock-media") return renderStockMediaConfig(group);
		return renderConfigFields({ group });
	};

	const renderAgentApiConfig = ({ group }: { group: DesktopApiGroup }) => {
		const groupStatus = getGroupStatus({ status, group });
		const selectedPreset = findAgentProviderPreset(values);
		const activeTab = getAgentProviderTab(values);
		const openAiPresets = AGENT_PROVIDER_PRESETS.filter(
			(preset) => preset.tab === "openai",
		);
		const quickPresetValue =
			selectedPreset?.tab === "openai"
				? selectedPreset.id
				: CUSTOM_OPENAI_COMPATIBLE_PRESET_ID;
		const providerField = group.fields.find(
			(field) => field.key === "AGENT_LLM_PROVIDER",
		);
		const keyField = group.fields.find(
			(field) => field.key === "AGENT_LLM_KEY",
		);
		const modelField = group.fields.find(
			(field) => field.key === "AGENT_LLM_MODEL",
		);
		const hostField = group.fields.find(
			(field) => field.key === "AGENT_LLM_HOST",
		);
		if (!providerField || !keyField || !modelField || !hostField) {
			return renderConfigFields({ group });
		}

		const selectedLabel =
			selectedPreset?.label ??
			(activeTab === "openai" ? "OpenAI Compatible" : activeTab);
		const recommendedModels = selectedPreset?.models ?? [];
		const currentModel = values.AGENT_LLM_MODEL ?? "";
		const modelCacheKey = getAgentModelCacheKey(values);
		const fetchedModels = modelOptionsByKey[modelCacheKey] ?? [];
		const sourceModels =
			fetchedModels.length > 0 ? fetchedModels : recommendedModels;
		const modelOptions = Array.from(
			new Set([currentModel, ...sourceModels].filter(Boolean)),
		);
		const isFetchingModels = fetchingModelListKey === modelCacheKey;
		const keyApplyLabel =
			locale === "zh-CN"
				? `去 ${selectedLabel} 获取 Key`
				: `Get key from ${selectedLabel}`;

		return (
			<div className="flex flex-col gap-5">
				<input
					id={providerField.key}
					type="hidden"
					value={values.AGENT_LLM_PROVIDER ?? ""}
					readOnly
				/>
				<div className="flex flex-wrap gap-2">
					{AGENT_PROVIDER_TABS.map((tab) => {
						const selected = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								disabled={isLoading || isSaving}
								onClick={() =>
									handleApplyAgentProviderPreset(getDefaultPresetForTab(tab.id))
								}
								className={`h-9 rounded-full border px-4 text-sm font-medium transition ${
									selected
										? "border-cyan-500 bg-cyan-500 text-white shadow-sm"
										: "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
								} disabled:cursor-not-allowed disabled:opacity-60`}
							>
								{tab.label}
							</button>
						);
					})}
				</div>

				{activeTab === "openai" && (
					<div className="flex flex-col gap-2">
						<Label htmlFor="agent-provider-preset">
							{locale === "zh-CN" ? "快速填充提供方" : "Quick provider preset"}
						</Label>
						<Select
							value={quickPresetValue}
							disabled={isLoading || isSaving}
							onValueChange={(value) => {
								const preset = AGENT_PROVIDER_PRESETS.find(
									(item) => item.id === value,
								);
								if (preset) handleApplyAgentProviderPreset(preset);
							}}
						>
							<SelectTrigger
								id="agent-provider-preset"
								aria-label={
									locale === "zh-CN"
										? "快速填充提供方"
										: "Quick provider preset"
								}
								className="h-10 w-full"
								variant="outline"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{quickPresetValue === CUSTOM_OPENAI_COMPATIBLE_PRESET_ID && (
									<SelectItem value={CUSTOM_OPENAI_COMPATIBLE_PRESET_ID}>
										Custom OpenAI compatible
									</SelectItem>
								)}
								{openAiPresets.map((preset) => (
									<SelectItem key={preset.id} value={preset.id}>
										{preset.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				<div className="grid gap-4 md:grid-cols-2">
					{renderConfigField({
						field: {
							...keyField,
							applyUrl: selectedPreset?.keyUrl ?? keyField.applyUrl,
						},
						groupStatus,
						applyLabel: keyApplyLabel,
					})}

					<div key={modelField.key} className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<Label htmlFor={modelField.key}>
								{getLocalizedField({ field: modelField, pageCopy }).label}
							</Label>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="h-7 gap-1.5 px-2 text-xs"
								disabled={isLoading || isSaving || isFetchingModels}
								onClick={handleFetchAgentModels}
							>
								<RefreshCw
									className={`size-3.5 ${isFetchingModels ? "animate-spin" : ""}`}
								/>
								{locale === "zh-CN" ? "获取模型列表" : "Fetch models"}
							</Button>
						</div>
						{modelOptions.length > 0 ? (
							<Select
								value={values[modelField.key] ?? ""}
								disabled={isLoading || isSaving}
								onValueChange={(value) =>
									updateConfigValues({
										values: {
											[modelField.key]: value,
										},
									})
								}
							>
								<SelectTrigger
									id={modelField.key}
									aria-label={
										getLocalizedField({ field: modelField, pageCopy }).label
									}
									className="h-9 w-full"
									variant="outline"
								>
									<SelectValue
										placeholder={
											selectedPreset?.defaultModel ??
											getLocalizedField({ field: modelField, pageCopy })
												.placeholder
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{modelOptions.map((model) => (
										<SelectItem key={model} value={model}>
											{model}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<Input
								id={modelField.key}
								name={modelField.key}
								placeholder={
									selectedPreset?.defaultModel ??
									getLocalizedField({ field: modelField, pageCopy }).placeholder
								}
								value={values[modelField.key] ?? ""}
								disabled={isLoading || isSaving}
								onChange={(event) =>
									updateConfigValues({
										values: {
											[modelField.key]: event.target.value,
										},
									})
								}
								autoComplete="off"
							/>
						)}
						<p className="text-xs leading-5 text-muted-foreground">
							{getLocalizedField({ field: modelField, pageCopy }).help}
							{sourceModels.length > 0 && (
								<span className="ml-1">
									{fetchedModels.length > 0
										? locale === "zh-CN"
											? "已获取："
											: "Fetched: "
										: locale === "zh-CN"
											? "推荐："
											: "Recommended: "}
									{sourceModels.slice(0, 4).join(", ")}
								</span>
							)}
							<span className="ml-1 font-mono text-[0.7rem]">
								{modelField.env}
							</span>
						</p>
					</div>

					{renderConfigField({
						field: {
							...hostField,
							applyUrl: selectedPreset?.keyUrl ?? hostField.applyUrl,
						},
						groupStatus,
					})}

					<div className="flex flex-col justify-center gap-1 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
						<span>{locale === "zh-CN" ? "当前写入配置" : "Saved config"}</span>
						<code className="break-all text-foreground">
							{values.AGENT_LLM_PROVIDER || "openai"} ·{" "}
							{values.AGENT_LLM_HOST ||
								selectedPreset?.baseUrl ||
								"https://api.openai.com/v1"}
						</code>
					</div>
				</div>
			</div>
		);
	};

	const agentLlmText = agentLlmGroup
		? getLocalizedGroup({ group: agentLlmGroup, pageCopy })
		: null;
	const renderRuntimeCards = ({
		compact = false,
	}: { compact?: boolean } = {}) => (
		<div className="grid gap-3 md:grid-cols-2">
			<button
				type="button"
				disabled={isLoading || isSaving}
				onClick={() => handleSelectRuntime(LOCAL_RUNTIME)}
				className={`relative flex ${
					compact ? "min-h-28 p-4" : "min-h-36 p-5"
				} items-start gap-4 rounded-md border text-left transition ${
					runtime === LOCAL_RUNTIME
						? "border-cyan-500 bg-cyan-500/5 shadow-sm"
						: "border-border bg-background hover:bg-accent/40"
				} disabled:cursor-not-allowed disabled:opacity-60`}
			>
				<span className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-background">
					<Terminal className="size-5 text-cyan-600" />
				</span>
				<span className="min-w-0">
					<span className="flex flex-wrap items-center gap-2">
						<span
							className={
								compact ? "text-base font-semibold" : "text-lg font-semibold"
							}
						>
							{pageCopy.runtime.localTitle}
						</span>
						{runtime === LOCAL_RUNTIME && (
							<Badge variant="secondary">
								{pageCopy.runtime.localSelected}
							</Badge>
						)}
					</span>
					<span className="mt-2 block text-sm leading-6 text-muted-foreground">
						{pageCopy.runtime.localBody}
					</span>
				</span>
			</button>

			<button
				type="button"
				disabled={isLoading || isSaving}
				onClick={() => handleSelectRuntime(API_RUNTIME)}
				className={`relative flex ${
					compact ? "min-h-28 p-4" : "min-h-36 p-5"
				} items-start gap-4 rounded-md border text-left transition ${
					runtime === API_RUNTIME
						? "border-cyan-500 bg-cyan-500/5 shadow-sm"
						: "border-border bg-background hover:bg-accent/40"
				} disabled:cursor-not-allowed disabled:opacity-60`}
			>
				<span className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-background">
					<KeyRound className="size-5 text-cyan-600" />
				</span>
				<span className="min-w-0">
					<span className="flex flex-wrap items-center gap-2">
						<span
							className={
								compact ? "text-base font-semibold" : "text-lg font-semibold"
							}
						>
							{pageCopy.runtime.apiTitle}
						</span>
						{runtime === API_RUNTIME && (
							<Badge variant="secondary">{pageCopy.runtime.apiSelected}</Badge>
						)}
					</span>
					<span className="mt-2 block text-sm leading-6 text-muted-foreground">
						{pageCopy.runtime.apiBody}
					</span>
				</span>
			</button>
		</div>
	);

	return (
		<main
			className={
				isEmbedded
					? "h-full min-h-0 bg-background text-foreground"
					: "min-h-screen bg-background text-foreground"
			}
		>
			{!isEmbedded && (
				<header className="electron-drag-region sticky top-0 z-20 border-b bg-background/95 px-5 backdrop-blur">
					<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4">
						<div className="flex min-w-0 items-center gap-3">
							<Button asChild variant="ghost" size="icon">
								<Link
									href="/projects"
									aria-label={pageCopy.actions.backToProjects}
								>
									<ArrowLeft className="size-4" />
								</Link>
							</Button>
							<ShotlyxLogo size={30} alt="" />
							<div className="hidden min-w-0 sm:block">
								<p className="text-xs text-muted-foreground">
									{PRODUCT_NAME} Desktop
								</p>
								<h1 className="truncate text-base font-semibold">
									{pageCopy.headerTitle}
								</h1>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<LanguageSelector
								showLabel={false}
								className="hidden sm:inline-flex"
							/>
							<ThemeToggle
								showLabel={false}
								className="hidden sm:inline-flex"
							/>
							<Badge
								variant={
									isLoading
										? "outline"
										: requiredReady
											? "secondary"
											: "destructive"
								}
							>
								{isLoading
									? pageCopy.status.loading
									: requiredReady
										? pageCopy.status.ready
										: pageCopy.status.needsSetup}
							</Badge>
							<Button onClick={handleSave} disabled={isSaving || isLoading}>
								<Save className="size-4" />
								{isSaving ? pageCopy.actions.saving : pageCopy.actions.save}
							</Button>
						</div>
					</div>
				</header>
			)}

			<div
				className={
					isEmbedded
						? "flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 py-4"
						: "mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8"
				}
			>
				{isEmbedded && embeddedSection === "agent" && (
					<section className="flex flex-col gap-4 rounded-md border bg-background p-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0">
								<h2 className="text-xl font-semibold tracking-normal">
									Agent配置
								</h2>
								<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
									{locale === "zh-CN"
										? "选择当前使用本地 Agent 还是 API。切换运行方式不会丢弃已经保存的 API Key。"
										: "Choose whether the Agent uses a local Agent or an API. Switching runtimes does not discard saved API keys."}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<Badge
									variant={
										isLoading
											? "outline"
											: requiredReady
												? "secondary"
												: "destructive"
									}
								>
									{isLoading
										? pageCopy.status.loading
										: requiredReady
											? pageCopy.status.ready
											: pageCopy.status.needsSetup}
								</Badge>
								<Button onClick={handleSave} disabled={isSaving || isLoading}>
									<Save className="size-4" />
									{isSaving ? pageCopy.actions.saving : pageCopy.actions.save}
								</Button>
							</div>
						</div>
						{renderRuntimeCards({ compact: true })}
					</section>
				)}

				{isEmbedded && embeddedSection === "advanced-api" && (
					<section className="flex flex-col gap-4 rounded-md border bg-background p-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0">
								<h2 className="text-xl font-semibold tracking-normal">
									高级 API 配置
								</h2>
								<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
									{locale === "zh-CN"
										? "配置视频生成、转写、搜索和素材库等可选能力。它们不影响 Agent 主运行方式。"
										: "Configure optional video, transcription, search, and stock media integrations. These do not change the main Agent runtime."}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<Badge variant="outline">
									{formatConfiguredCount({
										locale,
										configured: configuredOptionalCount,
										total: optionalGroups.length,
									})}
								</Badge>
								<Button onClick={handleSave} disabled={isSaving || isLoading}>
									<Save className="size-4" />
									{isSaving ? pageCopy.actions.saving : pageCopy.actions.save}
								</Button>
							</div>
						</div>
					</section>
				)}

				{!isEmbedded && (
					<section className="flex flex-col gap-5">
						<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
							<div className="max-w-3xl">
								<h2 className="text-4xl font-semibold tracking-normal md:text-5xl">
									{pageCopy.hero.title}
								</h2>
								<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
									{pageCopy.hero.body}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<LanguageSelector />
								<ThemeToggle />
							</div>
						</div>

						{renderRuntimeCards()}
					</section>
				)}

				{showAgentConfig && agentRuntimeGroup && (
					<section
						id="agent-runtime"
						className="rounded-md border bg-background p-5"
					>
						<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="text-xl font-semibold tracking-normal">
									{pageCopy.localCli.title}
								</h2>
								<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
									{pageCopy.localCli.body}
								</p>
							</div>
							<Button
								type="button"
								variant="secondary"
								onClick={handleScanAgents}
								disabled={isScanningAgents}
							>
								<RefreshCw className="size-4" />
								{isScanningAgents
									? pageCopy.localCli.scanning
									: pageCopy.localCli.rescan}
							</Button>
						</div>

						<div className="grid gap-2 md:grid-cols-2">
							{localAgents.map((agent) => (
								<button
									key={agent.id}
									type="button"
									disabled={isLoading || isSaving}
									onClick={() =>
										updateConfigValues({
											values: {
												AGENT_RUNTIME: LOCAL_RUNTIME,
												AGENT_CLI_ID: agent.id,
												AGENT_CLI_MODEL: values.AGENT_CLI_MODEL || "default",
											},
										})
									}
									className={`flex min-h-16 items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${
										values.AGENT_CLI_ID === agent.id
											? "border-cyan-500 bg-cyan-500/5"
											: "border-border bg-background hover:bg-accent/50"
									} ${agent.available ? "" : "opacity-70"}`}
								>
									<Terminal className="size-4 shrink-0 text-muted-foreground" />
									<span className="min-w-0">
										<span className="block font-medium">{agent.name}</span>
										<span className="block truncate text-xs text-muted-foreground">
											{agent.available
												? agent.version || agent.binPath || agent.bin
												: `${pageCopy.localCli.notFound}: ${agent.bin}`}
										</span>
									</span>
								</button>
							))}
							{localAgents.length === 0 && (
								<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">
									{pageCopy.localCli.empty}
								</div>
							)}
						</div>

						<Separator className="my-5" />
						{renderConfigFields({
							group: agentRuntimeGroup,
							fields: agentRuntimeGroup.fields.filter(
								(field) => field.key !== "AGENT_RUNTIME",
							),
						})}
					</section>
				)}

				{showApiConfig && agentLlmGroup && (
					<section
						id="agent-llm"
						className="rounded-md border bg-background p-5"
					>
						<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="text-xl font-semibold tracking-normal">
									{pageCopy.apiMode.title}
								</h2>
								<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
									{pageCopy.apiMode.body}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{pageCopy.apiMode.recommended}:{" "}
									{agentLlmText?.recommendedProvider}
								</p>
							</div>
							<Badge
								variant={agentLlmStatus?.configured ? "secondary" : "outline"}
							>
								{agentLlmStatus?.configured
									? pageCopy.status.configured
									: pageCopy.apiMode.required}
							</Badge>
						</div>
						{renderAgentApiConfig({ group: agentLlmGroup })}
					</section>
				)}

				{showOptionalConfig && (
					<section
						id="optional-api-integrations"
						className="rounded-md border bg-background p-5"
					>
						<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="text-xl font-semibold tracking-normal">
									{pageCopy.optional.title}
								</h2>
								<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
									{pageCopy.optional.body}
								</p>
							</div>
							<Badge variant="outline">
								{formatConfiguredCount({
									locale,
									configured: configuredOptionalCount,
									total: optionalGroups.length,
								})}
							</Badge>
						</div>

						<div className="divide-y rounded-md border">
							{[...coreOptionalGroups, ...experimentalOptionalGroups].map(
								(group) => {
									const groupText = getLocalizedGroup({ group, pageCopy });
									const groupStatus = getGroupStatus({ status, group });
									const groupConfigured = isMeaningfullyConfigured({
										group,
										groupStatus,
									});
									const expanded = Boolean(expandedGroups[group.id]);
									const GroupIcon = OPTIONAL_GROUP_ICONS[group.id] ?? Settings;
									return (
										<div key={group.id}>
											<button
												type="button"
												className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-accent/40"
												aria-expanded={expanded}
												aria-controls={`${group.id}-settings`}
												onClick={() =>
													setExpandedGroups((current) => ({
														...current,
														[group.id]: !expanded,
													}))
												}
											>
												<span className="flex min-w-0 items-start gap-3">
													<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
														<GroupIcon className="size-3.5 text-muted-foreground" />
													</span>
													<span className="min-w-0">
														<span className="flex flex-wrap items-center gap-2">
															<span className="font-medium">
																{groupText.title}
															</span>
															<Badge
																variant={
																	group.tier === "core"
																		? "secondary"
																		: "outline"
																}
															>
																{group.tier === "core"
																	? pageCopy.status.core
																	: pageCopy.status.experimental}
															</Badge>
															<Badge
																variant={
																	groupConfigured ? "secondary" : "outline"
																}
															>
																{groupConfigured
																	? pageCopy.status.configured
																	: pageCopy.status.optional}
															</Badge>
														</span>
														<span className="mt-1 block text-sm leading-5 text-muted-foreground">
															{groupText.purpose}
														</span>
													</span>
												</span>
												<ChevronDown
													className={`size-4 shrink-0 text-muted-foreground transition ${
														expanded ? "rotate-180" : ""
													}`}
												/>
											</button>
											{expanded && (
												<div
													id={`${group.id}-settings`}
													className="border-t bg-muted/20 p-4"
												>
													<div className="mb-4 rounded-md border bg-background p-3">
														<div className="mb-1 flex items-center gap-2 text-sm font-medium">
															<Settings className="size-4" />
															{pageCopy.optional.howToTitle}
														</div>
														<p className="text-xs leading-5 text-muted-foreground">
															{formatHowTo({
																locale,
																recommendedProvider:
																	groupText.recommendedProvider,
																requiredFor: groupText.requiredFor,
															})}
														</p>
													</div>
													{renderOptionalGroupConfig({ group })}
												</div>
											)}
										</div>
									);
								},
							)}
						</div>
					</section>
				)}

				{showOtherConfig && (
					<section
						id="other-config"
						className="rounded-md border bg-background p-5"
					>
						<h2 className="text-xl font-semibold tracking-normal">其他配置</h2>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
							这里先预留给后续桌面端偏好设置，比如缓存、快捷键、导出默认值等。
						</p>
					</section>
				)}

				{!isEmbedded && (
					<footer className="flex flex-col gap-3 rounded-md border bg-[#f6fbfc] p-4 text-sm text-muted-foreground dark:bg-[#050607] md:flex-row md:items-center md:justify-between">
						<div className="space-y-1">
							<p>{pageCopy.footer.storage}</p>
							{configPath && (
								<p className="break-all">
									{pageCopy.footer.localConfig}: {configPath}
								</p>
							)}
							{!isDesktop && (
								<p className="text-amber-700 dark:text-amber-200">
									{pageCopy.footer.desktopWarningStart}{" "}
									<code>bun run dev:client</code>{" "}
									{pageCopy.footer.desktopWarningEnd}
								</p>
							)}
						</div>
						<Button asChild variant="secondary">
							<Link href="/projects">{pageCopy.actions.openProjects}</Link>
						</Button>
					</footer>
				)}
			</div>
		</main>
	);
}
