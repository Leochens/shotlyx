import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useReducer, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type { CaptionChunk, TranscriptionLanguage } from "@/transcription/types";
import {
	CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS,
	DEFAULT_CAPTION_TRANSCRIPTION_PROVIDER,
	type CaptionTranscriptionProvider,
	getCaptionProviderStartStep,
	isCaptionTranscriptionProvider,
} from "@/subtitles/caption-provider";
import { parseSubtitleFile } from "@/subtitles/parse";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readToolData({
	result,
}: {
	result: { data?: unknown };
}): Record<string, unknown> | null {
	return isRecord(result.data) ? result.data : null;
}

/* eslint-disable shotlyx/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable shotlyx/prefer-object-params */

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [selectedTargetLanguage, setSelectedTargetLanguage] =
		useState<string>("en");
	const [selectedProvider, setSelectedProvider] =
		useState<CaptionTranscriptionProvider>(
			DEFAULT_CAPTION_TRANSCRIPTION_PROVIDER,
		);
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();

	const isProcessing = processing.status === "processing";

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);

	const insertCaptions = async ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): Promise<boolean> => {
		const result = await editor.mcp.execute({
			toolName: "subtitles_import",
			params: {
				format: "cues",
				insertMode: "layer",
				cues: captions.map((caption) => ({
					text: caption.text,
					startTimeSeconds: caption.startTime,
					durationSeconds: caption.duration,
				})),
			},
		});
		if (result.status === "error") {
			throw new Error(result.error ?? "Subtitle import failed");
		}
		return true;
	};

	const handleGenerateTranscript = async () => {
		dispatch({
			type: "start",
			step: getCaptionProviderStartStep({ provider: selectedProvider }),
		});
		try {
			const result = await editor.mcp.execute({
				toolName: "subtitles_generate_from_video",
				params: {
					source: "timeline",
					provider: selectedProvider,
					language: selectedLanguage,
					style: "clean",
					placement: "bottom",
				},
				onProgress: (event) => {
					if (event.status === "running") {
						dispatch({ type: "update_step", step: event.label });
					}
				},
			});
			if (result.status === "error") {
				dispatch({
					type: "fail",
					error: result.error ?? "Subtitle generation failed",
				});
				return;
			}

			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const translateCaptions = async ({
		trackId,
		elementId,
	}: {
		trackId?: string;
		elementId?: string;
	} = {}) => {
		const result = await editor.mcp.execute({
			toolName: "subtitles_translate",
			params: {
				targetLanguage: selectedTargetLanguage,
				sourceLanguage:
					selectedLanguage === "auto" ? undefined : selectedLanguage,
				subtitleTrackId: trackId,
				subtitleElementId: elementId,
			},
			onProgress: (event) => {
				if (event.status === "running") {
					dispatch({ type: "update_step", step: event.label });
				}
			},
		});
		if (result.status === "error") {
			throw new Error(result.error ?? "Subtitle translation failed");
		}
		return true;
	};

	const handleTranslateCurrentCaptions = async () => {
		dispatch({ type: "start", step: "Translating captions..." });
		try {
			await translateCaptions();
			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Subtitle translation failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleGenerateBilingualSubtitles = async () => {
		dispatch({
			type: "start",
			step: getCaptionProviderStartStep({ provider: selectedProvider }),
		});
		try {
			const transcriptResult = await editor.mcp.execute({
				toolName: "subtitles_generate_from_video",
				params: {
					source: "timeline",
					provider: selectedProvider,
					language: selectedLanguage,
					style: "clean",
					placement: "bottom",
					revealMode: "line",
					lineBreakMode: "wrap",
				},
				onProgress: (event) => {
					if (event.status === "running") {
						dispatch({ type: "update_step", step: event.label });
					}
				},
			});
			if (transcriptResult.status === "error") {
				dispatch({
					type: "fail",
					error:
						transcriptResult.error ?? "Subtitle generation failed",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Translating captions..." });
			const data = readToolData({ result: transcriptResult });
			await translateCaptions({
				trackId:
					typeof data?.trackId === "string" ? data.trackId : undefined,
				elementId:
					typeof data?.elementId === "string" ? data.elementId : undefined,
			});

			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Bilingual subtitle generation failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			if (!(await insertCaptions({ captions: result.captions }))) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const handleProviderChange = ({ value }: { value: string }) => {
		if (!isCaptionTranscriptionProvider(value)) return;
		setSelectedProvider(value);
	};

	const handleTargetLanguageChange = ({ value }: { value: string }) => {
		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedTargetLanguage(matchedLanguage.code);
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title="Captions"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="Recognition">
							<Select
								value={selectedProvider}
								onValueChange={(value) => handleProviderChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a provider" />
								</SelectTrigger>
								<SelectContent>
									{CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS.map((provider) => (
										<SelectItem key={provider.id} value={provider.id}>
											{provider.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Translate To">
							<Select
								value={selectedTargetLanguage}
								onValueChange={(value) =>
									handleTargetLanguageChange({ value })
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
					</SectionFields>

					<div className="mt-auto space-y-2">
						{isProcessing && (
							<div className="text-muted-foreground flex items-center gap-2 text-xs">
								<Spinner />
								<span>{processing.step}</span>
							</div>
						)}
						<Button
							type="button"
							className="w-full"
							onClick={handleGenerateTranscript}
							disabled={isProcessing || activeDiagnostics.length > 0}
						>
							Generate transcript
						</Button>
						<div className="space-y-2">
							<Button
								type="button"
								variant="outline"
								className="w-full"
								onClick={handleTranslateCurrentCaptions}
								disabled={isProcessing}
							>
								Translate captions
							</Button>
							<Button
								type="button"
								variant="outline"
								className="w-full"
								onClick={handleGenerateBilingualSubtitles}
								disabled={isProcessing || activeDiagnostics.length > 0}
							>
								Generate bilingual
							</Button>
						</div>
					</div>
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
