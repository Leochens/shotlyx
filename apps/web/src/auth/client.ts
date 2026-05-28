import { createAuthClient } from "better-auth/react";

function isHttpUrl(value: string | undefined): value is string {
	return value?.startsWith("http://") || value?.startsWith("https://") || false;
}

function getAuthBaseUrl() {
	const configuredUrl = process.env.VITE_SITE_URL;
	if (isHttpUrl(configuredUrl)) {
		return configuredUrl;
	}
	if (typeof window !== "undefined") {
		const windowOrigin = window.location.origin;
		if (isHttpUrl(windowOrigin)) {
			return windowOrigin;
		}
	}
	return "http://localhost:3000";
}

export const { signIn, signUp, useSession } = createAuthClient({
	baseURL: getAuthBaseUrl(),
});
