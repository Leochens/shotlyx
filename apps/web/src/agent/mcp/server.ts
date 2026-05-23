import type { EditorCore } from "@/core";
import type { Tool, ToolProgressEvent, ToolResult } from "./types";
import type { FunctionSchema } from "./schema";
import type { MediaTime } from "@/wasm";
import { toolsToFunctionSchemas } from "./schema";
import { buildTimelineTools } from "./timeline-tools";
import { buildPlaybackTools } from "./playback-tools";
import { buildSelectionTools } from "./selection-tools";
import { buildMediaTools } from "./media-tools";
import { buildProjectTools } from "./project-tools";
import { buildSceneTools } from "./scene-tools";
import { buildEffectsTools } from "./effects-tools";
import { buildEditorTools } from "./editor-tools";
import { buildContextTools } from "./context-tools";
import { buildTextOverlayTools } from "./text-overlay-tools";
import { buildSubtitleTools } from "./subtitle-tools";
import { classifyError } from "./error-classification";
import { captureSnapshot, verifyChanges } from "./verification";
import { buildCreativeTools } from "@/agent/tools/creative/creative-tools";
import { buildStockMediaTools } from "@/agent/tools/stock-media/stock-tools";
import {
	buildVoiceoverTools,
	createVoiceoverToolDeps,
} from "@/agent/tools/voiceover/voiceover-tools";
import { buildWebTools } from "@/agent/tools/web/web-tools";
import {
	buildTranscriptionTools,
	createTranscriptionToolDeps,
} from "@/agent/tools/transcription/transcription-tools";
import { buildSilenceTools } from "./silence-tools";

export class MCPServer {
	private tools = new Map<string, Tool>();
	private editor: EditorCore | null = null;
	private mediaTimeFromSeconds:
		| ((args: { seconds: number }) => MediaTime)
		| null = null;
	private mediaTimeToSeconds: ((args: { time: MediaTime }) => number) | null =
		null;

	register(tool: Tool): void {
		this.tools.set(tool.name, tool);
	}

	getTools(): Tool[] {
		return Array.from(this.tools.values());
	}

	init(editor: EditorCore): void {
		this.editor = editor;
		for (const tool of buildSelectionTools(editor)) this.register(tool);
		for (const tool of buildMediaTools(editor)) this.register(tool);
		for (const tool of buildProjectTools(editor)) this.register(tool);
		for (const tool of buildSceneTools(editor)) this.register(tool);
		for (const tool of buildEffectsTools(editor)) this.register(tool);
		for (const tool of buildContextTools(editor)) this.register(tool);
		for (const tool of buildCreativeTools({ editor })) this.register(tool);
		for (const tool of buildStockMediaTools({ editor })) this.register(tool);
		for (const tool of buildWebTools()) this.register(tool);
		for (const tool of buildVoiceoverTools({
			deps: createVoiceoverToolDeps({ editor }),
		})) {
			this.register(tool);
		}
		for (const tool of buildTranscriptionTools({
			deps: createTranscriptionToolDeps({ editor }),
		})) {
			this.register(tool);
		}
		for (const tool of buildSilenceTools({ editor })) this.register(tool);

		// Register timeline and playback tools eagerly so getToolSchemas()
		// always returns the full schema set, even before WASM loads.
		// Handlers delegate to a lazy reference that resolves when WASM is ready.
		const mediaTimeFromSeconds = (args: { seconds: number }): MediaTime => {
			const fn = this.mediaTimeFromSeconds;
			if (!fn) {
				throw new Error("WASM 模块尚未加载，请稍后再试");
			}
			return fn(args);
		};
		const mediaTimeToSeconds = (args: { time: MediaTime }): number => {
			const fn = this.mediaTimeToSeconds;
			if (!fn) {
				throw new Error("WASM 模块尚未加载，请稍后再试");
			}
			return fn(args);
		};

		for (const tool of buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds },
		})) {
			this.register(tool);
		}
		for (const tool of buildTextOverlayTools({
			editor,
			deps: { mediaTimeFromSeconds },
		})) {
			this.register(tool);
		}
		for (const tool of buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds },
		})) {
			this.register(tool);
		}
		for (const tool of buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds },
		})) {
			this.register(tool);
		}
		for (const tool of buildEditorTools({
			editor,
			deps: { mediaTimeToSeconds },
		})) {
			this.register(tool);
		}

		import("@/wasm")
			.then(({ mediaTimeFromSeconds: fn1, mediaTimeToSeconds: fn2 }) => {
				this.mediaTimeFromSeconds = fn1;
				this.mediaTimeToSeconds = fn2;
			})
			.catch(() => {});
	}

	async execute({
		toolName,
		params,
		signal,
		onProgress,
	}: {
		toolName: string;
		params?: Record<string, unknown>;
		signal?: AbortSignal;
		onProgress?: (event: ToolProgressEvent) => void;
	}): Promise<ToolResult> {
		const tool = this.tools.get(toolName);
		if (!tool) {
			return {
				status: "error",
				error: `工具 "${toolName}" 不存在`,
				errorCategory: "not_found",
				suggestion: "使用 timeline_get_summary 查看可用工具",
			};
		}

		const safeParams = params ?? {};
		if (signal?.aborted) {
			return {
				status: "error",
				error: "工具调用已停止",
				errorCategory: "system_error",
			};
		}

		if (tool.preconditions) {
			const check = tool.preconditions(safeParams);
			if (!check.ok) {
				return {
					status: "error",
					error: check.error ?? "前置条件不满足",
					errorCategory: "state_error",
					suggestion: check.suggestion,
				};
			}
		}

		const shouldVerify = tool.mutating && this.editor;
		const beforeSnapshot = shouldVerify ? captureSnapshot(this.editor!) : null;

		try {
			const data = await Promise.resolve(
				tool.handler(safeParams, { signal, onProgress }),
			);

			if (shouldVerify && beforeSnapshot) {
				const afterSnapshot = captureSnapshot(this.editor!);
				const verification = verifyChanges(beforeSnapshot, afterSnapshot);
				return {
					status: "success",
					data,
					verified: verification.verified,
				};
			}

			return { status: "success", data };
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Unknown error";
			const classified = classifyError(errorMsg);
			return {
				status: "error",
				error: classified.message,
				errorCategory: classified.category,
				suggestion: classified.suggestion,
			};
		}
	}

	getToolSchemas(): FunctionSchema[] {
		return toolsToFunctionSchemas(this.getTools());
	}

	getEditor(): EditorCore {
		if (!this.editor) throw new Error("MCPServer 尚未初始化");
		return this.editor;
	}
}
