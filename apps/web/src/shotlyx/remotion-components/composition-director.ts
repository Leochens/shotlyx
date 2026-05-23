export interface ShotlyxMGCompositionComponentPlan {
	id: string;
	label: string;
	focus: string;
	visualRole: string;
	screenTiming: string;
	animationDirection: string;
	qualityBar: string;
}

export interface ShotlyxMGCompositionDirectorPlan {
	title: string;
	visualStyle: string;
	narrativeArc: string;
	components: ShotlyxMGCompositionComponentPlan[];
}

export interface CreateShotlyxMGCompositionPlanOptions {
	prompt: string;
	componentCount: number;
	durationSeconds?: number;
	styleGuide?: string;
}

function includesAny({
	text,
	values,
}: {
	text: string;
	values: string[];
}): boolean {
	return values.some((value) => text.includes(value.toLowerCase()));
}

function timingFor({
	index,
	durationSeconds,
}: {
	index: number;
	durationSeconds?: number;
}): string {
	if (!durationSeconds) return `第 ${index + 1} 段，全段可见`;
	const start = index * durationSeconds;
	const end = start + durationSeconds;
	return `${start.toFixed(1)}s-${end.toFixed(1)}s`;
}

function sliceComponents({
	components,
	componentCount,
	durationSeconds,
}: {
	components: ShotlyxMGCompositionComponentPlan[];
	componentCount: number;
	durationSeconds?: number;
}): ShotlyxMGCompositionComponentPlan[] {
	return components.slice(0, componentCount).map((component, index) => ({
		...component,
		screenTiming: timingFor({ index, durationSeconds }),
	}));
}

function createAiAgentPlan({
	componentCount,
	durationSeconds,
	styleGuide,
}: {
	componentCount: number;
	durationSeconds?: number;
	styleGuide?: string;
}): ShotlyxMGCompositionDirectorPlan {
	return {
		title: "AI Agent 运行原理科普 MG",
		visualStyle:
			styleGuide?.trim() ||
			"深色科技科普风，蓝青主色，清晰信息层级，少量发光线条",
		narrativeArc:
			"先定义 Agent，再解释感知-思考-行动循环，随后展示工具调用和记忆上下文，最后收束到反馈闭环。",
		components: sliceComponents({
			componentCount,
			durationSeconds,
			components: [
				{
					id: "agent-concept",
					label: "Agent 概念引入",
					focus:
						"展示 AI Agent 是能感知环境、制定计划并执行动作的智能体。用一个中心 Agent 核心和三条能力标签建立认知。",
					visualRole:
						"第一视觉主体：中心发光 Agent 核心、简短定义、三枚能力标签。",
					screenTiming: "",
					animationDirection:
						"核心从暗处浮现，标签依次滑入，定义文字用短句淡入。",
					qualityBar: "不要堆长段落；画面必须一眼看出 Agent 是中心主体。",
				},
				{
					id: "agent-loop",
					label: "感知-思考-行动循环",
					focus:
						"用循环流程图讲清 Perceive 感知输入、Think 思考规划、Act 执行动作三个步骤，并让箭头形成闭环。",
					visualRole: "核心机制层：三个节点、循环箭头、LLM brain 轻量标注。",
					screenTiming: "",
					animationDirection:
						"节点按顺序点亮，循环箭头沿路径扫光，最后形成完整闭环。",
					qualityBar:
						"必须包含感知、思考、行动三个清晰节点；避免只做抽象装饰。",
				},
				{
					id: "agent-tools",
					label: "工具调用机制",
					focus:
						"展示 Agent 通过 Function Calling 调用搜索、计算、API、文件等外部工具来扩展能力边界。",
					visualRole:
						"外部交互层：Agent 中枢连接多个工具卡片，突出工具调用链路。",
					screenTiming: "",
					animationDirection:
						"工具卡片从四周入场，连接线依次亮起，调用结果回流到 Agent。",
					qualityBar: "工具图标/卡片要少而清楚；不要生成无法辨认的小字堆。",
				},
				{
					id: "agent-memory",
					label: "记忆与上下文管理",
					focus:
						"展示短期上下文、长期记忆和工具结果如何进入下一轮决策，形成反馈闭环。",
					visualRole: "收束层：上下文窗口、长期记忆库、反馈箭头和最终输出。",
					screenTiming: "",
					animationDirection:
						"记忆块分层堆叠，反馈箭头回到循环，最终输出卡片轻微弹出。",
					qualityBar: "结尾要有明确闭环；不要把记忆做成纯背景纹理。",
				},
				{
					id: "agent-summary",
					label: "一句话总结",
					focus: "用一句短结论总结：Agent = LLM 推理 + 工具调用 + 记忆反馈。",
					visualRole: "结论层：一句话大字标题和简洁图标组合。",
					screenTiming: "",
					animationDirection:
						"前面元素弱化为背景，结论文字居中出现并保持可读。",
					qualityBar: "只保留一句结论，避免继续扩展信息。",
				},
			],
		}),
	};
}

function createChartPlan({
	componentCount,
	durationSeconds,
	styleGuide,
}: {
	componentCount: number;
	durationSeconds?: number;
	styleGuide?: string;
}): ShotlyxMGCompositionDirectorPlan {
	return {
		title: "数据可视化 MG",
		visualStyle: styleGuide?.trim() || "干净的数据新闻风，强对比图表，克制动效",
		narrativeArc:
			"先建立背景，再展示数据主体，随后用标注强调关键变化，最后收束结论。",
		components: sliceComponents({
			componentCount,
			durationSeconds,
			components: [
				{
					id: "context-background",
					label: "数据背景层",
					focus: "建立主题背景、坐标氛围和视觉基底，不承载主要数据。",
					visualRole: "背景网格、标题区占位、低对比辅助纹理。",
					screenTiming: "",
					animationDirection: "背景轻微入场，网格和标题区稳定出现。",
					qualityBar: "背景不能抢图表主体。",
				},
				{
					id: "data-main",
					label: "数据主体层",
					focus: "生成主要图表、数据点、趋势线或柱状变化。",
					visualRole: "最大视觉主体：图表和关键数值。",
					screenTiming: "",
					animationDirection: "图形按时间推进，数值跟随增长或移动。",
					qualityBar: "数据必须结构化进入 propsSchema table。",
				},
				{
					id: "insight-callout",
					label: "洞察标注层",
					focus: "突出关键拐点、峰值、变化率或一句洞察。",
					visualRole: "标注线、数字标签、短句结论。",
					screenTiming: "",
					animationDirection: "标注延迟出现，和图表主体对齐。",
					qualityBar: "只强调 1-3 个重点，不做密集注释。",
				},
				{
					id: "summary",
					label: "结论层",
					focus: "收束到结论标题或关键 takeaway。",
					visualRole: "结论大字和少量图形回声。",
					screenTiming: "",
					animationDirection: "图表弱化，结论居中出现。",
					qualityBar: "结论要短，文字不可遮挡图表重点。",
				},
			],
		}),
	};
}

function createDefaultPlan({
	prompt,
	componentCount,
	durationSeconds,
	styleGuide,
}: CreateShotlyxMGCompositionPlanOptions): ShotlyxMGCompositionDirectorPlan {
	return {
		title: "组合式 MG 动画",
		visualStyle: styleGuide?.trim() || "现代科普视觉，清晰层级，克制动效",
		narrativeArc: `围绕“${prompt.slice(0, 48)}”建立概念、展示主体、强调重点并总结。`,
		components: sliceComponents({
			componentCount,
			durationSeconds,
			components: [
				{
					id: "concept",
					label: "概念建立层",
					focus: "用简短标题和核心视觉建立主题，不展开全部细节。",
					visualRole: "首屏主体、标题、基础场景。",
					screenTiming: "",
					animationDirection: "主体淡入，标题短促入场。",
					qualityBar: "一屏只表达一个主概念。",
				},
				{
					id: "main-mechanism",
					label: "主体机制层",
					focus: "展示主要流程、结构、数据或机制，是动画信息核心。",
					visualRole: "最大的图形主体和核心步骤。",
					screenTiming: "",
					animationDirection: "按逻辑顺序展开，避免同时出现所有信息。",
					qualityBar: "必须有明确视觉主体。",
				},
				{
					id: "callouts",
					label: "重点标注层",
					focus: "补充关键标注、数字、短句解释和强调符号。",
					visualRole: "短文字、箭头、标注框、强调线。",
					screenTiming: "",
					animationDirection: "跟随主体节奏分批出现。",
					qualityBar: "标注不超过 3 个重点。",
				},
				{
					id: "final-summary",
					label: "总结收束层",
					focus: "用一句结论或最终状态完成收束。",
					visualRole: "结论文字和最终画面状态。",
					screenTiming: "",
					animationDirection: "前景稳定，结论清晰出现。",
					qualityBar: "总结要短，不能塞长段文字。",
				},
			],
		}),
	};
}

export function createShotlyxMGCompositionPlan({
	prompt,
	componentCount,
	durationSeconds,
	styleGuide,
}: CreateShotlyxMGCompositionPlanOptions): ShotlyxMGCompositionDirectorPlan {
	const normalized = `${prompt} ${styleGuide ?? ""}`.toLowerCase();
	const safeComponentCount = Math.min(Math.max(componentCount, 1), 5);
	if (
		includesAny({
			text: normalized,
			values: ["ai agent", "agent", "智能体", "工具调用"],
		})
	) {
		return createAiAgentPlan({
			componentCount: safeComponentCount,
			durationSeconds,
			styleGuide,
		});
	}
	if (
		includesAny({
			text: normalized,
			values: ["图表", "数据", "chart", "dashboard", "折线", "柱状"],
		})
	) {
		return createChartPlan({
			componentCount: safeComponentCount,
			durationSeconds,
			styleGuide,
		});
	}
	return createDefaultPlan({
		prompt,
		componentCount: safeComponentCount,
		durationSeconds,
		styleGuide,
	});
}
