"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import { rebuildShotlyxHyperFramesDocument } from "@/shotlyx/hyperframes/generator";
import {
	buildShotlyxMediaAssetRef,
	parseShotlyxMediaAssetRef,
	resolveShotlyxMGInputProps,
} from "../media-props";
import {
	appendShotlyxMGTableRow,
	getShotlyxMGTableColumns,
	normalizeShotlyxMGTableRows,
	parseShotlyxMGTableCellInput,
	removeShotlyxMGTableRow,
	updateShotlyxMGTableCell,
} from "../table-props";
import { isShotlyxHyperFramesAsset } from "../types";
import type {
	ShotlyxMGAsset,
	ShotlyxMGPropDefinition,
	ShotlyxMGPropValue,
} from "../types";
import { ShotlyxMGPlayer } from "./shotlyx-mg-player";

function normalizeColor(value: string): string {
	const cleaned = value.replace(/^#/, "").trim();
	return `#${cleaned || "ffffff"}`;
}

function stripHash(value: string): string {
	return value.replace(/^#/, "");
}

export function coerceShotlyxMGPropValue({
	prop,
	value,
}: {
	prop: ShotlyxMGPropDefinition;
	value: ShotlyxMGPropValue | undefined;
}): ShotlyxMGPropValue {
	return value ?? prop.default;
}

function clampNumberProp({
	prop,
	value,
}: {
	prop: ShotlyxMGPropDefinition;
	value: number;
}): number {
	const min = prop.min ?? value;
	const max = prop.max ?? value;
	return Math.max(min, Math.min(max, value));
}

export function ShotlyxMGAssetDialog({
	open,
	onOpenChange,
	asset,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	asset: ShotlyxMGAsset;
}) {
	const editor = useEditor();
	const mediaAssets = useEditor((nextEditor) => nextEditor.media.getAssets());
	const [name, setName] = useState(asset.name);
	const [durationSeconds, setDurationSeconds] = useState(
		asset.document.durationSeconds,
	);
	const [props, setProps] = useState<Record<string, ShotlyxMGPropValue>>(
		() => ({
			...asset.document.defaultProps,
		}),
	);

	const draftAsset = useMemo<ShotlyxMGAsset>(() => {
		if (isShotlyxHyperFramesAsset(asset)) {
			return {
				...asset,
				name: name.trim() || asset.name,
				document: rebuildShotlyxHyperFramesDocument({
					document: {
						...asset.document,
						name: name.trim() || asset.document.name,
						durationSeconds: Math.max(0.1, durationSeconds),
					},
					props,
				}),
			};
		}
		return {
			...asset,
			name: name.trim() || asset.name,
			document: {
				...asset.document,
				name: name.trim() || asset.document.name,
				durationSeconds: Math.max(0.1, durationSeconds),
				defaultProps: props,
			},
		};
	}, [asset, durationSeconds, name, props]);

	const setProp = ({
		key,
		value,
	}: {
		key: string;
		value: ShotlyxMGPropValue;
	}) => {
		setProps((current) => ({
			...current,
			[key]: value,
		}));
	};

	const handleSave = () => {
		const now = new Date().toISOString();
		editor.project.upsertShotlyxMGAsset({
			asset: {
				...draftAsset,
				updatedAt: now,
			},
		});
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden bg-neutral-950 text-neutral-100">
				<DialogHeader className="border-neutral-800">
					<DialogTitle className="text-2xl">
						{name || "未命名 Shotlyx MG"}
					</DialogTitle>
				</DialogHeader>
				<DialogBody className="grid max-h-[68vh] grid-cols-1 gap-5 overflow-y-auto md:grid-cols-[minmax(320px,1.1fr)_minmax(320px,0.9fr)]">
					<div className="flex min-w-0 flex-col gap-3">
						<div className="overflow-hidden rounded-md border border-neutral-800 bg-black">
							<div className="aspect-video">
								<ShotlyxMGPlayer
									asset={draftAsset}
									controls
									inputProps={resolveShotlyxMGInputProps({
										asset: draftAsset,
										params: props,
										mediaAssets,
									})}
								/>
							</div>
						</div>
						<div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-3">
							<p className="text-xs font-medium text-neutral-300">
								{isShotlyxHyperFramesAsset(asset)
									? "Shotlyx HyperFrames Overlay"
									: "Shotlyx Remotion Component"}
							</p>
							<p className="mt-1 text-xs text-neutral-500">
								{asset.document.runtime} · {asset.document.width}x
								{asset.document.height} · {asset.document.fps}fps
							</p>
						</div>
					</div>

					<div className="flex min-w-0 flex-col gap-4">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
							<div className="flex flex-col gap-2">
								<span className="text-sm font-medium text-neutral-300">
									名称
								</span>
								<Input
									value={name}
									onChange={(event) => setName(event.currentTarget.value)}
									className="bg-neutral-900"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<span className="text-sm font-medium text-neutral-300">
									时长
								</span>
								<Input
									type="number"
									min={0.1}
									step={0.1}
									value={durationSeconds}
									onChange={(event) =>
										setDurationSeconds(Number(event.currentTarget.value) || 0.1)
									}
									className="bg-neutral-900"
								/>
							</div>
						</div>

						<div className="flex flex-col gap-3">
							<h3 className="text-sm font-semibold text-neutral-300">
								可编辑属性
							</h3>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{asset.document.propsSchema.map((prop) => (
									<ShotlyxMGPropField
										key={prop.key}
										prop={prop}
										value={coerceShotlyxMGPropValue({
											prop,
											value: props[prop.key],
										})}
										onChange={(value) => setProp({ key: prop.key, value })}
									/>
								))}
							</div>
						</div>

						{asset.sourcePrompt && (
							<div className="flex flex-col gap-2">
								<span className="text-sm font-medium text-neutral-300">
									生成提示词
								</span>
								<Textarea
									value={asset.sourcePrompt}
									readOnly
									className="min-h-20 bg-neutral-900 text-neutral-400"
								/>
							</div>
						)}
					</div>
				</DialogBody>
				<DialogFooter className="border-neutral-800">
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						取消
					</Button>
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

function ShotlyxMGPropField({
	prop,
	value,
	onChange,
}: {
	prop: ShotlyxMGPropDefinition;
	value: ShotlyxMGPropValue;
	onChange: (value: ShotlyxMGPropValue) => void;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<span className="text-sm font-medium text-neutral-300">{prop.label}</span>
			<ShotlyxMGPropInput prop={prop} value={value} onChange={onChange} />
		</div>
	);
}

export function ShotlyxMGPropInput({
	prop,
	value,
	onChange,
}: {
	prop: ShotlyxMGPropDefinition;
	value: ShotlyxMGPropValue;
	onChange: (value: ShotlyxMGPropValue) => void;
}) {
	if (prop.type === "number") {
		return (
			<Input
				type="number"
				min={prop.min}
				max={prop.max}
				step={prop.step}
				value={typeof value === "number" ? value : Number(value)}
				onChange={(event) => {
					const nextValue = Number(event.currentTarget.value);
					onChange(
						clampNumberProp({
							prop,
							value: Number.isFinite(nextValue)
								? nextValue
								: Number(prop.default),
						}),
					);
				}}
				className="bg-neutral-900"
			/>
		);
	}

	if (prop.type === "boolean") {
		return (
			<div className="flex h-9 items-center">
				<Switch checked={Boolean(value)} onCheckedChange={onChange} />
			</div>
		);
	}

	if (prop.type === "select") {
		return (
			<Select value={String(value)} onValueChange={onChange}>
				<SelectTrigger className="bg-neutral-900">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{prop.options?.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (prop.type === "color") {
		return (
			<ColorPicker
				value={stripHash(String(value)).toUpperCase()}
				onChangeEnd={(color) => onChange(normalizeColor(color))}
				className="bg-neutral-900"
			/>
		);
	}

	if (prop.type === "font") {
		return (
			<FontPicker
				defaultValue={String(value)}
				onValueChange={onChange}
				className="bg-neutral-900"
			/>
		);
	}

	if (prop.type === "image") {
		return <ShotlyxMGImagePropInput value={value} onChange={onChange} />;
	}

	if (prop.type === "table") {
		return (
			<ShotlyxMGTablePropInput prop={prop} value={value} onChange={onChange} />
		);
	}

	return (
		<Input
			value={String(value)}
			onChange={(event) => onChange(event.currentTarget.value)}
			className="bg-neutral-900"
		/>
	);
}

function ShotlyxMGTablePropInput({
	prop,
	value,
	onChange,
}: {
	prop: ShotlyxMGPropDefinition;
	value: ShotlyxMGPropValue;
	onChange: (value: ShotlyxMGPropValue) => void;
}) {
	const columns = getShotlyxMGTableColumns({
		columns: prop.columns,
		value,
	});
	const rows = normalizeShotlyxMGTableRows({ value, columns });

	if (columns.length === 0) {
		return (
			<div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-500">
				这个表格没有可编辑列
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-col gap-2 rounded border border-neutral-800 bg-neutral-950/50 p-2">
			<div className="max-h-64 overflow-auto">
				<div
					className="grid min-w-max gap-2"
					style={{
						gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr)) 32px`,
					}}
				>
					{columns.map((column) => (
						<div
							key={`header-${column}`}
							className="px-1 text-xs font-medium text-neutral-400"
						>
							{column}
						</div>
					))}
					<div aria-hidden />

					{rows.map((row, rowIndex) => (
						<div key={`row-${rowIndex}`} className="contents">
							{columns.map((column) => {
								const cellValue = row[column] ?? "";
								return (
									<Input
										key={`${rowIndex}-${column}`}
										value={String(cellValue)}
										onChange={(event) => {
											onChange(
												updateShotlyxMGTableCell({
													rows,
													rowIndex,
													column,
													value: parseShotlyxMGTableCellInput({
														input: event.currentTarget.value,
														previousValue: cellValue,
													}),
												}),
											);
										}}
										className="h-8 bg-neutral-900 text-xs"
									/>
								);
							})}
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="删除这一行"
								className="size-8 text-neutral-500 hover:text-red-300"
								onClick={() =>
									onChange(removeShotlyxMGTableRow({ rows, rowIndex }))
								}
							>
								<Trash2 size={14} />
							</Button>
						</div>
					))}
				</div>
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="w-fit gap-1 bg-neutral-900"
				onClick={() => onChange(appendShotlyxMGTableRow({ rows, columns }))}
			>
				<Plus size={14} />
				添加一行
			</Button>
		</div>
	);
}

function ShotlyxMGImagePropInput({
	value,
	onChange,
}: {
	value: ShotlyxMGPropValue;
	onChange: (value: ShotlyxMGPropValue) => void;
}) {
	const imageAssets = useEditor((editor) =>
		editor.media.getAssets().filter((asset) => asset.type === "image"),
	);
	const stringValue = typeof value === "string" ? value : "";
	const referencedMediaId = stringValue
		? (parseShotlyxMediaAssetRef({ value: stringValue }) ?? stringValue)
		: "";
	const selectedMedia = imageAssets.find(
		(asset) => asset.id === referencedMediaId,
	);
	const hasUnresolvedReference =
		stringValue.length > 0 &&
		!selectedMedia &&
		!stringValue.startsWith("data:") &&
		!stringValue.startsWith("blob:");
	const selectValue = selectedMedia
		? selectedMedia.id
		: hasUnresolvedReference
			? "__unresolved__"
			: "__none__";

	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<Select
				value={selectValue}
				onValueChange={(nextValue) => {
					if (nextValue === "__none__" || nextValue === "__unresolved__") {
						onChange("");
						return;
					}
					onChange(buildShotlyxMediaAssetRef({ mediaAssetId: nextValue }));
				}}
			>
				<SelectTrigger className="bg-neutral-900">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="__none__">不使用图片</SelectItem>
					{hasUnresolvedReference && (
						<SelectItem value="__unresolved__">
							未解析引用：{stringValue}
						</SelectItem>
					)}
					{imageAssets.map((asset) => (
						<SelectItem key={asset.id} value={asset.id}>
							{asset.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{hasUnresolvedReference && (
				<p className="text-xs text-amber-300/80">
					当前图片引用不是媒体库资源，请从上方选择图片替换。
				</p>
			)}
			{imageAssets.length === 0 && (
				<p className="text-xs text-neutral-500">媒体库暂无图片素材。</p>
			)}
		</div>
	);
}
