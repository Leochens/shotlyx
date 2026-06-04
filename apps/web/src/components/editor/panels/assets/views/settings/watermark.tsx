"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { Move } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { TProjectWatermark } from "@/project/types";
import {
	DEFAULT_MEDIA_WATERMARK,
	DEFAULT_TEXT_WATERMARK,
	DEFAULT_WATERMARK_POSITION,
	clampWatermarkOpacity,
	clampWatermarkScale,
	normalizeWatermarkTransform,
} from "@/project/watermark";
import { useWatermarkAdjustStore } from "@/preview/watermark-adjust-store";
import { cn } from "@/utils/ui";

type WatermarkType = TProjectWatermark["type"];
type NumericWatermarkField =
	| "positionX"
	| "positionY"
	| "scale"
	| "rotate"
	| "opacity"
	| "fontSize";

interface WatermarkPatch {
	color?: string;
	enabled?: boolean;
	fontFamily?: string;
	fontSize?: number;
	mediaId?: string;
	opacity?: number;
	positionX?: number;
	positionY?: number;
	rotate?: number;
	scale?: number;
	text?: string;
}

function isWatermarkType(value: string): value is WatermarkType {
	return value === "text" || value === "image" || value === "video";
}

function getMediaAssetsForType({
	assets,
	type,
}: {
	assets: MediaAsset[];
	type: "image" | "video";
}) {
	return assets.filter((asset) => asset.type === type);
}

function firstMediaIdForType({
	assets,
	type,
}: {
	assets: MediaAsset[];
	type: "image" | "video";
}) {
	return getMediaAssetsForType({ assets, type })[0]?.id ?? null;
}

function createDefaultWatermark({
	assets,
	type,
}: {
	assets: MediaAsset[];
	type: WatermarkType;
}): TProjectWatermark | null {
	if (type === "text") {
		return {
			enabled: true,
			type: "text",
			text: "Shotlyx",
			...DEFAULT_WATERMARK_POSITION,
			...DEFAULT_TEXT_WATERMARK,
		};
	}

	const mediaId = firstMediaIdForType({ assets, type });
	if (!mediaId) return null;

	return {
		enabled: true,
		type,
		mediaId,
		...DEFAULT_WATERMARK_POSITION,
		...DEFAULT_MEDIA_WATERMARK,
	};
}

function formatNumber(value: number) {
	return Number.isFinite(value) ? String(value) : "";
}

function parseNumberInput(value: string): number | null {
	if (value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function mergeWatermarkPatch({
	patch,
	watermark,
}: {
	patch: WatermarkPatch;
	watermark: TProjectWatermark;
}): TProjectWatermark {
	const common = {
		enabled: patch.enabled ?? watermark.enabled,
		positionX: patch.positionX ?? watermark.positionX,
		positionY: patch.positionY ?? watermark.positionY,
		scale: patch.scale ?? watermark.scale,
		rotate: patch.rotate ?? watermark.rotate,
		opacity: patch.opacity ?? watermark.opacity,
	};

	if (watermark.type === "text") {
		return normalizeWatermarkTransform({
			...common,
			type: "text",
			text: patch.text ?? watermark.text,
			fontSize: patch.fontSize ?? watermark.fontSize,
			color: patch.color ?? watermark.color,
			fontFamily: patch.fontFamily ?? watermark.fontFamily,
		});
	}

	return normalizeWatermarkTransform({
		...common,
		type: watermark.type,
		mediaId: patch.mediaId ?? watermark.mediaId,
	});
}

function FieldRow({ children, label }: { children: ReactNode; label: string }) {
	return (
		<div className="grid grid-cols-[88px_1fr] items-center gap-2">
			<Label>{label}</Label>
			{children}
		</div>
	);
}

export function WatermarkContent() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const assets = useEditor((e) => e.media.getAssets());
	const watermark = activeProject.settings.watermark ?? null;
	const isAdjustingWatermark = useWatermarkAdjustStore(
		(s) => s.isAdjustingWatermark,
	);
	const setAdjustingWatermark = useWatermarkAdjustStore(
		(s) => s.setAdjustingWatermark,
	);
	const toggleAdjustingWatermark = useWatermarkAdjustStore(
		(s) => s.toggleAdjustingWatermark,
	);

	const imageAssets = useMemo(
		() => getMediaAssetsForType({ assets, type: "image" }),
		[assets],
	);
	const videoAssets = useMemo(
		() => getMediaAssetsForType({ assets, type: "video" }),
		[assets],
	);

	const updateWatermark = useCallback(
		(nextWatermark: TProjectWatermark | null, pushHistory = true) => {
			editor.project.updateSettings({
				settings: { watermark: nextWatermark },
				pushHistory,
			});
		},
		[editor.project],
	);

	const patchWatermark = useCallback(
		(patch: WatermarkPatch) => {
			if (!watermark) return;
			updateWatermark(
				mergeWatermarkPatch({
					watermark,
					patch,
				}),
			);
		},
		[updateWatermark, watermark],
	);

	const enableWatermark = useCallback(
		(enabled: boolean) => {
			if (!enabled) {
				if (watermark) patchWatermark({ enabled: false });
				setAdjustingWatermark(false);
				return;
			}
			updateWatermark(
				watermark
					? normalizeWatermarkTransform({ ...watermark, enabled: true })
					: createDefaultWatermark({ assets, type: "text" }),
			);
		},
		[assets, patchWatermark, setAdjustingWatermark, updateWatermark, watermark],
	);

	const selectType = useCallback(
		(type: WatermarkType) => {
			const nextWatermark =
				watermark?.type === type
					? normalizeWatermarkTransform({ ...watermark, enabled: true })
					: createDefaultWatermark({ assets, type });
			if (nextWatermark) {
				updateWatermark(nextWatermark);
			}
		},
		[assets, updateWatermark, watermark],
	);

	const updateNumericField = useCallback(
		(field: NumericWatermarkField, value: string) => {
			const parsed = parseNumberInput(value);
			if (parsed === null || !watermark) return;
			const nextValue =
				field === "opacity"
					? clampWatermarkOpacity(parsed)
					: field === "scale"
						? clampWatermarkScale(parsed)
						: parsed;
			patchWatermark({ [field]: nextValue });
		},
		[patchWatermark, watermark],
	);

	const enabled = watermark?.enabled ?? false;
	const mediaAssets =
		watermark?.type === "video"
			? videoAssets
			: watermark?.type === "image"
				? imageAssets
				: [];

	return (
		<div className="flex flex-col">
			<Section showTopBorder={false}>
				<SectionHeader>
					<SectionTitle className="flex-1">Watermark</SectionTitle>
					<Switch checked={enabled} onCheckedChange={enableWatermark} />
				</SectionHeader>
			</Section>
			{watermark ? (
				<>
					<Section
						showTopBorder={false}
						collapsible
						defaultOpen
						sectionKey="settings:watermark-source"
					>
						<SectionHeader>
							<SectionTitle>Source</SectionTitle>
						</SectionHeader>
						<SectionContent className="flex flex-col gap-3">
							<FieldRow label="Type">
								<Select
									value={watermark.type}
									onValueChange={(value) => {
										if (isWatermarkType(value)) {
											selectType(value);
										}
									}}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select watermark type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="text">Text</SelectItem>
										<SelectItem value="image">Image</SelectItem>
										<SelectItem value="video">Video</SelectItem>
									</SelectContent>
								</Select>
							</FieldRow>
							{watermark.type === "text" ? (
								<FieldRow label="Text">
									<Input
										size="sm"
										value={watermark.text}
										onChange={(event) =>
											patchWatermark({ text: event.currentTarget.value })
										}
									/>
								</FieldRow>
							) : (
								<FieldRow label="Asset">
									<Select
										value={watermark.mediaId}
										onValueChange={(mediaId) => patchWatermark({ mediaId })}
									>
										<SelectTrigger>
											<SelectValue placeholder={`Select ${watermark.type}`} />
										</SelectTrigger>
										<SelectContent>
											{mediaAssets.length > 0 ? (
												mediaAssets.map((asset) => (
													<SelectItem key={asset.id} value={asset.id}>
														{asset.name}
													</SelectItem>
												))
											) : (
												<SelectItem value="__none" disabled>
													No {watermark.type} assets
												</SelectItem>
											)}
										</SelectContent>
									</Select>
								</FieldRow>
							)}
						</SectionContent>
					</Section>
					<Section
						collapsible
						defaultOpen
						sectionKey="settings:watermark-layout"
					>
						<SectionHeader>
							<SectionTitle className="flex-1">Layout</SectionTitle>
							<Button
								size="sm"
								variant={isAdjustingWatermark ? "secondary" : "ghost"}
								className={cn("gap-1 px-2", !enabled && "opacity-50")}
								disabled={!enabled}
								onClick={toggleAdjustingWatermark}
							>
								<Move className="size-3.5" />
								Adjust
							</Button>
						</SectionHeader>
						<SectionContent className="flex flex-col gap-2">
							<div className="grid grid-cols-2 gap-2">
								<FieldRow label="X">
									<NumberField
										value={formatNumber(watermark.positionX)}
										onChange={(event) =>
											updateNumericField("positionX", event.currentTarget.value)
										}
									/>
								</FieldRow>
								<FieldRow label="Y">
									<NumberField
										value={formatNumber(watermark.positionY)}
										onChange={(event) =>
											updateNumericField("positionY", event.currentTarget.value)
										}
									/>
								</FieldRow>
							</div>
							<FieldRow label="Scale">
								<NumberField
									value={formatNumber(watermark.scale)}
									onChange={(event) =>
										updateNumericField("scale", event.currentTarget.value)
									}
								/>
							</FieldRow>
							<FieldRow label="Rotation">
								<NumberField
									value={formatNumber(watermark.rotate)}
									suffix="deg"
									onChange={(event) =>
										updateNumericField("rotate", event.currentTarget.value)
									}
								/>
							</FieldRow>
							<FieldRow label="Opacity">
								<NumberField
									value={formatNumber(watermark.opacity)}
									onChange={(event) =>
										updateNumericField("opacity", event.currentTarget.value)
									}
								/>
							</FieldRow>
						</SectionContent>
					</Section>
					{watermark.type === "text" ? (
						<Section
							collapsible
							defaultOpen={false}
							sectionKey="settings:watermark-text"
						>
							<SectionHeader>
								<SectionTitle>Text style</SectionTitle>
							</SectionHeader>
							<SectionContent className="flex flex-col gap-2">
								<FieldRow label="Size">
									<NumberField
										value={formatNumber(watermark.fontSize)}
										onChange={(event) =>
											updateNumericField("fontSize", event.currentTarget.value)
										}
									/>
								</FieldRow>
								<FieldRow label="Color">
									<div className="flex items-center gap-2">
										<Input
											type="color"
											size="sm"
											value={watermark.color}
											className="h-7 w-10 p-1"
											onChange={(event) =>
												patchWatermark({
													color: event.currentTarget.value,
												})
											}
										/>
										<Input
											size="sm"
											value={watermark.color}
											onChange={(event) =>
												patchWatermark({
													color: event.currentTarget.value,
												})
											}
										/>
									</div>
								</FieldRow>
								<FieldRow label="Font">
									<Input
										size="sm"
										value={watermark.fontFamily}
										onChange={(event) =>
											patchWatermark({
												fontFamily: event.currentTarget.value,
											})
										}
									/>
								</FieldRow>
							</SectionContent>
						</Section>
					) : null}
				</>
			) : (
				<Section showTopBorder={false}>
					<SectionContent className="pt-0">
						<Button
							variant="secondary"
							className="w-full"
							onClick={() =>
								updateWatermark(
									createDefaultWatermark({ assets, type: "text" }),
								)
							}
						>
							Add text watermark
						</Button>
					</SectionContent>
				</Section>
			)}
		</div>
	);
}
