import { createHmac } from "node:crypto";
import {
	HeadObjectCommand,
	S3Client,
	type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as STSModule from "qcloud-cos-sts";
import {
	buildObjectKey,
	inspectObjectStorageConfig,
	resolveCosStorageConfig,
	type ResolvedCosStorageConfig,
} from "./object-storage-config";

export type DirectUploadMode = "local-preview" | "cos";

export type DirectUploadSession = {
	mode: DirectUploadMode;
	provider: "local" | "cos";
	bucket?: string;
	region?: string;
	key: string;
	objectKey: string;
	uploadToken: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	maxSizeBytes: number;
	sliceSizeBytes: number;
	startTime: number;
	expiredTime: number;
	credentials?: {
		tmpSecretId: string;
		tmpSecretKey: string;
		sessionToken: string;
	};
	localPreviewRecommended: boolean;
};

type UploadTokenPayload = {
	userId: string;
	projectId: string;
	assetId: string;
	objectKey: string;
	mimeType: string;
	sizeBytes: number;
	expiresAt: number;
};

type CreateDirectUploadSessionInput = {
	userId: string;
	projectId: string;
	assetId: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
};

type CompleteDirectUploadInput = {
	userId: string;
	projectId: string;
	assetId: string;
	uploadToken: string;
};

const COS_UPLOAD_ACTIONS = [
	"name/cos:PutObject",
	"name/cos:PostObject",
	"name/cos:InitiateMultipartUpload",
	"name/cos:ListMultipartUploads",
	"name/cos:ListParts",
	"name/cos:UploadPart",
	"name/cos:CompleteMultipartUpload",
	"name/cos:AbortMultipartUpload",
];

function safeFileName(fileName: string): string {
	const cleaned = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
	return cleaned || "upload.bin";
}

function toBase64Url(value: string): string {
	return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): string {
	return Buffer.from(value, "base64url").toString("utf8");
}

function getUploadTokenSecret(env: NodeJS.ProcessEnv): string {
	return (
		env.SHOTLYX_UPLOAD_TOKEN_SECRET ||
		env.SHOTLYX_ADMIN_TOKEN ||
		env.COS_SECRET_KEY ||
		"shotlyx-local-upload-token"
	);
}

function signPayload({
	payload,
	env,
}: {
	payload: string;
	env: NodeJS.ProcessEnv;
}): string {
	return createHmac("sha256", getUploadTokenSecret(env))
		.update(payload)
		.digest("base64url");
}

function createUploadToken({
	payload,
	env,
}: {
	payload: UploadTokenPayload;
	env: NodeJS.ProcessEnv;
}): string {
	const encodedPayload = toBase64Url(JSON.stringify(payload));
	return `${encodedPayload}.${signPayload({ payload: encodedPayload, env })}`;
}

function verifyUploadToken({
	token,
	env,
}: {
	token: string;
	env: NodeJS.ProcessEnv;
}): UploadTokenPayload {
	const [encodedPayload, signature] = token.split(".");
	if (!encodedPayload || !signature) {
		throw new Error("invalid_upload_token");
	}
	const expected = signPayload({ payload: encodedPayload, env });
	if (signature !== expected) {
		throw new Error("invalid_upload_token");
	}
	const parsed = JSON.parse(fromBase64Url(encodedPayload)) as UploadTokenPayload;
	if (parsed.expiresAt < Math.floor(Date.now() / 1000)) {
		throw new Error("upload_token_expired");
	}
	return parsed;
}

function parseCosBucket(bucket: string): { shortBucketName: string; appId: string } {
	const splitAt = bucket.lastIndexOf("-");
	if (splitAt <= 0 || splitAt === bucket.length - 1) {
		throw new Error("cos_bucket_must_include_app_id");
	}
	return {
		shortBucketName: bucket.slice(0, splitAt),
		appId: bucket.slice(splitAt + 1),
	};
}

function buildCosObjectResource({
	bucket,
	region,
	objectKey,
}: {
	bucket: string;
	region: string;
	objectKey: string;
}): string {
	const { shortBucketName, appId } = parseCosBucket(bucket);
	return `qcs::cos:${region}:uid/${appId}:prefix//${appId}/${shortBucketName}/${objectKey.replace(/^\/+/, "")}`;
}

function buildCosUploadPolicy({
	bucket,
	region,
	objectKey,
}: {
	bucket: string;
	region: string;
	objectKey: string;
}) {
	return {
		version: "2.0",
		statement: [
			{
				action: COS_UPLOAD_ACTIONS,
				effect: "allow",
				principal: { qcs: ["*"] },
				resource: buildCosObjectResource({ bucket, region, objectKey }),
			},
		],
	};
}

function createS3Client(config: ResolvedCosStorageConfig): S3Client {
	return new S3Client({
		region: config.region,
		endpoint: config.endpoint,
		forcePathStyle: false,
		credentials: {
			accessKeyId: config.secretId,
			secretAccessKey: config.secretKey,
		},
	});
}

async function createCosCredentials({
	config,
	objectKey,
}: {
	config: ResolvedCosStorageConfig;
	objectKey: string;
}): Promise<DirectUploadSession["credentials"]> {
	const stsAny = (STSModule as Record<string, unknown>).default ?? STSModule;
	const getCredential = (stsAny as { getCredential?: unknown }).getCredential;
	if (typeof getCredential !== "function") {
		throw new Error("qcloud_cos_sts_get_credential_unavailable");
	}

	const credential = await new Promise<Record<string, unknown>>((resolve, reject) => {
		getCredential(
			{
				secretId: config.secretId,
				secretKey: config.secretKey,
				durationSeconds: config.cosUploadStsTtlSeconds,
				policy: buildCosUploadPolicy({
					bucket: config.bucket,
					region: config.region,
					objectKey,
				}),
			},
			(error: unknown, data: unknown) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(data as Record<string, unknown>);
			},
		);
	});

	const credentials = credential.credentials as
		| Record<string, unknown>
		| undefined;
	const tmpSecretId = credentials?.tmpSecretId;
	const tmpSecretKey = credentials?.tmpSecretKey;
	const sessionToken = credentials?.sessionToken;
	if (
		typeof tmpSecretId !== "string" ||
		typeof tmpSecretKey !== "string" ||
		typeof sessionToken !== "string"
	) {
		throw new Error("invalid_cos_sts_response");
	}
	return { tmpSecretId, tmpSecretKey, sessionToken };
}

function assertHeadMatchesUpload({
	head,
	payload,
}: {
	head: HeadObjectCommandOutput;
	payload: UploadTokenPayload;
}): void {
	if (typeof head.ContentLength === "number" && head.ContentLength !== payload.sizeBytes) {
		throw new Error("uploaded_object_size_mismatch");
	}
	const contentType = head.ContentType ?? "";
	if (contentType && payload.mimeType && contentType !== payload.mimeType) {
		throw new Error("uploaded_object_mime_mismatch");
	}
}

export function createCloudStorageService({
	env = process.env,
}: {
	env?: NodeJS.ProcessEnv;
} = {}) {
	return {
		configStatus() {
			return inspectObjectStorageConfig(env);
		},

		async createDirectUploadSession(
			input: CreateDirectUploadSessionInput,
		): Promise<DirectUploadSession> {
			const status = inspectObjectStorageConfig(env);
			const maxSizeBytes = status.maxUploadSizeMb * 1024 * 1024;
			if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
				throw new Error("invalid_upload_size");
			}
			if (input.sizeBytes > maxSizeBytes) {
				throw new Error("upload_too_large");
			}

			const relativePath = `users/${input.userId}/projects/${input.projectId}/assets/${input.assetId}/${safeFileName(input.fileName)}`;
			const objectKey = buildObjectKey({
				keyPrefix: status.keyPrefix,
				relativePath,
			});
			const nowSeconds = Math.floor(Date.now() / 1000);
			const expiresAt = nowSeconds + status.cosUploadStsTtlSeconds;
			const uploadToken = createUploadToken({
				env,
				payload: {
					userId: input.userId,
					projectId: input.projectId,
					assetId: input.assetId,
					objectKey,
					mimeType: input.mimeType,
					sizeBytes: input.sizeBytes,
					expiresAt,
				},
			});

			if (status.driver !== "cos") {
				return {
					mode: "local-preview",
					provider: "local",
					key: objectKey,
					objectKey,
					uploadToken,
					fileName: input.fileName,
					mimeType: input.mimeType,
					sizeBytes: input.sizeBytes,
					maxSizeBytes,
					sliceSizeBytes: status.cosUploadSliceSizeMb * 1024 * 1024,
					startTime: nowSeconds,
					expiredTime: expiresAt,
					localPreviewRecommended: true,
				};
			}

			const config = resolveCosStorageConfig(env);
			const credentials = await createCosCredentials({ config, objectKey });
			return {
				mode: "cos",
				provider: "cos",
				bucket: config.bucket,
				region: config.region,
				key: objectKey,
				objectKey,
				uploadToken,
				fileName: input.fileName,
				mimeType: input.mimeType,
				sizeBytes: input.sizeBytes,
				maxSizeBytes,
				sliceSizeBytes: config.cosUploadSliceSizeMb * 1024 * 1024,
				startTime: nowSeconds,
				expiredTime: expiresAt,
				credentials,
				localPreviewRecommended: true,
			};
		},

		async completeDirectUpload(
			input: CompleteDirectUploadInput,
		): Promise<UploadTokenPayload> {
			const payload = verifyUploadToken({ token: input.uploadToken, env });
			if (
				payload.userId !== input.userId ||
				payload.projectId !== input.projectId ||
				payload.assetId !== input.assetId
			) {
				throw new Error("upload_token_scope_mismatch");
			}
			const status = inspectObjectStorageConfig(env);
			if (status.driver !== "cos") {
				return payload;
			}
			const config = resolveCosStorageConfig(env);
			const client = createS3Client(config);
			const head = await client.send(
				new HeadObjectCommand({
					Bucket: config.bucket,
					Key: payload.objectKey,
				}),
			);
			assertHeadMatchesUpload({ head, payload });
			return payload;
		},

		async createReadUrl({ objectKey }: { objectKey: string }): Promise<string | null> {
			const status = inspectObjectStorageConfig(env);
			if (status.driver !== "cos") return null;
			const config = resolveCosStorageConfig(env);
			if (config.publicBaseUrl) {
				return `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`;
			}
			const client = createS3Client(config);
			return getSignedUrl(
				client,
				new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
				{ expiresIn: config.signedUrlTtlSeconds },
			);
		},
	};
}
