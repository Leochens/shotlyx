import { betterAuth, type RateLimit } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "@upstash/redis";
import { db } from "@/db";
import { webEnv } from "@/env/web";

const redis = new Redis({
	url: webEnv.UPSTASH_REDIS_REST_URL,
	token: webEnv.UPSTASH_REDIS_REST_TOKEN,
});

function getAuthHttpUrl(url: string) {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url;
	}
	return "http://localhost:3000";
}

const authBaseURL = getAuthHttpUrl(webEnv.VITE_SITE_URL);

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
	}),
	secret: webEnv.BETTER_AUTH_SECRET,
	user: {
		deleteUser: {
			enabled: true,
		},
	},
	emailAndPassword: {
		enabled: true,
	},
	rateLimit: {
		storage: "secondary-storage",
		customStorage: {
			get: async (key) => {
				const value = await redis.get<RateLimit>(key);
				return value ?? undefined;
			},
			set: async (key, value) => {
				await redis.set(key, value);
			},
		},
	},
	baseURL: authBaseURL,
	appName: "Shotlyx",
	trustedOrigins: [authBaseURL],
});

export type Auth = typeof auth;
