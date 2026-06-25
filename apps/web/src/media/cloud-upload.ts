import {
	completeCloudAssetUpload,
	hasStoredAuthSession,
	initiateCloudAssetUpload,
	type CloudUploadStatus,
	type DirectUploadSession,
} from "@/auth/client";
import type { MediaAsset } from "@/media/types";

export type MediaAssetCloudState = {
	cloudAssetId?: string;
	uploadStatus: CloudUploadStatus;
	objectKey?: string;
	readUrl?: string;
	uploadedAt?: string;
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
			ContentType?: string;
		},
		callback: (error: unknown, data: unknown) => void,
	) => void;
};

function getMediaMimeType(asset: MediaAsset): string {
	if (asset.file.type) return asset.file.type;
	if (asset.type === "video") return "video/mp4";
	if (asset.type === "image") return "image/png";
	if (asset.type === "audio") return "audio/mpeg";
	return "application/octet-stream";
}

async function uploadToCos({
	session,
	file,
}: {
	session: DirectUploadSession;
	file: File;
}): Promise<void> {
	if (
		!session.bucket ||
		!session.region ||
		!session.credentials ||
		session.mode !== "cos"
	) {
		throw new Error("invalid_cos_upload_session");
	}
	const imported = (await import("cos-js-sdk-v5")) as {
		default?: CosConstructor;
	};
	const Cos = imported.default;
	if (!Cos) throw new Error("cos_sdk_unavailable");
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

	await new Promise<void>((resolve, reject) => {
		cos.uploadFile(
			{
				Bucket: session.bucket!,
				Region: session.region!,
				Key: session.key,
				Body: file,
				SliceSize: session.sliceSizeBytes,
				ContentType: session.mimeType,
			},
			(error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			},
		);
	});
}

export async function uploadMediaAssetToCloud({
	projectId,
	asset,
}: {
	projectId: string;
	asset: MediaAsset;
}): Promise<MediaAssetCloudState> {
	if (!hasStoredAuthSession()) {
		return { uploadStatus: "local-only" };
	}

	const mimeType = getMediaMimeType(asset);
	const initiated = await initiateCloudAssetUpload({
		projectId,
		assetId: asset.id,
		fileName: asset.name,
		mimeType,
		mediaType: asset.type,
		sizeBytes: asset.file.size,
	});

	if (initiated.upload.mode === "local-preview") {
		return {
			cloudAssetId: initiated.asset.id,
			uploadStatus: "local-only",
			objectKey: initiated.upload.objectKey,
		};
	}

	try {
		await uploadToCos({ session: initiated.upload, file: asset.file });
		const completed = await completeCloudAssetUpload({
			projectId,
			assetId: asset.id,
			uploadToken: initiated.upload.uploadToken,
		});
		return {
			cloudAssetId: completed.asset.id,
			uploadStatus: "uploaded",
			objectKey: completed.asset.objectKey,
			readUrl: completed.readUrl ?? undefined,
			uploadedAt: completed.asset.uploadedAt,
		};
	} catch (error) {
		console.warn("Failed to upload media asset to cloud:", error);
		return {
			cloudAssetId: initiated.asset.id,
			uploadStatus: "failed",
			objectKey: initiated.upload.objectKey,
		};
	}
}
