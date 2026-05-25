import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z.url(),

	// Server
	DATABASE_URL: z
		.string()
		.refine(
			(url) => url.startsWith("postgres://") || url.startsWith("postgresql://"),
			"DATABASE_URL must be a postgres:// or postgresql:// URL",
		),

	BETTER_AUTH_SECRET: z.string(),
	UPSTASH_REDIS_REST_URL: z.url(),
	UPSTASH_REDIS_REST_TOKEN: z.string(),
	MARBLE_WORKSPACE_KEY: z.string(),
	FREESOUND_CLIENT_ID: z.string(),
	FREESOUND_API_KEY: z.string(),

	// Agent LLM
	AGENT_LLM_KEY: z.string().optional(),
	AGENT_LLM_MODEL: z.string().optional(),
	AGENT_LLM_HOST: z.string().url().optional(),
	AGENT_LLM_PROVIDER: z.string().optional(),
	AGENT_LLM_STRUCTURED_OUTPUT_MODE: z.string().optional(),
	AGENT_MG_KEY: z.string().optional(),
	AGENT_MG_MODEL: z.string().optional(),
	AGENT_MG_HOST: z.string().url().optional(),
	AGENT_MG_PROVIDER: z.string().optional(),
	AGENT_MG_STRUCTURED_OUTPUT_MODE: z.string().optional(),
	VOICEOVER_PROVIDER: z.string().optional(),
	EDGE_TTS_VOICE: z.string().optional(),
	EDGE_TTS_LANG: z.string().optional(),
	EDGE_TTS_OUTPUT_FORMAT: z.string().optional(),
	EDGE_TTS_RATE: z.string().optional(),
	EDGE_TTS_PITCH: z.string().optional(),
	EDGE_TTS_VOLUME: z.string().optional(),
	EDGE_TTS_PROXY: z.string().url().optional(),
	EDGE_TTS_TIMEOUT_MS: z.string().optional(),
	TTS_GENERATION_BASE_URL: z.string().url().optional(),
	TTS_GENERATION_API_KEY: z.string().optional(),
	TTS_GENERATION_MODEL: z.string().optional(),
	TTS_GENERATION_VOICE: z.string().optional(),
	VOLCENGINE_TTS_API_KEY: z.string().optional(),
	VOLCENGINE_TTS_APP_ID: z.string().optional(),
	VOLCENGINE_TTS_ACCESS_KEY: z.string().optional(),
	VOLCENGINE_TTS_RESOURCE_ID: z.string().optional(),
	VOLCENGINE_TTS_CLONE_RESOURCE_ID: z.string().optional(),
	VOLCENGINE_TTS_DEFAULT_SPEAKER: z.string().optional(),
	VOLCENGINE_TTS_SAMPLE_RATE: z.string().optional(),
	VOLCENGINE_TTS_URL: z.string().url().optional(),
	VOLCENGINE_TTS_UID: z.string().optional(),
	VOLCENGINE_TTS_CLONED_VOICES: z.string().optional(),
	VOLCENGINE_ACCESS_KEY_ID: z.string().optional(),
	VOLCENGINE_SECRET_ACCESS_KEY: z.string().optional(),
	VOLCENGINE_ARK_API_KEY: z.string().optional(),
	VOLCENGINE_ARK_BASE_URL: z.string().url().optional(),
	SEEDANCE_VIDEO_MODEL: z.string().optional(),
	ASR_PROVIDER: z.string().optional(),
	ASR_BASE_URL: z.string().url().optional(),
	ASR_API_KEY: z.string().optional(),
	ASR_SECRET_KEY: z.string().optional(),
	ASR_MODEL: z.string().optional(),
	VOLCENGINE_ASR_API_KEY: z.string().optional(),
	VOLCENGINE_API_KEY: z.string().optional(),
	VOLCENGINE_ASR_UID: z.string().optional(),
	VOLCENGINE_ASR_RESOURCE_ID: z.string().optional(),
	VOLCENGINE_ASR_FLASH_URL: z.string().url().optional(),
	AGENT_WEB_SEARCH_PROVIDER: z.string().optional(),
	AGENT_WEB_FETCH_PROVIDER: z.string().optional(),
	TAVILY_API_KEY: z.string().optional(),
	FIRECRAWL_API_KEY: z.string().optional(),
	BRAVE_SEARCH_API_KEY: z.string().optional(),
	JINA_API_KEY: z.string().optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
