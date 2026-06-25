import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";

export type CloudUploadTaskStatus =
	| "pending"
	| "uploading"
	| "failed"
	| "uploaded"
	| "canceled";

export type CloudUploadTaskProgress = {
	loaded: number;
	total: number;
	percent: number;
	speed?: number;
	updatedAt: string;
};

export type CloudUploadTaskRecord = {
	id: string;
	projectId: string;
	assetId: string;
	fileFingerprint: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	lastModified: number;
	objectKey?: string;
	uploadToken?: string;
	uploadId?: string;
	taskId?: string;
	status: CloudUploadTaskStatus;
	progress?: CloudUploadTaskProgress;
	error?: string;
	createdAt: string;
	updatedAt: string;
	expiresAt?: string;
};

export type CloudUploadTaskPatch = Partial<
	Pick<
		CloudUploadTaskRecord,
		| "objectKey"
		| "uploadToken"
		| "uploadId"
		| "taskId"
		| "status"
		| "progress"
		| "error"
		| "expiresAt"
	>
>;

export type CloudUploadTaskStore = {
	getTask(args: {
		projectId: string;
		assetId: string;
	}): Promise<CloudUploadTaskRecord | null>;
	upsertTask(
		task: Omit<CloudUploadTaskRecord, "createdAt" | "updatedAt"> & {
			createdAt?: string;
			updatedAt?: string;
		},
	): Promise<CloudUploadTaskRecord>;
	patchTask(args: {
		projectId: string;
		assetId: string;
		patch: CloudUploadTaskPatch;
	}): Promise<CloudUploadTaskRecord | null>;
	removeTask(args: { projectId: string; assetId: string }): Promise<void>;
};

const uploadTaskAdapter = new IndexedDBAdapter<CloudUploadTaskRecord>({
	dbName: "shotlyx-cloud-upload-tasks",
	storeName: "tasks",
});

export function buildCloudUploadTaskId({
	projectId,
	assetId,
}: {
	projectId: string;
	assetId: string;
}): string {
	return `${projectId}:${assetId}`;
}

export function buildFileFingerprint({
	fileName,
	sizeBytes,
	lastModified,
}: {
	fileName: string;
	sizeBytes: number;
	lastModified: number;
}): string {
	return [fileName, sizeBytes, lastModified].join("::");
}

export const cloudUploadTaskStore: CloudUploadTaskStore = {
	async getTask({ projectId, assetId }) {
		return uploadTaskAdapter.get(buildCloudUploadTaskId({ projectId, assetId }));
	},

	async upsertTask(task) {
		const now = new Date().toISOString();
		const record: CloudUploadTaskRecord = {
			...task,
			createdAt: task.createdAt ?? now,
			updatedAt: task.updatedAt ?? now,
		};
		await uploadTaskAdapter.set({ key: record.id, value: record });
		return record;
	},

	async patchTask({ projectId, assetId, patch }) {
		const id = buildCloudUploadTaskId({ projectId, assetId });
		const existing = await uploadTaskAdapter.get(id);
		if (!existing) return null;
		const next: CloudUploadTaskRecord = {
			...existing,
			...patch,
			updatedAt: new Date().toISOString(),
		};
		await uploadTaskAdapter.set({ key: id, value: next });
		return next;
	},

	async removeTask({ projectId, assetId }) {
		await uploadTaskAdapter.remove(buildCloudUploadTaskId({ projectId, assetId }));
	},
};
