import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { webEnv } from "@/env/web";
import { isDesktopMode } from "@/desktop/config/server";

const redis = isDesktopMode()
	? null
	: new Redis({
			url: webEnv.UPSTASH_REDIS_REST_URL,
			token: webEnv.UPSTASH_REDIS_REST_TOKEN,
		});

export const baseRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests per minute
			analytics: true,
			prefix: "rate-limit",
		})
	: null;

export async function checkRateLimit({ request }: { request: Request }) {
	if (!baseRateLimit) {
		return { success: true, limited: false };
	}
	const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
	const { success } = await baseRateLimit.limit(ip);
	return { success, limited: !success };
}
