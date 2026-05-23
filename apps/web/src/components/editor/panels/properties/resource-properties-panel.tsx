"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Captions,
	FileText,
	ImageIcon,
	LayoutTemplate,
	Music,
	Sparkles,
	Video,
} from "lucide-react";
import { toast } from "sonner";
import type { ShotlyxMGAsset } from "@/shotlyx/remotion-components/asset-store";
import { createMediaAssetReference } from "@/agent/context/resolve-references";
import { useAgentContextStore } from "@/agent/context/store";
import type { SelectedAssetRef } from "@/components/editor/panels/assets/assets-panel-store";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import type { MediaAsset } from "@/media/types";
import { usePanelStore } from "@/editor/panel-store";
import { AudioWaveform } from "@/timeline/components/audio-waveform";
import { useResizeObserver } from "@/hooks/use-resize-observer";

type ResolvedResource =
	| { kind: "media"; asset: MediaAsset }
	| { kind: "shotlyx-mg"; asset: ShotlyxMGAsset };

export function ResourcePropertiesPanel({
	selectedAssetRefs,
}: {
	selectedAssetRefs: SelectedAssetRef[];
}) {
	const mediaAssets = useEditor((editor) => editor.media.getAssets());
	const shotlyxMGAssets = useEditor((editor) => editor.project.getShotlyxMGAssets());

	const resources = useMemo(
		() =>
			selectedAssetRefs
				.map((ref): ResolvedResource | null => {
					if (ref.kind === "media") {
						const asset = mediaAssets.find((item) => item.id === ref.id);
						return asset ? { kind: "media", asset } : null;
					}
					const asset = shotlyxMGAssets.find((item) => item.id === ref.id);
					return asset ? { kind: "shotlyx-mg", asset } : null;
				})
				.filter((item): item is ResolvedResource => item !== null),
		[shotlyxMGAssets, mediaAssets, selectedAssetRefs],
	);

	if (resources.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground text-sm">
				Selected resource is no longer available.
			</div>
		);
	}

	if (resources.length > 1) {
		return <MultipleResourceProperties resources={resources} />;
	}

	const resource = resources[0];
	if (!resource) return null;
	return resource.kind === "media" ? (
		<MediaResourceProperties asset={resource.asset} />
	) : (
		<ShotlyxMGResourceProperties asset={resource.asset} />
	);
}

function MultipleResourceProperties({
	resources,
}: {
	resources: ResolvedResource[];
}) {
	const counts = resources.reduce(
		(acc, resource) => {
			const key =
				resource.kind === "shotlyx-mg" ? "MG 动画" : getMediaTypeLabel(resource.asset.type);
			acc[key] = (acc[key] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);

	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
			<p className="text-lg font-medium">{resources.length} resources selected</p>
			<div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
				{Object.entries(counts).map(([type, count]) => (
					<span key={type} className="rounded border bg-muted/30 px-2 py-1">
						{type} x {count}
					</span>
				))}
			</div>
		</div>
	);
}

function MediaResourceProperties({ asset }: { asset: MediaAsset }) {
	const editor = useEditor();
	const activeProject = useEditor((nextEditor) => nextEditor.project.getActiveOrNull());
	const addReference = useAgentContextStore((state) => state.addReference);
	const setAgentPanelOpen = usePanelStore((state) => state.setAgentPanelOpen);

	const handleNameCommit = useCallback(
		(name: string) => {
			if (!activeProject) return;
			void editor.media.updateMediaAsset({
				projectId: activeProject.metadata.id,
				id: asset.id,
				updates: { name },
			});
		},
		[activeProject, asset.id, editor],
	);

	const handleAskAgent = () => {
		addReference(
			createMediaAssetReference({
				asset,
				source: "manual-add",
			}),
		);
		setAgentPanelOpen(true);
		toast.success("已把素材加入 Agent 引用");
	};

	return (
		<div className="flex flex-col">
			<ResourceHeader
				icon={getMediaTypeIcon(asset.type)}
				title={asset.name}
				subtitle={getMediaTypeLabel(asset.type)}
				action={<AskAgentButton onClick={handleAskAgent} />}
			/>
			<Section sectionKey={`resource:${asset.id}:basic`}>
				<SectionHeader>
					<SectionTitle>Basic</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<SectionField label="Name">
							<EditableNameInput
								key={`${asset.id}:${asset.name}`}
								value={asset.name}
								onCommit={handleNameCommit}
							/>
						</SectionField>
						<ReadonlyField label="Type" value={getMediaTypeLabel(asset.type)} />
						<ReadonlyField label="File" value={asset.file.name} />
						<ReadonlyField label="Size" value={formatBytes(asset.file.size)} />
						<ReadonlyField
							label="Modified"
							value={formatDate(asset.file.lastModified)}
						/>
					</SectionFields>
				</SectionContent>
			</Section>
			<Section sectionKey={`resource:${asset.id}:media`}>
				<SectionHeader>
					<SectionTitle>Media Info</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<ReadonlyField
							label="Duration"
							value={asset.duration ? formatDuration(asset.duration) : "-"}
						/>
						<ReadonlyField
							label="Dimensions"
							value={
								asset.width && asset.height
									? `${asset.width} x ${asset.height}`
									: "-"
							}
						/>
						<ReadonlyField label="FPS" value={asset.fps ? `${asset.fps}` : "-"} />
						<ReadonlyField
							label="Audio"
							value={asset.hasAudio === undefined ? "-" : asset.hasAudio ? "Yes" : "No"}
						/>
						{asset.file.type ? (
							<ReadonlyField label="MIME" value={asset.file.type} />
						) : null}
					</SectionFields>
				</SectionContent>
			</Section>
			{asset.type === "audio" ? (
				<Section sectionKey={`resource:${asset.id}:waveform`}>
					<SectionHeader>
						<SectionTitle>Waveform</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<AudioResourceWaveform asset={asset} />
					</SectionContent>
				</Section>
			) : null}
			{asset.type === "text" || asset.type === "subtitle" ? (
				<DocumentResourcePreview asset={asset} />
			) : null}
			{asset.externalSource ? (
				<Section sectionKey={`resource:${asset.id}:license`}>
					<SectionHeader>
						<SectionTitle>Source & License</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							<ReadonlyField label="Provider" value={asset.externalSource.provider} />
							<ReadonlyField
								label="Author"
								value={asset.externalSource.author?.name ?? "-"}
							/>
							<ReadonlyField
								label="License"
								value={asset.externalSource.license.name}
							/>
							<ReadonlyField
								label="Commercial"
								value={
									asset.externalSource.license.commercialUse === false
										? "Review required"
										: "Allowed"
								}
							/>
						</SectionFields>
					</SectionContent>
				</Section>
			) : null}
		</div>
	);
}

function ShotlyxMGResourceProperties({ asset }: { asset: ShotlyxMGAsset }) {
	const editor = useEditor();
	const handleNameCommit = useCallback(
		(name: string) => {
			const nextName = name.trim() || asset.name;
			editor.project.upsertShotlyxMGAsset({
				asset: {
					...asset,
					name: nextName,
					document: {
						...asset.document,
						name: nextName,
					},
				},
			});
		},
		[asset, editor],
	);

	return (
		<div className="flex flex-col">
			<ResourceHeader
				icon={<LayoutTemplate className="size-5" />}
				title={asset.name}
				subtitle="MG 动画"
			/>
			<Section sectionKey={`resource:${asset.id}:basic`}>
				<SectionHeader>
					<SectionTitle>Basic</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<SectionField label="Name">
							<EditableNameInput
								key={`${asset.id}:${asset.name}`}
								value={asset.name}
								onCommit={handleNameCommit}
							/>
						</SectionField>
						<ReadonlyField label="Runtime" value={asset.runtime} />
						<ReadonlyField
							label="Duration"
							value={formatDuration(asset.document.durationSeconds)}
						/>
						<ReadonlyField label="FPS" value={`${asset.document.fps}`} />
						<ReadonlyField
							label="Transparent"
							value={asset.document.transparentBackground ? "Yes" : "No"}
						/>
						<ReadonlyField
							label="Editable props"
							value={`${asset.document.propsSchema.length}`}
						/>
					</SectionFields>
				</SectionContent>
			</Section>
			<Section sectionKey={`resource:${asset.id}:prompt`}>
				<SectionHeader>
					<SectionTitle>Prompt</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<Textarea
						value={asset.sourcePrompt}
						readOnly
						className="min-h-28 text-xs"
					/>
				</SectionContent>
			</Section>
		</div>
	);
}

function ResourceHeader({
	icon,
	title,
	subtitle,
	action,
}: {
	icon: React.ReactNode;
	title: string;
	subtitle: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 border-b p-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{title}</p>
				<p className="text-xs text-muted-foreground">{subtitle}</p>
			</div>
			{action}
		</div>
	);
}

function AskAgentButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-cyan-300/20 bg-cyan-300/10 px-2.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-300/20"
		>
			<Sparkles className="size-3.5" />
			Ask AI
		</button>
	);
}

function EditableNameInput({
	value,
	onCommit,
}: {
	value: string;
	onCommit: (value: string) => void;
}) {
	const [draft, setDraft] = useState(value);

	const commit = useCallback(() => {
		const nextValue = draft.trim();
		if (!nextValue || nextValue === value) {
			setDraft(value);
			return;
		}
		onCommit(nextValue);
	}, [draft, onCommit, value]);

	return (
		<Input
			value={draft}
			size="sm"
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.currentTarget.blur();
				}
				if (event.key === "Escape") {
					setDraft(value);
					event.currentTarget.blur();
				}
			}}
		/>
	);
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
	return (
		<SectionField label={label}>
			<div className="min-h-7 rounded-md border bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground">
				{value}
			</div>
		</SectionField>
	);
}

function AudioResourceWaveform({ asset }: { asset: MediaAsset }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(320);
	const duration = Math.max(asset.duration ?? 1, 0.001);
	const onResize = useCallback((entry: ResizeObserverEntry) => {
		setWidth(Math.max(1, entry.contentRect.width));
	}, []);

	useResizeObserver({ ref: containerRef, onResize });

	return (
		<div
			ref={containerRef}
			className="h-24 overflow-hidden rounded-md border bg-muted/20 p-2"
		>
			<AudioWaveform
				sourceKey={buildWaveformSourceKey({ kind: "media", id: asset.id })}
				sourceFile={asset.file}
				audioUrl={asset.url}
				pixelsPerSecond={width / duration}
				clipDurationSec={duration}
				sourceStartSec={0}
				color="hsl(var(--primary))"
				className="h-full"
			/>
		</div>
	);
}

function DocumentResourcePreview({ asset }: { asset: MediaAsset }) {
	const [text, setText] = useState("读取中...");

	useEffect(() => {
		let disposed = false;
		void asset.file
			.text()
			.then((content) => {
				if (!disposed) setText(content.slice(0, 4000));
			})
			.catch(() => {
				if (!disposed) setText("无法读取文件内容");
			});
		return () => {
			disposed = true;
		};
	}, [asset.file]);

	return (
		<Section sectionKey={`resource:${asset.id}:document`}>
			<SectionHeader>
				<SectionTitle>Content</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<Textarea value={text} readOnly className="min-h-48 font-mono text-xs" />
			</SectionContent>
		</Section>
	);
}

function getMediaTypeLabel(type: MediaAsset["type"]): string {
	switch (type) {
		case "video":
			return "视频";
		case "image":
			return "图片";
		case "audio":
			return "音频";
		case "subtitle":
			return "字幕文件";
		case "text":
			return "文本文件";
	}
}

function getMediaTypeIcon(type: MediaAsset["type"]) {
	const className = "size-5";
	switch (type) {
		case "video":
			return <Video className={className} />;
		case "image":
			return <ImageIcon className={className} />;
		case "audio":
			return <Music className={className} />;
		case "subtitle":
			return <Captions className={className} />;
		case "text":
			return <FileText className={className} />;
	}
}

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number): string {
	const safeSeconds = Math.max(0, seconds);
	const minutes = Math.floor(safeSeconds / 60);
	const secs = Math.floor(safeSeconds % 60);
	const millis = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);
	if (minutes > 0) {
		return `${minutes}:${secs.toString().padStart(2, "0")}.${Math.floor(millis / 100)}`;
	}
	return `${secs}.${Math.floor(millis / 100)}s`;
}

function formatDate(timestamp: number): string {
	if (!Number.isFinite(timestamp) || timestamp <= 0) return "-";
	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(timestamp));
}
