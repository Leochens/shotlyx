export type WorkbenchMode = "video" | "topic";

export type TopicProjectMode = "brainstorm" | "workflow";

export type TopicStage =
	| "ideation"
	| "research"
	| "structure"
	| "package"
	| "production"
	| "timeline";

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

export interface ResearchInsight {
	id: string;
	title: string;
	content: string;
	sourceIds: string[];
	hidden?: boolean;
	kind?: "agent" | "custom";
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

export interface TopicScriptTableAsset {
	mediaAssetId: string;
	name: string;
	mediaType?: string;
	durationSeconds?: number;
	sizeBytes?: number;
	addedAt: number;
}

export interface TopicScriptTableRow {
	id: string;
	timeRange: string;
	copy: string;
	visualContent: string;
	assets: TopicScriptTableAsset[];
	updatedAt: number;
}

export interface TopicScriptTableMetadata {
	title: string;
	description: string;
	coverAsset: TopicScriptTableAsset | null;
	updatedAt: number;
}

export interface PlatformRecommendation {
	platform: TopicPlatform;
	title: string;
	description: string;
}

export type TopicInputMaterialKind =
	| "uploaded-media"
	| "script"
	| "screen-recording"
	| "note";

export interface TopicInputMaterial {
	id: string;
	kind: TopicInputMaterialKind;
	title: string;
	summary?: string;
	content?: string;
	mediaAssetId?: string;
	mediaType?: string;
	durationSeconds?: number;
	sizeBytes?: number;
	createdAt: number;
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

export type ProductionPlanVideoType =
	| "talking-head"
	| "screen-recording"
	| "tutorial"
	| "review"
	| "vlog"
	| "explainer"
	| "ad";

export type ProductionPlanAssetType =
	| "user-footage"
	| "screen-recording"
	| "broll"
	| "screenshot"
	| "voiceover"
	| "subtitle"
	| "mg";

export interface ProductionPlanSegment {
	timeRange: string;
	goal: string;
	script: string;
	visualNeed: string;
	assetSuggestion: string;
	editSuggestion: string;
}

export interface ProductionPlanAsset {
	type: ProductionPlanAssetType;
	description: string;
	optional: boolean;
}

export interface ProductionPlan {
	id: string;
	createdAt: number;
	basedOnPackageVersionId: string;
	videoType: ProductionPlanVideoType;
	targetPlatform: string[];
	estimatedDurationMinutes: number;
	segments: ProductionPlanSegment[];
	requiredAssets: ProductionPlanAsset[];
	nextActions: string[];
}

export interface TopicProject {
	id: string;
	editorProjectId: string;
	mode?: TopicProjectMode;
	title: string;
	originPrompt: string;
	stage: TopicStage;
	status: "draft" | "active" | "ready-for-video";
	createdAt: number;
	updatedAt: number;
	promptHistory: string[];
	inputMaterials: TopicInputMaterial[];
	scriptTableRows: TopicScriptTableRow[];
	scriptTableMetadata: TopicScriptTableMetadata;
	candidates: TopicCandidate[];
	selectedCandidateId: string | null;
	researchSources: ResearchSource[];
	researchInsights: ResearchInsight[];
	structures: VideoStructureOption[];
	selectedStructureId: string | null;
	packageVersions: TopicPackageVersion[];
	activePackageVersionId: string | null;
	productionPlans: ProductionPlan[];
	activeProductionPlanId: string | null;
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
		| "handoff-video"
		| "stage-forward"
		| "stage-reset";
}
