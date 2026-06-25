import { describe, expect, mock, test } from "bun:test";
import type { DirectUploadSession } from "@/auth/client";
import type {
	CloudUploadTaskRecord,
	CloudUploadTaskStore,
} from "@/media/cloud-upload-tasks";

const completeCloudAssetUploadMock = mock(
	async ({
		projectId,
		assetId,
	}: {
		projectId: string;
		assetId: string;
	}) => ({
		asset: {
			id: assetId,
			userId: "user-1",
			projectId,
			name: "clip.mp4",
			mediaType: "video",
			mimeType: "video/mp4",
			sizeBytes: 16,
			objectKey: "shotlyx/users/user-1/projects/project-1/assets/asset-1/clip.mp4",
			uploadStatus: "uploaded" as const,
			createdAt: "2026-06-25T00:00:00.000Z",
			updatedAt: "2026-06-25T00:00:01.000Z",
			uploadedAt: "2026-06-25T00:00:01.000Z",
		},
		readUrl: "https://cos.example.com/clip.mp4",
	}),
);

const initiateCloudAssetUploadMock = mock(
	async (): Promise<{
		upload: DirectUploadSession;
		asset: {
			id: string;
			userId: string;
			projectId: string;
			name: string;
			mediaType: string;
			mimeType: string;
			sizeBytes: number;
			objectKey?: string;
			uploadStatus: "uploading";
			createdAt: string;
			updatedAt: string;
		};
	}> => ({
		upload: {
			mode: "cos",
			provider: "cos",
			bucket: "shotlyx-1250000000",
			region: "ap-beijing",
			key: "shotlyx/users/user-1/projects/project-1/assets/asset-1/clip.mp4",
			objectKey: "shotlyx/users/user-1/projects/project-1/assets/asset-1/clip.mp4",
			uploadToken: `token-${Date.now()}`,
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			sizeBytes: 16,
			maxSizeBytes: 1024 * 1024,
			sliceSizeBytes: 8,
			startTime: 1,
			expiredTime: 999999,
			credentials: {
				tmpSecretId: "tmp-id",
				tmpSecretKey: "tmp-key",
				sessionToken: "tmp-token",
			},
			localPreviewRecommended: true,
		},
		asset: {
			id: "asset-1",
			userId: "user-1",
			projectId: "project-1",
			name: "clip.mp4",
			mediaType: "video",
			mimeType: "video/mp4",
			sizeBytes: 16,
			objectKey: "shotlyx/users/user-1/projects/project-1/assets/asset-1/clip.mp4",
			uploadStatus: "uploading",
			createdAt: "2026-06-25T00:00:00.000Z",
			updatedAt: "2026-06-25T00:00:00.000Z",
		},
	}),
);

mock.module("@/auth/client", () => ({
	completeCloudAssetUpload: completeCloudAssetUploadMock,
	hasStoredAuthSession: () => true,
	initiateCloudAssetUpload: initiateCloudAssetUploadMock,
}));

const { prepareCosUploadFile, uploadMediaAssetToCloud } = await import(
	"../cloud-upload"
);

function createTaskStore(): CloudUploadTaskStore & {
	records: Map<string, CloudUploadTaskRecord>;
} {
	const records = new Map<string, CloudUploadTaskRecord>();
	return {
		records,
		async getTask({ projectId, assetId }) {
			return records.get(`${projectId}:${assetId}`) ?? null;
		},
		async upsertTask(task) {
			const now = "2026-06-25T00:00:00.000Z";
			const record: CloudUploadTaskRecord = {
				...task,
				createdAt: task.createdAt ?? now,
				updatedAt: task.updatedAt ?? now,
			};
			records.set(record.id, record);
			return record;
		},
		async patchTask({ projectId, assetId, patch }) {
			const id = `${projectId}:${assetId}`;
			const existing = records.get(id);
			if (!existing) return null;
			const next: CloudUploadTaskRecord = {
				...existing,
				...patch,
				updatedAt: "2026-06-25T00:00:01.000Z",
			};
			records.set(id, next);
			return next;
		},
		async removeTask({ projectId, assetId }) {
			records.delete(`${projectId}:${assetId}`);
		},
	};
}

describe("cloud media upload", () => {
	test("persists UploadId after a failed multipart upload and reuses it on retry", async () => {
		initiateCloudAssetUploadMock.mockClear();
		completeCloudAssetUploadMock.mockClear();
		const originalWarn = console.warn;
		console.warn = mock(() => {}) as typeof console.warn;
		const taskStore = createTaskStore();
		const uploadOptions: Array<{ UploadData?: { UploadId?: string } }> = [];
		let uploadCall = 0;
		class FakeCos {
			uploadFile(
				options: {
					UploadData?: { UploadId?: string };
					onTaskReady?: (taskId: string) => void;
					onProgress?: (progress: {
						loaded: number;
						total: number;
						percent: number;
					}) => void;
				},
				callback: (error: Error | null, data?: Record<string, unknown>) => void,
			) {
				uploadOptions.push(options);
				options.onTaskReady?.(`task-${uploadCall}`);
				options.onProgress?.({ loaded: 8, total: 16, percent: 0.5 });
				if (uploadCall === 0) {
					uploadCall += 1;
					callback(Object.assign(new Error("network_down"), { UploadId: "u-1" }));
					return;
				}
				uploadCall += 1;
				callback(null, { UploadId: options.UploadData?.UploadId });
			}
		}
		const asset = {
			id: "asset-1",
			name: "clip.mp4",
			type: "video" as const,
			file: new File(["0123456789abcdef"], "clip.mp4", {
				type: "video/mp4",
				lastModified: 123,
			}),
		};

		try {
			const failedState = await uploadMediaAssetToCloud({
				projectId: "project-1",
				asset,
				taskStore,
				cosConstructor: FakeCos as never,
			});
			expect(failedState.uploadStatus).toBe("failed");
			expect(taskStore.records.get("project-1:asset-1")?.uploadId).toBe("u-1");

			const uploadedState = await uploadMediaAssetToCloud({
				projectId: "project-1",
				asset,
				taskStore,
				cosConstructor: FakeCos as never,
			});

			expect(uploadOptions[1]?.UploadData?.UploadId).toBe("u-1");
			expect(uploadedState.uploadStatus).toBe("uploaded");
			expect(completeCloudAssetUploadMock).toHaveBeenCalledTimes(1);
			expect(taskStore.records.has("project-1:asset-1")).toBe(false);
		} finally {
			console.warn = originalWarn;
		}
	});

	test("restores stable file name and lastModifiedDate for COS UploadId cache", () => {
		const opfsFile = new File(["video"], "asset-1", {
			type: "video/mp4",
			lastModified: 456,
		});
		const prepared = prepareCosUploadFile({
			file: opfsFile,
			asset: {
				id: "asset-1",
				name: "original.mp4",
				type: "video",
				file: opfsFile,
			},
		});
		expect(prepared.name).toBe("original.mp4");
		expect((prepared as File & { lastModifiedDate?: Date }).lastModifiedDate).toBeInstanceOf(
			Date,
		);
	});
});
