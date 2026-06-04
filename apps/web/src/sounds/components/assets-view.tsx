"use client";

import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import { useFileUpload } from "@/media/use-file-upload";
import type { MediaAsset } from "@/media/types";
import { useSoundSearch } from "@/sounds/use-sound-search";
import { useSoundsStore } from "@/sounds/sounds-store";
import type {
	SavedSound,
	SoundEffect,
	UploadedSoundAsset,
} from "@/sounds/types";
import { createAudioPreviewPlayer } from "@/sounds/audio-preview-player";
import { useUploadedSoundLibraryStore } from "@/sounds/uploaded-sound-library-store";
import {
	UPLOADED_SOUND_UPLOAD_ACCEPT,
	filterUploadedSoundAssets,
	insertUploadedSoundAsset,
	isUploadedSoundFile,
} from "@/sounds/uploaded-sounds";
import { getVoiceCloneUploadFormat } from "@/sounds/voice-clone-upload";
import type { VoiceProfile } from "@/agent/tools/voiceover/types";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import { mediaTimeFromSeconds } from "@/wasm";
import {
	FavouriteIcon,
	FilterMailIcon,
	PauseIcon,
	PlayIcon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Headphones,
	ListMusic,
	Loader2,
	Mic2,
	Pause,
	Play,
	Plus,
	RefreshCw,
	Send,
	Sparkles,
	Square,
	Trash2,
	Upload,
} from "lucide-react";
import { toast } from "sonner";

const MANUAL_SCRIPT_SOURCE_ID = "manual";
const LOCAL_CUSTOM_VOICES_KEY = "shotlyx.volcengine.custom-voices";
const DEFAULT_VOICE_PREVIEW_TEXT =
	"你好，我是 Shotlyx 的 AI 配音音色。正在为你试听这一段声音。";
const DEFAULT_VOICE_CLONE_TEXT =
	"你好，欢迎使用 Shotlyx。我正在录制自己的克隆音色，用来生成更自然的视频旁白。";
const MAX_VOICE_PREVIEW_CHARS = 64;
const VOICE_CLONE_POLL_INTERVAL_MS = 3_000;
const VOICE_CLONE_MAX_POLLS = 40;

interface VoiceListResponse {
	voices: VoiceProfile[];
	defaultVoiceId?: string;
	providerConfigured?: boolean;
	warning?: string;
}

function isVoiceListResponse(value: unknown): value is VoiceListResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"voices" in value &&
		Array.isArray(value.voices)
	);
}

function getErrorMessage(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || !("error" in value)) {
		return undefined;
	}
	return typeof value.error === "string" ? value.error : undefined;
}

interface GeneratedVoiceoverAsset {
	id: string;
	name: string;
	url: string;
	mimeType: string;
	durationSeconds?: number;
	sizeBytes?: number;
}

type VoiceCloneStatus =
	| "not_found"
	| "training"
	| "available"
	| "failed"
	| "unknown";

interface VoiceCloneResponse {
	provider: "volcengine";
	speakerId: string;
	resourceId: string;
	status: VoiceCloneStatus;
	customSpeakerId?: string;
	demoAudio?: string;
	availableTrainingTimes?: number;
}

interface VoiceRecorderSession {
	audioContext: AudioContext;
	source: MediaStreamAudioSourceNode;
	processor: ScriptProcessorNode;
	stream: MediaStream;
	chunks: Float32Array[];
	sampleRate: number;
}

function isScriptAsset(asset: MediaAsset): boolean {
	return asset.type === "subtitle" || asset.type === "text";
}

function createLocalVoiceId(): string {
	return `local:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isVoiceCloneResponse(value: unknown): value is VoiceCloneResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"speakerId" in value &&
		typeof value.speakerId === "string" &&
		"status" in value &&
		typeof value.status === "string"
	);
}

function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
	const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
	const samples = new Float32Array(sampleCount);
	let offset = 0;
	for (const chunk of chunks) {
		samples.set(chunk, offset);
		offset += chunk.length;
	}
	return samples;
}

function encodeWav({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): Blob {
	const bytesPerSample = 2;
	const blockAlign = bytesPerSample;
	const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
	const view = new DataView(buffer);
	const writeString = ({ offset, value }: { offset: number; value: string }) => {
		for (let index = 0; index < value.length; index += 1) {
			view.setUint8(offset + index, value.charCodeAt(index));
		}
	};

	writeString({ offset: 0, value: "RIFF" });
	view.setUint32(4, 36 + samples.length * bytesPerSample, true);
	writeString({ offset: 8, value: "WAVE" });
	writeString({ offset: 12, value: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true);
	writeString({ offset: 36, value: "data" });
	view.setUint32(40, samples.length * bytesPerSample, true);

	let offset = 44;
	for (const sample of samples) {
		const clamped = Math.max(-1, Math.min(1, sample));
		view.setInt16(
			offset,
			clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
			true,
		);
		offset += bytesPerSample;
	}

	return new Blob([buffer], { type: "audio/wav" });
}

function readLocalCustomVoices(): VoiceProfile[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(LOCAL_CUSTOM_VOICES_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is VoiceProfile => {
					return (
						typeof item === "object" &&
						item !== null &&
						"id" in item &&
						"speaker" in item &&
						"name" in item
					);
				})
			: [];
	} catch {
		return [];
	}
}

function writeLocalCustomVoices(voices: VoiceProfile[]) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(LOCAL_CUSTOM_VOICES_KEY, JSON.stringify(voices));
	window.dispatchEvent(new Event("shotlyx:custom-voices"));
}

function voiceLabel(voice: VoiceProfile): string {
	return voice.name === voice.speaker
		? voice.name
		: `${voice.name} · ${voice.speaker}`;
}

function cleanVoicePreviewText(value: string): string {
	const normalized = value
		.replace(/\r/g, "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => {
			if (!line) return false;
			if (/^\d+$/.test(line)) return false;
			if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(line)) return false;
			if (/^WEBVTT\b/i.test(line)) return false;
			return true;
		})
		.join(" ")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const previewText = normalized || DEFAULT_VOICE_PREVIEW_TEXT;
	return Array.from(previewText).slice(0, MAX_VOICE_PREVIEW_CHARS).join("");
}

async function parseVoicePreviewError(response: Response): Promise<string> {
	try {
		const body: unknown = await response.json();
		return getErrorMessage(body) ?? `Voice preview failed with ${response.status}`;
	} catch {
		return `Voice preview failed with ${response.status}`;
	}
}

function useVoicePreviewPlayer() {
	const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
	const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const cacheRef = useRef(new Map<string, string>());

	const stopPreview = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			audio.currentTime = 0;
			audio.onended = null;
			audio.onerror = null;
		}
		audioRef.current = null;
		setLoadingVoiceId(null);
		setPlayingVoiceId(null);
	}, []);

	useEffect(() => {
		const cachedUrls = cacheRef.current;
		return () => {
			stopPreview();
			for (const url of cachedUrls.values()) {
				URL.revokeObjectURL(url);
			}
			cachedUrls.clear();
		};
	}, [stopPreview]);

	const previewVoice = useCallback(
		async ({
			voice,
			text,
			speed = 1,
			emotion,
		}: {
			voice: VoiceProfile;
			text?: string;
			speed?: number;
			emotion?: string;
		}) => {
			if (loadingVoiceId === voice.id || playingVoiceId === voice.id) {
				stopPreview();
				return;
			}

			stopPreview();
			const previewText = cleanVoicePreviewText(text ?? "");
			const normalizedEmotion = emotion?.trim() || undefined;
			const cacheKey = JSON.stringify({
				voiceId: voice.id,
				speaker: voice.speaker,
				resourceId: voice.resourceId,
				text: previewText,
				speed,
				emotion: normalizedEmotion,
			});
			let objectUrl = cacheRef.current.get(cacheKey);

			try {
				if (!objectUrl) {
					const abortController = new AbortController();
					abortRef.current = abortController;
					setLoadingVoiceId(voice.id);

					const response = await fetch("/api/agent/voiceover", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							provider: "volcengine",
							text: previewText,
							voice: voice.speaker,
							voiceId: voice.id,
							resourceId: voice.resourceId,
							speed,
							emotion: normalizedEmotion,
							format: "mp3",
						}),
						signal: abortController.signal,
					});
					if (!response.ok) {
						throw new Error(await parseVoicePreviewError(response));
					}
					const blob = await response.blob();
					objectUrl = URL.createObjectURL(blob);
					cacheRef.current.set(cacheKey, objectUrl);
				}

				const audio = new Audio(objectUrl);
				audioRef.current = audio;
				audio.onended = () => {
					if (audioRef.current === audio) {
						audioRef.current = null;
						setPlayingVoiceId(null);
					}
				};
				audio.onerror = () => {
					if (audioRef.current === audio) {
						audioRef.current = null;
						setPlayingVoiceId(null);
					}
					toast.error("Voice preview playback failed");
				};
				setPlayingVoiceId(voice.id);
				await audio.play();
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return;
				}
				toast.error(
					error instanceof Error ? error.message : "Voice preview failed",
				);
			} finally {
				if (abortRef.current?.signal.aborted === false) {
					abortRef.current = null;
				}
				setLoadingVoiceId(null);
			}
		},
		[loadingVoiceId, playingVoiceId, stopPreview],
	);

	return {
		loadingVoiceId,
		playingVoiceId,
		previewVoice,
		stopPreview,
	};
}

function VoicePreviewButton({
	voice,
	isLoading,
	isPlaying,
	disabled,
	onClick,
}: {
	voice?: VoiceProfile;
	isLoading: boolean;
	isPlaying: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	const label = isPlaying
		? "Stop preview"
		: voice
			? `Preview ${voice.name}`
			: "Preview voice";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					onClick={onClick}
					disabled={disabled || !voice}
					aria-label={label}
				>
					{isLoading ? (
						<Loader2 className="size-4 animate-spin" />
					) : isPlaying ? (
						<Square className="size-3.5" fill="currentColor" />
					) : (
						<Headphones className="size-4" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export function SoundsView() {
	return (
		<div className="flex h-full flex-col">
			<Tabs defaultValue="voiceover" className="flex h-full flex-col">
				<div className="px-3 pt-4 pb-0">
					<TabsList>
						<TabsTrigger value="voiceover" className="px-2 text-xs">
							TTS
						</TabsTrigger>
						<TabsTrigger value="voices" className="px-2 text-xs">
							Voice
						</TabsTrigger>
						<TabsTrigger value="sound-effects" className="px-2 text-xs">
							FX
						</TabsTrigger>
						<TabsTrigger value="saved" className="px-2 text-xs">
							Saved
						</TabsTrigger>
					</TabsList>
				</div>
				<Separator className="my-4" />
				<TabsContent
					value="voiceover"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<VoiceoverWorkbench />
				</TabsContent>
				<TabsContent
					value="voices"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<VoiceCatalogView />
				</TabsContent>
				<TabsContent
					value="sound-effects"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<SoundEffectsView />
				</TabsContent>
				<TabsContent
					value="saved"
					className="mt-0 flex min-h-0 flex-1 flex-col p-5 pt-0"
				>
					<SavedSoundsView />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function useVoiceProfiles() {
	const [voices, setVoices] = useState<VoiceProfile[]>([]);
	const [customVoices, setCustomVoices] = useState<VoiceProfile[]>(() =>
		readLocalCustomVoices(),
	);
	const [defaultVoiceId, setDefaultVoiceId] = useState<string | undefined>();
	const [providerConfigured, setProviderConfigured] = useState(false);
	const [warning, setWarning] = useState<string | undefined>();
	const [isLoading, setIsLoading] = useState(false);

	const refreshCustomVoices = () => {
		setCustomVoices(readLocalCustomVoices());
	};

	const refreshVoices = async () => {
		setIsLoading(true);
		try {
			const response = await fetch("/api/agent/voiceover/voices");
			if (!response.ok) {
				throw new Error(`Voice list failed with ${response.status}`);
			}
			const data: unknown = await response.json();
			if (!isVoiceListResponse(data)) {
				throw new Error("Voice list response was invalid");
			}
			setVoices(data.voices ?? []);
			setDefaultVoiceId(data.defaultVoiceId);
			setProviderConfigured(Boolean(data.providerConfigured));
			setWarning(data.warning);
		} catch (error) {
			setVoices([]);
			setWarning(error instanceof Error ? error.message : "Voice list failed");
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		queueMicrotask(() => {
			void refreshVoices();
		});

		const handleStorage = (event: StorageEvent) => {
			if (event.key === LOCAL_CUSTOM_VOICES_KEY) refreshCustomVoices();
		};
		window.addEventListener("storage", handleStorage);
		window.addEventListener("shotlyx:custom-voices", refreshCustomVoices);
		return () => {
			window.removeEventListener("storage", handleStorage);
			window.removeEventListener("shotlyx:custom-voices", refreshCustomVoices);
		};
	}, []);

	const mergedVoices = useMemo(() => {
		const seen = new Set<string>();
		return [...voices, ...customVoices].filter((voice) => {
			const key = `${voice.resourceId ?? ""}:${voice.speaker}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}, [customVoices, voices]);

	return {
		voices: mergedVoices,
		defaultVoiceId,
		providerConfigured,
		warning,
		isLoading,
		refreshVoices,
		customVoices,
		setCustomVoices,
	};
}

function VoiceoverWorkbench() {
	const editor = useEditor();
	const activeProject = useEditor((currentEditor) =>
		currentEditor.project.getActiveOrNull(),
	);
	const scriptAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets().filter(isScriptAsset),
	);
	const {
		voices,
		defaultVoiceId,
		providerConfigured,
		warning,
		isLoading,
		refreshVoices,
	} = useVoiceProfiles();
	const [selectedVoiceId, setSelectedVoiceId] = useState("");
	const [scriptSourceId, setScriptSourceId] = useState(MANUAL_SCRIPT_SOURCE_ID);
	const [script, setScript] = useState("");
	const [speed, setSpeed] = useState(1);
	const [emotion, setEmotion] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [generatedAsset, setGeneratedAsset] =
		useState<GeneratedVoiceoverAsset | null>(null);
	const { loadingVoiceId, playingVoiceId, previewVoice } =
		useVoicePreviewPlayer();

	useEffect(() => {
		if (scriptSourceId === MANUAL_SCRIPT_SOURCE_ID) return;
		const asset = scriptAssets.find((item) => item.id === scriptSourceId);
		if (!asset) return;
		let shouldIgnore = false;
		asset.file
			.text()
			.then((text) => {
				if (!shouldIgnore) setScript(text);
			})
			.catch((error) => {
				if (!shouldIgnore) {
					toast.error(
						error instanceof Error ? error.message : "Could not read script",
					);
				}
			});
		return () => {
			shouldIgnore = true;
		};
	}, [scriptAssets, scriptSourceId]);

	const effectiveSelectedVoiceId =
		selectedVoiceId ||
		voices.find((voice) => voice.id === defaultVoiceId)?.id ||
		voices[0]?.id ||
		"";
	const selectedVoice = voices.find(
		(voice) => voice.id === effectiveSelectedVoiceId,
	);

	const addAssetToTimeline = ({
		asset,
	}: {
		asset: GeneratedVoiceoverAsset;
	}) => {
		const duration = mediaTimeFromSeconds({
			seconds: asset.durationSeconds ?? 5,
		});
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: "audio",
			name: asset.name,
			duration,
			startTime: editor.playback.getCurrentTime(),
		});
		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "audio" },
			element,
		});
	};

	const generateVoiceover = async ({ insert }: { insert: boolean }) => {
		const text = script.trim();
		if (!text) {
			toast.error("Add a script first");
			return;
		}
		if (!activeProject) {
			toast.error("Open a project first");
			return;
		}

		setIsGenerating(true);
		try {
			const response = await fetch("/api/agent/voiceover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "volcengine",
					text,
					voice: selectedVoice?.speaker,
					voiceId: selectedVoice?.id,
					resourceId: selectedVoice?.resourceId,
					speed,
					emotion: emotion.trim() || undefined,
					format: "mp3",
				}),
			});
			if (!response.ok) {
				const error: unknown = await response.json().catch(() => null);
				throw new Error(
					getErrorMessage(error) ?? `Voiceover failed with ${response.status}`,
				);
			}

			const blob = await response.blob();
			const filename =
				response.headers.get("x-voiceover-filename") ?? "voiceover.mp3";
			const file = new File([blob], filename, {
				type: blob.type || "audio/mpeg",
			});
			const processed = await processMediaAssets({ files: [file] });
			const mediaAsset = processed[0];
			if (!mediaAsset) {
				throw new Error("Could not process generated audio");
			}
			const saved = await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset: mediaAsset,
			});
			if (!saved) {
				throw new Error("Could not save generated audio");
			}

			const nextAsset: GeneratedVoiceoverAsset = {
				id: saved.id,
				name: saved.name,
				url: saved.url ?? "",
				mimeType: file.type || "audio/mpeg",
				durationSeconds: saved.duration,
				sizeBytes: file.size,
			};
			setGeneratedAsset(nextAsset);
			if (insert) addAssetToTimeline({ asset: nextAsset });
			toast.success(insert ? "Voiceover added to timeline" : "Voiceover saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Voiceover generation failed",
			);
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 pb-1">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
						<Mic2 className="size-4" />
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">Agent voiceover</p>
						<p className="text-muted-foreground truncate text-xs">
							{providerConfigured
								? "Volcengine ready"
								: "Volcengine key missing"}
						</p>
					</div>
				</div>
				<Button
					variant="outline"
					size="icon"
					onClick={() => void refreshVoices()}
					disabled={isLoading}
					title="Refresh voices"
				>
					<RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
				</Button>
			</div>

			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-2">
					<span className="text-muted-foreground text-xs font-medium">
						Voice
					</span>
					<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
						<Select
							value={effectiveSelectedVoiceId}
							onValueChange={setSelectedVoiceId}
						>
							<SelectTrigger className="h-9 w-full">
								<SelectValue placeholder="Select voice" />
							</SelectTrigger>
							<SelectContent>
								{voices.map((voice) => (
									<SelectItem key={voice.id} value={voice.id}>
										{voiceLabel(voice)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<VoicePreviewButton
							voice={selectedVoice}
							isLoading={loadingVoiceId === selectedVoice?.id}
							isPlaying={playingVoiceId === selectedVoice?.id}
							disabled={isGenerating}
							onClick={() => {
								if (!selectedVoice) return;
								void previewVoice({
									voice: selectedVoice,
									text: script,
									speed,
									emotion,
								});
							}}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<span className="text-muted-foreground text-xs font-medium">
						Script
					</span>
					<Select value={scriptSourceId} onValueChange={setScriptSourceId}>
						<SelectTrigger className="h-9 w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={MANUAL_SCRIPT_SOURCE_ID}>Manual</SelectItem>
							{scriptAssets.map((asset) => (
								<SelectItem key={asset.id} value={asset.id}>
									{asset.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<Textarea
				value={script}
				onChange={({ currentTarget }) => {
					setScriptSourceId(MANUAL_SCRIPT_SOURCE_ID);
					setScript(currentTarget.value);
				}}
				placeholder="Paste SRT text or voiceover script"
				className="min-h-28 resize-none leading-6"
			/>

			<div className="grid grid-cols-[1fr_auto] gap-2">
				<Button
					variant="outline"
					onClick={() => void generateVoiceover({ insert: false })}
					disabled={isGenerating}
				>
					<Sparkles className="size-4" />
					Generate
				</Button>
				<Button
					onClick={() => void generateVoiceover({ insert: true })}
					disabled={isGenerating}
				>
					<Send className="size-4" />
					Add
				</Button>
			</div>

			<div className="flex flex-col gap-3 rounded-md border border-border/70 bg-accent/40 p-2.5">
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground text-xs font-medium">
						Speed
					</span>
					<span className="text-xs tabular-nums">{speed.toFixed(2)}x</span>
				</div>
				<Slider
					value={[speed]}
					min={0.5}
					max={1.8}
					step={0.05}
					onValueChange={(value) => setSpeed(value[0] ?? 1)}
				/>
				<Input
					value={emotion}
					onChange={({ currentTarget }) => setEmotion(currentTarget.value)}
					placeholder="Emotion, optional"
					className="h-9"
				/>
			</div>

			{warning && (
				<p className="text-caution line-clamp-2 text-xs">{warning}</p>
			)}
			{generatedAsset && (
				<div className="border-primary/25 bg-primary/5 flex items-center justify-between gap-3 rounded-md border px-3 py-2">
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">
							{generatedAsset.name}
						</p>
						<p className="text-muted-foreground text-xs">
							{generatedAsset.durationSeconds
								? `${generatedAsset.durationSeconds.toFixed(1)}s`
								: "Saved to assets"}
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => addAssetToTimeline({ asset: generatedAsset })}
					>
						<Plus className="size-4" />
						Add
					</Button>
				</div>
			)}
		</div>
	);
}

function VoiceCatalogView() {
	const { voices, isLoading, refreshVoices, customVoices, setCustomVoices } =
		useVoiceProfiles();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [manualName, setManualName] = useState("");
	const [manualSpeaker, setManualSpeaker] = useState("");
	const [manualResourceId, setManualResourceId] = useState("seed-icl-2.0");
	const [cloneName, setCloneName] = useState("");
	const [cloneSpeakerId, setCloneSpeakerId] = useState("");
	const [cloneText, setCloneText] = useState(DEFAULT_VOICE_CLONE_TEXT);
	const [recordingState, setRecordingState] = useState<
		"idle" | "recording" | "ready"
	>("idle");
	const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
	const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
	const [recordedDuration, setRecordedDuration] = useState(0);
	const [sampleAudioFormat, setSampleAudioFormat] = useState("wav");
	const [sampleFileName, setSampleFileName] = useState("shotlyx-voice-clone.wav");
	const [cloneProgress, setCloneProgress] = useState(0);
	const [cloneStage, setCloneStage] = useState("");
	const [isCloning, setIsCloning] = useState(false);
	const [cloneDemoAudio, setCloneDemoAudio] = useState<string | null>(null);
	const [samplePreviewUrl, setSamplePreviewUrl] = useState<string | null>(null);
	const [demoPreviewUrl, setDemoPreviewUrl] = useState<string | null>(null);
	const recorderRef = useRef<VoiceRecorderSession | null>(null);
	const recordedAudioUrlRef = useRef<string | null>(null);
	const uploadInputRef = useRef<HTMLInputElement | null>(null);
	const samplePreviewPlayer = useMemo(
		() =>
			createAudioPreviewPlayer({
				onPlayingChange: setSamplePreviewUrl,
			}),
		[],
	);
	const demoPreviewPlayer = useMemo(
		() =>
			createAudioPreviewPlayer({
				onPlayingChange: setDemoPreviewUrl,
			}),
		[],
	);
	const { loadingVoiceId, playingVoiceId, previewVoice } =
		useVoicePreviewPlayer();

	const cleanupRecorder = useCallback(() => {
		const session = recorderRef.current;
		if (!session) return;
		session.processor.disconnect();
		session.source.disconnect();
		session.stream.getTracks().forEach((track) => track.stop());
		void session.audioContext.close();
		recorderRef.current = null;
	}, []);

	const setRecordedAudio = useCallback(
		({
			blob,
			audioFormat = "wav",
			fileName = "shotlyx-voice-clone.wav",
		}: {
			blob: Blob | null;
			audioFormat?: string;
			fileName?: string;
		}) => {
			samplePreviewPlayer.stop();
			if (recordedAudioUrlRef.current) {
				URL.revokeObjectURL(recordedAudioUrlRef.current);
				recordedAudioUrlRef.current = null;
			}
			setRecordedBlob(blob);
			setSampleAudioFormat(audioFormat);
			setSampleFileName(fileName);
			if (!blob) {
				setRecordedAudioUrl(null);
				setRecordedDuration(0);
				return;
			}
			const nextUrl = URL.createObjectURL(blob);
			recordedAudioUrlRef.current = nextUrl;
			setRecordedAudioUrl(nextUrl);
		},
		[samplePreviewPlayer],
	);

	useEffect(() => {
		return () => {
			samplePreviewPlayer.stop();
			demoPreviewPlayer.stop();
			cleanupRecorder();
			if (recordedAudioUrlRef.current) {
				URL.revokeObjectURL(recordedAudioUrlRef.current);
			}
		};
	}, [cleanupRecorder, demoPreviewPlayer, samplePreviewPlayer]);

	const persistClonedVoice = useCallback(
		({
			result,
			displayName,
		}: {
			result: VoiceCloneResponse;
			displayName: string;
		}) => {
			const nextVoice: VoiceProfile = {
				id: createLocalVoiceId(),
				name: displayName.trim() || result.speakerId,
				provider: "volcengine",
				kind: "cloned",
				speaker: result.speakerId,
				resourceId: result.resourceId || "seed-icl-2.0",
				locale: "zh-CN",
				status: "available",
				previewUrl: result.demoAudio,
			};
			const nextVoices = [
				...customVoices.filter(
					(voice) =>
						voice.speaker !== nextVoice.speaker ||
						voice.resourceId !== nextVoice.resourceId,
				),
				nextVoice,
			];
			setCustomVoices(nextVoices);
			writeLocalCustomVoices(nextVoices);
		},
		[customVoices, setCustomVoices],
	);

	const addCustomVoice = () => {
		const nextSpeaker = manualSpeaker.trim();
		if (!nextSpeaker) {
			toast.error("Speaker ID is required");
			return;
		}
		const nextVoices = [
			...customVoices.filter(
				(voice) =>
					voice.speaker !== nextSpeaker ||
					voice.resourceId !== (manualResourceId.trim() || "seed-icl-2.0"),
			),
			{
				id: createLocalVoiceId(),
				name: manualName.trim() || nextSpeaker,
				provider: "volcengine",
				kind: "cloned",
				speaker: nextSpeaker,
				resourceId: manualResourceId.trim() || "seed-icl-2.0",
				locale: "zh-CN",
				status: "available",
			} satisfies VoiceProfile,
		];
		setCustomVoices(nextVoices);
		writeLocalCustomVoices(nextVoices);
		setManualName("");
		setManualSpeaker("");
		setManualResourceId("seed-icl-2.0");
		setIsDialogOpen(false);
	};

	const startRecording = async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			toast.error("Microphone recording is not available");
			return;
		}
		try {
			cleanupRecorder();
			setRecordedAudio({ blob: null });
			demoPreviewPlayer.stop();
			setCloneDemoAudio(null);
			setCloneProgress(0);
			setCloneStage("");
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});
			const audioWindow: Window & {
				webkitAudioContext?: typeof AudioContext;
			} = window;
			const AudioContextCtor =
				window.AudioContext ?? audioWindow.webkitAudioContext;
			if (!AudioContextCtor) {
				throw new Error("Audio recording is not available");
			}
			const audioContext = new AudioContextCtor();
			const source = audioContext.createMediaStreamSource(stream);
			const processor = audioContext.createScriptProcessor(4096, 1, 1);
			const chunks: Float32Array[] = [];
			processor.onaudioprocess = (event) => {
				chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
			};
			source.connect(processor);
			processor.connect(audioContext.destination);
			recorderRef.current = {
				audioContext,
				source,
				processor,
				stream,
				chunks,
				sampleRate: audioContext.sampleRate,
			};
			setRecordingState("recording");
			toast.success("Recording started");
		} catch (error) {
			cleanupRecorder();
			toast.error(
				error instanceof Error ? error.message : "Microphone recording failed",
			);
		}
	};

	const stopRecording = () => {
		const session = recorderRef.current;
		if (!session) return;
		const { chunks, sampleRate } = session;
		cleanupRecorder();
		if (chunks.length === 0) {
			setRecordingState("idle");
			toast.error("No voice sample was captured");
			return;
		}
		const samples = mergeFloat32Chunks(chunks);
		const nextBlob = encodeWav({ samples, sampleRate });
		setRecordedDuration(samples.length / sampleRate);
		setRecordedAudio({
			blob: nextBlob,
			audioFormat: "wav",
			fileName: "shotlyx-voice-clone.wav",
		});
		setRecordingState("ready");
		toast.success("Voice sample recorded");
	};

	const handleSampleUpload = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = "";
		if (!file) return;
		if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
			toast.error("Voice sample must be between 1 byte and 10MB");
			return;
		}
		cleanupRecorder();
		demoPreviewPlayer.stop();
		const audioFormat = getVoiceCloneUploadFormat({
			fileName: file.name,
			mimeType: file.type,
		});
		setRecordedAudio({
			blob: file,
			audioFormat,
			fileName: file.name || `shotlyx-voice-clone.${audioFormat}`,
		});
		setRecordedDuration(0);
		setRecordingState("ready");
		setCloneDemoAudio(null);
		setCloneProgress(0);
		setCloneStage("");
		toast.success("Voice sample uploaded");
	};

	const playRecordedAudio = async () => {
		if (!recordedAudioUrl) return;
		try {
			await samplePreviewPlayer.toggle(recordedAudioUrl);
		} catch {
			toast.error("Voice sample playback failed");
		}
	};

	const playCloneDemoAudio = async () => {
		if (!cloneDemoAudio) return;
		try {
			await demoPreviewPlayer.toggle(cloneDemoAudio);
		} catch {
			toast.error("Clone demo playback failed");
		}
	};

	const fetchCloneStatus = async ({
		speakerId,
		customSpeakerId,
	}: {
		speakerId: string;
		customSpeakerId?: string;
	}): Promise<VoiceCloneResponse> => {
		const response = await fetch("/api/agent/voiceover/clone/status", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ speakerId, customSpeakerId }),
		});
		const data: unknown = await response.json();
		if (!response.ok) {
			throw new Error(getErrorMessage(data) ?? "Voice clone status failed");
		}
		if (!isVoiceCloneResponse(data)) {
			throw new Error("Voice clone status response was invalid");
		}
		return data;
	};

	const waitForClone = async (initial: VoiceCloneResponse) => {
		let latest = initial;
		for (let index = 0; index < VOICE_CLONE_MAX_POLLS; index += 1) {
			if (latest.status === "available") return latest;
			if (latest.status === "failed") {
				throw new Error("Voice clone training failed");
			}
			setCloneProgress(Math.min(90, 45 + index * 2));
			setCloneStage(
				latest.availableTrainingTimes !== undefined
					? `Training voice · ${latest.availableTrainingTimes} tries left`
					: "Training voice",
			);
			await sleep(VOICE_CLONE_POLL_INTERVAL_MS);
			latest = await fetchCloneStatus({
				speakerId: latest.speakerId,
				customSpeakerId: latest.customSpeakerId,
			});
			if (latest.demoAudio) setCloneDemoAudio(latest.demoAudio);
		}
		throw new Error("Voice clone is still training");
	};

	const submitClone = async () => {
		if (!recordedBlob) {
			toast.error("Record a voice sample first");
			return;
		}
		setIsCloning(true);
		setCloneProgress(20);
		setCloneStage("Uploading voice sample");
		samplePreviewPlayer.stop();
		demoPreviewPlayer.stop();
		setCloneDemoAudio(null);
		try {
			const form = new FormData();
			const nextName = cloneName.trim() || "Cloned voice";
			const nextSpeaker = cloneSpeakerId.trim();
			form.set("name", nextName);
			if (nextSpeaker) form.set("speakerId", nextSpeaker);
			form.set("text", cloneText.trim() || DEFAULT_VOICE_CLONE_TEXT);
			form.set(
				"demoText",
				Array.from(cloneText.trim() || DEFAULT_VOICE_CLONE_TEXT)
					.slice(0, 120)
					.join(""),
			);
			form.set("language", "0");
			form.set("audioFormat", sampleAudioFormat);
			form.set(
				"audio",
				new File([recordedBlob], sampleFileName, {
					type: recordedBlob.type || `audio/${sampleAudioFormat}`,
				}),
			);

			const response = await fetch("/api/agent/voiceover/clone", {
				method: "POST",
				body: form,
			});
			const data: unknown = await response.json();
			if (!response.ok) {
				throw new Error(getErrorMessage(data) ?? "Voice clone failed");
			}
			if (!isVoiceCloneResponse(data)) {
				throw new Error("Voice clone response was invalid");
			}
			setCloneProgress(45);
			setCloneStage("Training voice");
			if (data.demoAudio) setCloneDemoAudio(data.demoAudio);
			const readyVoice = await waitForClone(data);
			if (readyVoice.demoAudio) setCloneDemoAudio(readyVoice.demoAudio);
			persistClonedVoice({ result: readyVoice, displayName: nextName });
			setCloneProgress(100);
			setCloneStage("Voice ready");
			toast.success("Cloned voice added");
			void refreshVoices();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Voice clone failed",
			);
			setCloneStage("Clone failed");
		} finally {
			setIsCloning(false);
		}
	};

	const handleDialogOpenChange = (open: boolean) => {
		setIsDialogOpen(open);
		if (!open) {
			samplePreviewPlayer.stop();
			demoPreviewPlayer.stop();
			if (recordingState === "recording") {
				cleanupRecorder();
				setRecordingState(recordedBlob ? "ready" : "idle");
			}
		}
	};

	const sampleStatusLabel = cloneStage
		? cloneStage
		: recordedBlob
			? recordedDuration > 0
				? `${recordedDuration.toFixed(1)}s sample · ${sampleAudioFormat}`
				: `${sampleFileName} · ${sampleAudioFormat}`
			: "Ready";
	const isSamplePreviewPlaying =
		Boolean(recordedAudioUrl) && samplePreviewUrl === recordedAudioUrl;
	const isDemoPreviewPlaying =
		Boolean(cloneDemoAudio) && demoPreviewUrl === cloneDemoAudio;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
						<ListMusic className="size-4" />
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">Voices</p>
						<p className="text-muted-foreground text-xs">
							{voices.length} available
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={() => void refreshVoices()}
						disabled={isLoading}
						title="Refresh voices"
					>
						<RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
					</Button>
					<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
						<DialogTrigger asChild>
							<Button variant="outline" size="icon" title="Add voice">
								<Plus className="size-4" />
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Add cloned voice</DialogTitle>
								<DialogDescription>
									Volcengine cloned voice.
								</DialogDescription>
							</DialogHeader>
							<Tabs defaultValue="record" className="flex flex-col gap-4">
								<TabsList className="grid grid-cols-2">
									<TabsTrigger value="record">
										<Mic2 className="size-4" />
										Record
									</TabsTrigger>
									<TabsTrigger value="import">
										<Plus className="size-4" />
										Import ID
									</TabsTrigger>
								</TabsList>
								<TabsContent value="record" className="mt-0 flex flex-col gap-4">
									<div className="grid grid-cols-2 gap-3">
										<div className="flex flex-col gap-2">
											<Label>Display name</Label>
											<Input
												value={cloneName}
												onChange={({ currentTarget }) =>
													setCloneName(currentTarget.value)
												}
												placeholder="My voice"
											/>
										</div>
										<div className="flex flex-col gap-2">
											<Label>SpeakerID slot</Label>
											<Input
												value={cloneSpeakerId}
												onChange={({ currentTarget }) =>
													setCloneSpeakerId(currentTarget.value)
												}
												placeholder="Optional S_xxx"
											/>
										</div>
									</div>
									<div className="flex flex-col gap-2">
										<Label>Read aloud</Label>
										<Textarea
											value={cloneText}
											onChange={({ currentTarget }) =>
												setCloneText(currentTarget.value)
											}
											className="min-h-20 resize-none"
										/>
									</div>
									<input
										ref={uploadInputRef}
										type="file"
										accept=".wav,.mp3,.ogg,.m4a,.aac,.pcm,audio/wav,audio/mpeg,audio/ogg,audio/mp4,audio/aac"
										className="hidden"
										onChange={handleSampleUpload}
									/>
									<div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
										<Button
											variant={
												recordingState === "recording"
													? "destructive"
													: "outline"
											}
											onClick={() =>
												recordingState === "recording"
													? stopRecording()
													: void startRecording()
											}
											disabled={isCloning}
										>
											{recordingState === "recording" ? (
												<Square className="size-4" />
											) : (
												<Mic2 className="size-4" />
											)}
											{recordingState === "recording" ? "Stop" : "Record"}
										</Button>
										<Button
											variant="outline"
											onClick={() => uploadInputRef.current?.click()}
											disabled={isCloning || recordingState === "recording"}
										>
											<Upload className="size-4" />
											Upload
										</Button>
										<Button
											variant="outline"
											size="icon"
											onClick={() => void playRecordedAudio()}
											disabled={
												!recordedAudioUrl || recordingState === "recording"
											}
											title={
												isSamplePreviewPlaying
													? "Stop sample"
													: "Preview sample"
											}
										>
											{isSamplePreviewPlaying ? (
												<Pause className="size-4" />
											) : (
												<Play className="size-4" />
											)}
										</Button>
										<Button
											onClick={() => void submitClone()}
											disabled={
												!recordedBlob ||
												isCloning ||
												recordingState === "recording"
											}
										>
											{isCloning ? (
												<Loader2 className="size-4 animate-spin" />
											) : (
												<Sparkles className="size-4" />
											)}
											Clone
										</Button>
									</div>
									<div className="flex min-h-10 flex-col gap-2">
										<div className="flex items-center justify-between gap-3">
											<span className="text-muted-foreground truncate text-xs">
												{sampleStatusLabel}
											</span>
											{cloneDemoAudio && (
												<Button
													variant="text"
													size="sm"
													onClick={() => void playCloneDemoAudio()}
												>
													{isDemoPreviewPlaying ? (
														<Pause className="size-4" />
													) : (
														<Play className="size-4" />
													)}
													Demo
												</Button>
											)}
										</div>
										{cloneProgress > 0 && (
											<Progress value={cloneProgress} className="h-1.5" />
										)}
									</div>
								</TabsContent>
								<TabsContent value="import" className="mt-0 flex flex-col gap-3">
									<Input
										value={manualName}
										onChange={({ currentTarget }) =>
											setManualName(currentTarget.value)
										}
										placeholder="Display name"
									/>
									<Input
										value={manualSpeaker}
										onChange={({ currentTarget }) =>
											setManualSpeaker(currentTarget.value)
										}
										placeholder="SpeakerID, e.g. S_xxx or icl_xxx"
									/>
									<Input
										value={manualResourceId}
										onChange={({ currentTarget }) =>
											setManualResourceId(currentTarget.value)
										}
										placeholder="Resource ID"
									/>
									<DialogFooter>
										<Button
											variant="text"
											onClick={() => setIsDialogOpen(false)}
										>
											Cancel
										</Button>
										<Button onClick={addCustomVoice}>Add voice</Button>
									</DialogFooter>
								</TabsContent>
							</Tabs>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-2">
					{voices.map((voice) => (
						<div
							key={voice.id}
							className="border-border/70 bg-accent/35 flex items-center justify-between gap-3 rounded-md border p-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{voice.name}</p>
								<p className="text-muted-foreground truncate text-xs">
									{voice.speaker}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<VoicePreviewButton
									voice={voice}
									isLoading={loadingVoiceId === voice.id}
									isPlaying={playingVoiceId === voice.id}
									onClick={() => {
										void previewVoice({ voice });
									}}
								/>
								<span className="bg-background text-muted-foreground rounded px-2 py-1 text-xs">
									{voice.kind}
								</span>
								{voice.status && (
									<span className="bg-background text-muted-foreground rounded px-2 py-1 text-xs">
										{voice.status}
									</span>
								)}
							</div>
						</div>
					))}
					{!isLoading && voices.length === 0 && (
						<div className="text-muted-foreground py-10 text-center text-sm">
							No voices found
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

function SoundEffectsView() {
	const {
		topSoundEffects,
		isLoading,
		searchQuery,
		setSearchQuery,
		scrollPosition,
		setScrollPosition,
		loadSavedSounds,
		showCommercialOnly,
		toggleCommercialFilter,
		hasLoaded,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	} = useSoundsStore();
	const {
		addProcessedAssets,
		isLoaded: isUploadedSoundsLoaded,
		isLoading: isUploadedSoundsLoading,
		items: uploadedSounds,
		loadItems: loadUploadedSounds,
	} = useUploadedSoundLibraryStore();
	const {
		results: searchResults,
		isLoading: isSearching,
		loadMore,
		hasNextPage,
		isLoadingMore,
	} = useSoundSearch({
		query: searchQuery,
		commercialOnly: showCommercialOnly,
	});

	const [playingKey, setPlayingKey] = useState<string | null>(null);
	const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
		null,
	);
	const [isProcessingUpload, setIsProcessingUpload] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);

	const { scrollAreaRef, handleScroll } = useInfiniteScroll({
		onLoadMore: loadMore,
		hasMore: hasNextPage,
		isLoading: isLoadingMore || isSearching,
	});

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	useEffect(() => {
		void loadUploadedSounds();
	}, [loadUploadedSounds]);

	useEffect(() => {
		if (hasLoaded) {
			return;
		}

		let shouldIgnore = false;

		const fetchTopSounds = async () => {
			try {
				if (!shouldIgnore) {
					setLoading({ loading: true });
					setError({ error: null });
				}

				const response = await fetch(
					"/api/sounds/search?page_size=50&sort=downloads",
				);

				if (!shouldIgnore) {
					if (!response.ok) {
						throw new Error(`Failed to fetch: ${response.status}`);
					}

					const data = await response.json();
					setTopSoundEffects({ sounds: data.results });
					setHasLoaded({ loaded: true });

					setCurrentPage({ page: 1 });
					setHasNextPage({ hasNext: !!data.next });
					setTotalCount({ count: data.count });
				}
			} catch (error) {
				if (!shouldIgnore) {
					console.error("Failed to fetch top sounds:", error);
					setError({
						error:
							error instanceof Error ? error.message : "Failed to load sounds",
					});
				}
			} finally {
				if (!shouldIgnore) {
					setLoading({ loading: false });
				}
			}
		};

		const timeoutId = setTimeout(fetchTopSounds, 100, {});

		return () => {
			shouldIgnore = true;
			clearTimeout(timeoutId);
		};
	}, [
		hasLoaded,
		setTopSoundEffects,
		setLoading,
		setError,
		setHasLoaded,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
	]);

	useEffect(() => {
		if (!scrollAreaRef.current || scrollPosition <= 0) {
			return;
		}

		const restoreScrollPosition = () => {
			scrollAreaRef.current?.scrollTo({ top: scrollPosition });
		};

		const timeoutId = setTimeout(restoreScrollPosition, 100, {});

		return () => clearTimeout(timeoutId);
	}, [scrollPosition, scrollAreaRef]);

	const handleScrollWithPosition = (event: React.UIEvent<HTMLDivElement>) => {
		const { scrollTop } = event.currentTarget;
		setScrollPosition({ position: scrollTop });
		handleScroll(event);
	};

	const displayedSounds = searchQuery ? searchResults : topSoundEffects;
	const displayedUploadedSounds = filterUploadedSoundAssets({
		items: uploadedSounds,
		query: searchQuery,
	});
	const isUploadedSectionLoading =
		isUploadedSoundsLoading || !isUploadedSoundsLoaded;

	const processUploadedSoundFiles = async ({ files }: { files: File[] }) => {
		if (!files.length) return;

		const acceptedFiles = files.filter((file) => isUploadedSoundFile({ file }));
		if (!acceptedFiles.length) {
			toast.error("Upload an audio file");
			return;
		}

		setIsProcessingUpload(true);
		setUploadProgress(0);
		try {
			await showMediaUploadToast({
				filesCount: acceptedFiles.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({
						files: acceptedFiles,
						onProgress: ({ progress }) => setUploadProgress(progress),
					});
					const savedSounds = await addProcessedAssets({
						assets: processedAssets,
					});
					return {
						uploadedCount: savedSounds.length,
						assetNames: savedSounds.map((sound) => sound.name),
					};
				},
			});
		} catch (error) {
			console.error("Failed to upload sound effects:", error);
		} finally {
			setIsProcessingUpload(false);
			setUploadProgress(0);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: UPLOADED_SOUND_UPLOAD_ACCEPT,
			multiple: true,
			onFilesSelected: (files) => void processUploadedSoundFiles({ files }),
		});

	const playSound = ({ sound }: { sound: SoundEffect }) => {
		const key = `sound:${sound.id}`;
		if (playingKey === key) {
			audioElement?.pause();
			setPlayingKey(null);
			return;
		}

		audioElement?.pause();

		if (sound.previewUrl) {
			const audio = new Audio(sound.previewUrl);
			audio.addEventListener("ended", () => {
				setPlayingKey(null);
			});
			audio.addEventListener("error", () => {
				setPlayingKey(null);
			});
			audio.play().catch((error) => {
				console.error("Failed to play sound preview:", error);
				setPlayingKey(null);
			});

			setAudioElement(audio);
			setPlayingKey(key);
		}
	};

	const playUploadedSound = ({ sound }: { sound: UploadedSoundAsset }) => {
		const key = `uploaded:${sound.id}`;
		if (playingKey === key) {
			audioElement?.pause();
			setPlayingKey(null);
			return;
		}

		audioElement?.pause();

		if (sound.url) {
			const audio = new Audio(sound.url);
			audio.addEventListener("ended", () => {
				setPlayingKey(null);
			});
			audio.addEventListener("error", () => {
				setPlayingKey(null);
			});
			audio.play().catch((error) => {
				console.error("Failed to play uploaded sound preview:", error);
				setPlayingKey(null);
			});

			setAudioElement(audio);
			setPlayingKey(key);
		}
	};

	return (
		<div className="mt-1 flex h-full flex-col gap-5">
			<input {...fileInputProps} />
			<div className="flex items-center gap-3">
				<Input
					placeholder="Search sound effects"
					className="w-full"
					containerClassName="w-full"
					value={searchQuery}
					onChange={({ currentTarget }) =>
						setSearchQuery({ query: currentTarget.value })
					}
					showClearIcon
					onClear={() => setSearchQuery({ query: "" })}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="text"
							size="icon"
							className={cn(showCommercialOnly && "text-primary")}
						>
							<HugeiconsIcon icon={FilterMailIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuCheckboxItem
							checked={showCommercialOnly}
							onCheckedChange={() => toggleCommercialFilter()}
						>
							Show only commercially licensed
						</DropdownMenuCheckboxItem>
						<div className="text-muted-foreground px-2 py-1.5 text-xs">
							{showCommercialOnly
								? "Only showing sounds licensed for commercial use"
								: "Showing all sounds regardless of license"}
						</div>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="relative h-full overflow-hidden">
				<ScrollArea
					className="h-full flex-1"
					ref={scrollAreaRef}
					onScrollCapture={handleScrollWithPosition}
				>
					<div className="flex flex-col gap-4">
						<UploadedSoundUploadPanel
							isDragOver={isDragOver}
							isProcessing={isProcessingUpload}
							progress={uploadProgress}
							onUpload={openFilePicker}
							dragProps={dragProps}
						/>
						{isUploadedSectionLoading ? (
							<div className="text-muted-foreground text-sm">
								Loading uploaded sounds...
							</div>
						) : displayedUploadedSounds.length > 0 ? (
							<UploadedSoundSection
								items={displayedUploadedSounds}
								playingKey={playingKey}
								onPlay={playUploadedSound}
							/>
						) : null}
						{isLoading && !searchQuery && (
							<div className="text-muted-foreground text-sm">
								Loading sounds...
							</div>
						)}
						{isSearching && searchQuery && (
							<div className="text-muted-foreground text-sm">Searching...</div>
						)}
						{displayedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={sound}
								isPlaying={playingKey === `sound:${sound.id}`}
								onPlay={playSound}
							/>
						))}
						{!isLoading &&
							!isSearching &&
							displayedSounds.length === 0 &&
							displayedUploadedSounds.length === 0 && (
								<div className="text-muted-foreground text-sm">
									{searchQuery ? "No sounds found" : "No sounds available"}
								</div>
							)}
						{isLoadingMore && (
							<div className="text-muted-foreground py-4 text-center text-sm">
								Loading more sounds...
							</div>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

function UploadedSoundUploadPanel({
	isDragOver,
	isProcessing,
	progress,
	onUpload,
	dragProps,
}: {
	isDragOver: boolean;
	isProcessing: boolean;
	progress: number;
	onUpload: () => void;
	dragProps: ReturnType<typeof useFileUpload>["dragProps"];
}) {
	return (
		<div
			className={cn(
				"border-border bg-muted/20 flex min-h-16 items-center justify-between gap-3 rounded-md border border-dashed p-3",
				isDragOver && "border-primary bg-primary/10",
			)}
			{...dragProps}
		>
			<div className="flex min-w-0 items-center gap-2">
				<div className="bg-background flex size-9 shrink-0 items-center justify-center rounded-md">
					<Upload className="text-muted-foreground size-4" />
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">
						{isProcessing ? `Uploading ${progress}%` : "Upload FX"}
					</p>
					<p className="text-muted-foreground truncate text-xs">
						Audio files are saved globally
					</p>
				</div>
			</div>
			<Button
				type="button"
				size="sm"
				variant="secondary"
				onClick={onUpload}
				disabled={isProcessing}
				className="shrink-0 gap-1.5"
			>
				{isProcessing ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<Upload className="size-4" />
				)}
				Upload
			</Button>
		</div>
	);
}

function UploadedSoundSection({
	items,
	playingKey,
	onPlay,
}: {
	items: UploadedSoundAsset[];
	playingKey: string | null;
	onPlay: ({ sound }: { sound: UploadedSoundAsset }) => void;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<p className="text-xs text-muted-foreground">Uploaded FX</p>
				<span className="text-xs text-muted-foreground">{items.length}</span>
			</div>
			<div className="flex flex-col gap-3">
				{items.map((sound) => (
					<UploadedSoundItem
						key={sound.id}
						sound={sound}
						isPlaying={playingKey === `uploaded:${sound.id}`}
						onPlay={onPlay}
					/>
				))}
			</div>
		</div>
	);
}

function UploadedSoundItem({
	sound,
	isPlaying,
	onPlay,
}: {
	sound: UploadedSoundAsset;
	isPlaying: boolean;
	onPlay: ({ sound }: { sound: UploadedSoundAsset }) => void;
}) {
	const editor = useEditor();
	const { removeItem } = useUploadedSoundLibraryStore();
	const [isAdding, setIsAdding] = useState(false);

	const handleAddToTimeline = async ({
		stopPropagation,
	}: React.MouseEvent<HTMLButtonElement>) => {
		stopPropagation();
		setIsAdding(true);
		try {
			await insertUploadedSoundAsset({
				editor,
				item: sound,
				startTime: editor.playback.getCurrentTime(),
			});
		} catch (error) {
			console.error("Failed to add uploaded sound to timeline:", error);
			toast.error("Failed to add sound to timeline");
		} finally {
			setIsAdding(false);
		}
	};

	const handleRemove = async ({
		stopPropagation,
	}: React.MouseEvent<HTMLButtonElement>) => {
		stopPropagation();
		await removeItem({ id: sound.id });
	};

	return (
		<div className="group flex items-center gap-3 opacity-100 hover:opacity-75">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
				onClick={() => onPlay({ sound })}
			>
				<div className="bg-accent relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
					<div className="from-primary/20 absolute inset-0 bg-gradient-to-br to-transparent" />
					{isPlaying ? (
						<HugeiconsIcon icon={PauseIcon} className="size-5" />
					) : (
						<HugeiconsIcon icon={PlayIcon} className="size-5" />
					)}
				</div>

				<div className="min-w-0 flex-1 overflow-hidden">
					<p className="truncate text-sm font-medium">{sound.name}</p>
					<span className="text-muted-foreground block truncate text-xs">
						User upload
					</span>
				</div>
			</button>

			<div className="flex items-center gap-3 pr-2">
				<Button
					variant="text"
					size="icon"
					className="text-muted-foreground hover:text-foreground w-auto !opacity-100"
					onClick={handleAddToTimeline}
					disabled={isAdding}
					title="Add to timeline"
				>
					{isAdding ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<HugeiconsIcon icon={PlusSignIcon} />
					)}
				</Button>
				<Button
					variant="text"
					size="icon"
					className="text-muted-foreground hover:text-destructive w-auto !opacity-100"
					onClick={handleRemove}
					title="Remove uploaded sound"
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		</div>
	);
}

function SavedSoundsView() {
	const {
		savedSounds,
		isLoadingSavedSounds,
		savedSoundsError,
		loadSavedSounds,
		clearSavedSounds,
	} = useSoundsStore();

	const [playingId, setPlayingId] = useState<number | null>(null);
	const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
		null,
	);

	const [showClearDialog, setShowClearDialog] = useState(false);

	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	const playSound = ({ sound }: { sound: SoundEffect }) => {
		if (playingId === sound.id) {
			audioElement?.pause();
			setPlayingId(null);
			return;
		}

		audioElement?.pause();

		if (sound.previewUrl) {
			const audio = new Audio(sound.previewUrl);
			audio.addEventListener("ended", () => {
				setPlayingId(null);
			});
			audio.addEventListener("error", () => {
				setPlayingId(null);
			});
			audio.play().catch((error) => {
				console.error("Failed to play sound preview:", error);
				setPlayingId(null);
			});

			setAudioElement(audio);
			setPlayingId(sound.id);
		}
	};

	const convertToSoundEffect = ({
		savedSound,
	}: {
		savedSound: SavedSound;
	}): SoundEffect => ({
		id: savedSound.id,
		name: savedSound.name,
		description: "",
		url: "",
		previewUrl: savedSound.previewUrl,
		downloadUrl: savedSound.downloadUrl,
		duration: savedSound.duration,
		filesize: 0,
		type: "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: savedSound.username,
		tags: savedSound.tags,
		license: savedSound.license,
		created: savedSound.savedAt,
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	});

	if (isLoadingSavedSounds) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-muted-foreground text-sm">
					Loading saved sounds...
				</div>
			</div>
		);
	}

	if (savedSoundsError) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-destructive text-sm">
					Error: {savedSoundsError}
				</div>
			</div>
		);
	}

	if (savedSounds.length === 0) {
		return (
			<div className="bg-background flex h-full flex-col items-center justify-center gap-3 p-4">
				<HugeiconsIcon
					icon={FavouriteIcon}
					className="text-muted-foreground size-10"
				/>
				<div className="flex flex-col gap-2 text-center">
					<p className="text-lg font-medium">No saved sounds</p>
					<p className="text-muted-foreground text-sm text-balance">
						Click the heart icon on any sound to save it here
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mt-1 flex h-full flex-col gap-5">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					{savedSounds.length} saved{" "}
					{savedSounds.length === 1 ? "sound" : "sounds"}
				</p>
				<Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
					<DialogTrigger asChild>
						<Button
							variant="text"
							size="sm"
							className="text-muted-foreground hover:text-destructive h-auto !opacity-100"
						>
							Clear all
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Clear all saved sounds?</DialogTitle>
							<DialogDescription>
								This will permanently remove all {savedSounds.length} saved
								sounds from your collection. This action cannot be undone.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="text" onClick={() => setShowClearDialog(false)}>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={async ({
									stopPropagation,
								}: React.MouseEvent<HTMLButtonElement>) => {
									stopPropagation();
									await clearSavedSounds();
									setShowClearDialog(false);
								}}
							>
								Clear all sounds
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="relative h-full overflow-hidden">
				<ScrollArea className="h-full flex-1">
					<div className="flex flex-col gap-4">
						{savedSounds.map((sound) => (
							<AudioItem
								key={sound.id}
								sound={convertToSoundEffect({ savedSound: sound })}
								isPlaying={playingId === sound.id}
								onPlay={playSound}
							/>
						))}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

interface AudioItemProps {
	sound: SoundEffect;
	isPlaying: boolean;
	onPlay: ({ sound }: { sound: SoundEffect }) => void;
}

function AudioItem({ sound, isPlaying, onPlay }: AudioItemProps) {
	const { addSoundToTimeline, isSoundSaved, toggleSavedSound } =
		useSoundsStore();
	const isSaved = isSoundSaved({ soundId: sound.id });

	const handleClick = () => {
		onPlay({ sound });
	};

	const handleSaveClick = ({
		stopPropagation,
	}: React.MouseEvent<HTMLButtonElement>) => {
		stopPropagation();
		toggleSavedSound({ soundEffect: sound });
	};

	const handleAddToTimeline = async ({
		stopPropagation,
	}: React.MouseEvent<HTMLButtonElement>) => {
		stopPropagation();
		await addSoundToTimeline({ sound });
	};

	return (
		<div className="group flex items-center gap-3 opacity-100 hover:opacity-75">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
				onClick={handleClick}
			>
				<div className="bg-accent relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
					<div className="from-primary/20 absolute inset-0 bg-gradient-to-br to-transparent" />
					{isPlaying ? (
						<HugeiconsIcon icon={PauseIcon} className="size-5" />
					) : (
						<HugeiconsIcon icon={PlayIcon} className="size-5" />
					)}
				</div>

				<div className="min-w-0 flex-1 overflow-hidden">
					<p className="truncate text-sm font-medium">{sound.name}</p>
					<span className="text-muted-foreground block truncate text-xs">
						{sound.username}
					</span>
				</div>
			</button>

			<div className="flex items-center gap-3 pr-2">
				<Button
					variant="text"
					size="icon"
					className="text-muted-foreground hover:text-foreground w-auto !opacity-100"
					onClick={handleAddToTimeline}
					title="Add to timeline"
				>
					<HugeiconsIcon icon={PlusSignIcon} />
				</Button>
				<Button
					variant="text"
					size="icon"
					className={`hover:text-foreground w-auto !opacity-100 ${
						isSaved
							? "text-red-500 hover:text-red-600"
							: "text-muted-foreground"
					}`}
					onClick={handleSaveClick}
					title={isSaved ? "Remove from saved" : "Save sound"}
				>
					<HugeiconsIcon
						icon={FavouriteIcon}
						className={`${isSaved ? "fill-current" : ""}`}
					/>
				</Button>
			</div>
		</div>
	);
}
