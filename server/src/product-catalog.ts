export type BillingProductType = "plan" | "credit_package";

export type BillingPlan = {
	type: "plan";
	code: string;
	name: string;
	description: string;
	priceCents: number;
	period: "month";
	includedCredits: number;
	features: string[];
	highlight?: boolean;
};

export type BillingCreditPackage = {
	type: "credit_package";
	code: string;
	name: string;
	description: string;
	priceCents: number;
	credits: number;
	bonusCredits: number;
	highlight?: boolean;
};

export type BillingProduct = BillingPlan | BillingCreditPackage;

export type UsagePricingRule = {
	code: string;
	name: string;
	unit: string;
	credits: number;
	description: string;
	adminConfigKey: string;
};

export const DEFAULT_BILLING_PLANS: BillingPlan[] = [
	{
		type: "plan",
		code: "creator_monthly",
		name: "创作者月度版",
		description: "适合个人创作者持续做口播、字幕、配音和基础 AI 剪辑。",
		priceCents: 3900,
		period: "month",
		includedCredits: 500_000,
		features: [
			"每月 50 万积分",
			"云项目与素材上传",
			"基础 AI 字幕和文案工作流",
		],
		highlight: true,
	},
	{
		type: "plan",
		code: "studio_monthly",
		name: "工作室月度版",
		description: "适合团队和高频视频生产，预留更高用量与协作权益。",
		priceCents: 9900,
		period: "month",
		includedCredits: 1_800_000,
		features: ["每月 180 万积分", "更高上传额度", "优先任务队列预留"],
	},
];

export const DEFAULT_CREDIT_PACKAGES: BillingCreditPackage[] = [
	{
		type: "credit_package",
		code: "credits_100k",
		name: "10 万积分包",
		description: "适合临时补充字幕、配音、图片生成等消耗。",
		priceCents: 1000,
		credits: 100_000,
		bonusCredits: 0,
	},
	{
		type: "credit_package",
		code: "credits_500k",
		name: "50 万积分包",
		description: "适合一批短视频项目或较长素材分析。",
		priceCents: 4500,
		credits: 500_000,
		bonusCredits: 50_000,
		highlight: true,
	},
	{
		type: "credit_package",
		code: "credits_1m",
		name: "100 万积分包",
		description: "适合密集生产、批量转录和多素材生成。",
		priceCents: 8500,
		credits: 1_000_000,
		bonusCredits: 150_000,
	},
];

export const DEFAULT_USAGE_PRICING_RULES: UsagePricingRule[] = [
	{
		code: "asr_transcription_minute",
		name: "语音转字幕",
		unit: "每分钟音视频",
		credits: 1_200,
		description: "上传音视频后生成带时间戳字幕。",
		adminConfigKey: "USAGE_CREDITS_ASR_TRANSCRIPTION_MINUTE",
	},
	{
		code: "llm_agent_turn",
		name: "AI 剪辑对话",
		unit: "每次工具链回合",
		credits: 800,
		description: "Agent 理解项目、规划动作并调用编辑工具。",
		adminConfigKey: "USAGE_CREDITS_LLM_AGENT_TURN",
	},
	{
		code: "voiceover_1k_chars",
		name: "AI 配音",
		unit: "每 1000 字",
		credits: 2_000,
		description: "生成旁白音频并可导入时间线。",
		adminConfigKey: "USAGE_CREDITS_VOICEOVER_1K_CHARS",
	},
	{
		code: "image_generation",
		name: "生图",
		unit: "每张图片",
		credits: 5_000,
		description: "生成封面、插图、B-roll 候选图。",
		adminConfigKey: "USAGE_CREDITS_IMAGE_GENERATION",
	},
	{
		code: "mg_generation",
		name: "MG 动画生成",
		unit: "每个可编辑组件",
		credits: 8_000,
		description: "生成可编辑 Remotion/Shotlyx MG 组件。",
		adminConfigKey: "USAGE_CREDITS_MG_GENERATION",
	},
	{
		code: "stock_import",
		name: "素材检索导入",
		unit: "每次导入",
		credits: 500,
		description: "搜索并下载外部授权素材进入项目。",
		adminConfigKey: "USAGE_CREDITS_STOCK_IMPORT",
	},
];

function parsePositiveIntegerEnv(key: string, fallback: number): number {
	const value = Number(process.env[key]);
	return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function getBillingCatalog() {
	return {
		plans: DEFAULT_BILLING_PLANS,
		creditPackages: DEFAULT_CREDIT_PACKAGES,
	};
}

export function getBillingProduct({
	type,
	code,
}: {
	type: BillingProductType;
	code: string;
}): BillingProduct | null {
	if (type === "plan") {
		return DEFAULT_BILLING_PLANS.find((plan) => plan.code === code) ?? null;
	}
	return (
		DEFAULT_CREDIT_PACKAGES.find((product) => product.code === code) ?? null
	);
}

export function getProductGrantedCredits(product: BillingProduct): number {
	if (product.type === "plan") return product.includedCredits;
	return product.credits + product.bonusCredits;
}

export function getUsagePricingRules(): UsagePricingRule[] {
	return DEFAULT_USAGE_PRICING_RULES.map((rule) => ({
		...rule,
		credits: parsePositiveIntegerEnv(rule.adminConfigKey, rule.credits),
	}));
}
