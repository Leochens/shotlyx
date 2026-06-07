import type { Tool } from "@/agent/mcp/types";
import {
	optionalBooleanParam,
	optionalNumberParam,
	optionalStringParam,
} from "@/agent/mcp/validation";
import type { EditorCore } from "@/core";
import type { extractTimelineAudio } from "@/media/mediabunny";
import type {
	GenerateSubtitlesFromVideoInput,
	GenerateSubtitlesFromVideoResult,
	TranscribeAudioResult,
	TranscriptionCue,
	TranscriptionToolDeps,
} from "./types";
import type {
	TranscriptionLanguage,
	TranscriptionModelId,
} from "@/transcription/types";
import type { SubtitleToken } from "@/subtitles/types";
import { formatSrt } from "@/subtitles/srt";

const DEFAULT_TRANSCRIPTION_SOURCE = "timeline";
const DEFAULT_TRANSCRIPTION_PROVIDER = "volcengine";
const DEFAULT_SUBTITLE_STYLE = "clean";
const DEFAULT_SUBTITLE_PLACEMENT = "bottom";
const DEFAULT_SUBTITLE_LINE_BREAK_MODE = "page";
const DEFAULT_CLOUD_ASR_PROGRESS_INTERVAL_MS = 5_000;
const CLOUD_ASR_PROGRESS_CAP = 95;
const GENERATED_SUBTITLE_PUNCTUATION_RE = /[\p{P}\p{S}]+/gu;

export interface BuildTranscriptionToolsOptions {
	deps?: Partial<TranscriptionToolDeps>;
}

export interface CreateTranscriptionToolDepsOptions {
	editor: EditorCore;
	fetchFn?: typeof fetch;
	extractTimelineAudioFn?: typeof extractTimelineAudio;
	cloudAsrProgressIntervalMs?: number;
}

function assertGenerateSubtitlesFromVideo(
	deps?: Partial<TranscriptionToolDeps>,
): TranscriptionToolDeps["generateSubtitlesFromVideo"] {
	if (!deps?.generateSubtitlesFromVideo) {
		throw new Error(
			"transcription provider 未配置：请注入 generateSubtitlesFromVideo 后再调用 subtitles_generate_from_video",
		);
	}
	return deps.generateSubtitlesFromVideo;
}

function optionalTrimmedString({
	params,
	key,
	fallback,
}: {
	params: Record<string, unknown>;
	key: string;
	fallback?: string;
}): string | undefined {
	const value = optionalStringParam(params, key);
	if (value === undefined) return fallback;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeSourceParam({
	params,
}: {
	params: Record<string, unknown>;
}): "timeline" {
	const source = optionalTrimmedString({
		params,
		key: "source",
		fallback: DEFAULT_TRANSCRIPTION_SOURCE,
	});
	if (source !== "timeline") {
		throw new Error(`类型不匹配："source" 目前只支持 timeline`);
	}
	return "timeline";
}

async function parseTranscriptionApiError(response: Response): Promise<string> {
	try {
		const body = await response.json();
		if (
			typeof body === "object" &&
			body !== null &&
			"error" in body &&
			typeof body.error === "string"
		) {
			return body.error;
		}
	} catch {
		// fall through
	}
	return `provider_error: ASR transcription failed with ${response.status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalTokens({
	value,
	cueIndex,
}: {
	value: unknown;
	cueIndex: number;
}): SubtitleToken[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error(
			`provider_error: ASR cue ${cueIndex} tokens must be an array`,
		);
	}
	return value.map((item, tokenIndex) => {
		if (!isRecord(item)) {
			throw new Error(
				`provider_error: ASR cue ${cueIndex} token ${tokenIndex} must be an object`,
			);
		}
		const text = item.text;
		const startTime = item.startTimeSeconds ?? item.startTime ?? item.start;
		const endTime = item.endTimeSeconds ?? item.endTime ?? item.end;
		const duration = item.durationSeconds ?? item.duration;
		if (typeof text !== "string" || text.length === 0) {
			throw new Error(
				`provider_error: ASR cue ${cueIndex} token ${tokenIndex} has no text`,
			);
		}
		if (typeof startTime !== "number" || !Number.isFinite(startTime)) {
			throw new Error(
				`provider_error: ASR cue ${cueIndex} token ${tokenIndex} has invalid start time`,
			);
		}
		const resolvedDuration =
			typeof duration === "number"
				? duration
				: typeof endTime === "number"
					? endTime - startTime
					: Number.NaN;
		if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
			throw new Error(
				`provider_error: ASR cue ${cueIndex} token ${tokenIndex} has invalid duration`,
			);
		}
		return {
			text,
			startTime,
			duration: resolvedDuration,
			...(typeof item.confidence === "number"
				? { confidence: item.confidence }
				: {}),
		};
	});
}

function parseCue({
	value,
	index,
}: {
	value: unknown;
	index: number;
}): TranscriptionCue {
	if (!isRecord(value)) {
		throw new Error(`provider_error: ASR cue ${index} must be an object`);
	}
	const text = value.text;
	const startTimeSeconds = value.startTimeSeconds ?? value.startTime;
	const durationSeconds = value.durationSeconds ?? value.duration;
	if (typeof text !== "string" || text.trim().length === 0) {
		throw new Error(`provider_error: ASR cue ${index} has no text`);
	}
	if (
		typeof startTimeSeconds !== "number" ||
		!Number.isFinite(startTimeSeconds) ||
		typeof durationSeconds !== "number" ||
		!Number.isFinite(durationSeconds) ||
		durationSeconds <= 0
	) {
		throw new Error(`provider_error: ASR cue ${index} has invalid timing`);
	}
	return {
		text,
		startTimeSeconds,
		durationSeconds,
		tokens: parseOptionalTokens({
			value: value.tokens ?? value.words,
			cueIndex: index,
		}),
	};
}

function parseTranscriptionResult({
	value,
}: {
	value: unknown;
}): TranscribeAudioResult {
	if (!isRecord(value)) {
		throw new Error("provider_error: ASR response must be a JSON object");
	}
	if (!Array.isArray(value.cues)) {
		throw new Error("provider_error: ASR response did not include cues");
	}
	const cues = value.cues.map((cue, index) => parseCue({ value: cue, index }));
	const provider =
		typeof value.provider === "string" && value.provider.trim()
			? value.provider
			: "unknown";
	return {
		text: typeof value.text === "string" ? value.text : "",
		cues,
		language: typeof value.language === "string" ? value.language : undefined,
		provider,
		model: typeof value.model === "string" ? value.model : undefined,
		metadata: isRecord(value.metadata) ? value.metadata : undefined,
	};
}

function stripGeneratedSubtitlePunctuation({ text }: { text: string }): string {
	return text
		.replace(GENERATED_SUBTITLE_PUNCTUATION_RE, "")
		.replace(/\s+/g, " ")
		.trim();
}

function sanitizeGeneratedSubtitleTokens({
	tokens,
}: {
	tokens?: SubtitleToken[];
}): SubtitleToken[] | undefined {
	if (!tokens) return undefined;
	const sanitized = tokens.flatMap((token) => {
		const text = stripGeneratedSubtitlePunctuation({ text: token.text });
		return text.length > 0 ? [{ ...token, text }] : [];
	});
	return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeGeneratedTranscriptionCue({
	cue,
}: {
	cue: TranscriptionCue;
}): TranscriptionCue | null {
	const text = stripGeneratedSubtitlePunctuation({ text: cue.text });
	const tokens = sanitizeGeneratedSubtitleTokens({ tokens: cue.tokens });
	const fallbackText = tokens?.map((token) => token.text).join("") ?? "";
	const resolvedText = text.length > 0 ? text : fallbackText;
	if (resolvedText.length === 0) return null;
	return {
		text: resolvedText,
		startTimeSeconds: cue.startTimeSeconds,
		durationSeconds: cue.durationSeconds,
		...(tokens ? { tokens } : {}),
	};
}

function sanitizeGeneratedTranscription({
	transcription,
}: {
	transcription: TranscribeAudioResult;
}): TranscribeAudioResult {
	const cues = transcription.cues.flatMap((cue) => {
		const sanitizedCue = sanitizeGeneratedTranscriptionCue({ cue });
		return sanitizedCue ? [sanitizedCue] : [];
	});
	const text =
		stripGeneratedSubtitlePunctuation({ text: transcription.text }) ||
		cues.map((cue) => cue.text).join("");
	return {
		...transcription,
		text,
		cues,
	};
}

function buildTimelineAudioFile({ blob }: { blob: Blob }): File {
	return new File([blob], "shotlyx-timeline-audio.wav", {
		type: blob.type || "audio/wav",
	});
}

function sanitizeFilePart({ value }: { value: string }): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

function buildTranscriptionSubtitleFile({
	transcription,
}: {
	transcription: TranscribeAudioResult;
}): File {
	const provider = sanitizeFilePart({ value: transcription.provider }) || "asr";
	const model = transcription.model
		? `-${sanitizeFilePart({ value: transcription.model })}`
		: "";
	const fileName = `transcript-${provider}${model}.srt`;
	const content = `${formatSrt({
		cues: transcription.cues.map((cue) => ({
			text: cue.text,
			startTime: cue.startTimeSeconds,
			duration: cue.durationSeconds,
		})),
	})}\n`;
	return new File([content], fileName, {
		type: "application/x-subrip;charset=utf-8",
	});
}

async function saveTranscriptionSubtitleAsset({
	editor,
	transcription,
}: {
	editor: EditorCore;
	transcription: TranscribeAudioResult;
}): Promise<{ subtitleAssetId?: string; subtitleAssetName?: string }> {
	const project = editor.project.getActive();
	const file = buildTranscriptionSubtitleFile({ transcription });
	const result = await editor.media.addMediaAsset({
		projectId: project.metadata.id,
		asset: {
			name: file.name,
			type: "subtitle",
			file,
			url:
				typeof URL !== "undefined" && "createObjectURL" in URL
					? URL.createObjectURL(file)
					: undefined,
		},
	});
	if (!result) return {};
	return {
		subtitleAssetId: result.id,
		subtitleAssetName: result.name,
	};
}

function normalizeLocalLanguage({
	language,
}: {
	language?: string;
}): TranscriptionLanguage | undefined {
	switch (language) {
		case undefined:
		case "auto":
			return undefined;
		case "en":
		case "es":
		case "it":
		case "fr":
		case "de":
		case "pt":
		case "ru":
		case "ja":
		case "zh":
			return language;
		default:
			throw new Error(`类型不匹配：本地转写暂不支持语言 "${language}"`);
	}
}

function normalizeLocalModel({
	model,
}: {
	model?: string;
}): TranscriptionModelId | undefined {
	switch (model) {
		case undefined:
			return undefined;
		case "whisper-tiny":
		case "whisper-small":
		case "whisper-medium":
		case "whisper-large-v3-turbo":
			return model;
		default:
			throw new Error(`类型不匹配：本地转写暂不支持模型 "${model}"`);
	}
}

async function transcribeWithLocalWhisper({
	audioBlob,
	language,
	model,
	onProgress,
}: {
	audioBlob: Blob;
	language?: string;
	model?: string;
	onProgress?: GenerateSubtitlesFromVideoInput["onProgress"];
}): Promise<TranscribeAudioResult> {
	onProgress?.({
		stage: "asr-provider",
		label: "正在准备本地 Whisper 转写",
		status: "running",
		detail: model,
	});
	const [
		{ decodeAudioToFloat32 },
		{ transcriptionService },
		{ buildCaptionChunks },
		{ DEFAULT_TRANSCRIPTION_SAMPLE_RATE },
	] = await Promise.all([
		import("@/media/audio"),
		import("@/services/transcription/service"),
		import("@/transcription/caption"),
		import("@/transcription/audio"),
	]);
	const { samples } = await decodeAudioToFloat32({
		audioBlob,
		sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
	});
	const result = await transcriptionService.transcribe({
		audioData: samples,
		language: normalizeLocalLanguage({ language }),
		modelId: normalizeLocalModel({ model }),
		onProgress: (progress) => {
			onProgress?.({
				stage: "asr-provider",
				label: progress.message ?? "正在本地转写音频",
				status: "running",
				current: progress.progress,
				total: 100,
			});
		},
	});
	const captions = buildCaptionChunks({ segments: result.segments });
	return {
		text: result.text,
		cues: captions.map((caption) => ({
			text: caption.text,
			startTimeSeconds: caption.startTime,
			durationSeconds: caption.duration,
		})),
		language: result.language,
		provider: "local",
		model,
	};
}

async function transcribeWithApi({
	audioBlob,
	provider,
	language,
	model,
	referenceText,
	fetchFn,
	abortSignal,
	onProgress,
	progressIntervalMs = DEFAULT_CLOUD_ASR_PROGRESS_INTERVAL_MS,
}: {
	audioBlob: Blob;
	provider: string;
	language?: string;
	model?: string;
	referenceText?: string;
	fetchFn: typeof fetch;
	abortSignal?: AbortSignal;
	onProgress?: GenerateSubtitlesFromVideoInput["onProgress"];
	progressIntervalMs?: number;
}): Promise<TranscribeAudioResult> {
	const form = new FormData();
	form.set("audio", buildTimelineAudioFile({ blob: audioBlob }));
	form.set("provider", provider);
	if (language) form.set("language", language);
	if (model) form.set("model", model);
	if (referenceText) form.set("referenceText", referenceText);
	const stopProgress = startCloudAsrProgress({
		provider,
		onProgress,
		intervalMs: progressIntervalMs,
	});
	try {
		const response = await fetchFn("/api/agent/transcription", {
			method: "POST",
			body: form,
			signal: abortSignal,
		});
		if (!response.ok) {
			throw new Error(await parseTranscriptionApiError(response));
		}
		onProgress?.({
			stage: "asr-provider",
			label: "ASR 已返回，正在解析识别结果",
			status: "running",
			detail: provider,
			current: 98,
			total: 100,
		});
		return parseTranscriptionResult({ value: await response.json() });
	} finally {
		stopProgress();
	}
}

function startCloudAsrProgress({
	provider,
	onProgress,
	intervalMs,
}: {
	provider: string;
	onProgress?: GenerateSubtitlesFromVideoInput["onProgress"];
	intervalMs: number;
}): () => void {
	if (!onProgress) return () => {};
	let tick = 0;
	const startedAt = Date.now();
	const emitProgress = () => {
		tick += 1;
		const current = Math.min(CLOUD_ASR_PROGRESS_CAP, 10 + tick * 5);
		const elapsedSeconds = Math.max(
			1,
			Math.round((Date.now() - startedAt) / 1000),
		);
		onProgress({
			stage: "asr-provider",
			label: `字幕识别中 ${current}%`,
			status: "running",
			detail: `${provider} 已等待 ${elapsedSeconds}s`,
			current,
			total: 100,
		});
	};
	const timer = setInterval(emitProgress, Math.max(1, intervalMs));
	return () => clearInterval(timer);
}

export function createTranscriptionToolDeps({
	editor,
	fetchFn = globalThis.fetch.bind(globalThis),
	extractTimelineAudioFn,
	cloudAsrProgressIntervalMs,
}: CreateTranscriptionToolDepsOptions): TranscriptionToolDeps {
	return {
		async generateSubtitlesFromVideo(
			input: GenerateSubtitlesFromVideoInput,
		): Promise<GenerateSubtitlesFromVideoResult> {
			const source = input.source ?? DEFAULT_TRANSCRIPTION_SOURCE;
			if (source !== "timeline") {
				throw new Error(`类型不匹配：暂不支持字幕来源 "${source}"`);
			}
			input.onProgress?.({
				stage: "audio-extract",
				label: "正在从当前时间线提取音频",
				status: "running",
			});
			const audioExtractor =
				extractTimelineAudioFn ??
				(await import("@/media/mediabunny")).extractTimelineAudio;
			const audioBlob = await audioExtractor({
				tracks: editor.scenes.getActiveScene().tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});
			input.onProgress?.({
				stage: "audio-extract",
				label: "音频已提取",
				status: "success",
			});

			const provider = input.provider ?? DEFAULT_TRANSCRIPTION_PROVIDER;
			input.onProgress?.({
				stage: "asr-provider",
				label: provider === "local" ? "正在本地识别字幕" : "正在请求 ASR 服务",
				status: "running",
				detail: provider,
				...(provider === "local" ? {} : { current: 5, total: 100 }),
			});
			const rawTranscription =
				provider === "local"
					? await transcribeWithLocalWhisper({
							audioBlob,
							language: input.language,
							model: input.model,
							onProgress: input.onProgress,
						})
					: await transcribeWithApi({
							audioBlob,
							provider,
							language: input.language,
							model: input.model,
							referenceText: input.referenceText,
							fetchFn,
							abortSignal: input.abortSignal,
							onProgress: input.onProgress,
							progressIntervalMs: cloudAsrProgressIntervalMs,
						});
			const transcription = sanitizeGeneratedTranscription({
				transcription: rawTranscription,
			});
			input.onProgress?.({
				stage: "asr-provider",
				label: "字幕识别完成",
				status: "success",
				detail: transcription.provider,
				current: 100,
				total: 100,
			});

			if (transcription.cues.length === 0) {
				throw new Error("字幕为空：ASR 没有返回有效字幕 cue");
			}

			let subtitleAsset: {
				subtitleAssetId?: string;
				subtitleAssetName?: string;
			} = {};
			if (input.saveAsset !== false) {
				input.onProgress?.({
					stage: "subtitle-asset",
					label: "正在保存字幕文件到资源库",
					status: "running",
				});
				try {
					subtitleAsset = await saveTranscriptionSubtitleAsset({
						editor,
						transcription,
					});
					input.onProgress?.({
						stage: "subtitle-asset",
						label: subtitleAsset.subtitleAssetName
							? "字幕文件已保存到资源库"
							: "字幕文件未保存",
						status: subtitleAsset.subtitleAssetName ? "success" : "error",
						detail: subtitleAsset.subtitleAssetName,
					});
				} catch (error) {
					console.warn("Failed to save transcription subtitle asset:", error);
					input.onProgress?.({
						stage: "subtitle-asset",
						label: "字幕文件保存失败",
						status: "error",
						detail: error instanceof Error ? error.message : undefined,
					});
				}
			}

			input.onProgress?.({
				stage: "subtitle-import",
				label: "正在插入字幕到时间线",
				status: "running",
			});
			const importResult = await editor.mcp.execute({
				toolName: "subtitles_import",
				params: {
					format: "cues",
					cues: transcription.cues,
					style: input.style ?? DEFAULT_SUBTITLE_STYLE,
					placement: input.placement ?? DEFAULT_SUBTITLE_PLACEMENT,
					...(subtitleAsset.subtitleAssetId
						? {
								subtitleAssetId: subtitleAsset.subtitleAssetId,
								...(subtitleAsset.subtitleAssetName
									? { subtitleAssetName: subtitleAsset.subtitleAssetName }
									: {}),
							}
						: {}),
					...(input.trackId ? { trackId: input.trackId } : {}),
					...(input.revealMode ? { revealMode: input.revealMode } : {}),
					...(input.lineBreakMode
						? { lineBreakMode: input.lineBreakMode }
						: {}),
					...(typeof input.maxCharsPerLine === "number"
						? { maxCharsPerLine: input.maxCharsPerLine }
						: {}),
					...(input.highlightColor
						? { highlightColor: input.highlightColor }
						: {}),
				},
				signal: input.abortSignal,
			});
			if (importResult.status === "error") {
				throw new Error(importResult.error ?? "字幕插入失败");
			}
			const data = isRecord(importResult.data) ? importResult.data : {};
			input.onProgress?.({
				stage: "subtitle-import",
				label: "字幕已插入时间线",
				status: "success",
				detail: typeof data.trackId === "string" ? data.trackId : undefined,
			});
			return {
				imported: true,
				provider: transcription.provider,
				cueCount:
					typeof data.cueCount === "number"
						? data.cueCount
						: transcription.cues.length,
				groupId: typeof data.groupId === "string" ? data.groupId : undefined,
				trackId: typeof data.trackId === "string" ? data.trackId : undefined,
				...subtitleAsset,
				language: transcription.language,
				model: transcription.model,
				text: transcription.text,
				metadata: transcription.metadata,
			};
		},
	};
}

export function buildTranscriptionTools({
	deps,
}: BuildTranscriptionToolsOptions = {}): Tool[] {
	return [
		{
			name: "subtitles_generate_from_video",
			description:
				"从当前时间线提取音频，调用本地或云端 ASR 生成字幕，并将字幕 cue 插入时间线。",
			parameters: {
				source: {
					type: "string",
					description: "字幕来源，目前支持 timeline，默认 timeline",
					optional: true,
				},
				provider: {
					type: "string",
					description:
						"ASR provider ID：volcengine、local、openai-compatible、tencent、aliyun、baidu、iflytek。默认 volcengine。",
					optional: true,
				},
				language: {
					type: "string",
					description: "语言代码，例如 auto、zh、en",
					optional: true,
				},
				model: {
					type: "string",
					description: "ASR 模型名，由 provider 解释",
					optional: true,
				},
				referenceText: {
					type: "string",
					description:
						"可选参考脚本、提示稿、术语或易错词；用户提供长稿时，先总结成关键台词、专有名词和纠错提示后传入，用于提升 ASR 准确度。",
					optional: true,
				},
				style: {
					type: "string",
					description: "字幕样式：clean、documentary、social",
					optional: true,
				},
				placement: {
					type: "string",
					description: "字幕位置：bottom 或 lower_third",
					optional: true,
				},
				trackId: {
					type: "string",
					description: "可选目标字幕文本轨道 ID；省略时自动创建新字幕轨",
					optional: true,
				},
				revealMode: {
					type: "string",
					description:
						"字幕显示模式：line、token 或 karaoke。karaoke 会按 token 时间高亮已说出的文字。",
					optional: true,
				},
				lineBreakMode: {
					type: "string",
					description:
						"换行展示模式：wrap 自动换行，page 按行分页显示。默认 page。",
					optional: true,
				},
				maxCharsPerLine: {
					type: "number",
					description: "每行最大字符数，用于字幕换行或分页。",
					optional: true,
				},
				highlightColor: {
					type: "string",
					description: "karaoke 高亮颜色，例如 #22d3ee。",
					optional: true,
				},
				saveAsset: {
					type: "boolean",
					description:
						"是否保存一份可同步的 SRT 字幕素材到资源库。默认 true；只有用户明确不想保存素材时才传 false。",
					optional: true,
				},
			},
			mutating: true,
			// Tool handlers use the MCP Tool interface's positional signature.
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const generateSubtitlesFromVideo =
					assertGenerateSubtitlesFromVideo(deps);
				return generateSubtitlesFromVideo({
					source: normalizeSourceParam({ params }),
					provider: optionalTrimmedString({
						params,
						key: "provider",
						fallback: DEFAULT_TRANSCRIPTION_PROVIDER,
					}),
					language: optionalTrimmedString({ params, key: "language" }),
					model: optionalTrimmedString({ params, key: "model" }),
					referenceText: optionalTrimmedString({
						params,
						key: "referenceText",
					}),
					style: optionalTrimmedString({
						params,
						key: "style",
						fallback: DEFAULT_SUBTITLE_STYLE,
					}),
					placement: optionalTrimmedString({
						params,
						key: "placement",
						fallback: DEFAULT_SUBTITLE_PLACEMENT,
					}),
					trackId: optionalTrimmedString({ params, key: "trackId" }),
					revealMode: optionalTrimmedString({ params, key: "revealMode" }),
					lineBreakMode: optionalTrimmedString({
						params,
						key: "lineBreakMode",
						fallback: DEFAULT_SUBTITLE_LINE_BREAK_MODE,
					}),
					maxCharsPerLine: optionalNumberParam(params, "maxCharsPerLine"),
					highlightColor: optionalTrimmedString({
						params,
						key: "highlightColor",
					}),
					saveAsset: optionalBooleanParam(params, "saveAsset") ?? true,
					abortSignal: context?.signal,
					onProgress: context?.onProgress,
				});
			},
		},
	];
}
