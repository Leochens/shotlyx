import {
	completeCloudAssetUpload,
	hasStoredAuthSession,
	initiateCloudAssetUpload,
	type CloudMediaAssetMetadata,
	type CloudUploadStatus,
	type DirectUploadSession,
} from "@/auth/client";
import {
	buildCloudUploadTaskId,
	buildFileFingerprint,
	cloudUploadTaskStore,
	type CloudUploadTaskProgress,
	type CloudUploadTaskRecord,
	type CloudUploadTaskStore,
} from "@/media/cloud-upload-tasks";
import type { MediaAsset } from "@/media/types";

export type MediaAssetCloudState = {
	cloudAssetId?: string;
	uploadStatus: CloudUploadStatus;
	objectKey?: string;
	readUrl?: string;
	uploadedAt?: string;
	uploadTaskId?: string;
	uploadProgress?: number;
	uploadResumable?: boolean;
	uploadError?: string;
};

type CosProgress = {
	loaded: number;
	total: number;
	speed?: number;
	percent: number;
};

type CosUploadError = {
	UploadId?: unknown;
	message?: unknown;
};

type CosConstructor = new (options: {
	getAuthorization: (
		options: unknown,
		callback: (credentials: {
			TmpSecretId: string;
			TmpSecretKey: string;
			SecurityToken: string;
			StartTime: number;
			ExpiredTime: number;
		}) => void,
	) => void;
}) => {
	uploadFile: (
		options: {
			Bucket: string;
			Region: string;
			Key: string;
			Body: File;
			SliceSize?: number;
			ChunkSize?: number;
			AsyncLimit?: number;
			ContentType?: string;
			UploadData?: {
				UploadId?: string;
			};
			onTaskReady?: (taskId: string) => void;
			onProgress?: (progress: CosProgress) => void;
		},
		callback: (
			error: (CosUploadError & Error) | null,
			data: Record<string, unknown> | undefined,
		) => void,
	) => void;
};

type UploadMediaAssetOptions = {
	taskStore?: CloudUploadTaskStore;
	cosConstructor?: CosConstructor;
	onStateChange?: (state: MediaAssetCloudState) => void | Promise<void>;
	onProgress?: (progress: CloudUploadTaskProgress) => void;
};

function buildCloudMediaAssetMetadata({
	asset,
}: {
	asset: Pick<
		MediaAsset,
		"width" | "height" | "duration" | "fps" | "hasAudio" | "thumbnailUrl"
	>;
}): CloudMediaAssetMetadata {
	return {
		width: asset.width,
		height: asset.height,
		duration: asset.duration,
		fps: asset.fps,
		hasAudio: asset.hasAudio,
		thumbnailUrl: asset.thumbnailUrl,
	};
}

function getMediaMimeType(asset: MediaAsset): string {
	if (asset.file.type) return asset.file.type;
	if (asset.type === "video") return "video/mp4";
	if (asset.type === "image") return "image/png";
	if (asset.type === "audio") return "audio/mpeg";
	return "application/octet-stream";
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "object" && error !== null && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return message;
	}
	if (typeof error === "string") return error;
	return "cloud_upload_failed";
}

function readUploadId(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const uploadId = (value as { UploadId?: unknown }).UploadId;
	return typeof uploadId === "string" && uploadId ? uploadId : undefined;
}

function toDate(value: number): Date {
	return new Date(Number.isFinite(value) ? value : Date.now());
}

export function prepareCosUploadFile({
	file,
	asset,
}: {
	file: File;
	asset: MediaAsset;
}): File {
	const uploadFile =
		file.name === asset.name
			? file
			: new File([file.slice(0, file.size, file.type)], asset.name, {
					type: file.type || getMediaMimeType(asset),
					lastModified: file.lastModified || Date.now(),
				});
	const uploadFileWithLegacyDate = uploadFile as File & {
		lastModifiedDate?: Date;
	};
	if (uploadFile.name !== asset.name) {
		try {
			Object.defineProperty(uploadFileWithLegacyDate, "name", {
				configurable: true,
				value: asset.name,
			});
		} catch {
			// Some runtimes expose File.name as non-configurable. In that case COS can
			// still resume through explicit UploadData when the task store has UploadId.
		}
	}
	if (!uploadFileWithLegacyDate.lastModifiedDate) {
		try {
			Object.defineProperty(uploadFileWithLegacyDate, "lastModifiedDate", {
				configurable: true,
				value: toDate(uploadFile.lastModified),
			});
		} catch {
			uploadFileWithLegacyDate.lastModifiedDate = toDate(uploadFile.lastModified);
		}
	}
	return uploadFileWithLegacyDate;
}

function buildProgress(progress: CosProgress): CloudUploadTaskProgress {
	return {
		loaded: Math.max(0, progress.loaded),
		total: Math.max(0, progress.total),
		speed: progress.speed,
		percent: Math.max(0, Math.min(1, progress.percent)),
		updatedAt: new Date().toISOString(),
	};
}

async function resolveCosConstructor(
	cosConstructor?: CosConstructor,
): Promise<CosConstructor> {
	if (cosConstructor) return cosConstructor;
	const imported = (await import("cos-js-sdk-v5")) as {
		default?: CosConstructor;
	};
	if (!imported.default) throw new Error("cos_sdk_unavailable");
	return imported.default;
}

async function uploadToCos({
	session,
	file,
	asset,
	task,
	taskStore,
	cosConstructor,
	onProgress,
}: {
	session: DirectUploadSession;
	file: File;
	asset: MediaAsset;
	task: CloudUploadTaskRecord;
	taskStore: CloudUploadTaskStore;
	cosConstructor?: CosConstructor;
	onProgress?: (progress: CloudUploadTaskProgress) => void;
}): Promise<void> {
	if (
		!session.bucket ||
		!session.region ||
		!session.credentials ||
		session.mode !== "cos"
	) {
		throw new Error("invalid_cos_upload_session");
	}
	const Cos = await resolveCosConstructor(cosConstructor);
	const cos = new Cos({
		getAuthorization: (_options, callback) => {
			callback({
				TmpSecretId: session.credentials!.tmpSecretId,
				TmpSecretKey: session.credentials!.tmpSecretKey,
				SecurityToken: session.credentials!.sessionToken,
				StartTime: session.startTime,
				ExpiredTime: session.expiredTime,
			});
		},
	});

	const uploadFile = prepareCosUploadFile({ file, asset });
	await new Promise<void>((resolve, reject) => {
		let lastProgressWriteAt = 0;
		cos.uploadFile(
			{
				Bucket: session.bucket!,
				Region: session.region!,
				Key: session.key,
				Body: uploadFile,
				SliceSize: session.sliceSizeBytes,
				ChunkSize: session.sliceSizeBytes,
				AsyncLimit: 3,
				ContentType: session.mimeType,
				UploadData: task.uploadId ? { UploadId: task.uploadId } : undefined,
				onTaskReady: (taskId) => {
					void taskStore.patchTask({
						projectId: task.projectId,
						assetId: task.assetId,
						patch: { taskId, status: "uploading" },
					});
				},
				onProgress: (progress) => {
					const taskProgress = buildProgress(progress);
					onProgress?.(taskProgress);
					const now = Date.now();
					if (now - lastProgressWriteAt < 1000 && taskProgress.percent < 1) {
						return;
					}
					lastProgressWriteAt = now;
					void taskStore.patchTask({
						projectId: task.projectId,
						assetId: task.assetId,
						patch: { progress: taskProgress, status: "uploading" },
					});
				},
			},
			(error, data) => {
				if (error) {
					void taskStore.patchTask({
						projectId: task.projectId,
						assetId: task.assetId,
						patch: {
							uploadId: readUploadId(error) ?? task.uploadId,
							status: "failed",
							error: getErrorMessage(error),
						},
					});
					reject(error);
					return;
				}
				void taskStore.patchTask({
					projectId: task.projectId,
					assetId: task.assetId,
					patch: {
						uploadId: readUploadId(data) ?? task.uploadId,
						status: "uploaded",
						progress: {
							loaded: file.size,
							total: file.size,
							percent: 1,
							updatedAt: new Date().toISOString(),
						},
					},
				});
				resolve();
			},
		);
	});
}

export async function uploadMediaAssetToCloud({
	projectId,
	asset,
	taskStore = cloudUploadTaskStore,
	cosConstructor,
	onStateChange,
	onProgress,
}: {
	projectId: string;
	asset: MediaAsset;
} & UploadMediaAssetOptions): Promise<MediaAssetCloudState> {
	if (!hasStoredAuthSession()) {
		return { uploadStatus: "local-only" };
	}

	const mimeType = getMediaMimeType(asset);
	const uploadFile = prepareCosUploadFile({ file: asset.file, asset });
	const fileFingerprint = buildFileFingerprint({
		fileName: asset.name,
		sizeBytes: uploadFile.size,
		lastModified: uploadFile.lastModified,
	});
	const initiated = await initiateCloudAssetUpload({
		projectId,
		assetId: asset.id,
		fileName: asset.name,
		mimeType,
		mediaType: asset.type,
		sizeBytes: uploadFile.size,
		metadata: buildCloudMediaAssetMetadata({ asset }),
	});
	const taskId = buildCloudUploadTaskId({ projectId, assetId: asset.id });
	const existingTask = await taskStore.getTask({
		projectId,
		assetId: asset.id,
	});
	const canResumeExistingTask =
		existingTask?.fileFingerprint === fileFingerprint &&
		existingTask.objectKey === initiated.upload.objectKey;
	const task = await taskStore.upsertTask({
		id: taskId,
		projectId,
		assetId: asset.id,
		fileFingerprint,
		fileName: asset.name,
		mimeType,
		sizeBytes: uploadFile.size,
		lastModified: uploadFile.lastModified,
		objectKey: initiated.upload.objectKey,
		uploadToken: initiated.upload.uploadToken,
		uploadId: canResumeExistingTask ? existingTask?.uploadId : undefined,
		status: "uploading",
		progress: canResumeExistingTask ? existingTask?.progress : undefined,
		expiresAt: new Date(initiated.upload.expiredTime * 1000).toISOString(),
	});
	const uploadingState: MediaAssetCloudState = {
		cloudAssetId: initiated.asset.id,
		uploadStatus: initiated.asset.uploadStatus,
		objectKey: initiated.upload.objectKey,
		uploadTaskId: task.id,
		uploadProgress: task.progress?.percent,
		uploadResumable: true,
		uploadError: undefined,
	};
	await onStateChange?.(uploadingState);

	if (initiated.upload.mode === "local-preview") {
		await taskStore.removeTask({ projectId, assetId: asset.id });
		return {
			cloudAssetId: initiated.asset.id,
			uploadStatus: "local-only",
			objectKey: initiated.upload.objectKey,
			uploadTaskId: undefined,
			uploadProgress: undefined,
			uploadResumable: false,
			uploadError: undefined,
		};
	}

	try {
		await uploadToCos({
			session: initiated.upload,
			file: uploadFile,
			asset,
			task,
			taskStore,
			cosConstructor,
			onProgress,
		});
		const completed = await completeCloudAssetUpload({
			projectId,
			assetId: asset.id,
			uploadToken: initiated.upload.uploadToken,
		});
		await taskStore.removeTask({ projectId, assetId: asset.id });
		return {
			cloudAssetId: completed.asset.id,
			uploadStatus: "uploaded",
			objectKey: completed.asset.objectKey,
			readUrl: completed.readUrl ?? undefined,
			uploadedAt: completed.asset.uploadedAt,
			uploadTaskId: undefined,
			uploadProgress: 1,
			uploadResumable: false,
			uploadError: undefined,
		};
	} catch (error) {
		console.warn("Failed to upload media asset to cloud:", error);
		const failedTask = await taskStore.getTask({
			projectId,
			assetId: asset.id,
		});
		const failedState = {
			cloudAssetId: initiated.asset.id,
			uploadStatus: "failed" as const,
			objectKey: initiated.upload.objectKey,
			uploadTaskId: task.id,
			uploadProgress: failedTask?.progress?.percent ?? task.progress?.percent,
			uploadResumable: true,
			uploadError: getErrorMessage(error),
		};
		await onStateChange?.(failedState);
		return failedState;
	}
}
