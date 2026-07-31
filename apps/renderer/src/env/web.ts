import { z } from "zod";
import { applyDesktopConfigToProcessEnv } from "@/desktop/config/server";

applyDesktopConfigToProcessEnv();

const localApiEnvSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	FREESOUND_API_KEY: z.string().default(""),
});

export type WebEnv = z.infer<typeof localApiEnvSchema>;

export const webEnv = localApiEnvSchema.parse(process.env);
