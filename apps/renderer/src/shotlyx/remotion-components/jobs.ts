import { generateUUID } from "@/utils/id";
import {
	createShotlyxMGCompositionPlan,
	type ShotlyxMGCompositionComponentPlan,
} from "./composition-director";
import {
	buildShotlyxMGCompositionGenerationGuidance,
	resolveMGCompositionStyleGuide,
} from "./composition-prompt";
import type { GenerateShotlyxMGComponentOptions } from "./generator";
import {
	buildRemotionSkillContextSummary,
	formatRemotionSkillSummary,
	type RemotionSkillContextSummary,
} from "./skill-context";
import {
	createShotlyxMGTemplateDocument,
	normalizeShotlyxMGTemplateSelection,
	type ShotlyxMGTemplateId,
	type ShotlyxMGTemplateMode,
} from "./template-library";
import type { ShotlyxRemotionComponentDocument } from "./types";

export interface ShotlyxMGJobInput extends Omit<
	GenerateShotlyxMGComponentOptions,
	"model" | "generateTextFn"
> {
	componentCount?: number;
	templateMode?: ShotlyxMGTemplateMode;
	templateId?: ShotlyxMGTemplateId;
}

export type ShotlyxMGJobStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export type ShotlyxMGJobEvent =
	| {
			type: "started" | "progress" | "completed" | "cancelled";
			jobId: string;
			label: string;
			status: "running" | "success" | "error";
			detail?: string;
			index?: number;
			total?: number;
			taskId?: string;
			taskLabel?: string;
			documents?: ShotlyxRemotionComponentDocument[];
	  }
	| {
			type: "component-complete";
			jobId: string;
			label: string;
			status: "success";
			index: number;
			total: number;
			taskId?: string;
			taskLabel?: string;
			document: ShotlyxRemotionComponentDocument;
	  }
	| {
			type: "error";
			jobId: string;
			label: string;
			status: "error";
			error: string;
	  };

interface ShotlyxMGJob {
	id: string;
	input: ShotlyxMGJobInput;
	status: ShotlyxMGJobStatus;
	abortController: AbortController;
	events: ShotlyxMGJobEvent[];
	subscribers: Set<(event: ShotlyxMGJobEvent) => void>;
}

export type GenerateShotlyxMGJobDocumentFn = (
	args: GenerateShotlyxMGComponentOptions,
) => Promise<ShotlyxRemotionComponentDocument>;

const DEFAULT_COMPONENT_TIMEOUT_MS = 180_000;
const DEFAULT_COMPONENT_RETRY_ATTEMPTS = 0;
const DEFAULT_COMPONENT_REPAIR_ATTEMPTS = 0;
const DEFAULT_COMPONENT_MAX_OUTPUT_TOKENS = 12_000;
const DEFAULT_COMPONENT_CONCURRENCY = 5;
const globalShotlyxMGJobs = globalThis as typeof globalThis & {
	__shotlyxMGJobs?: Map<string, ShotlyxMGJob>;
};
const jobs =
	globalShotlyxMGJobs.__shotlyxMGJobs ?? new Map<string, ShotlyxMGJob>();
globalShotlyxMGJobs.__shotlyxMGJobs = jobs;

function buildComponentPrompt({
	input,
	index,
	total,
}: {
	input: ShotlyxMGJobInput;
	index: number;
	total: number;
}): string {
	if (total <= 1) return input.prompt;
	const styleGuide = resolveMGCompositionStyleGuide({
		styleGuide: input.styleGuide,
		componentCount: total,
	});
	const directorPlan = createShotlyxMGCompositionPlan({
		prompt: input.prompt,
		componentCount: total,
		durationSeconds: input.durationSeconds,
		styleGuide,
		aspectRatio: input.aspectRatio ?? "16:9",
		transparentBackground: input.transparentBackground !== false,
	});
	const component = directorPlan.components[index];
	if (!component) return input.prompt;
	return [
		`MG asset name: ${buildMGComponentAssetName({
			index,
			total,
			component,
			basePrompt: input.prompt,
		})}`,
		buildShotlyxMGCompositionGenerationGuidance({
			description: input.prompt,
			aspectRatio: input.aspectRatio ?? "16:9",
			durationSeconds: component.durationSeconds,
			componentCount: total,
			styleGuide,
			transparentBackground: input.transparentBackground !== false,
		}),
		`组合式 Shotlyx MG 总需求：${input.prompt}`,
		`Director 总体概念：${directorPlan.title}`,
		`Director 视觉风格：${directorPlan.visualStyle}`,
		`Director styleTokens：${JSON.stringify(directorPlan.styleTokens)}`,
		`Director 叙事弧线：${directorPlan.narrativeArc}`,
		`Director 时间线：${directorPlan.timelineMode}，总时长 ${directorPlan.totalDurationSeconds.toFixed(2)}s / ${directorPlan.totalDurationFrames} frames。`,
		`现在只生成第 ${index + 1}/${total} 个小组件：${component.label}。`,
		`Scene ID：${component.sceneId}`,
		`生成策略：${component.generationMode}${component.templateId ? `，templateId=${component.templateId}` : "，无 templateId，必须自定义写 Remotion 代码"}`,
		`组件职责：${component.focus}`,
		`视觉角色：${component.visualRole}`,
		`组件 timing：${JSON.stringify(component.timing)}`,
		`组件 propsIntent：${JSON.stringify(component.propsIntent)}`,
		`转场：in=${component.transitionIn}, out=${component.transitionOut}`,
		`背景/文字策略：${component.backgroundMode} / ${component.textPolicy}`,
		`动效方向：${component.animationDirection}`,
		`质量底线：${component.qualityBar}`,
		`必须通过的校验：${component.validationChecks.join(", ")}`,
		"节奏要求：短促局部强调可以只做 1-2 秒，不要为了填满默认时长而空等；如果该组件持续多秒，必须包含入场、保持期的轻微运动或强调、以及必要的退场，不能 1 秒动完后剩余时间空白。",
		"这个组件会和其他小组件叠加使用，所以只输出自己负责的视觉层，不要试图完成整个动画。",
		input.transparentBackground === false
			? "背景模式：允许根据设计需要绘制完整背景。"
			: "背景模式：透明。不要绘制全画布黑底/实底，只输出可叠加到视频上的局部图形、文字、线条和强调层。",
		"所有用户后续可能修改的文字、颜色、数据、数值和显示开关都必须进入 propsSchema。",
	].join("\n");
}

function buildMGComponentAssetName({
	index,
	total,
	component,
	basePrompt,
}: {
	index: number;
	total: number;
	component: ShotlyxMGCompositionComponentPlan;
	basePrompt: string;
}): string {
	const subject = basePrompt
		.trim()
		.replace(/\s+/g, " ")
		.replace(/[，。,.、；;：:【】[\]（）()]/g, " ")
		.trim()
		.slice(0, 18)
		.trim();
	const positionText = `${index + 1}/${total}`;
	const labelHasPosition = component.label.includes(positionText);
	const suffix = total > 1 && !labelHasPosition ? ` ${positionText}` : "";
	return `${component.label}${suffix}${subject ? ` · ${subject}` : ""}`;
}

function getJobComponentDurationSeconds({
	input,
	index,
	total,
}: {
	input: ShotlyxMGJobInput;
	index: number;
	total: number;
}): number | undefined {
	if (total <= 1) return input.durationSeconds;
	const styleGuide = resolveMGCompositionStyleGuide({
		styleGuide: input.styleGuide,
		componentCount: total,
	});
	const directorPlan = createShotlyxMGCompositionPlan({
		prompt: input.prompt,
		componentCount: total,
		durationSeconds: input.durationSeconds,
		styleGuide,
		aspectRatio: input.aspectRatio ?? "16:9",
		transparentBackground: input.transparentBackground !== false,
	});
	return (
		directorPlan.components[index]?.timing.durationSeconds ??
		input.durationSeconds
	);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return "MG 子智能体生成失败";
	}
}

function isJsonParseLikeMGError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("remotion json 解析失败") ||
		lower.includes("unterminated string in json") ||
		lower.includes("expected property name") ||
		lower.includes("unexpected token") ||
		lower.includes("bad control character") ||
		lower.includes("json parse error") ||
		lower.includes("json.parse")
	);
}

function isSpecificRepairableMGError(message: string): boolean {
	const lower = message.toLowerCase();
	if (
		lower.includes("configuration_error") ||
		lower.includes("api key") ||
		lower.includes("response_format")
	) {
		return false;
	}

	return (
		isJsonParseLikeMGError(message) ||
		lower.includes("transform failed") ||
		lower.includes("expected expression") ||
		lower.includes("esbuild") ||
		lower.includes("shotlyx mg 生成失败") ||
		lower.includes("shotlyx remotion") ||
		lower.includes("invalid shotlyx remotion") ||
		lower.includes("json 不符合 shotlyx mg schema") ||
		lower.includes("invalid shotlyx mg") ||
		lower.includes("references unknown") ||
		lower.includes("targets missing") ||
		lower.includes("missing node") ||
		lower.includes("duplicate node") ||
		lower.includes("validation")
	);
}

function getErrorStack(error: unknown): string | undefined {
	if (error instanceof Error && error.stack) return error.stack;
	return undefined;
}

function logComponentGenerationError({
	job,
	componentIndex,
	componentCount,
	taskId,
	taskLabel,
	error,
	message,
	retrying,
	repairingSpecificError,
}: {
	job: ShotlyxMGJob;
	componentIndex: number;
	componentCount: number;
	taskId: string;
	taskLabel: string;
	error: unknown;
	message: string;
	retrying: boolean;
	repairingSpecificError: boolean;
}): void {
	if (process.env.NODE_ENV === "test") return;
	console.warn("[shotlyx-mg-job] component-error", {
		jobId: job.id,
		componentIndex,
		componentCount,
		taskId,
		taskLabel,
		retrying,
		repairingSpecificError,
		error: message,
		stack: getErrorStack(error),
	});
}

async function tryCreateTemplateDocumentForJob({
	job,
	component,
	componentIndex,
	componentCount,
}: {
	job: ShotlyxMGJob;
	component: ShotlyxMGCompositionComponentPlan;
	componentIndex: number;
	componentCount: number;
}): Promise<{
	document: ShotlyxRemotionComponentDocument;
	templateId: ShotlyxMGTemplateId;
} | null> {
	const { templateMode, templateId: selectedTemplateId } =
		normalizeShotlyxMGTemplateSelection({
			templateMode: job.input.templateMode,
			templateId: job.input.templateId,
			defaultTemplateMode: "off",
		});
	if (templateMode !== "force") return null;
	const templateId = selectedTemplateId;
	if (!templateId) {
		throw new Error(
			`No builtin MG template selected for task "${component.sceneId}"`,
		);
	}
	emit({
		job,
		event: {
			type: "progress",
			jobId: job.id,
			label: `使用内置 MG 模板生成第 ${componentIndex + 1}/${componentCount} 个组件`,
			status: "running",
			detail: `${templateId} · ${component.label}`,
			index: componentIndex,
			total: componentCount,
			taskId: component.sceneId,
			taskLabel: component.label,
		},
	});
	try {
		const document = await createShotlyxMGTemplateDocument({
			templateId,
			prompt: job.input.prompt,
			taskLabel: component.label,
			taskFocus: component.focus,
			durationSeconds: getJobComponentDurationSeconds({
				input: job.input,
				index: componentIndex,
				total: componentCount,
			}),
			aspectRatio: job.input.aspectRatio ?? "16:9",
			transparentBackground: job.input.transparentBackground !== false,
		});
		return { document, templateId };
	} catch (error) {
		if (templateMode === "force") throw error;
		logComponentGenerationError({
			job,
			componentIndex,
			componentCount,
			taskId: component.sceneId,
			taskLabel: component.label,
			error,
			message: getErrorMessage(error),
			retrying: true,
			repairingSpecificError: false,
		});
		return null;
	}
}

function emit({ job, event }: { job: ShotlyxMGJob; event: ShotlyxMGJobEvent }) {
	job.events.push(event);
	logJobEvent({ event });
	for (const subscriber of job.subscribers) {
		subscriber(event);
	}
}

function logJobEvent({ event }: { event: ShotlyxMGJobEvent }): void {
	if (process.env.NODE_ENV === "test") return;
	const payload = {
		jobId: event.jobId,
		type: event.type,
		label: event.label,
		status: event.status,
		index: "index" in event ? event.index : undefined,
		total: "total" in event ? event.total : undefined,
		taskId: "taskId" in event ? event.taskId : undefined,
		detail: "detail" in event ? event.detail : undefined,
		error: "error" in event ? event.error : undefined,
	};
	if (event.type === "error") {
		console.error("[shotlyx-mg-job] error", payload);
		return;
	}
	console.info("[shotlyx-mg-job] event", payload);
}

function isTerminalStatus(status: ShotlyxMGJobStatus): boolean {
	return (
		status === "completed" || status === "failed" || status === "cancelled"
	);
}

function markJobCancelled({ job }: { job: ShotlyxMGJob }): void {
	if (isTerminalStatus(job.status)) return;
	job.status = "cancelled";
	emit({
		job,
		event: {
			type: "cancelled",
			jobId: job.id,
			label: "MG 子智能体已停止",
			status: "error",
		},
	});
}

function emitRemotionSkillContext({
	job,
	summary,
}: {
	job: ShotlyxMGJob;
	summary: RemotionSkillContextSummary;
}): void {
	emit({
		job,
		event: {
			type: "progress",
			jobId: job.id,
			label: "已加载 Remotion Skill",
			status: "success",
			detail: formatRemotionSkillSummary({ summary }),
			index: summary.selectedRules.length,
			total: summary.selectedRules.length,
		},
	});
}

function shouldCancelJob({ job }: { job: ShotlyxMGJob }): boolean {
	return (
		job.abortController.signal.aborted ||
		job.status === "cancelled" ||
		job.status === "failed"
	);
}

async function generateDocumentWithTimeout({
	job,
	generateDocumentFn,
	args,
	componentIndex,
	componentCount,
	timeoutMs,
}: {
	job: ShotlyxMGJob;
	generateDocumentFn: GenerateShotlyxMGJobDocumentFn;
	args: GenerateShotlyxMGComponentOptions;
	componentIndex: number;
	componentCount: number;
	timeoutMs: number;
}): Promise<ShotlyxRemotionComponentDocument> {
	const componentAbortController = new AbortController();
	const timeoutMessage = `MG 子智能体超时：第 ${
		componentIndex + 1
	}/${componentCount} 个组件超过 ${timeoutMs}ms 仍未完成`;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let onAbort: (() => void) | undefined;

	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeoutId = setTimeout(() => {
			componentAbortController.abort();
			reject(new Error(timeoutMessage));
		}, timeoutMs);
	});
	const abortPromise = new Promise<never>((_resolve, reject) => {
		onAbort = () => {
			componentAbortController.abort();
			reject(new Error("Shotlyx MG job cancelled"));
		};
		if (job.abortController.signal.aborted) {
			onAbort();
			return;
		}
		job.abortController.signal.addEventListener("abort", onAbort, {
			once: true,
		});
	});

	try {
		return await Promise.race([
			generateDocumentFn({
				...args,
				abortSignal: componentAbortController.signal,
			}),
			timeoutPromise,
			abortPromise,
		]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		if (onAbort) {
			job.abortController.signal.removeEventListener("abort", onAbort);
		}
	}
}

async function generateMGComponentForJob({
	job,
	generateDocumentFn,
	componentIndex,
	componentCount,
	componentTimeoutMs,
	componentRetryAttempts,
	component,
}: {
	job: ShotlyxMGJob;
	generateDocumentFn: GenerateShotlyxMGJobDocumentFn;
	componentIndex: number;
	componentCount: number;
	componentTimeoutMs: number;
	componentRetryAttempts: number;
	component: ShotlyxMGCompositionComponentPlan;
}): Promise<ShotlyxRemotionComponentDocument> {
	if (shouldCancelJob({ job })) {
		throw new Error("Shotlyx MG job cancelled");
	}
	const taskId = component.sceneId;
	const taskLabel = component.label;

	emit({
		job,
		event: {
			type: "progress",
			jobId: job.id,
			label: "生成动画",
			status: "running",
			index: componentIndex,
			total: componentCount,
			taskId,
			taskLabel,
		},
	});

	const templateResult = await tryCreateTemplateDocumentForJob({
		job,
		component,
		componentIndex,
		componentCount,
	});
	if (templateResult) {
		if (shouldCancelJob({ job })) {
			throw new Error("Shotlyx MG job cancelled");
		}
		emit({
			job,
			event: {
				type: "component-complete",
				jobId: job.id,
				label: `已生成${templateResult.document.name}`,
				status: "success",
				index: componentIndex,
				total: componentCount,
				taskId,
				taskLabel,
				document: templateResult.document,
			},
		});
		return templateResult.document;
	}

	const styleGuide = resolveMGCompositionStyleGuide({
		styleGuide: job.input.styleGuide,
		componentCount,
	});
	const basePrompt = buildComponentPrompt({
		input: job.input,
		index: componentIndex,
		total: componentCount,
	});
	let document: ShotlyxRemotionComponentDocument | null = null;
	let lastErrorMessage = "";
	let unclearRetryCount = 0;
	let repairRetryCount = 0;

	while (true) {
		try {
			const {
				templateMode: _templateMode,
				templateId: _templateId,
				...generatorInput
			} = job.input;
			document = await generateDocumentWithTimeout({
				job,
				generateDocumentFn,
				componentIndex,
				componentCount,
				timeoutMs: componentTimeoutMs,
				args: {
					...generatorInput,
					styleGuide,
					durationSeconds: getJobComponentDurationSeconds({
						input: job.input,
						index: componentIndex,
						total: componentCount,
					}),
					prompt: basePrompt,
					repairAttempts: Math.min(
						2,
						Math.max(job.input.repairAttempts ?? 0, 1),
					),
					maxOutputTokens: Math.max(
						job.input.maxOutputTokens ?? 0,
						DEFAULT_COMPONENT_MAX_OUTPUT_TOKENS,
					),
				},
			});
			break;
		} catch (error) {
			if (shouldCancelJob({ job })) {
				throw error;
			}
			lastErrorMessage = getErrorMessage(error);
			const canRepairSpecificError =
				isSpecificRepairableMGError(lastErrorMessage) &&
				repairRetryCount < DEFAULT_COMPONENT_REPAIR_ATTEMPTS;
			const canRetryUnclearError =
				!isSpecificRepairableMGError(lastErrorMessage) &&
				unclearRetryCount < componentRetryAttempts;
			logComponentGenerationError({
				job,
				componentIndex,
				componentCount,
				taskId,
				taskLabel,
				error,
				message: lastErrorMessage,
				retrying: canRepairSpecificError || canRetryUnclearError,
				repairingSpecificError: canRepairSpecificError,
			});
			if (!canRepairSpecificError && !canRetryUnclearError) {
				throw error;
			}
			if (canRepairSpecificError) {
				repairRetryCount += 1;
			} else {
				unclearRetryCount += 1;
			}
			emit({
				job,
				event: {
					type: "progress",
					jobId: job.id,
					label: canRepairSpecificError
						? `优化动画（第 ${repairRetryCount} 次）`
						: `第 ${componentIndex + 1}/${componentCount} 个 MG 组件生成失败，正在第 ${unclearRetryCount} 次重试`,
					status: "running",
					detail: lastErrorMessage,
					index: componentIndex,
					total: componentCount,
					taskId,
					taskLabel,
				},
			});
		}
	}

	if (!document) {
		throw new Error(lastErrorMessage || "MG 子智能体没有返回可用的组件结果");
	}
	if (shouldCancelJob({ job })) {
		throw new Error("Shotlyx MG job cancelled");
	}

	emit({
		job,
		event: {
			type: "component-complete",
			jobId: job.id,
			label: `检查文字与画面：${document.name}`,
			status: "success",
			index: componentIndex,
			total: componentCount,
			taskId,
			taskLabel,
			document,
		},
	});
	return document;
}

async function runParallelJobTasks<T>({
	tasks,
}: {
	tasks: Array<() => Promise<T>>;
}): Promise<T[]> {
	const results = new Array<T>(tasks.length);
	let nextIndex = 0;
	const workerCount = Math.min(DEFAULT_COMPONENT_CONCURRENCY, tasks.length);
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < tasks.length) {
				const index = nextIndex;
				nextIndex += 1;
				results[index] = await tasks[index]!();
			}
		}),
	);
	return results;
}

async function runShotlyxMGJob({
	job,
	generateDocumentFn,
	componentTimeoutMs,
	componentRetryAttempts,
}: {
	job: ShotlyxMGJob;
	generateDocumentFn: GenerateShotlyxMGJobDocumentFn;
	componentTimeoutMs: number;
	componentRetryAttempts: number;
}): Promise<void> {
	if (shouldCancelJob({ job })) {
		markJobCancelled({ job });
		return;
	}
	job.status = "running";
	const componentCount = Math.max(Math.floor(job.input.componentCount ?? 1), 1);
	const styleGuide = resolveMGCompositionStyleGuide({
		styleGuide: job.input.styleGuide,
		componentCount,
	});
	const remotionSkill = buildRemotionSkillContextSummary({
		prompt: job.input.prompt,
		styleGuide,
	});
	emitRemotionSkillContext({
		job,
		summary: remotionSkill,
	});
	const directorPlan = createShotlyxMGCompositionPlan({
		prompt: job.input.prompt,
		componentCount,
		durationSeconds: job.input.durationSeconds,
		styleGuide,
		aspectRatio: job.input.aspectRatio ?? "16:9",
		transparentBackground: job.input.transparentBackground !== false,
	});
	emit({
		job,
		event: {
			type: "progress",
			jobId: job.id,
			label: "设计布局与 VisualDNA",
			status: "success",
			detail: `${directorPlan.title} · ${directorPlan.components
				.map((component) => component.label)
				.join(" / ")}`,
			index: 0,
			total: componentCount,
		},
	});
	emit({
		job,
		event: {
			type: "started",
			jobId: job.id,
			label: "理解内容",
			status: "running",
			index: 0,
			total: componentCount,
		},
	});

	try {
		const documents = await runParallelJobTasks({
			tasks: directorPlan.components.slice(0, componentCount).map(
				(component, index) => () =>
					generateMGComponentForJob({
						job,
						generateDocumentFn,
						componentIndex: index,
						componentCount,
						componentTimeoutMs,
						componentRetryAttempts,
						component,
					}),
			),
		});
		if (shouldCancelJob({ job })) {
			markJobCancelled({ job });
			return;
		}
		job.status = "completed";
		emit({
			job,
			event: {
				type: "completed",
				jobId: job.id,
				label: "完成",
				status: "success",
				index: componentCount,
				total: componentCount,
				documents,
			},
		});
	} catch (error) {
		if (shouldCancelJob({ job })) {
			markJobCancelled({ job });
			return;
		}
		job.status = "failed";
		job.abortController.abort();
		emit({
			job,
			event: {
				type: "error",
				jobId: job.id,
				label: "MG 子智能体失败",
				status: "error",
				error: getErrorMessage(error),
			},
		});
	}
}

export function createShotlyxMGJob({
	input,
	generateDocumentFn,
	componentTimeoutMs = DEFAULT_COMPONENT_TIMEOUT_MS,
	componentRetryAttempts = DEFAULT_COMPONENT_RETRY_ATTEMPTS,
}: {
	input: ShotlyxMGJobInput;
	generateDocumentFn: GenerateShotlyxMGJobDocumentFn;
	componentTimeoutMs?: number;
	componentRetryAttempts?: number;
}): { jobId: string } {
	const job: ShotlyxMGJob = {
		id: generateUUID(),
		input,
		status: "queued",
		abortController: new AbortController(),
		events: [],
		subscribers: new Set(),
	};
	jobs.set(job.id, job);
	void runShotlyxMGJob({
		job,
		generateDocumentFn,
		componentTimeoutMs,
		componentRetryAttempts,
	});
	return { jobId: job.id };
}

export function subscribeShotlyxMGJob({
	jobId,
	onEvent,
}: {
	jobId: string;
	onEvent: (event: ShotlyxMGJobEvent) => void;
}): () => void {
	const job = jobs.get(jobId);
	if (!job) {
		throw new Error(`Shotlyx MG job not found: ${jobId}`);
	}
	for (const event of job.events) {
		onEvent(event);
	}
	job.subscribers.add(onEvent);
	return () => {
		job.subscribers.delete(onEvent);
	};
}

export function getShotlyxMGJobStatus({
	jobId,
}: {
	jobId: string;
}): ShotlyxMGJobStatus | null {
	return jobs.get(jobId)?.status ?? null;
}

export function cancelShotlyxMGJob({ jobId }: { jobId: string }): boolean {
	const job = jobs.get(jobId);
	if (!job || isTerminalStatus(job.status)) return false;
	job.abortController.abort();
	markJobCancelled({ job });
	return true;
}

export function clearShotlyxMGJobs(): void {
	jobs.clear();
}
