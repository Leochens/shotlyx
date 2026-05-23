import type { EditorCore } from "@/core";
import type { Tool } from "@/agent/mcp/types";
import {
	optionalNumberParam,
	optionalStringParam,
	requireStringParam,
} from "@/agent/mcp/validation";
import type { processMediaAssets } from "@/media/processing";
import type {
	GenerateVoiceoverAudioResult,
	GenerateVoiceoverAudioInput,
	VoiceoverCandidateMetadata,
	VoiceoverToolDeps,
} from "./types";

const DEFAULT_VOICEOVER_PROVIDER = "default";
const DEFAULT_VOICEOVER_SPEED = 1;
const MIN_VOICEOVER_SPEED = 0.25;
const MAX_VOICEOVER_SPEED = 4;

export interface BuildVoiceoverToolsOptions {
	deps?: Partial<VoiceoverToolDeps>;
}

export interface CreateVoiceoverToolDepsOptions {
	editor: EditorCore;
	fetchFn?: typeof fetch;
	processMediaAssetsFn?: typeof processMediaAssets;
}

function normalizeSpeed(value: number | undefined): number {
	const speed = value ?? DEFAULT_VOICEOVER_SPEED;
	if (speed < MIN_VOICEOVER_SPEED || speed > MAX_VOICEOVER_SPEED) {
		throw new Error(
			`类型不匹配："speed" 必须在 ${MIN_VOICEOVER_SPEED} 到 ${MAX_VOICEOVER_SPEED} 之间`,
		);
	}
	return speed;
}

function assertGenerateVoiceoverAudio(
	deps?: Partial<VoiceoverToolDeps>,
): VoiceoverToolDeps["generateVoiceoverAudio"] {
	if (!deps?.generateVoiceoverAudio) {
		throw new Error(
			"voiceover provider 未配置：请注入 generateVoiceoverAudio 后再调用 agent_generate_voiceover",
		);
	}
	return deps.generateVoiceoverAudio;
}

function getHeaderOrUndefined({
	headers,
	name,
}: {
	headers: Headers;
	name: string;
}): string | undefined {
	const value = headers.get(name);
	return value && value.trim() ? value : undefined;
}

function extensionFromMimeType(mimeType: string): string {
	if (mimeType.includes("wav")) return "wav";
	if (mimeType.includes("ogg")) return "ogg";
	return "mp3";
}

async function parseVoiceoverApiError(response: Response): Promise<string> {
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
	return `provider_error: voiceover generation failed with ${response.status}`;
}

export function createVoiceoverToolDeps({
	editor,
	fetchFn = globalThis.fetch.bind(globalThis),
	processMediaAssetsFn,
}: CreateVoiceoverToolDepsOptions): VoiceoverToolDeps {
	return {
		async generateVoiceoverAudio(
			input: GenerateVoiceoverAudioInput,
		): Promise<GenerateVoiceoverAudioResult> {
			const project = editor.project.getActiveOrNull();
			if (!project) {
				throw new Error("状态错误：未加载项目，无法保存旁白音频");
			}

			input.onProgress?.({
				stage: "voiceover-provider",
				label: "正在请求 TTS 服务",
				status: "running",
				detail: input.provider,
			});

			const response = await fetchFn("/api/agent/voiceover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text: input.text,
					voice: input.voice,
					language: input.language,
					speed: input.speed,
					provider: input.provider === "default" ? undefined : input.provider,
					format: "mp3",
				}),
				signal: input.abortSignal,
			});

			if (!response.ok) {
				throw new Error(await parseVoiceoverApiError(response));
			}

			input.onProgress?.({
				stage: "voiceover-provider",
				label: "TTS 音频已返回",
				status: "success",
				detail: input.provider,
			});
			input.onProgress?.({
				stage: "voiceover-import",
				label: "正在处理旁白音频",
				status: "running",
			});

			const blob = await response.blob();
			const mimeType = blob.type || "audio/mpeg";
			const filename =
				getHeaderOrUndefined({
					headers: response.headers,
					name: "x-voiceover-filename",
				}) ??
				`voiceover.${extensionFromMimeType(mimeType)}`;
			const file = new File([blob], filename, { type: mimeType });
			const mediaProcessor =
				processMediaAssetsFn ??
				(await import("@/media/processing")).processMediaAssets;
			const processed = await mediaProcessor({ files: [file] });
			const mediaAsset = processed[0];
			if (!mediaAsset) {
				throw new Error("媒体处理失败：无法处理旁白音频");
			}

			input.onProgress?.({
				stage: "voiceover-import",
				label: "正在导入资源库",
				status: "running",
				detail: mediaAsset.name,
			});

			const result = await editor.media.addMediaAsset({
				projectId: project.metadata.id,
				asset: mediaAsset,
			});
			if (!result) {
				throw new Error("媒体导入失败：保存旁白音频时出错");
			}

			input.onProgress?.({
				stage: "voiceover-import",
				label: "旁白音频已导入资源库",
				status: "success",
				detail: result.name,
			});

			const provider =
				getHeaderOrUndefined({
					headers: response.headers,
					name: "x-voiceover-provider",
				}) ??
				input.provider;
			const voice =
				getHeaderOrUndefined({
					headers: response.headers,
					name: "x-voiceover-voice",
				}) ??
				input.voice;
			return {
				asset: {
					id: result.id,
					name: result.name,
					url: result.url ?? "",
					mimeType,
					durationSeconds: result.duration,
					sizeBytes: file.size,
				},
				candidate: {
					id: result.id,
					provider,
					voice,
					language: input.language,
					speed: input.speed,
					text: input.text,
					title: result.name,
					status: "generated",
					audio: {
						id: result.id,
						name: result.name,
						url: result.url ?? "",
						mimeType,
						durationSeconds: result.duration,
						sizeBytes: file.size,
					},
					durationSeconds: result.duration,
					sizeBytes: file.size,
				},
				message: "旁白音频已生成并导入资源库",
				metadata: {
					mediaAssetId: result.id,
					imported: true,
				},
			};
		},
	};
}

function normalizeVoiceoverResult({
	result,
	text,
	voice,
	language,
	speed,
	provider,
}: {
	result: GenerateVoiceoverAudioResult;
	text: string;
	voice?: string;
	language?: string;
	speed: number;
	provider: string;
}): {
	asset?: GenerateVoiceoverAudioResult["asset"];
	candidate: VoiceoverCandidateMetadata;
	candidates: VoiceoverCandidateMetadata[];
	mediaAssetId?: string;
	message?: string;
	metadata?: Record<string, unknown>;
} {
	const fallbackCandidate: VoiceoverCandidateMetadata = {
		provider,
		voice,
		language,
		speed,
		text,
		status: "generated",
		audio: result.asset,
	};
	const candidate = result.candidate ?? fallbackCandidate;
	const candidates = result.candidates ?? [candidate];
	return {
		asset: result.asset ?? candidate.audio,
		candidate,
		candidates,
		mediaAssetId: (result.asset ?? candidate.audio)?.id,
		message: result.message,
		metadata: result.metadata,
	};
}

export function buildVoiceoverTools({
	deps,
}: BuildVoiceoverToolsOptions = {}): Tool[] {
	return [
		{
			name: "agent_generate_voiceover",
			description:
				"根据文本生成旁白音频，返回可导入或可保存的 audio asset/candidate metadata。provider 细节由注入的 generateVoiceoverAudio 实现负责。",
			parameters: {
				text: {
					type: "string",
					description: "需要转成旁白的文本",
				},
				voice: {
					type: "string",
					description: "声音/说话人 ID 或名称，由 provider 解释",
					optional: true,
				},
				language: {
					type: "string",
					description: "语言代码，例如 zh-CN、en-US",
					optional: true,
				},
				speed: {
					type: "number",
					description: "语速倍率，默认 1，允许 0.25 到 4",
					optional: true,
				},
				provider: {
					type: "string",
					description: "语音生成 provider ID，默认 default",
					optional: true,
				},
			},
			mutating: false,
			// Tool handlers use the MCP Tool interface's positional signature.
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const text = requireStringParam(params, "text").trim();
				if (text.length === 0) {
					throw new Error('参数缺失："text" 为必填项，且必须为非空字符串');
				}
				const voice = optionalStringParam(params, "voice");
				const language = optionalStringParam(params, "language");
				const speed = normalizeSpeed(optionalNumberParam(params, "speed"));
				const provider =
					optionalStringParam(params, "provider") ?? DEFAULT_VOICEOVER_PROVIDER;
				const generateVoiceoverAudio = assertGenerateVoiceoverAudio(deps);

				context?.onProgress?.({
					stage: "generation",
					label: "正在生成旁白音频",
					status: "running",
				});

				const result = await generateVoiceoverAudio({
					text,
					voice,
					language,
					speed,
					provider,
					abortSignal: context?.signal,
					onProgress: context?.onProgress,
				});

				const normalized = normalizeVoiceoverResult({
					result,
					text,
					voice,
					language,
					speed,
					provider,
				});

				context?.onProgress?.({
					stage: "generation",
					label: "旁白音频已生成",
					status: "success",
					detail: normalized.asset?.name ?? normalized.candidate.title,
				});

				return normalized;
			},
		},
	];
}
