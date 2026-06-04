export type AppLocale = "en" | "zh-CN";

export const DEFAULT_APP_LOCALE: AppLocale = "en";

export const APP_LOCALES: Array<{
	value: AppLocale;
	label: string;
	nativeLabel: string;
	shortLabel: string;
	htmlLang: string;
}> = [
	{
		value: "en",
		label: "English",
		nativeLabel: "English",
		shortLabel: "EN",
		htmlLang: "en",
	},
	{
		value: "zh-CN",
		label: "Simplified Chinese",
		nativeLabel: "简体中文",
		shortLabel: "中",
		htmlLang: "zh-CN",
	},
];

export function isAppLocale(value: unknown): value is AppLocale {
	return APP_LOCALES.some((locale) => locale.value === value);
}

export function getLocaleMeta(locale: AppLocale) {
	return (
		APP_LOCALES.find((option) => option.value === locale) ?? APP_LOCALES[0]
	);
}

export const SITE_COPY = {
	en: {
		preferences: {
			language: "Language",
			theme: "Theme",
			light: "Light",
			dark: "Dark",
			switchToLight: "Switch to light mode",
			switchToDark: "Switch to dark mode",
		},
		header: {
			links: [
				{ label: "Engine", href: "/#engine" },
				{ label: "Pipeline", href: "/#pipeline" },
				{ label: "Labs", href: "/#labs" },
				{ label: "Updates", href: "/changelog" },
			],
			login: "Login",
			launch: "Launch",
			workspace: "workspace",
		},
		hero: {
			kicker: "AI-native video command center",
			title: "Cut video at the speed of thought.",
			body: "turns natural language into precise, reversible editor actions. It feels less like a template generator and more like a programmable post-production rig.",
			launch: "Launch workspace",
			login: "Login to console",
			signals: [
				"scene graph",
				"agent plan",
				"timeline ops",
				"render queue",
				"asset memory",
			],
			footerLeft: "scroll / inspect pipeline",
			footerRight: "prompt-to-timeline runtime",
			engineKicker: "Engine",
			engineTitle: "Designed for agents that can actually touch the edit.",
			pipeline: [
				{
					kicker: "01 / Intent",
					title: "The model reads the cut like a system state.",
					body: "Prompts are translated into timeline-aware operations, not flattened into a magic export button.",
				},
				{
					kicker: "02 / Edit",
					title: "Every AI move lands as editable structure.",
					body: "Clips, captions, motion graphics, voiceover, and media choices stay inspectable after generation.",
				},
				{
					kicker: "03 / Iterate",
					title: "Branch ideas without losing the working cut.",
					body: "Ask for variants, compare directions, and keep control over the final editorial decision.",
				},
			],
			traceTitle: "live agent trace",
			trace: `> analyze timeline
state.clips: 18
state.captions: stale
state.energy: low at 00:14

> plan revision
insert b-roll
retime intro
generate lower third
normalize voiceover

> execute
timeline.patch committed`,
			labsKicker: "Labs",
			labsTitle: "More terminal than toy. More editor than chatbot.",
			labsBody:
				"The interface keeps AI work visible: what was interpreted, what changed, and which media assets entered the timeline. That is the difference between generative output and an editable production system.",
			previewPromptLabel: "prompt",
			previewPrompt:
				"Make the intro sharper, add kinetic captions, and create a cold open from the strongest quote.",
			previewRows: [
				["thinking", "312 ms"],
				["tools called", "07"],
				["edits staged", "12"],
			],
			previewStatus: ["media mapped", "edits reversible", "timeline synced"],
			workspaceLabel: "workspace / 04",
			agentOnline: "agent online",
		},
		login: {
			kicker: "identity handshake",
			title: "Authenticate into the cut graph.",
			body: "Your account opens the workspace where prompts, tools, assets, and timeline changes stay connected.",
			telemetry: [
				["latency", "32 ms"],
				["runtime", "agentic"],
				["state", "encrypted"],
			],
			security: ["session hardened", "tool graph ready", "render state local"],
		},
		auth: {
			secureConsole: "secure console",
			signIn: "Login",
			signUp: "Create",
			resume: "Resume workspace",
			initialize: "Initialize workspace",
			body: "keeps your creative state close to the editor.",
			name: "Name",
			email: "Email",
			password: "Password",
			createWorkspace: "Create workspace",
			enterConsole: "Enter console",
			authFailed: "Authentication failed",
			namePlaceholder: "Ada",
			emailPlaceholder: "operator@studio.ai",
			passwordPlaceholder: "8+ characters",
		},
		editor: {
			exitProject: "Exit project",
			shortcuts: "Shortcuts",
			failedRename: "Failed to rename project",
			tryAgain: "Please try again",
			export: "Export",
			exporting: "Exporting project",
			failedDelete: "Failed to delete project",
			commandPalette: {
				open: "Open command palette",
				title: "Command palette",
				description: "Search and run editor commands.",
				placeholder: "Search commands or Agent actions",
				empty: "No command found",
				openAgent: "Open Agent Command Center",
				agentCategory: "agent",
			},
			projectSwitcher: {
				open: "Open project switcher",
				title: "Projects",
				description: "Choose a project to open it in the editor.",
				loading: "Loading projects...",
				empty: "No projects yet",
				newProject: "New project",
				creatingProject: "Creating...",
				allProjects: "All projects",
				current: "Current",
				updated: "Updated",
				opening: "Opening...",
				openProject: "Open",
				switchProject: "Switch",
				failedOpen: "Failed to open project",
				failedCreate: "Failed to create project",
				logoAlt: "Shotlyx project switcher",
			},
			exportDialog: {
				unknownError: "Unknown error occurred",
				format: "Format",
				mp4: "MP4 (H.264) - Better compatibility",
				webm: "WebM (VP9) - Smaller file size",
				quality: "Quality",
				low: "Low - Smallest file size",
				medium: "Medium - Balanced",
				high: "High - Recommended",
				veryHigh: "Very high - Largest file size",
				audio: "Audio",
				includeAudio: "Include audio in export",
				stages: {
					preparing: "Preparing export",
					prerenderingMG: "Rendering MG segments",
					mixingAudio: "Mixing audio",
					encoding: "Encoding video",
				},
				subProgress: {
					estimatedRemaining: "Estimated remaining",
					frame: "Frame",
					mgSegment: "MG segment",
					timeUnits: {
						hour: "h",
						minute: "m",
						second: "s",
					},
				},
				cancel: "Cancel",
				failed: "Export failed",
				copy: "Copy",
				retry: "Retry",
			},
			agentPanel: {
				kicker: "AI Command",
				title: "Shotlyx",
				context: "Context",
				tools: "Tools",
				timeline: "Timeline",
				push: "Push",
				drawer: "Drawer",
				pushTitle: "Push layout",
				drawerTitle: "Drawer layout",
				runningModeTitle: "Agent is running; panel mode is locked",
				collapse: "Collapse Agent panel",
				collapseRunning: "Agent is running; panel cannot be collapsed",
				expand: "Open Agent panel",
			},
			onboarding: {
				description: "Shotlyx AI-native editing workspace onboarding.",
				fallbackTitle: "Shotlyx Onboarding",
				signals: ["Agent", "Tools", "Preview"],
				steps: [
					{
						signal: "AI Native Workspace",
						title: "Put ideas on the timeline",
						body: "Agent organizes plans, calls tools, and keeps the execution visible in the left command area.",
						button: "Continue",
					},
					{
						signal: "Beta Lab",
						title: "Beta control room",
						body: [
							"AI editing, media fill, captions, and voiceover are the first workflows being validated here.",
							"When an operation is uncertain, Agent will ask you to choose before changing the project.",
						],
						button: "Continue",
					},
					{
						signal: "Feedback Loop",
						title: "Start the first cut",
						body: [
							"Record real editing scenarios and rough edges, then hand them to Agent for iteration.",
						],
						button: "Enter editor",
					},
				],
			},
			chat: {
				sessionFallback: "Conversation",
				noMessage: "No messages",
				noContent: "No content",
				openSessions: "Open conversations",
				closeSessions: "Close conversations",
				sessions: "Conversations",
				moreActions: "More actions",
				copyChat: "Copy chat",
				clearChat: "Clear chat",
				confirmClear: "Clear?",
				confirm: "Confirm",
				cancel: "Cancel",
				running: "Running",
				selectedCount: "selected",
				copySelected: "Copy selected",
				confirmRename: "Confirm rename",
				cancelRename: "Cancel rename",
				renameSession: "Rename conversation",
				deleteSession: "Delete conversation",
				newSession: "New conversation",
				emptyKicker: "Starter workflows",
				emptyTitle: "What do you want to create today?",
				emptyBody:
					"Pick a workflow. The Agent will ask for missing material, goals, and format details before it edits.",
				emptyNoMediaTitle: "No source media yet",
				emptyNoMediaBody:
					"For talking-head or gameplay cuts, the Agent will first guide you to upload video or audio before planning edits.",
				starters: [
					{
						label: "Talking-head cut",
						hint: "upload / hook / captions",
						prompt:
							"I want to cut a talking-head short video. First inspect whether this project already has video or audio media. If there is no usable source media, do not run editing tools yet: guide me to upload the footage and ask for the platform, target duration, opening hook style, parts to keep/remove, caption style, and whether to remove filler words or repeated phrases. After I answer and the media exists, propose the edit plan and then execute it.",
					},
					{
						label: "MG animation",
						hint: "topic / data / style",
						prompt:
							"I want to create a motion-graphics animation. First ask me for the topic, use case, target duration, aspect ratio, key copy/data points, brand style, and whether it should be a performance comparison, workflow explainer, or report-style visual. After the answers are clear, generate a concise storyboard and execute the MG/timeline creation.",
					},
					{
						label: "Work report",
						hint: "outline / metrics / charts",
						prompt:
							"I want to create a work-report video. Ask me for the audience, report period, 3-5 key achievements, metric comparisons, risks/blockers, desired tone, and target duration. If I have source slides, screen recordings, or voiceover, guide me to upload or reference them. Then turn the answers into a structured short video plan and execute the needed text, captions, MG, and timeline steps.",
					},
					{
						label: "Game short",
						hint: "clip / highlight / pace",
						prompt:
							"I want to make a game short video. First check whether I have uploaded gameplay footage. If not, guide me to upload it. Ask for the game, target platform, highlight moment, desired pace, meme/commentary style, caption language, and target duration. Then propose a cut structure and execute after the source material is available.",
					},
					{
						label: "App promo",
						hint: "link / features / CTA",
						prompt:
							"I want to create an app promotional video. Ask me for the app name or link, target user, core pain point, top 3 features, visual assets available, platform, aspect ratio, CTA, and desired duration. If I only provide a link, fetch/read it first, summarize the selling points, then propose and execute the video structure.",
					},
					{
						label: "Explainer video",
						hint: "concept / script / visuals",
						prompt:
							"I want to create an explainer video. Ask me for the topic, target audience, what viewers should understand after watching, preferred format, examples/references, and target duration. If no source media exists, suggest whether to use text/MG, generated visuals, B-roll, or voiceover. Then build the script and execute the timeline plan.",
					},
				],
			},
			toolbar: {
				placeholder:
					"Describe the cut goal; type @ to reference media, clips, or tracks",
				executionMode: "Execution mode",
				addReference: "Add reference",
				addReferenceTitle: "Add media or timeline reference",
				media: "Media",
				timeline: "Timeline",
				tracks: "Tracks",
				clip: "clip",
				clips: "clips",
				pointSelect: "Point select",
				openPointSelect: "Enable point select",
				closePointSelect: "Disable point select",
				stop: "Stop",
				stopTitle: "Stop the current Agent run",
				send: "Send",
				modes: {
					auto: "Auto",
					suggest: "Suggest",
					manual: "Manual",
				},
			},
			brandKit: {
				label: "Brand kit",
				noBrand: "No brand",
				create: "Create brand kit",
				edit: "Edit",
				colorUnit: "colors",
				dialog: {
					untitled: "Untitled kit",
					name: "Name",
					colors: "Colors",
					addColor: "Add color",
					deleteColor: "Delete color",
					fonts: "Fonts",
					addFont: "Add font",
					deleteFont: "Delete font",
					logo: "LOGO",
					images: "Images",
					styleGuide: "Style guide",
					styleGuidePlaceholder:
						"One-line brand tone, for example: modern, technical, restrained. Do not repeat colors or fonts here.",
					upload: "Upload",
					save: "Save",
					deleteAsset: "Delete {title}",
				},
			},
			assets: {
				title: "Assets",
				import: "Import",
				noActiveProject: "No active project",
				dragDrop:
					"Drag and drop videos, photos, audio, subtitles, and text files here",
				processing: "Processing your files ({progress}%)",
				groups: {
					video: "Video",
					image: "Images",
					audio: "Audio",
					subtitle: "Subtitle files",
					text: "Text files",
				},
				mgAnimations: "MG animations",
				unknown: "Unknown",
				context: {
					exportClips: "Export clips",
					delete: "Delete",
					deleteItems: "Delete {count} items",
					previewMg: "Preview MG asset",
					editMg: "Edit MG asset",
				},
				actions: {
					switchToList: "Switch to list view",
					switchToGrid: "Switch to grid view",
					sortBy: "Sort by {key} ({order})",
					ascending: "ascending",
					descending: "descending",
					sortLabels: {
						name: "Name",
						type: "Type",
						duration: "Duration",
						size: "File size",
					},
				},
				preview: {
					loading: "Loading...",
					readFailed: "Could not read file content",
				},
				tabs: {
					media: "Media",
					sounds: "Sounds",
					text: "Text",
					effects: "Effects",
					captions: "Captions",
					settings: "Settings",
				},
			},
			properties: {
				emptyTitle: "No properties selected",
				emptyBody:
					"Select a clip or asset to inspect and edit its parameters here.",
				selectedClips: "clips selected",
				addedSelectedClips: "Added selected clips to Agent references",
				elementsSelected: "elements selected.",
			},
			silence: {
				title: "Remove silence",
				description:
					"Detect quiet sections in selected clips, review the plan, then apply it as one undoable timeline edit.",
				threshold: "Threshold",
				minSilence: "Min silence",
				padding: "Keep padding",
				mergeGap: "Merge gap",
				selectedClips: "{count} clips ready",
				pending: "Run analysis to preview removable silence.",
				result: "{count} segments, {seconds}s removable",
				segmentCount: "{count} segments",
				analyze: "Analyze",
				analyzing: "Analyzing...",
				apply: "Apply cut",
				cancel: "Cancel",
				noSelection: "Select one or more audio/video clips first",
				noSegments: "No removable silence found",
				analysisFailed: "Silence analysis failed",
				nothingApplied: "No silence edits were applied",
				applied: "Removed {count} silence segments ({seconds}s)",
			},
		},
		footer: {
			description:
				"Prompt, inspect, revise, and ship video from a programmable timeline.",
			categories: [
				{
					label: "Resources",
					links: [
						{ label: "Engine", href: "/#engine" },
						{ label: "Pipeline", href: "/#pipeline" },
						{ label: "Changelog", href: "/changelog" },
						{ label: "Blog", href: "/blog" },
						{ label: "Source", href: "/source" },
						{ label: "License", href: "/license" },
						{ label: "Third-party Notices", href: "/third-party-notices" },
						{ label: "Privacy", href: "/privacy" },
						{ label: "Terms of use", href: "/terms" },
					],
				},
				{
					label: "Company",
					links: [
						{ label: "Foundation", href: "/brand" },
						{ label: "Contributors", href: "/contributors" },
					],
				},
			],
		},
	},
	"zh-CN": {
		preferences: {
			language: "语言",
			theme: "主题",
			light: "浅色",
			dark: "深色",
			switchToLight: "切换到浅色模式",
			switchToDark: "切换到深色模式",
		},
		header: {
			links: [
				{ label: "引擎", href: "/#engine" },
				{ label: "流程", href: "/#pipeline" },
				{ label: "实验室", href: "/#labs" },
				{ label: "更新", href: "/changelog" },
			],
			login: "登录",
			launch: "启动",
			workspace: "工作台",
		},
		hero: {
			kicker: "AI 原生视频指挥中心",
			title: "用想法的速度剪视频。",
			body: "把自然语言转成精准、可回退的编辑器操作。它不像模板生成器，更像一个可编程的后期制作系统。",
			launch: "进入工作台",
			login: "登录控制台",
			signals: ["场景图", "Agent 计划", "时间线操作", "渲染队列", "素材记忆"],
			footerLeft: "下滑 / 查看流程",
			footerRight: "Prompt 到时间线运行时",
			engineKicker: "引擎",
			engineTitle: "为真正能操作剪辑的 Agent 设计。",
			pipeline: [
				{
					kicker: "01 / 意图",
					title: "模型把成片理解为系统状态。",
					body: "Prompt 会被翻译成感知时间线的操作，而不是粗暴压成一个神奇导出按钮。",
				},
				{
					kicker: "02 / 编辑",
					title: "每一步 AI 动作都落在可编辑结构里。",
					body: "剪辑、字幕、MG、旁白和素材选择在生成后仍然可以检查、修改和回退。",
				},
				{
					kicker: "03 / 迭代",
					title: "在不破坏当前版本的情况下探索分支。",
					body: "让 AI 给出变体、对比方向，同时保留最终剪辑判断权。",
				},
			],
			traceTitle: "实时 Agent 轨迹",
			trace: `> 分析时间线
state.clips: 18
state.captions: 需要更新
state.energy: 00:14 偏弱

> 规划修改
插入 B-roll
重剪开头节奏
生成信息条
均衡旁白

> 执行
timeline.patch 已提交`,
			labsKicker: "实验室",
			labsTitle: "更像终端，不像玩具。更像编辑器，不像聊天框。",
			labsBody:
				"界面会保留 AI 工作的可见结构：它理解了什么、修改了什么、哪些素材进入了时间线。这才是生成结果和可编辑生产系统的区别。",
			previewPromptLabel: "指令",
			previewPrompt: "让开头更锋利，加入动效字幕，并用最强金句做冷开场。",
			previewRows: [
				["思考中", "312 ms"],
				["工具调用", "07"],
				["编辑暂存", "12"],
			],
			previewStatus: ["素材已映射", "编辑可回退", "时间线已同步"],
			workspaceLabel: "工作台 / 04",
			agentOnline: "Agent 在线",
		},
		login: {
			kicker: "身份握手",
			title: "进入剪辑图谱。",
			body: "登录后，Prompt、工具、素材和时间线变更会在同一个工作台里保持连接。",
			telemetry: [
				["延迟", "32 ms"],
				["运行时", "agentic"],
				["状态", "已加密"],
			],
			security: ["会话已加固", "工具图谱就绪", "渲染状态本地化"],
		},
		auth: {
			secureConsole: "安全控制台",
			signIn: "登录",
			signUp: "创建",
			resume: "继续工作台",
			initialize: "初始化工作台",
			body: "会把你的创作状态保留在编辑器旁边。",
			name: "名称",
			email: "邮箱",
			password: "密码",
			createWorkspace: "创建工作台",
			enterConsole: "进入控制台",
			authFailed: "认证失败",
			namePlaceholder: "Ada",
			emailPlaceholder: "operator@studio.ai",
			passwordPlaceholder: "至少 8 个字符",
		},
		editor: {
			exitProject: "退出项目",
			shortcuts: "快捷键",
			failedRename: "项目重命名失败",
			tryAgain: "请重试",
			export: "导出",
			exporting: "正在导出项目",
			failedDelete: "删除项目失败",
			commandPalette: {
				open: "打开命令面板",
				title: "命令面板",
				description: "搜索并运行编辑器命令。",
				placeholder: "搜索命令或 Agent 动作",
				empty: "没有找到命令",
				openAgent: "打开 Agent 指挥中心",
				agentCategory: "agent",
			},
			projectSwitcher: {
				open: "打开项目切换器",
				title: "项目",
				description: "选择一个项目后会直接打开对应编辑器。",
				loading: "正在加载项目...",
				empty: "还没有项目",
				newProject: "新建项目",
				creatingProject: "创建中...",
				allProjects: "全部项目",
				current: "当前",
				updated: "更新于",
				opening: "打开中...",
				openProject: "打开",
				switchProject: "切换",
				failedOpen: "打开项目失败",
				failedCreate: "新建项目失败",
				logoAlt: "Shotlyx 项目切换器",
			},
			exportDialog: {
				unknownError: "发生未知错误",
				format: "格式",
				mp4: "MP4 (H.264) - 兼容性更好",
				webm: "WebM (VP9) - 文件更小",
				quality: "质量",
				low: "低 - 文件最小",
				medium: "中 - 平衡质量和体积",
				high: "高 - 推荐",
				veryHigh: "非常高 - 文件最大",
				audio: "音频",
				includeAudio: "导出时包含音频",
				stages: {
					preparing: "正在准备导出",
					prerenderingMG: "正在渲染 MG 片段",
					mixingAudio: "正在混合音频",
					encoding: "正在编码视频",
				},
				subProgress: {
					estimatedRemaining: "预计剩余",
					frame: "帧",
					mgSegment: "MG 片段",
					timeUnits: {
						hour: "小时",
						minute: "分",
						second: "秒",
					},
				},
				cancel: "取消",
				failed: "导出失败",
				copy: "复制",
				retry: "重试",
			},
			agentPanel: {
				kicker: "AI Command",
				title: "Shotlyx",
				context: "上下文",
				tools: "工具",
				timeline: "时间线",
				push: "挤压",
				drawer: "抽屉",
				pushTitle: "挤压式布局",
				drawerTitle: "抽屉式布局",
				runningModeTitle: "Agent 运行中，暂不能切换面板模式",
				collapse: "收起 Agent 面板",
				collapseRunning: "Agent 运行中，暂不能收起面板",
				expand: "展开 Agent 面板",
			},
			onboarding: {
				description: "Shotlyx AI 原生编辑工作台引导。",
				fallbackTitle: "Shotlyx 引导",
				signals: ["Agent", "工具", "预览"],
				steps: [
					{
						signal: "AI Native Workspace",
						title: "把想法交给时间线",
						body: "Agent 会围绕成片目标组织计划、调用工具，并把执行过程留在左侧指挥区。",
						button: "继续",
					},
					{
						signal: "Beta Lab",
						title: "Beta 控制室",
						body: [
							"这里会优先验证 AI 剪辑、素材补位、字幕、旁白这些高频任务。",
							"遇到不确定的操作，Agent 会先给你选择，而不是直接改掉项目。",
						],
						button: "继续",
					},
					{
						signal: "Feedback Loop",
						title: "开始第一版剪辑",
						body: [
							"把你真实的剪辑场景和不顺手的地方记录下来，后续可以直接交给 Agent 迭代。",
						],
						button: "进入编辑器",
					},
				],
			},
			chat: {
				sessionFallback: "会话",
				noMessage: "无消息",
				noContent: "无内容",
				openSessions: "展开会话列表",
				closeSessions: "收起会话列表",
				sessions: "会话",
				moreActions: "更多",
				copyChat: "复制聊天记录",
				clearChat: "清空会话",
				confirmClear: "确认清空?",
				confirm: "确认",
				cancel: "取消",
				running: "运行中",
				selectedCount: "已选",
				copySelected: "复制所选",
				confirmRename: "确认重命名",
				cancelRename: "取消重命名",
				renameSession: "重命名会话",
				deleteSession: "删除会话",
				newSession: "新建会话",
				emptyKicker: "Starter workflows",
				emptyTitle: "今天想创作什么？",
				emptyBody:
					"选择一个方向，子 Agent 会先补齐素材、目标和格式信息，再进入执行。",
				emptyNoMediaTitle: "项目里还没有素材",
				emptyNoMediaBody:
					"如果要剪口播或游戏视频，子 Agent 会先引导你上传视频/音频素材，再开始规划剪辑。",
				starters: [
					{
						label: "口播剪辑",
						hint: "上传 / 钩子 / 字幕",
						prompt:
							"我想剪一条口播短视频。请先检查当前项目里是否已经有可用的视频或音频素材。如果没有素材，不要直接执行剪辑工具，先引导我上传口播素材，并询问我：发布平台、目标时长、开头钩子方向、哪些内容必须保留/删除、字幕风格、是否要去口误/重复/停顿。等我回答并且素材准备好之后，再给出剪辑计划并执行。",
					},
					{
						label: "MG 动画",
						hint: "主题 / 数据 / 风格",
						prompt:
							"我想生成一个 MG 动画。请先问我：主题、用途、目标时长、画幅、关键文案/数据、品牌风格，以及它更像业绩对比、流程讲解还是工作汇报。信息明确后，先给出简短分镜和动画结构，再执行 MG 和时间线生成。",
					},
					{
						label: "工作汇报",
						hint: "结构 / 指标 / 图表",
						prompt:
							"我想做一个工作汇报视频。请先问我：汇报对象、时间范围、3-5 个核心成果、关键指标对比、风险/阻塞、希望的语气和目标时长。如果我有 PPT、录屏、口播或图片素材，请引导我上传或引用。然后把这些信息整理成短视频结构，并执行需要的文字、字幕、MG 和时间线操作。",
					},
					{
						label: "游戏短视频",
						hint: "素材 / 高光 / 节奏",
						prompt:
							"我想做一个游戏短视频。请先检查项目里是否已经上传了游戏录屏素材。如果没有，请先引导我上传。然后问我：游戏名、发布平台、想突出的高光时刻、节奏风格、是否要梗图/解说/字幕、目标时长。素材和信息齐了之后，再给出剪辑结构并执行。",
					},
					{
						label: "App 宣传",
						hint: "链接 / 卖点 / CTA",
						prompt:
							"我想做一个 App 宣传视频。请先问我：App 名称或链接、目标用户、核心痛点、3 个主要卖点、已有素材、发布平台、画幅、CTA 和目标时长。如果我只给链接，请先读取链接并总结卖点，再给出视频结构并执行。",
					},
					{
						label: "讲解视频",
						hint: "概念 / 脚本 / 画面",
						prompt:
							"我想做一个讲解视频。请先问我：主题、目标观众、看完后要理解什么、希望的视频形式、参考案例和目标时长。如果当前没有素材，请建议使用文字/MG、生成画面、B-roll 或旁白中的哪种方式。然后生成脚本和执行计划，并在确认后操作时间线。",
					},
				],
			},
			toolbar: {
				placeholder: "描述成片目标；输入 @ 引用素材、片段或轨道",
				executionMode: "执行模式",
				addReference: "添加引用",
				addReferenceTitle: "添加素材或时间线引用",
				media: "素材",
				timeline: "时间线",
				tracks: "轨道",
				clip: "个片段",
				clips: "个片段",
				pointSelect: "点选模式",
				openPointSelect: "开启点选模式",
				closePointSelect: "关闭点选模式",
				stop: "停止",
				stopTitle: "停止当前 Agent 流程",
				send: "发送",
				modes: {
					auto: "自动",
					suggest: "建议",
					manual: "手动",
				},
			},
			brandKit: {
				label: "品牌套件",
				noBrand: "不使用品牌",
				create: "创建品牌套件",
				edit: "编辑",
				colorUnit: "色",
				dialog: {
					untitled: "未命名套件",
					name: "名称",
					colors: "颜色",
					addColor: "添加颜色",
					deleteColor: "删除颜色",
					fonts: "字体",
					addFont: "添加字体",
					deleteFont: "删除字体",
					logo: "LOGO",
					images: "图片",
					styleGuide: "风格指南",
					styleGuidePlaceholder:
						"一句话品牌调性（例如：现代、技术、克制）。不要描述颜色或字体，这些字段已经写明了。",
					upload: "上传",
					save: "保存",
					deleteAsset: "删除{title}",
				},
			},
			assets: {
				title: "素材",
				import: "导入",
				noActiveProject: "没有打开的项目",
				dragDrop: "把视频、图片、音频、字幕和文本文件拖到这里",
				processing: "正在处理文件（{progress}%）",
				groups: {
					video: "视频",
					image: "图片",
					audio: "音频",
					subtitle: "字幕文件",
					text: "文本文件",
				},
				mgAnimations: "MG 动画",
				unknown: "未知",
				context: {
					exportClips: "导出片段",
					delete: "删除",
					deleteItems: "删除 {count} 个项目",
					previewMg: "预览 MG 素材",
					editMg: "编辑 MG 素材",
				},
				actions: {
					switchToList: "切换到列表视图",
					switchToGrid: "切换到网格视图",
					sortBy: "按 {key} 排序（{order}）",
					ascending: "升序",
					descending: "降序",
					sortLabels: {
						name: "名称",
						type: "类型",
						duration: "时长",
						size: "文件大小",
					},
				},
				preview: {
					loading: "读取中...",
					readFailed: "无法读取文件内容",
				},
				tabs: {
					media: "素材",
					sounds: "声音",
					text: "文字",
					effects: "效果",
					captions: "字幕",
					settings: "设置",
				},
			},
			properties: {
				emptyTitle: "暂无选择属性",
				emptyBody: "选中片段或素材后，这里会显示它的参数。",
				selectedClips: "个片段已选中",
				addedSelectedClips: "已把选中片段加入 Agent 引用",
				elementsSelected: "个元素已选中。",
			},
			silence: {
				title: "静音剪辑",
				description:
					"识别选中片段里的安静区间，先预览计划，再作为一次可撤销的时间线编辑应用。",
				threshold: "静音阈值",
				minSilence: "最短静音",
				padding: "保留余量",
				mergeGap: "合并间隔",
				selectedClips: "{count} 个片段可分析",
				pending: "先运行分析，预览可删除的静音片段。",
				result: "{count} 段，预计删除 {seconds}s",
				segmentCount: "{count} 段",
				analyze: "分析",
				analyzing: "分析中...",
				apply: "应用剪辑",
				cancel: "取消",
				noSelection: "请先选中一个或多个音频/视频片段",
				noSegments: "没有找到可删除的静音片段",
				analysisFailed: "静音分析失败",
				nothingApplied: "没有应用静音剪辑",
				applied: "已删除 {count} 段静音（{seconds}s）",
			},
		},
		footer: {
			description: "从可编程时间线里发出指令、检查结果、迭代并交付视频。",
			categories: [
				{
					label: "资源",
					links: [
						{ label: "引擎", href: "/#engine" },
						{ label: "流程", href: "/#pipeline" },
						{ label: "更新日志", href: "/changelog" },
						{ label: "博客", href: "/blog" },
						{ label: "源码", href: "/source" },
						{ label: "许可证", href: "/license" },
						{ label: "第三方 Notice", href: "/third-party-notices" },
						{ label: "隐私", href: "/privacy" },
						{ label: "使用条款", href: "/terms" },
					],
				},
				{
					label: "公司",
					links: [
						{ label: "基础", href: "/brand" },
						{ label: "贡献者", href: "/contributors" },
					],
				},
			],
		},
	},
} as const;

export function getSiteCopy(locale: AppLocale) {
	return SITE_COPY[locale] ?? SITE_COPY[DEFAULT_APP_LOCALE];
}
