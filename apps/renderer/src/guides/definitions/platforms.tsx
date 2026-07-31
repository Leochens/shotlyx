import type { GuideDefinition } from "@/guides/types";
import { TikTokLayout } from "./tiktok-layout";

function PlatformLogo({
	label,
	className = "size-4",
}: {
	label: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={`${className} inline-flex items-center justify-center rounded-[0.3rem] border bg-background text-[0.55rem] font-semibold text-foreground`}
		>
			{label.slice(0, 2).toUpperCase()}
		</span>
	);
}

function PlatformGuidePreview({ label }: { label: string }) {
	return <PlatformLogo label={label} />;
}

function platformGuide({
	id,
	label,
}: {
	id: string;
	label: string;
}): GuideDefinition {
	return {
		id,
		label,
		renderPreview: () => <PlatformGuidePreview label={label} />,
		renderTriggerIcon: () => <PlatformLogo label={label} />,
		renderOverlay: () => null,
	};
}

export const tiktokGuide: GuideDefinition = {
	...platformGuide({ id: "tiktok", label: "TikTok" }),
	renderOverlay: () => <TikTokLayout />,
};
export const igReelsGuide = platformGuide({
	id: "ig-reels",
	label: "Reels",
});
export const ytShortsGuide = platformGuide({
	id: "yt-shorts",
	label: "Shorts",
});
export const spotlightGuide = platformGuide({
	id: "spotlight",
	label: "Spotlight",
});
