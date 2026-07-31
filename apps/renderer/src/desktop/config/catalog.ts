export type DesktopApiField = {
	key: string;
	label: string;
	env: string;
	secret?: boolean;
	required?: boolean;
	placeholder?: string;
	defaultValue?: string;
	options?: Array<{ label: string; value: string }>;
	help: string;
	applyUrl: string;
	docsUrl?: string;
};

export type DesktopApiGroup = {
	id: string;
	title: string;
	tier: "core" | "experimental";
	purpose: string;
	requiredFor: string;
	recommendedProvider: string;
	fields: DesktopApiField[];
};

export const DESKTOP_API_GROUPS: DesktopApiGroup[] = [
	{
		id: "agent-runtime",
		title: "Agent runtime",
		tier: "core",
		purpose:
			"Choose whether Shotlyx Agent talks to a provider API directly or delegates reasoning to a local coding CLI.",
		requiredFor: "Agent chat, planning, and editor tool orchestration",
		recommendedProvider:
			"API mode for hosted usage; local CLI mode for desktop demos",
		fields: [
			{
				key: "AGENT_RUNTIME",
				label: "Runtime",
				env: "AGENT_RUNTIME",
				defaultValue: "api",
				options: [
					{ label: "Provider API", value: "api" },
					{ label: "Local CLI", value: "local-cli" },
				],
				help: "Use local-cli to run Agent reasoning through Claude Code or Codex CLI installed on this computer.",
				applyUrl: "https://docs.anthropic.com/en/docs/claude-code",
			},
			{
				key: "AGENT_CLI_ID",
				label: "CLI",
				env: "AGENT_CLI_ID",
				defaultValue: "claude",
				options: [
					{ label: "Claude Code", value: "claude" },
					{ label: "Codex CLI", value: "codex" },
				],
				help: "The local CLI used for planning and ReAct tool calls when runtime is local-cli.",
				applyUrl: "https://docs.anthropic.com/en/docs/claude-code",
			},
			{
				key: "AGENT_CLI_MODEL",
				label: "CLI model",
				env: "AGENT_CLI_MODEL",
				defaultValue: "default",
				placeholder: "default, sonnet, gpt-5-codex",
				help: "Leave default to use the CLI's own configured model, or set an alias/model accepted by the selected CLI.",
				applyUrl: "https://docs.anthropic.com/en/docs/claude-code",
			},
			{
				key: "AGENT_CLI_PATH",
				label: "CLI path",
				env: "AGENT_CLI_PATH",
				placeholder: "/opt/homebrew/bin/claude",
				help: "Optional absolute path when the CLI is not discoverable from PATH.",
				applyUrl: "https://docs.anthropic.com/en/docs/claude-code",
			},
		],
	},
	{
		id: "agent-llm",
		title: "Agent LLM",
		tier: "core",
		purpose:
			"Optional AI capability for prompt operations, tool planning, and task generation.",
		requiredFor: "Agent chat and timeline editing by natural language",
		recommendedProvider:
			"OpenAI, Gemini, Anthropic, or any OpenAI-compatible proxy",
		fields: [
			{
				key: "AGENT_LLM_PROVIDER",
				label: "Provider",
				env: "AGENT_LLM_PROVIDER",
				defaultValue: "openai",
				placeholder: "openai",
				help: "Use openai, google, anthropic, or openai-compatible.",
				applyUrl: "https://platform.openai.com/api-keys",
				docsUrl: "https://platform.openai.com/docs",
			},
			{
				key: "AGENT_LLM_KEY",
				label: "API key",
				env: "AGENT_LLM_KEY",
				secret: true,
				required: true,
				placeholder: "sk-...",
				help: "The main key used by the local Agent server.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "AGENT_LLM_MODEL",
				label: "Model",
				env: "AGENT_LLM_MODEL",
				defaultValue: "gpt-4o",
				placeholder: "gpt-4o",
				help: "A tool-calling model. Use gemini-2.5-pro/flash for Gemini.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "AGENT_LLM_HOST",
				label: "Base URL",
				env: "AGENT_LLM_HOST",
				placeholder: "https://api.openai.com/v1",
				help: "Optional for official providers; required for OpenAI-compatible proxies.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
		],
	},
	{
		id: "motion-graphics",
		title: "Motion graphics generation",
		tier: "core",
		purpose: "Optional dedicated model for editable MG components.",
		requiredFor: "Shotlyx MG generation",
		recommendedProvider:
			"Reuse Agent LLM first, then add a faster/cheaper MG model",
		fields: [
			{
				key: "AGENT_MG_PROVIDER",
				label: "Provider",
				env: "AGENT_MG_PROVIDER",
				placeholder: "openai-compatible",
				help: "Leave empty to reuse the Agent LLM provider.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "AGENT_MG_KEY",
				label: "API key",
				env: "AGENT_MG_KEY",
				secret: true,
				placeholder: "Optional separate MG key",
				help: "Leave empty to reuse AGENT_LLM_KEY.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "AGENT_MG_MODEL",
				label: "Model",
				env: "AGENT_MG_MODEL",
				placeholder: "gpt-4o",
				help: "Leave empty to reuse AGENT_LLM_MODEL.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "AGENT_MG_HOST",
				label: "Base URL",
				env: "AGENT_MG_HOST",
				placeholder: "https://api.openai.com/v1",
				help: "Optional endpoint override for MG generation.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
		],
	},
	{
		id: "image-generation",
		title: "Image generation",
		tier: "core",
		purpose:
			"Creates still assets from prompts through an OpenAI-compatible endpoint.",
		requiredFor: "Image generation tool",
		recommendedProvider:
			"OpenAI image generation or a compatible image endpoint",
		fields: [
			{
				key: "IMAGE_GENERATION_BASE_URL",
				label: "Base URL",
				env: "IMAGE_GENERATION_BASE_URL",
				defaultValue: "https://api.openai.com/v1",
				placeholder: "https://api.openai.com/v1",
				help: "Endpoint that exposes /images/generations.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "IMAGE_GENERATION_API_KEY",
				label: "API key",
				env: "IMAGE_GENERATION_API_KEY",
				secret: true,
				placeholder: "sk-...",
				help: "Image generation provider key.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "IMAGE_GENERATION_MODEL",
				label: "Model",
				env: "IMAGE_GENERATION_MODEL",
				defaultValue: "gpt-image-1",
				placeholder: "gpt-image-1",
				help: "Model name accepted by your image provider.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
		],
	},
	{
		id: "visual-understanding",
		title: "Visual understanding",
		tier: "experimental",
		purpose:
			"Analyzes imported images or videos with Kimi K2.6 for visual verification, video understanding, and editing suggestions.",
		requiredFor: "Vision analysis, visual verification, and video edit advice",
		recommendedProvider: "Kimi K2.6 / Moonshot",
		fields: [
			{
				key: "AGENT_VISION_PROVIDER",
				label: "Provider",
				env: "AGENT_VISION_PROVIDER",
				defaultValue: "openai-compatible",
				placeholder: "openai-compatible",
				help: "Vision analysis uses an OpenAI-compatible chat completions format. Kimi K2.6 is recommended.",
				applyUrl: "https://platform.moonshot.cn/console/api-keys",
				docsUrl: "https://platform.kimi.com/docs/guide/use-kimi-vision-model",
			},
			{
				key: "AGENT_VISION_KEY",
				label: "Kimi / Moonshot API key",
				env: "AGENT_VISION_KEY",
				secret: true,
				placeholder: "sk-...",
				help: "Moonshot API key used for image and video visual understanding.",
				applyUrl: "https://platform.moonshot.cn/console/api-keys",
			},
			{
				key: "AGENT_VISION_MODEL",
				label: "Vision model",
				env: "AGENT_VISION_MODEL",
				defaultValue: "kimi-k2.6",
				placeholder: "kimi-k2.6",
				help: "Model used for image/video content understanding.",
				applyUrl: "https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart",
			},
			{
				key: "AGENT_VISION_HOST",
				label: "Vision Base URL",
				env: "AGENT_VISION_HOST",
				defaultValue: "https://api.moonshot.cn/v1",
				placeholder: "https://api.moonshot.cn/v1",
				help: "Moonshot OpenAI-compatible API base URL.",
				applyUrl: "https://platform.moonshot.cn/console/api-keys",
			},
		],
	},
	{
		id: "video-generation",
		title: "Video generation",
		tier: "experimental",
		purpose: "Creates Seedance video tasks through Volcengine Ark.",
		requiredFor: "Seedance video generation",
		recommendedProvider: "Volcengine Ark",
		fields: [
			{
				key: "VOLCENGINE_ARK_API_KEY",
				label: "Ark API key",
				env: "VOLCENGINE_ARK_API_KEY",
				secret: true,
				placeholder: "volcengine ark key",
				help: "Used to create and poll Seedance tasks.",
				applyUrl: "https://console.volcengine.com/ark",
			},
			{
				key: "VOLCENGINE_ARK_BASE_URL",
				label: "Ark Base URL",
				env: "VOLCENGINE_ARK_BASE_URL",
				defaultValue: "https://ark.cn-beijing.volces.com/api/v3",
				placeholder: "https://ark.cn-beijing.volces.com/api/v3",
				help: "Volcengine Ark API base URL.",
				applyUrl: "https://console.volcengine.com/ark",
			},
			{
				key: "SEEDANCE_VIDEO_MODEL",
				label: "Seedance model",
				env: "SEEDANCE_VIDEO_MODEL",
				defaultValue: "doubao-seedance-1-5-pro-251215",
				placeholder: "doubao-seedance-1-5-pro-251215",
				help: "The Seedance model identifier enabled in Ark.",
				applyUrl: "https://console.volcengine.com/ark",
			},
		],
	},
	{
		id: "voiceover",
		title: "Voiceover / TTS",
		tier: "core",
		purpose: "Generates narration audio for timeline voiceover.",
		requiredFor: "Voiceover and TTS tools",
		recommendedProvider:
			"OpenAI-compatible TTS, Edge TTS, or Volcengine Speech",
		fields: [
			{
				key: "VOICEOVER_PROVIDER",
				label: "Provider",
				env: "VOICEOVER_PROVIDER",
				defaultValue: "openai",
				placeholder: "openai",
				help: "Use openai, edge-tts, or volcengine.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "TTS_GENERATION_API_KEY",
				label: "OpenAI-compatible TTS key",
				env: "TTS_GENERATION_API_KEY",
				secret: true,
				placeholder: "sk-...",
				help: "Used when VOICEOVER_PROVIDER=openai.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "TTS_GENERATION_BASE_URL",
				label: "TTS Base URL",
				env: "TTS_GENERATION_BASE_URL",
				defaultValue: "https://api.openai.com/v1",
				placeholder: "https://api.openai.com/v1",
				help: "Endpoint for OpenAI-compatible speech generation.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "TTS_GENERATION_MODEL",
				label: "TTS model",
				env: "TTS_GENERATION_MODEL",
				defaultValue: "gpt-4o-mini-tts",
				placeholder: "gpt-4o-mini-tts",
				help: "Speech model name.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "VOLCENGINE_TTS_API_KEY",
				label: "Volcengine TTS key",
				env: "VOLCENGINE_TTS_API_KEY",
				secret: true,
				placeholder: "optional volcengine speech key",
				help: "Used when VOICEOVER_PROVIDER=volcengine.",
				applyUrl: "https://console.volcengine.com/speech",
			},
			{
				key: "VOLCENGINE_TTS_RESOURCE_ID",
				label: "Volcengine TTS model",
				env: "VOLCENGINE_TTS_RESOURCE_ID",
				defaultValue: "seed-tts-2.0",
				placeholder: "seed-tts-2.0",
				help: "Speech resource/model identifier used by Volcengine TTS.",
				applyUrl: "https://console.volcengine.com/speech",
			},
		],
	},
	{
		id: "transcription",
		title: "Transcription / ASR",
		tier: "core",
		purpose: "Turns audio into editable subtitles.",
		requiredFor: "ASR-assisted subtitles and silence/audio analysis workflows",
		recommendedProvider: "Volcengine ASR or OpenAI-compatible transcription",
		fields: [
			{
				key: "ASR_PROVIDER",
				label: "Provider",
				env: "ASR_PROVIDER",
				defaultValue: "volcengine",
				placeholder: "volcengine",
				help: "Use volcengine or openai-compatible.",
				applyUrl: "https://console.volcengine.com/speech",
			},
			{
				key: "VOLCENGINE_ASR_API_KEY",
				label: "Volcengine ASR key",
				env: "VOLCENGINE_ASR_API_KEY",
				secret: true,
				placeholder: "volcengine speech key",
				help: "Recommended key for Chinese ASR workflows.",
				applyUrl: "https://console.volcengine.com/speech",
			},
			{
				key: "VOLCENGINE_ASR_RESOURCE_ID",
				label: "Volcengine ASR model",
				env: "VOLCENGINE_ASR_RESOURCE_ID",
				defaultValue: "volc.bigasr.auc_turbo",
				placeholder: "volc.bigasr.auc_turbo",
				help: "ASR resource/model identifier used by Volcengine.",
				applyUrl: "https://console.volcengine.com/speech",
			},
			{
				key: "ASR_API_KEY",
				label: "OpenAI-compatible ASR key",
				env: "ASR_API_KEY",
				secret: true,
				placeholder: "sk-...",
				help: "Used when ASR_PROVIDER=openai-compatible.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "ASR_BASE_URL",
				label: "ASR Base URL",
				env: "ASR_BASE_URL",
				defaultValue: "https://api.openai.com/v1",
				placeholder: "https://api.openai.com/v1",
				help: "Endpoint for OpenAI-compatible transcription.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
			{
				key: "ASR_MODEL",
				label: "ASR model",
				env: "ASR_MODEL",
				defaultValue: "whisper-1",
				placeholder: "whisper-1",
				help: "Transcription model name.",
				applyUrl: "https://platform.openai.com/api-keys",
			},
		],
	},
	{
		id: "web-tools",
		title: "Web search / fetch",
		tier: "experimental",
		purpose: "Lets the Agent research web pages and search results.",
		requiredFor: "Agent web_search and web_fetch tools",
		recommendedProvider: "Tavily for search, Jina or Firecrawl for fetch",
		fields: [
			{
				key: "TAVILY_API_KEY",
				label: "Tavily key",
				env: "TAVILY_API_KEY",
				secret: true,
				placeholder: "tvly-...",
				help: "Recommended general search provider.",
				applyUrl: "https://app.tavily.com/",
			},
			{
				key: "FIRECRAWL_API_KEY",
				label: "Firecrawl key",
				env: "FIRECRAWL_API_KEY",
				secret: true,
				placeholder: "fc-...",
				help: "Optional search and dynamic page fetch provider.",
				applyUrl: "https://www.firecrawl.dev/app/api-keys",
			},
			{
				key: "BRAVE_SEARCH_API_KEY",
				label: "Brave Search key",
				env: "BRAVE_SEARCH_API_KEY",
				secret: true,
				placeholder: "brave search key",
				help: "Optional independent web search provider.",
				applyUrl: "https://api.search.brave.com/app/keys",
			},
			{
				key: "JINA_API_KEY",
				label: "Jina key",
				env: "JINA_API_KEY",
				secret: true,
				placeholder: "jina key",
				help: "Optional fetch provider; raises Jina Reader limits.",
				applyUrl: "https://jina.ai/",
			},
		],
	},
	{
		id: "stock-media",
		title: "Stock media",
		tier: "experimental",
		purpose: "Searches and imports third-party images, videos, and sounds.",
		requiredFor: "Stock media search/import tools",
		recommendedProvider: "Pexels, Pixabay, and Freesound",
		fields: [
			{
				key: "PEXELS_API_KEY",
				label: "Pexels key",
				env: "PEXELS_API_KEY",
				secret: true,
				placeholder: "pexels api key",
				help: "Video and photo stock search.",
				applyUrl: "https://www.pexels.com/api/",
			},
			{
				key: "PIXABAY_API_KEY",
				label: "Pixabay key",
				env: "PIXABAY_API_KEY",
				secret: true,
				placeholder: "pixabay api key",
				help: "Image and video stock search.",
				applyUrl: "https://pixabay.com/api/docs/",
			},
			{
				key: "FREESOUND_API_KEY",
				label: "Freesound key",
				env: "FREESOUND_API_KEY",
				secret: true,
				placeholder: "freesound api key",
				help: "Sound effect search and import.",
				applyUrl: "https://freesound.org/apiv2/apply/",
			},
			{
				key: "FREESOUND_CLIENT_ID",
				label: "Freesound client id",
				env: "FREESOUND_CLIENT_ID",
				placeholder: "freesound client id",
				help: "Optional Freesound app client id.",
				applyUrl: "https://freesound.org/apiv2/apply/",
			},
		],
	},
];

export const DESKTOP_API_FIELDS = DESKTOP_API_GROUPS.flatMap(
	(group) => group.fields,
);

export const DESKTOP_API_FIELD_KEYS = DESKTOP_API_FIELDS.map(
	(field) => field.key,
);

export function isDesktopApiFieldKey(key: string): boolean {
	return DESKTOP_API_FIELDS.some((field) => field.key === key);
}

export function isSecretDesktopApiField(key: string): boolean {
	return DESKTOP_API_FIELDS.some((field) => field.key === key && field.secret);
}
