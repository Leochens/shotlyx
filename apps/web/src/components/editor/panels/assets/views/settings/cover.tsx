"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import type { MediaAsset } from "@/media/types";
import {
	clampProjectCoverDurationSeconds,
	createDefaultProjectCover,
	getDefaultProjectCoverCustomSize,
	getProjectCoverThumbnail,
	MAX_PROJECT_COVER_DURATION_SECONDS,
	MIN_PROJECT_COVER_DURATION_SECONDS,
	normalizeProjectCover,
	type ProjectCoverLayoutMode,
} from "@/project/cover";
import type { TProjectCover } from "@/project/types";
import { cn } from "@/utils/ui";

function FieldRow({ children, label }: { children: ReactNode; label: string }) {
	return (
		<div className="grid grid-cols-[88px_1fr] items-center gap-2">
			<Label>{label}</Label>
			{children}
		</div>
	);
}

function formatNumber(value: number) {
	return Number.isFinite(value) ? String(value) : "";
}

function parseNumberInput(value: string): number | null {
	if (value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function isCoverLayoutMode(value: string): value is ProjectCoverLayoutMode {
	return value === "fill" || value === "custom";
}

function buildCoverForAsset({
	asset,
	canvasSize,
	currentCover,
}: {
	asset: MediaAsset;
	canvasSize: { width: number; height: number };
	currentCover?: TProjectCover | null;
}): TProjectCover {
	return (
		normalizeProjectCover({
			asset,
			canvasSize,
			cover: currentCover
				? { ...currentCover, mediaId: asset.id, enabled: true }
				: createDefaultProjectCover({ asset, canvasSize }),
		}) ?? createDefaultProjectCover({ asset, canvasSize })
	);
}

export function CoverContent() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const assets = useEditor((e) => e.media.getAssets());
	const cover = activeProject.settings.cover ?? null;
	const canvasSize = activeProject.settings.canvasSize;
	const imageAssets = useMemo(
		() => assets.filter((asset) => asset.type === "image"),
		[assets],
	);
	const selectedAsset =
		imageAssets.find((asset) => asset.id === cover?.mediaId) ?? null;
	const coverThumbnail = getProjectCoverThumbnail({
		cover,
		mediaAssets: assets,
	});

	const updateCover = useCallback(
		(nextCover: TProjectCover | null) => {
			void editor.project.updateSettings({
				settings: { cover: nextCover },
				pushHistory: true,
			});

			const thumbnail = getProjectCoverThumbnail({
				cover: nextCover,
				mediaAssets: assets,
			});
			if (thumbnail) {
				void editor.project.updateThumbnail({ thumbnail });
			}
		},
		[assets, editor.project],
	);

	const enableCover = useCallback(
		(enabled: boolean) => {
			if (!enabled) {
				updateCover(null);
				void editor.project.refreshThumbnailFromTimeline();
				return;
			}

			const asset = selectedAsset ?? imageAssets[0] ?? null;
			if (!asset) {
				toast.error("请先导入图片素材");
				return;
			}

			updateCover(
				buildCoverForAsset({
					asset,
					canvasSize,
					currentCover: cover,
				}),
			);
		},
		[canvasSize, cover, editor.project, imageAssets, selectedAsset, updateCover],
	);

	const selectAsset = useCallback(
		(mediaId: string) => {
			const asset = imageAssets.find((item) => item.id === mediaId);
			if (!asset) return;
			updateCover(
				buildCoverForAsset({
					asset,
					canvasSize,
					currentCover: cover,
				}),
			);
		},
		[canvasSize, cover, imageAssets, updateCover],
	);

	const patchCover = useCallback(
		(patch: Partial<TProjectCover>) => {
			if (!cover || !selectedAsset) return;
			updateCover(
				normalizeProjectCover({
					asset: selectedAsset,
					canvasSize,
					cover: { ...cover, ...patch },
				}),
			);
		},
		[canvasSize, cover, selectedAsset, updateCover],
	);

	const selectLayoutMode = useCallback(
		(mode: ProjectCoverLayoutMode) => {
			if (!cover || !selectedAsset) return;
			if (mode === "fill") {
				patchCover({ layout: { mode: "fill" } } as Partial<TProjectCover>);
				return;
			}
			const fallbackSize =
				cover.layout.mode === "custom"
					? { width: cover.layout.width, height: cover.layout.height }
					: getDefaultProjectCoverCustomSize({
							asset: selectedAsset,
							canvasSize,
						});
			patchCover({
				layout: {
					mode: "custom",
					width: fallbackSize.width,
					height: fallbackSize.height,
				},
			} as Partial<TProjectCover>);
		},
		[canvasSize, cover, patchCover, selectedAsset],
	);

	const updateDuration = useCallback(
		(value: string) => {
			const parsed = parseNumberInput(value);
			if (parsed === null) return;
			patchCover({
				durationSeconds: clampProjectCoverDurationSeconds(parsed),
			});
		},
		[patchCover],
	);

	const updateCustomDimension = useCallback(
		(field: "width" | "height", value: string) => {
			if (!cover || cover.layout.mode !== "custom") return;
			const parsed = parseNumberInput(value);
			if (parsed === null || parsed <= 0) return;
			patchCover({
				layout: {
					...cover.layout,
					[field]: Math.round(parsed),
				},
			} as Partial<TProjectCover>);
		},
		[cover, patchCover],
	);

	return (
		<div className="flex flex-col">
			<Section showTopBorder={false}>
				<SectionHeader>
					<SectionTitle className="flex-1">Cover</SectionTitle>
					<Switch
						checked={!!cover?.enabled}
						disabled={!cover && imageAssets.length === 0}
						onCheckedChange={enableCover}
					/>
				</SectionHeader>
			</Section>
			{cover ? (
				<>
					<Section
						showTopBorder={false}
						collapsible
						defaultOpen
						sectionKey="settings:cover-source"
					>
						<SectionHeader>
							<SectionTitle>Source</SectionTitle>
						</SectionHeader>
						<SectionContent className="flex flex-col gap-3">
							<FieldRow label="Image">
								<Select value={cover.mediaId} onValueChange={selectAsset}>
									<SelectTrigger>
										<SelectValue placeholder="Select image" />
									</SelectTrigger>
									<SelectContent>
										{imageAssets.length > 0 ? (
											imageAssets.map((asset) => (
												<SelectItem key={asset.id} value={asset.id}>
													{asset.name}
												</SelectItem>
											))
										) : (
											<SelectItem value="__none" disabled>
												No image assets
											</SelectItem>
										)}
									</SelectContent>
								</Select>
							</FieldRow>
							<div
								className={cn(
									"bg-muted relative aspect-video overflow-hidden rounded-sm border",
									!coverThumbnail && "flex items-center justify-center",
								)}
							>
								{coverThumbnail ? (
									<img
										src={coverThumbnail}
										alt=""
										className={cn(
											"size-full",
											cover.layout.mode === "fill"
												? "object-cover"
												: "object-contain",
										)}
									/>
								) : (
									<span className="text-muted-foreground text-xs">
										Image unavailable
									</span>
								)}
							</div>
						</SectionContent>
					</Section>
					<Section
						collapsible
						defaultOpen
						sectionKey="settings:cover-layout"
					>
						<SectionHeader>
							<SectionTitle>Layout</SectionTitle>
						</SectionHeader>
						<SectionContent className="flex flex-col gap-3">
							<FieldRow label="Mode">
								<Select
									value={cover.layout.mode}
									onValueChange={(value) => {
										if (isCoverLayoutMode(value)) {
											selectLayoutMode(value);
										}
									}}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select layout mode" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="fill">Fill screen</SelectItem>
										<SelectItem value="custom">Custom size</SelectItem>
									</SelectContent>
								</Select>
							</FieldRow>
							{cover.layout.mode === "custom" ? (
								<div className="grid grid-cols-2 gap-2">
									<FieldRow label="Width">
										<NumberField
											value={formatNumber(cover.layout.width)}
											suffix="px"
											onChange={(event) =>
												updateCustomDimension(
													"width",
													event.currentTarget.value,
												)
											}
										/>
									</FieldRow>
									<FieldRow label="Height">
										<NumberField
											value={formatNumber(cover.layout.height)}
											suffix="px"
											onChange={(event) =>
												updateCustomDimension(
													"height",
													event.currentTarget.value,
												)
											}
										/>
									</FieldRow>
								</div>
							) : null}
							<FieldRow label="Duration">
								<NumberField
									value={formatNumber(cover.durationSeconds)}
									suffix="s"
									allowExpressions={false}
									min={MIN_PROJECT_COVER_DURATION_SECONDS}
									max={MAX_PROJECT_COVER_DURATION_SECONDS}
									step={0.1}
									onChange={(event) =>
										updateDuration(event.currentTarget.value)
									}
								/>
							</FieldRow>
						</SectionContent>
					</Section>
				</>
			) : (
				<Section showTopBorder={false}>
					<SectionContent className="pt-0">
						<p className="text-muted-foreground text-xs">
							Choose an image asset to use as the project cover during export.
						</p>
					</SectionContent>
				</Section>
			)}
		</div>
	);
}
