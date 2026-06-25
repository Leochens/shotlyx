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
		description: "适合个人创作者持续做字幕、基础 AI 剪辑和轻量配音。",
		priceCents: 3900,
		period: "month",
		includedCredits: 3_000,
		features: [
			"每月 3000 点",
			"云项目与素材上传",
			"DeepSeek V4 Pro 基础剪辑 Agent",
		],
		highlight: true,
	},
	{
		type: "plan",
		code: "pro_monthly",
		name: "专业月度版",
		description: "适合高频短视频生产，覆盖更长字幕、配音和 MG 工作流。",
		priceCents: 9900,
		period: "month",
		includedCredits: 10_000,
		features: ["每月 10000 点", "更高上传额度", "优先任务队列预留"],
	},
	{
		type: "plan",
		code: "team_monthly",
		name: "团队月度版",
		description: "适合小团队共享生产额度，单独承载视频生成等高成本能力。",
		priceCents: 29900,
		period: "month",
		includedCredits: 33_000,
		features: ["每月 33000 点", "团队共享额度", "高成本任务预扣保护"],
	},
];

export const DEFAULT_CREDIT_PACKAGES: BillingCreditPackage[] = [
	{
		type: "credit_package",
		code: "points_1000",
		name: "1000 点数包",
		description: "适合临时补充字幕、Agent 对话和少量生成任务。",
		priceCents: 1000,
		credits: 1_000,
		bonusCredits: 0,
	},
	{
		type: "credit_package",
		code: "points_3000",
		name: "3000 点数包",
		description: "适合一批短视频项目的字幕、配音和 MG 生成。",
		priceCents: 3000,
		credits: 3_000,
		bonusCredits: 0,
		highlight: true,
	},
	{
		type: "credit_package",
		code: "points_7000",
		name: "7000 点数包",
		description: "适合高频创作者批量转录、配音和图片生成。",
		priceCents: 6900,
		credits: 7_000,
		bonusCredits: 0,
	},
	{
		type: "credit_package",
		code: "points_12000",
		name: "12000 点数包",
		description: "适合密集生产和多素材生成任务。",
		priceCents: 11900,
		credits: 12_000,
		bonusCredits: 0,
	},
	{
		type: "credit_package",
		code: "points_30000",
		name: "30000 点数包",
		description: "适合团队批量生产和视频生成等高成本能力。",
		priceCents: 29900,
		credits: 30_000,
		bonusCredits: 0,
	},
];

export const DEFAULT_USAGE_PRICING_RULES: UsagePricingRule[] = [
	{
		code: "llm_agent_turn",
		name: "AI 剪辑对话",
		unit: "每次工具链回合",
		credits: 20,
		description: "DeepSeek V4 Pro 理解项目、规划动作并调用编辑工具。",
		adminConfigKey: "USAGE_CREDITS_LLM_AGENT_TURN",
	},
	{
		code: "llm_agent_long_turn",
		name: "长上下文 AI 剪辑对话",
		unit: "每次复杂工具链回合",
		credits: 80,
		description: "长素材、复杂 MG 或多轮规划任务的 DeepSeek V4 Pro 调用。",
		adminConfigKey: "USAGE_CREDITS_LLM_AGENT_LONG_TURN",
	},
	{
		code: "asr_transcription_minute",
		name: "标准字幕识别",
		unit: "每分钟音视频",
		credits: 8,
		description: "volc.seedasr.auc 录音文件识别，生成带时间戳字幕。",
		adminConfigKey: "USAGE_CREDITS_ASR_TRANSCRIPTION_MINUTE",
	},
	{
		code: "asr_context_minute",
		name: "高质量字幕识别",
		unit: "每分钟音视频",
		credits: 12,
		description: "带参考稿、热词或上下文纠错的 volc.seedasr.auc 字幕识别。",
		adminConfigKey: "USAGE_CREDITS_ASR_CONTEXT_MINUTE",
	},
	{
		code: "tts_1k_chars",
		name: "普通 AI 配音",
		unit: "每 1000 字",
		credits: 200,
		description: "豆包 Seed-TTS 普通音色配音并导入时间线。",
		adminConfigKey: "USAGE_CREDITS_TTS_1K_CHARS",
	},
	{
		code: "voice_clone_tts_1k_chars",
		name: "克隆音色配音",
		unit: "每 1000 字",
		credits: 300,
		description: "豆包声音复刻音色配音，按字数扣点。",
		adminConfigKey: "USAGE_CREDITS_VOICE_CLONE_TTS_1K_CHARS",
	},
	{
		code: "voice_clone_training",
		name: "声音复刻训练",
		unit: "每次训练",
		credits: 1_000,
		description: "创建或更新一个复刻音色，成功后可用于克隆音色配音。",
		adminConfigKey: "USAGE_CREDITS_VOICE_CLONE_TRAINING",
	},
	{
		code: "image_generation",
		name: "生图",
		unit: "每张图片",
		credits: 150,
		description: "生成封面、插图、B-roll 候选图。",
		adminConfigKey: "USAGE_CREDITS_IMAGE_GENERATION",
	},
	{
		code: "mg_generation",
		name: "MG 动画生成",
		unit: "每个可编辑组件",
		credits: 200,
		description: "用 DeepSeek V4 Pro 生成可编辑 Remotion/Shotlyx MG 组件。",
		adminConfigKey: "USAGE_CREDITS_MG_GENERATION",
	},
	{
		code: "video_understanding_base",
		name: "视频理解基础费",
		unit: "每次分析",
		credits: 50,
		description: "ASR-first 后需要抽帧视觉分析时的基础扣点。",
		adminConfigKey: "USAGE_CREDITS_VIDEO_UNDERSTANDING_BASE",
	},
	{
		code: "video_understanding_minute",
		name: "视频理解时长费",
		unit: "每分钟视频",
		credits: 15,
		description: "关键帧或整段视频理解的时长扣点，ASR 足够时不触发。",
		adminConfigKey: "USAGE_CREDITS_VIDEO_UNDERSTANDING_MINUTE",
	},
	{
		code: "video_generation_5s_720p",
		name: "视频生成 720P",
		unit: "每 5 秒",
		credits: 1_200,
		description: "Seedance/Wan 720P 视频生成，必须预扣。",
		adminConfigKey: "USAGE_CREDITS_VIDEO_GENERATION_5S_720P",
	},
	{
		code: "video_generation_5s_1080p",
		name: "视频生成 1080P",
		unit: "每 5 秒",
		credits: 2_000,
		description: "Seedance/Wan 1080P 视频生成，必须预扣。",
		adminConfigKey: "USAGE_CREDITS_VIDEO_GENERATION_5S_1080P",
	},
	{
		code: "stock_import",
		name: "素材检索导入",
		unit: "每次导入",
		credits: 5,
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
