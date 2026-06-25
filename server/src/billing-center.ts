export type BillingCenterConfigStatus = {
	configured: boolean;
	baseUrl?: string;
	appCode?: string;
	missing: string[];
};

function clean(value: string | undefined): string {
	return value?.trim().replace(/\/+$/, "") ?? "";
}

export function inspectBillingCenterConfig(
	env: NodeJS.ProcessEnv = process.env,
): BillingCenterConfigStatus {
	const baseUrl = clean(env.BILLING_CENTER_BASE_URL);
	const apiKey = clean(env.BILLING_CENTER_API_KEY);
	const appCode = clean(
		env.BILLING_CENTER_APP_CODE || env.BILLING_CENTER_APP_ID,
	);
	const missing = [
		!baseUrl ? "BILLING_CENTER_BASE_URL" : "",
		!apiKey ? "BILLING_CENTER_API_KEY" : "",
		!appCode ? "BILLING_CENTER_APP_CODE" : "",
	].filter(Boolean);
	return {
		configured: missing.length === 0,
		baseUrl: baseUrl || undefined,
		appCode: appCode || undefined,
		missing,
	};
}
