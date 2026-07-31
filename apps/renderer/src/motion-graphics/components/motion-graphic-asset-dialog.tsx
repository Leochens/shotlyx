"use client";

import Image from "@/platform/image";
import { useMemo, useState } from "react";
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
import { getGraphicDefinition } from "@/graphics";
import type { ParamDefinition, ParamValue, ParamValues } from "@/params";
import { useEditor } from "@/editor/use-editor";
import { buildMotionGraphicManifest } from "@/motion-graphics/manifest";
import { buildProjectMotionGraphicPreviewUrl } from "@/motion-graphics/preview";
import type { ProjectMotionGraphicAsset } from "@/motion-graphics/types";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";

const HIDDEN_ASSET_PARAMS = new Set(["progress"]);

function normalizeColor(value: string): string {
	const cleaned = value.replace(/^#/, "").trim();
	return `#${cleaned || "ffffff"}`;
}

function stripHash(value: string): string {
	return value.replace(/^#/, "");
}

function coerceParamValue({
	param,
	value,
}: {
	param: ParamDefinition;
	value: ParamValue | undefined;
}): ParamValue {
	if (value !== undefined) return value;
	return param.default;
}

function clampNumberParam({
	param,
	value,
}: {
	param: Extract<ParamDefinition, { type: "number" }>;
	value: number;
}): number {
	const max = param.max ?? value;
	return Math.max(param.min, Math.min(max, value));
}

export function MotionGraphicAssetDialog({
	open,
	onOpenChange,
	asset,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	asset: ProjectMotionGraphicAsset;
}) {
	const editor = useEditor();
	const definition = getGraphicDefinition({ definitionId: asset.definitionId });
	const editableParams = definition.params.filter(
		(param) => !HIDDEN_ASSET_PARAMS.has(param.key),
	);
	const [name, setName] = useState(asset.name);
	const [durationSeconds, setDurationSeconds] = useState(() =>
		mediaTimeToSeconds({ time: asset.duration }),
	);
	const [params, setParams] = useState<ParamValues>(() => ({
		...asset.params,
	}));

	const draftAsset = useMemo<ProjectMotionGraphicAsset>(
		() => ({
			...asset,
			name,
			duration: mediaTimeFromSeconds({
				seconds: Math.max(0.1, durationSeconds),
			}),
			params,
		}),
		[asset, durationSeconds, name, params],
	);
	const previewUrl = useMemo(
		() => buildProjectMotionGraphicPreviewUrl({ asset: draftAsset, size: 320 }),
		[draftAsset],
	);

	const setParam = ({ key, value }: { key: string; value: ParamValue }) => {
		setParams((current) => ({
			...current,
			[key]: value,
		}));
	};

	const handleSave = () => {
		const now = new Date().toISOString();
		editor.project.upsertMotionGraphicAsset({
			asset: {
				...draftAsset,
				name: draftAsset.name.trim() || asset.name,
				manifest: buildMotionGraphicManifest({
					definition,
					kind: asset.kind,
					params: draftAsset.params,
					sourcePrompt: asset.sourcePrompt,
					generatedAt: asset.manifest?.generatedAt ?? asset.createdAt,
					updatedAt: now,
				}),
				updatedAt: now,
			},
		});
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden bg-neutral-950 text-neutral-100">
				<DialogHeader className="border-neutral-800">
					<DialogTitle className="text-2xl">{name || "未命名 MG"}</DialogTitle>
				</DialogHeader>
				<DialogBody className="grid max-h-[68vh] grid-cols-1 gap-5 overflow-y-auto md:grid-cols-[240px_1fr]">
					<div className="flex flex-col gap-3">
						<div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
							<div className="aspect-square">
								<Image
									src={previewUrl}
									alt={name}
									width={320}
									height={320}
									className="size-full object-contain"
									unoptimized
								/>
							</div>
						</div>
						<div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-3">
							<p className="text-xs font-medium text-neutral-300">
								{definition.name}
							</p>
							<p className="mt-1 text-xs text-neutral-500">
								{asset.engine} · {asset.kind ?? "motion graphic"}
							</p>
						</div>
					</div>

					<div className="flex flex-col gap-4">
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
							<h3 className="text-sm font-semibold text-neutral-300">参数</h3>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{editableParams.map((param) => (
									<MotionGraphicParamField
										key={param.key}
										param={param}
										value={coerceParamValue({
											param,
											value: params[param.key],
										})}
										onChange={(value) => setParam({ key: param.key, value })}
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

function MotionGraphicParamField({
	param,
	value,
	onChange,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onChange: (value: ParamValue) => void;
}) {
	return (
		<label className="flex min-w-0 flex-col gap-2">
			<span className="text-sm font-medium text-neutral-300">
				{param.label}
			</span>
			<MotionGraphicParamInput
				param={param}
				value={value}
				onChange={onChange}
			/>
		</label>
	);
}

function MotionGraphicParamInput({
	param,
	value,
	onChange,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onChange: (value: ParamValue) => void;
}) {
	if (param.type === "number") {
		return (
			<Input
				type="number"
				min={param.min}
				max={param.max}
				step={param.step}
				value={typeof value === "number" ? value : Number(value)}
				onChange={(event) => {
					const nextValue = Number(event.currentTarget.value);
					onChange(
						clampNumberParam({
							param,
							value: Number.isFinite(nextValue) ? nextValue : param.default,
						}),
					);
				}}
				className="bg-neutral-900"
			/>
		);
	}

	if (param.type === "boolean") {
		return (
			<div className="flex h-9 items-center">
				<Switch checked={Boolean(value)} onCheckedChange={onChange} />
			</div>
		);
	}

	if (param.type === "select") {
		return (
			<Select value={String(value)} onValueChange={onChange}>
				<SelectTrigger className="bg-neutral-900">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{param.options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (param.type === "color") {
		return (
			<ColorPicker
				value={stripHash(String(value)).toUpperCase()}
				onChangeEnd={(color) => onChange(normalizeColor(color))}
				className="bg-neutral-900"
			/>
		);
	}

	if (param.type === "font") {
		return (
			<FontPicker
				defaultValue={String(value)}
				onValueChange={onChange}
				className="bg-neutral-900"
			/>
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
