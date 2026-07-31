"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { storageService } from "@/services/storage/service";
import { formatStorageBytes } from "@/services/storage/quota";
import { cn } from "@/utils/ui";

interface DesktopMediaLibraryStatus {
	cancelled?: boolean;
	configPath?: string;
	desktop?: boolean;
	directory?: string;
	error?: string;
	exists?: boolean;
	projectId?: string;
	projectDirectory?: string | null;
	projectSizeBytes?: number | null;
	sizeBytes?: number;
	updatedAt?: string;
}

type BusyAction = "refresh" | "select" | "open" | null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readStringValue({
	key,
	value,
}: {
	key: keyof DesktopMediaLibraryStatus;
	value: Record<string, unknown>;
}): string | undefined {
	const item = Reflect.get(value, key);
	return typeof item === "string" ? item : undefined;
}

function readNumberValue({
	key,
	value,
}: {
	key: keyof DesktopMediaLibraryStatus;
	value: Record<string, unknown>;
}): number | undefined {
	const item = Reflect.get(value, key);
	return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function readNullableNumberValue({
	key,
	value,
}: {
	key: keyof DesktopMediaLibraryStatus;
	value: Record<string, unknown>;
}): number | null | undefined {
	const item = Reflect.get(value, key);
	if (item === null) return null;
	return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function parseDesktopMediaLibraryStatus(
	value: unknown,
): DesktopMediaLibraryStatus {
	if (!isRecord(value)) return {};
	return {
		cancelled: Reflect.get(value, "cancelled") === true,
		configPath: readStringValue({ key: "configPath", value }),
		desktop: Reflect.get(value, "desktop") === true,
		directory: readStringValue({ key: "directory", value }),
		error: readStringValue({ key: "error", value }),
		exists: Reflect.get(value, "exists") === true,
		projectId: readStringValue({ key: "projectId", value }),
		projectDirectory:
			Reflect.get(value, "projectDirectory") === null
				? null
				: readStringValue({ key: "projectDirectory", value }),
		projectSizeBytes: readNullableNumberValue({
			key: "projectSizeBytes",
			value,
		}),
		sizeBytes: readNumberValue({ key: "sizeBytes", value }),
		updatedAt: readStringValue({ key: "updatedAt", value }),
	};
}

export function StorageSettingsPanel() {
	const isDesktop = process.env.VITE_SHOTLYX_DESKTOP === "1";
	const activeProject = useEditor((editor) => editor.project.getActiveOrNull());
	const mediaAssets = useEditor((editor) => editor.media.getAssets());
	const [status, setStatus] = useState<DesktopMediaLibraryStatus | null>(null);
	const [busyAction, setBusyAction] = useState<BusyAction>(null);
	const [error, setError] = useState<string | null>(null);

	const projectId = activeProject?.metadata.id;

	const loadStatus = useCallback(async () => {
		if (!isDesktop) return;
		setBusyAction((current) => current ?? "refresh");
		setError(null);
		try {
			const params = projectId
				? `?${new URLSearchParams({ projectId }).toString()}`
				: "";
			const response = await fetch(`/api/desktop/media-library${params}`, {
				cache: "no-store",
			});
			if (!response.ok) {
				throw new Error(`Storage request failed: ${response.status}`);
			}
			setStatus(parseDesktopMediaLibraryStatus(await response.json()));
		} catch (nextError) {
			const message =
				nextError instanceof Error
					? nextError.message
					: "Unable to load storage";
			setError(message);
		} finally {
			setBusyAction((current) => (current === "refresh" ? null : current));
		}
	}, [isDesktop, projectId]);

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			void loadStatus();
		}, 0);
		return () => window.clearTimeout(timeout);
	}, [loadStatus]);

	const handleChooseDirectory = async () => {
		if (!projectId) return;
		setBusyAction("select");
		setError(null);
		try {
			const response = await fetch("/api/desktop/media-library/select", {
				method: "POST",
			});
			if (!response.ok) {
				throw new Error(`Folder selection failed: ${response.status}`);
			}
			const result = parseDesktopMediaLibraryStatus(await response.json());
			if (result.cancelled) return;

			await storageService.copyMediaAssetsToCurrentBackend({
				assets: mediaAssets,
				projectId,
			});
			setStatus(result);
			toast.success("媒体库位置已更新", {
				description: result.directory,
			});
			await loadStatus();
		} catch (nextError) {
			const message =
				nextError instanceof Error
					? nextError.message
					: "Unable to change storage folder";
			setError(message);
			toast.error("媒体库位置更新失败", {
				description: message,
			});
		} finally {
			setBusyAction(null);
		}
	};

	const handleOpenDirectory = async () => {
		setBusyAction("open");
		setError(null);
		try {
			const params = projectId
				? `?${new URLSearchParams({ projectId }).toString()}`
				: "";
			const response = await fetch(`/api/desktop/media-library/open${params}`, {
				method: "POST",
			});
			if (!response.ok) {
				throw new Error(`Open folder failed: ${response.status}`);
			}
			const result = parseDesktopMediaLibraryStatus(await response.json());
			if (result.error) {
				throw new Error(result.error);
			}
		} catch (nextError) {
			const message =
				nextError instanceof Error
					? nextError.message
					: "Unable to open folder";
			setError(message);
			toast.error("无法打开媒体库文件夹", {
				description: message,
			});
		} finally {
			setBusyAction(null);
		}
	};

	if (!isDesktop) {
		return (
			<div className="flex h-full flex-col justify-center px-8 text-sm text-muted-foreground">
				<h2 className="mb-2 text-base font-medium text-foreground">存储位置</h2>
				<p>自定义媒体库目录仅在 Shotlyx Desktop 中可用。</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="border-b px-5 py-4">
				<h2 className="text-base font-medium text-foreground">项目文件夹</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					每个工程都是一个可见的 .shotlyx
					文件夹。导入素材默认保留原文件链接，生成和录制素材保存在项目内。
				</p>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				<div className="space-y-4">
					<StorageInfoRow
						label="项目根目录"
						value={status?.directory ?? "正在读取..."}
						monospace
					/>
					<div className="grid grid-cols-2 gap-3">
						<StorageMetric
							label="全部项目"
							value={
								status?.sizeBytes == null
									? "..."
									: formatStorageBytes({ bytes: status.sizeBytes })
							}
						/>
						<StorageMetric
							label="当前项目"
							value={
								status?.projectSizeBytes == null
									? "..."
									: formatStorageBytes({ bytes: status.projectSizeBytes })
							}
						/>
					</div>
					<StorageInfoRow
						label="当前项目目录"
						value={status?.projectDirectory ?? "尚未创建"}
						monospace
					/>
					{error && (
						<div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</div>
					)}
				</div>
			</div>
			<div className="flex items-center justify-between gap-3 border-t px-5 py-3">
				<p className="text-xs text-muted-foreground">
					更改位置会复制已有 .shotlyx 项目；外部链接素材不会被重复复制。
				</p>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleOpenDirectory}
						disabled={busyAction !== null}
					>
						<FolderOpen className="size-4" />
						打开项目
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={loadStatus}
						disabled={busyAction !== null}
					>
						<RefreshCw
							className={cn(
								"size-4",
								busyAction === "refresh" && "animate-spin",
							)}
						/>
						刷新
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={handleChooseDirectory}
						disabled={busyAction !== null || !projectId}
					>
						更改位置
					</Button>
				</div>
			</div>
		</div>
	);
}

function StorageInfoRow({
	label,
	monospace = false,
	value,
}: {
	label: string;
	monospace?: boolean;
	value: string;
}) {
	return (
		<div className="rounded-sm border bg-muted/20 px-3 py-2">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div
				className={cn(
					"mt-1 break-all text-sm text-foreground",
					monospace && "font-mono text-xs",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function StorageMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-sm border bg-background px-3 py-3">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 text-lg font-medium text-foreground">{value}</div>
		</div>
	);
}
