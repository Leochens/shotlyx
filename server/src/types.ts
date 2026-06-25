export type PublicUser = {
	id: string;
	email: string;
	name: string;
	createdAt: string;
};

export type ShotlyxUser = PublicUser & {
	passwordHash: string;
	updatedAt: string;
};

export type ShotlyxSession = {
	token: string;
	userId: string;
	createdAt: string;
	expiresAt: string;
};

export type NewApiKeyBinding = {
	userId: string;
	tokenId: string;
	key: string;
	quota: number;
};

export type CreditLedgerStatus = "pending" | "applied" | "failed";

export type CreditLedgerEntry = {
	id: string;
	userId: string;
	idempotencyKey: string;
	type: "top_up";
	amount: number;
	balanceBefore: number;
	balanceAfter: number;
	status: CreditLedgerStatus;
	createdAt: string;
	updatedAt: string;
	externalPaymentId?: string;
	note?: string;
	meta?: Record<string, unknown>;
};

export type PaymentProvider = "zpay";
export type PaymentOrderStatus = "pending" | "paid" | "failed";
export type PaymentOrderPayType = "alipay" | "wxpay";

export type PaymentOrder = {
	id: string;
	provider: PaymentProvider;
	userId: string;
	outTradeNo: string;
	credits: number;
	moneyCents: number;
	payType: PaymentOrderPayType;
	status: PaymentOrderStatus;
	providerTradeNo?: string;
	createdAt: string;
	updatedAt: string;
	paidAt?: string;
	meta?: Record<string, unknown>;
};

export type SyncedProject = {
	id: string;
	userId: string;
	name: string;
	metadata: Record<string, unknown>;
	project: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

export type MediaAssetUploadStatus = "local-only" | "uploading" | "uploaded" | "failed";

export type SyncedMediaAsset = {
	id: string;
	userId: string;
	projectId: string;
	name: string;
	mediaType: string;
	mimeType: string;
	sizeBytes: number;
	metadata?: Record<string, unknown>;
	objectKey?: string;
	uploadStatus: MediaAssetUploadStatus;
	createdAt: string;
	updatedAt: string;
	uploadedAt?: string;
	expiresAt?: string;
};

export type ShotlyxLogEntry = {
	id: string;
	type: string;
	userId?: string;
	message: string;
	createdAt: string;
	meta?: Record<string, unknown>;
};

export type ServerSettings = {
	newApiBaseUrl: string;
	initialQuota: number;
	callbackSecretSet: boolean;
};

export type ShotlyxStore = {
	createUser(user: ShotlyxUser): Promise<void>;
	findUserByEmail(email: string): Promise<ShotlyxUser | null>;
	findUserById(id: string): Promise<ShotlyxUser | null>;
	listUsers(): Promise<ShotlyxUser[]>;

	createSession(session: ShotlyxSession): Promise<void>;
	findSessionByToken(token: string): Promise<ShotlyxSession | null>;

	saveNewApiKeyBinding(params: {
		shotlyxUserId: string;
		binding: NewApiKeyBinding;
	}): Promise<void>;
	findNewApiKeyByShotlyxUserId(
		shotlyxUserId: string,
	): Promise<NewApiKeyBinding | null>;

	addLog(entry: ShotlyxLogEntry): Promise<void>;
	listLogs(): Promise<ShotlyxLogEntry[]>;

	insertCreditLedgerEntryIfAbsent(
		entry: CreditLedgerEntry,
	): Promise<{ entry: CreditLedgerEntry; inserted: boolean }>;
	updateCreditLedgerEntry(entry: CreditLedgerEntry): Promise<CreditLedgerEntry>;
	listCreditLedgerEntriesByUserId(userId: string): Promise<CreditLedgerEntry[]>;

	createPaymentOrder(order: PaymentOrder): Promise<void>;
	findPaymentOrderByOutTradeNo(
		outTradeNo: string,
	): Promise<PaymentOrder | null>;
	updatePaymentOrder(order: PaymentOrder): Promise<PaymentOrder>;
	listPaymentOrdersByUserId(userId: string): Promise<PaymentOrder[]>;

	upsertProject(project: SyncedProject): Promise<void>;
	findProjectByUserId(params: {
		userId: string;
		projectId: string;
	}): Promise<SyncedProject | null>;
	listProjectsByUserId(userId: string): Promise<SyncedProject[]>;
	deleteProjectByUserId(params: {
		userId: string;
		projectId: string;
	}): Promise<void>;

	upsertMediaAsset(asset: SyncedMediaAsset): Promise<void>;
	findMediaAssetByUserId(params: {
		userId: string;
		projectId: string;
		assetId: string;
	}): Promise<SyncedMediaAsset | null>;
	listMediaAssetsByProjectId(params: {
		userId: string;
		projectId: string;
	}): Promise<SyncedMediaAsset[]>;
	deleteMediaAssetsByProjectId(params: {
		userId: string;
		projectId: string;
	}): Promise<void>;

	getSettings(): Promise<ServerSettings>;
	updateSettings(settings: Partial<ServerSettings>): Promise<ServerSettings>;
};
