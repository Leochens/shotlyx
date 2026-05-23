"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { FontPicker } from "@/components/ui/font-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { generateUUID } from "@/utils/id";
import { cn } from "@/utils/ui";
import type { BrandKitMediaAsset, ProjectBrandKit } from "../types";

function createEmptyKit(): ProjectBrandKit {
	const now = new Date().toISOString();
	return {
		id: generateUUID(),
		name: "未命名套件",
		colors: [],
		fonts: [],
		logos: [],
		images: [],
		styleGuide: "",
		createdAt: now,
		updatedAt: now,
	};
}

function normalizeColor(value: string): string {
	const cleaned = value.replace(/^#/, "").trim();
	return `#${cleaned || "ffffff"}`;
}

function stripHash(value: string): string {
	return value.replace(/^#/, "");
}

export function BrandKitDialog({
	open,
	onOpenChange,
	kit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	kit?: ProjectBrandKit | null;
}) {
	const editor = useEditor();
	const activeProject = useEditor((currentEditor) =>
		currentEditor.project.getActiveOrNull(),
	);
	const [draft, setDraft] = useState<ProjectBrandKit>(() =>
		kit ? { ...kit } : createEmptyKit(),
	);
	const [isUploading, setIsUploading] = useState(false);
	const logoInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);

	const addColor = () => {
		setDraft((current) => ({
			...current,
			colors: [
				...current.colors,
				{ id: generateUUID(), value: "#ffffff" },
			],
		}));
	};

	const addFont = () => {
		setDraft((current) => ({
			...current,
			fonts: [
				...current.fonts,
				{ id: generateUUID(), family: "Arial", role: "body" },
			],
		}));
	};

	const uploadImages = async ({
		files,
		target,
	}: {
		files: FileList | null;
		target: "logos" | "images";
	}) => {
		if (!files || files.length === 0 || !activeProject) return;
		setIsUploading(true);
		try {
			const processedAssets = await processMediaAssets({
				files: Array.from(files),
			});
			const mediaItems: BrandKitMediaAsset[] = [];
			for (const asset of processedAssets) {
				if (asset.type !== "image") continue;
				const saved = await editor.media.addMediaAsset({
					projectId: activeProject.metadata.id,
					asset,
				});
				if (!saved) continue;
				mediaItems.push({
					id: generateUUID(),
					mediaAssetId: saved.id,
					name: saved.name,
					width: saved.width,
					height: saved.height,
				});
			}
			setDraft((current) => ({
				...current,
				[target]: [...current[target], ...mediaItems],
			}));
		} finally {
			setIsUploading(false);
			if (target === "logos" && logoInputRef.current) {
				logoInputRef.current.value = "";
			}
			if (target === "images" && imageInputRef.current) {
				imageInputRef.current.value = "";
			}
		}
	};

	const handleSave = () => {
		const name = draft.name.trim() || "未命名套件";
		editor.project.upsertBrandKit({
			kit: {
				...draft,
				name,
				updatedAt: new Date().toISOString(),
			},
		});
		editor.project.setActiveBrandKit({ id: draft.id });
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden bg-neutral-950 text-neutral-100">
				<DialogHeader className="border-neutral-800">
					<DialogTitle className="text-2xl">{draft.name || "未命名套件"}</DialogTitle>
				</DialogHeader>
				<DialogBody className="max-h-[68vh] overflow-y-auto">
					<div className="flex flex-col gap-2">
						<span className="text-sm font-medium text-neutral-300">名称</span>
						<Input
							value={draft.name}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									name: event.target.value,
								}))
							}
							className="bg-neutral-900"
						/>
					</div>

					<BrandKitSection title="颜色" onAdd={addColor} addLabel="添加颜色">
						<div className="flex flex-col gap-2">
							{draft.colors.map((color) => (
								<div key={color.id} className="flex items-center gap-2">
									<ColorPicker
										value={stripHash(color.value)}
										onChangeEnd={(value) =>
											setDraft((current) => ({
												...current,
												colors: current.colors.map((item) =>
													item.id === color.id
														? { ...item, value: normalizeColor(value) }
														: item,
												),
											}))
										}
										className="max-w-44 bg-neutral-900"
									/>
									<IconRemoveButton
										label="删除颜色"
										onClick={() =>
											setDraft((current) => ({
												...current,
												colors: current.colors.filter(
													(item) => item.id !== color.id,
												),
											}))
										}
									/>
								</div>
							))}
						</div>
					</BrandKitSection>

					<BrandKitSection title="字体" onAdd={addFont} addLabel="添加字体">
						<div className="flex flex-col gap-2">
							{draft.fonts.map((font) => (
								<div key={font.id} className="flex items-center gap-2">
									<FontPicker
										defaultValue={font.family}
										onValueChange={(family) =>
											setDraft((current) => ({
												...current,
												fonts: current.fonts.map((item) =>
													item.id === font.id ? { ...item, family } : item,
												),
											}))
										}
										className="max-w-64 bg-neutral-900"
									/>
									<IconRemoveButton
										label="删除字体"
										onClick={() =>
											setDraft((current) => ({
												...current,
												fonts: current.fonts.filter(
													(item) => item.id !== font.id,
												),
											}))
										}
									/>
								</div>
							))}
						</div>
					</BrandKitSection>

					<MediaUploadSection
						title="LOGO"
						items={draft.logos}
						inputRef={logoInputRef}
						isUploading={isUploading}
						onUpload={(files) => uploadImages({ files, target: "logos" })}
						onRemove={(id) =>
							setDraft((current) => ({
								...current,
								logos: current.logos.filter((item) => item.id !== id),
							}))
						}
					/>

					<MediaUploadSection
						title="图片"
						items={draft.images}
						inputRef={imageInputRef}
						isUploading={isUploading}
						onUpload={(files) => uploadImages({ files, target: "images" })}
						onRemove={(id) =>
							setDraft((current) => ({
								...current,
								images: current.images.filter((item) => item.id !== id),
							}))
						}
					/>

					<div className="flex flex-col gap-2">
						<span className="text-sm font-medium text-neutral-300">
							风格指南
						</span>
						<Textarea
							value={draft.styleGuide}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									styleGuide: event.target.value,
								}))
							}
							placeholder="一句话品牌调性（例如：现代、技术、克制）。不要描述颜色或字体，这些字段已经写明了。"
							className="min-h-28 bg-neutral-900"
						/>
					</div>
				</DialogBody>
				<DialogFooter className="border-neutral-800">
					<Button
						type="button"
						onClick={handleSave}
						className="bg-amber-500 text-neutral-950 hover:bg-amber-400"
					>
						保存
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function BrandKitSection({
	title,
	children,
	addLabel,
	onAdd,
}: {
	title: string;
	children: ReactNode;
	addLabel: string;
	onAdd: () => void;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-neutral-300">{title}</h3>
				<button
					type="button"
					onClick={onAdd}
					className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-200"
				>
					<Plus size={15} />
					{addLabel}
				</button>
			</div>
			{children}
		</section>
	);
}

function MediaUploadSection({
	title,
	items,
	inputRef,
	isUploading,
	onUpload,
	onRemove,
}: {
	title: string;
	items: BrandKitMediaAsset[];
	inputRef: RefObject<HTMLInputElement | null>;
	isUploading: boolean;
	onUpload: (files: FileList | null) => void;
	onRemove: (id: string) => void;
}) {
	return (
		<section className="flex flex-col gap-3">
			<h3 className="text-sm font-semibold text-neutral-300">{title}</h3>
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				multiple
				className="hidden"
				onChange={(event) => onUpload(event.target.files)}
			/>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					disabled={isUploading}
					onClick={() => inputRef.current?.click()}
					className={cn(
						"flex size-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300",
						isUploading && "opacity-50",
					)}
				>
					<ImagePlus size={22} />
					<span className="text-xs">上传</span>
				</button>
				{items.map((item) => (
					<div
						key={item.id}
						className="group relative flex h-24 w-36 flex-col justify-end overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 p-2"
					>
						<span className="truncate text-xs text-neutral-300">
							{item.name}
						</span>
						<span className="truncate text-[10px] text-neutral-500">
							{item.width && item.height
								? `${item.width}x${item.height}`
								: item.mediaAssetId}
						</span>
						<IconRemoveButton
							label={`删除${title}`}
							onClick={() => onRemove(item.id)}
							className="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
						/>
					</div>
				))}
			</div>
		</section>
	);
}

function IconRemoveButton({
	label,
	onClick,
	className,
}: {
	label: string;
	onClick: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={cn(
				"rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-300",
				className,
			)}
		>
			<Trash2 size={14} />
		</button>
	);
}
