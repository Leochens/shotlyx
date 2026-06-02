export type VideoAspectRatio = "16:9" | "9:16" | "1:1" | "other";
export type VideoMotionLevel = "low" | "medium" | "high";
export type VideoSceneType =
	| "talking_head"
	| "screen_recording"
	| "product_demo"
	| "broll"
	| "vlog"
	| "gameplay"
	| "mg_animation"
	| "unknown";
export type SemanticSegmentType =
	| "intro"
	| "explanation"
	| "demo"
	| "broll"
	| "transition"
	| "highlight"
	| "ending"
	| "unknown";
export type VideoAnalysisLevel = "basic" | "standard" | "deep";

export interface VideoAssetProfile {
	videoId: string;
	duration: number;
	fps: number;
	width: number;
	height: number;
	aspectRatio: VideoAspectRatio;
	hasAudio: boolean;
	speechRatio: number;
	silenceRatio: number;
	motionLevel: VideoMotionLevel;
	sceneChangeDensity: number;
	contentTypeGuess: VideoSceneType;
}

export interface ShotSegment {
	id: string;
	start: number;
	end: number;
	duration: number;
	method: "ffmpeg_scene";
	confidence?: number;
}

export interface Keyframe {
	id: string;
	shotId: string;
	time: number;
	imagePath?: string;
}

export interface TranscriptSegment {
	start: number;
	end: number;
	text: string;
}

export interface SegmentCard {
	id: string;
	start: number;
	end: number;
	duration: number;
	keyframes: Keyframe[];
	transcript?: string;
	speechSummary?: string;
	visualSummary: string;
	actionSummary?: string;
	sceneType: VideoSceneType;
	role: SemanticSegmentType;
	editValue: {
		keepScore: number;
		hookScore: number;
		highlightScore: number;
		coverScore: number;
		brollScore: number;
		mgOpportunityScore: number;
	};
	semanticSummary: string;
}

export interface SuggestedOperation {
	type:
		| "keep"
		| "remove"
		| "trim"
		| "add_subtitle"
		| "add_voiceover"
		| "add_mg_annotation"
		| "add_broll"
		| "select_cover";
	reason: string;
}

export interface SemanticSegment {
	id: string;
	start: number;
	end: number;
	title: string;
	summary: string;
	sourceShotIds: string[];
	type: SemanticSegmentType;
	suggestedOperations: SuggestedOperation[];
}

export interface VideoSemanticIndex {
	videoId: string;
	profile: VideoAssetProfile;
	globalSummary: string;
	assetType: VideoSceneType | "mixed";
	shots: SegmentCard[];
	semanticSegments: SemanticSegment[];
	transcript?: TranscriptSegment[];
	analysisMeta: {
		createdAt: string;
		modelUsed: string[];
		analysisLevel: VideoAnalysisLevel;
	};
}

export interface VideoSemanticAgentViews {
	summary: {
		videoId: string;
		assetType: VideoSceneType | "mixed";
		duration: number;
		globalSummary: string;
		semanticSegments: Array<{
			segmentId: string;
			title: string;
			start: number;
			end: number;
			type: SemanticSegmentType;
			summary: string;
		}>;
	};
	editing: {
		targetDurationSeconds?: number;
		keep: Array<{
			segmentId: string;
			title: string;
			start: number;
			end: number;
			reason: string;
			sourceShotIds: string[];
		}>;
		remove: Array<{
			segmentId: string;
			title: string;
			start: number;
			end: number;
			reason: string;
		}>;
		additions: Array<{
			segmentId: string;
			type: SuggestedOperation["type"];
			reason: string;
		}>;
	};
	caption: {
		hasTranscript: boolean;
		transcript: TranscriptSegment[];
		transcriptText: string;
		speechSummaries: Array<{
			segmentId: string;
			start: number;
			end: number;
			text: string;
		}>;
	};
	mg: {
		opportunities: Array<{
			segmentId: string;
			start: number;
			end: number;
			score: number;
			reason: string;
			keyframeIds: string[];
		}>;
	};
	broll: {
		needs: Array<{
			segmentId: string;
			start: number;
			end: number;
			score: number;
			reason: string;
		}>;
		candidates: Array<{
			segmentId: string;
			start: number;
			end: number;
			score: number;
			reason: string;
		}>;
	};
}

export interface VideoAssetInspection {
	videoId: string;
	profile: VideoAssetProfile;
	shots: ShotSegment[];
	keyframes: Keyframe[];
	analysisMeta: VideoSemanticIndex["analysisMeta"];
}

export type VideoIntent =
	| "summarize"
	| "classify_asset"
	| "find_moment"
	| "extract_highlights"
	| "edit_suggestion"
	| "auto_edit"
	| "generate_script"
	| "caption"
	| "voiceover"
	| "mg_animation"
	| "cover_select"
	| "broll_match";

export interface AnalysisPlan {
	intent: VideoIntent;
	strategy:
		| "speech_first"
		| "silent_visual"
		| "product_demo"
		| "broll"
		| "mg_animation"
		| "high_motion"
		| "deep_video";
	steps: string[];
	budget: {
		level: "free" | "cheap" | "medium" | "expensive";
		maxFrames: number;
		maxVlmCalls: number;
		allowDeepModel: boolean;
	};
	expectedOutput:
		| "summary"
		| "asset_tags"
		| "moments"
		| "edit_plan"
		| "caption_plan"
		| "mg_plan";
}
