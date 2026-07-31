import type { LanguageCode } from "./languages";

export type TranscriptionLanguage = LanguageCode | "auto";

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
}

export interface CaptionChunk {
	text: string;
	startTime: number;
	duration: number;
}
