export type WorkbenchMode = "video" | "topic";

export type TopicStage = "ideation" | "research" | "structure" | "package";

export type TopicPlatform =
	| "bilibili"
	| "youtube"
	| "xiaohongshu"
	| "douyin"
	| "video-account";

export type ResearchPlatform = "youtube" | "bilibili" | "web" | "official";

export interface TopicCandidate {
	id: string;
	title: string;
	summary: string;
	coreViewpoint: string;
	audience: string;
	platforms: TopicPlatform[];
	durationMinutes: number;
	rationale: string;
	risks: string[];
	status: "draft" | "selected" | "confirmed";
	updatedAt: number;
}

export interface ResearchSource {
	id: string;
	platform: ResearchPlatform;
	title: string;
	url: string;
	sourceName: string;
	publishedAt?: string;
	angle: string;
	whyRelevant: string;
	confidence: "high" | "medium" | "low";
}

export interface VideoStructureStep {
	label: string;
	description: string;
}

export interface VideoStructureOption {
	id: string;
	name: string;
	bestFor: string;
	flow: VideoStructureStep[];
	rationale: string;
}

export interface ScriptSegment {
	timeRange: string;
	content: string;
	materialSuggestion: string;
}

export interface PlatformRecommendation {
	platform: TopicPlatform;
	title: string;
	description: string;
}

export interface TopicPackageVersion {
	id: string;
	versionName: string;
	createdAt: number;
	basedOnCandidateId: string;
	basedOnStructureId: string;
	title: string;
	summary: string;
	coreViewpoint: string;
	audienceAnalysis: string;
	durationMinutes: number;
	rationale: string;
	outline: string[];
	scriptSegments: ScriptSegment[];
	platformRecommendations: PlatformRecommendation[];
	coverIdeas: string[];
	referenceSourceIds: string[];
}

export interface TopicProject {
	id: string;
	editorProjectId: string;
	title: string;
	originPrompt: string;
	stage: TopicStage;
	status: "draft" | "active" | "ready-for-video";
	createdAt: number;
	updatedAt: number;
	promptHistory: string[];
	candidates: TopicCandidate[];
	selectedCandidateId: string | null;
	researchSources: ResearchSource[];
	structures: VideoStructureOption[];
	selectedStructureId: string | null;
	packageVersions: TopicPackageVersion[];
	activePackageVersionId: string | null;
}

export interface TopicWorkbenchAgentEvent {
	id: string;
	editorProjectId: string;
	content: string;
	autoRun: boolean;
	createdAt: number;
	source:
		| "candidate-select"
		| "candidate-edit"
		| "candidate-confirm"
		| "stage-forward"
		| "stage-reset";
}
