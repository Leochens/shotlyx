import type { CreativeAsset } from "./types";

type Orientation = "landscape" | "portrait" | "square";

interface SearchMockVideosInput {
	query: string;
	orientation?: Orientation;
	durationSeconds?: number;
	count?: number;
}

const MOCK_VIDEOS: CreativeAsset[] = [
	{
		id: "mock_video_ai_workspace_b-roll",
		type: "video",
		provider: "mock",
		title: "AI workspace b-roll",
		url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		previewUrl:
			"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		downloadUrl:
			"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		duration: 5,
		width: 1280,
		height: 720,
		license: {
			label: "Mock CC0",
			commercialUse: true,
			attributionRequired: false,
		},
	},
	{
		id: "mock_video_phone_vertical_product_shot",
		type: "video",
		provider: "mock",
		title: "Phone vertical product shot",
		url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		previewUrl:
			"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		downloadUrl:
			"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		duration: 5,
		width: 720,
		height: 1280,
		license: {
			label: "Mock CC0",
			commercialUse: true,
			attributionRequired: false,
		},
	},
	{
		id: "mock_video_video_editing_timeline_closeup",
		type: "video",
		provider: "mock",
		title: "Video editing timeline closeup",
		url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		previewUrl:
			"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		downloadUrl:
			"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
		duration: 5,
		width: 1080,
		height: 1080,
		license: {
			label: "Mock CC0",
			commercialUse: true,
			attributionRequired: false,
		},
	},
];

function getOrientation(asset: Pick<CreativeAsset, "width" | "height">): Orientation {
	const width = asset.width ?? 0;
	const height = asset.height ?? 0;
	if (width === height) return "square";
	return width > height ? "landscape" : "portrait";
}

export function searchMockVideos(input: SearchMockVideosInput): {
	candidates: CreativeAsset[];
} {
	const query = input.query.trim().toLowerCase();
	const count = Math.max(0, Math.min(input.count ?? 5, 10));
	const maxDuration =
		input.durationSeconds === undefined
			? undefined
			: Math.max(0, input.durationSeconds);
	const candidates = MOCK_VIDEOS.filter((asset) => {
		const searchableText = `${asset.title} ${asset.type}`.toLowerCase();
		const matchesQuery =
			query.length === 0 || searchableText.includes(query);
		const matchesOrientation = input.orientation
			? getOrientation(asset) === input.orientation
			: true;
		const matchesDuration = maxDuration !== undefined
			? (asset.duration ?? 0) <= maxDuration
			: true;
		return matchesQuery && matchesOrientation && matchesDuration;
	}).slice(0, count);

	return { candidates };
}
