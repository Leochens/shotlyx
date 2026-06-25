export type ObjectStorageDriver = "local" | "cos" | "r2" | "s3";

export type ObjectStorageConfigStatus = {
	driver: ObjectStorageDriver;
	configured: boolean;
	productionReady: boolean;
	keyPrefix: string;
	bucket?: string;
	endpoint?: string;
	publicBaseUrl?: string;
	missing: string[];
	maxUploadSizeMb: number;
	localPreviewRecommended: boolean;
	signedUrlTtlSeconds: number;
	cosUploadStsTtlSeconds: number;
	cosUploadSliceSizeMb: number;
};

const DEFAULT_KEY_PREFIX = "shotlyx";
const DEFAULT_MAX_UPLOAD_SIZE_MB = 5120;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
const DEFAULT_COS_UPLOAD_STS_TTL_SECONDS = 1800;
const DEFAULT_COS_UPLOAD_SLICE_SIZE_MB = 8;

export type ResolvedCosStorageConfig = {
	driver: "cos";
	region: string;
	bucket: string;
	endpoint: string;
	secretId: string;
	secretKey: string;
	keyPrefix: string;
	publicBaseUrl?: string;
	maxUploadSizeMb: number;
	signedUrlTtlSeconds: number;
	cosUploadStsTtlSeconds: number;
	cosUploadSliceSizeMb: number;
};

function clean(value: string | undefined): string {
	return value?.trim() ?? "";
}

function normalizePrefix(value: string | undefined): string {
	return (clean(value) || DEFAULT_KEY_PREFIX)
		.replace(/^\/+|\/+$/g, "")
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean)
		.join("/");
}

function readPositiveInt(
	env: NodeJS.ProcessEnv,
	name: string,
	fallback: number,
): number {
	const value = Number(env[name]);
	return Number.isInteger(value) && value > 0 ? value : fallback;
}

function missing(env: NodeJS.ProcessEnv, names: string[]): string[] {
	return names.filter((name) => !clean(env[name]));
}

export function inspectObjectStorageConfig(
	env: NodeJS.ProcessEnv = process.env,
): ObjectStorageConfigStatus {
	const driver = (clean(env.STORAGE_DRIVER) || "local") as ObjectStorageDriver;
	const keyPrefix = normalizePrefix(
		env.STORAGE_KEY_PREFIX ||
			env.COS_KEY_PREFIX ||
			env.R2_KEY_PREFIX ||
			env.S3_KEY_PREFIX,
	);
	const maxUploadSizeMb = readPositiveInt(
		env,
		"STORAGE_MAX_UPLOAD_SIZE_MB",
		DEFAULT_MAX_UPLOAD_SIZE_MB,
	);

	if (driver === "local") {
		const allowLocal = env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION === "true";
		return {
			driver,
			configured: true,
			productionReady: env.NODE_ENV !== "production" || allowLocal,
			keyPrefix,
			missing: [],
			maxUploadSizeMb,
			localPreviewRecommended: true,
			signedUrlTtlSeconds: readPositiveInt(
				env,
				"COS_SIGNED_URL_TTL_SECONDS",
				DEFAULT_SIGNED_URL_TTL_SECONDS,
			),
			cosUploadStsTtlSeconds: readPositiveInt(
				env,
				"COS_UPLOAD_STS_TTL_SECONDS",
				DEFAULT_COS_UPLOAD_STS_TTL_SECONDS,
			),
			cosUploadSliceSizeMb: readPositiveInt(
				env,
				"COS_UPLOAD_SLICE_SIZE_MB",
				DEFAULT_COS_UPLOAD_SLICE_SIZE_MB,
			),
		};
	}

	const required =
		driver === "cos"
			? ["COS_REGION", "COS_BUCKET", "COS_SECRET_ID", "COS_SECRET_KEY"]
			: driver === "r2"
				? [
						"R2_ENDPOINT",
						"R2_BUCKET",
						"R2_ACCESS_KEY_ID",
						"R2_SECRET_ACCESS_KEY",
					]
				: [
						"S3_ENDPOINT",
						"S3_BUCKET",
						"S3_ACCESS_KEY_ID",
						"S3_SECRET_ACCESS_KEY",
					];
	const missingNames = missing(env, required);
	const bucket = env.COS_BUCKET || env.R2_BUCKET || env.S3_BUCKET || undefined;
	const endpoint =
		env.COS_ENDPOINT ||
		env.R2_ENDPOINT ||
		env.S3_ENDPOINT ||
		(env.COS_REGION ? `https://cos.${env.COS_REGION}.myqcloud.com` : undefined);
	const publicBaseUrl =
		env.COS_PUBLIC_BASE_URL ||
		env.R2_PUBLIC_BASE_URL ||
		env.S3_PUBLIC_BASE_URL ||
		undefined;

	return {
		driver,
		configured: missingNames.length === 0,
		productionReady: missingNames.length === 0,
		keyPrefix,
		bucket,
		endpoint,
		publicBaseUrl,
		missing: missingNames,
		maxUploadSizeMb,
		localPreviewRecommended: true,
		signedUrlTtlSeconds: readPositiveInt(
			env,
			"COS_SIGNED_URL_TTL_SECONDS",
			DEFAULT_SIGNED_URL_TTL_SECONDS,
		),
		cosUploadStsTtlSeconds: readPositiveInt(
			env,
			"COS_UPLOAD_STS_TTL_SECONDS",
			DEFAULT_COS_UPLOAD_STS_TTL_SECONDS,
		),
		cosUploadSliceSizeMb: readPositiveInt(
			env,
			"COS_UPLOAD_SLICE_SIZE_MB",
			DEFAULT_COS_UPLOAD_SLICE_SIZE_MB,
		),
	};
}

export function normalizeObjectPrefix(prefix: string | undefined): string {
	return normalizePrefix(prefix);
}

export function buildObjectKey({
	keyPrefix,
	relativePath,
}: {
	keyPrefix: string;
	relativePath: string;
}): string {
	return [normalizePrefix(keyPrefix), relativePath.replace(/^\/+/, "")]
		.filter(Boolean)
		.join("/");
}

export function resolveCosStorageConfig(
	env: NodeJS.ProcessEnv = process.env,
): ResolvedCosStorageConfig {
	const status = inspectObjectStorageConfig(env);
	if (status.driver !== "cos") {
		throw new Error("cos_storage_not_enabled");
	}
	if (!status.configured) {
		throw new Error(`cos_storage_missing_config:${status.missing.join(",")}`);
	}
	const region = clean(env.COS_REGION);
	const bucket = clean(env.COS_BUCKET);
	return {
		driver: "cos",
		region,
		bucket,
		endpoint: clean(env.COS_ENDPOINT) || `https://cos.${region}.myqcloud.com`,
		secretId: clean(env.COS_SECRET_ID),
		secretKey: clean(env.COS_SECRET_KEY),
		keyPrefix: status.keyPrefix,
		publicBaseUrl: status.publicBaseUrl,
		maxUploadSizeMb: status.maxUploadSizeMb,
		signedUrlTtlSeconds: status.signedUrlTtlSeconds,
		cosUploadStsTtlSeconds: status.cosUploadStsTtlSeconds,
		cosUploadSliceSizeMb: status.cosUploadSliceSizeMb,
	};
}
