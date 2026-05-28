import { createAuthClient } from "better-auth/react";

function getAuthBaseUrl() {
	const configuredUrl = process.env.VITE_SITE_URL;
	if (
		configuredUrl?.startsWith("http://") ||
		configuredUrl?.startsWith("https://")
	) {
		return configuredUrl;
	}
	if (typeof window !== "undefined") {
		return window.location.origin;
	}
	return "http://localhost:3000";
}

export const { signIn, signUp, useSession } = createAuthClient({
	baseURL: getAuthBaseUrl(),
});
