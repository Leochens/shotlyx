import type {
	CreditLedgerEntry,
	NewApiKeyBinding,
	PaymentOrder,
	ServerSettings,
	SyncedMediaAsset,
	SyncedProject,
	ShotlyxLogEntry,
	ShotlyxSession,
	ShotlyxStore,
	ShotlyxUser,
} from "./types";

const DEFAULT_SETTINGS: ServerSettings = {
	newApiBaseUrl: "",
	initialQuota: 100_000,
	callbackSecretSet: false,
};

export class InMemoryShotlyxStore implements ShotlyxStore {
	private readonly usersById = new Map<string, ShotlyxUser>();
	private readonly userIdsByEmail = new Map<string, string>();
	private readonly sessionsByToken = new Map<string, ShotlyxSession>();
	private readonly newApiKeysByUserId = new Map<string, NewApiKeyBinding>();
	private readonly logs: ShotlyxLogEntry[] = [];
	private readonly creditLedgerById = new Map<string, CreditLedgerEntry>();
	private readonly creditLedgerIdsByIdempotencyKey = new Map<string, string>();
	private readonly paymentOrdersByOutTradeNo = new Map<string, PaymentOrder>();
	private readonly projectsById = new Map<string, SyncedProject>();
	private readonly mediaAssetsById = new Map<string, SyncedMediaAsset>();
	private settings: ServerSettings;

	constructor(settings: Partial<ServerSettings> = {}) {
		this.settings = { ...DEFAULT_SETTINGS, ...settings };
	}

	async createUser(user: ShotlyxUser): Promise<void> {
		this.usersById.set(user.id, user);
		this.userIdsByEmail.set(user.email, user.id);
	}

	async findUserByEmail(email: string): Promise<ShotlyxUser | null> {
		const id = this.userIdsByEmail.get(email);
		return id ? (this.usersById.get(id) ?? null) : null;
	}

	async findUserById(id: string): Promise<ShotlyxUser | null> {
		return this.usersById.get(id) ?? null;
	}

	async listUsers(): Promise<ShotlyxUser[]> {
		return Array.from(this.usersById.values());
	}

	async createSession(session: ShotlyxSession): Promise<void> {
		this.sessionsByToken.set(session.token, session);
	}

	async findSessionByToken(token: string): Promise<ShotlyxSession | null> {
		return this.sessionsByToken.get(token) ?? null;
	}

	async saveNewApiKeyBinding({
		shotlyxUserId,
		binding,
	}: {
		shotlyxUserId: string;
		binding: NewApiKeyBinding;
	}): Promise<void> {
		this.newApiKeysByUserId.set(shotlyxUserId, binding);
	}

	async findNewApiKeyByShotlyxUserId(
		shotlyxUserId: string,
	): Promise<NewApiKeyBinding | null> {
		return this.newApiKeysByUserId.get(shotlyxUserId) ?? null;
	}

	async addLog(entry: ShotlyxLogEntry): Promise<void> {
		this.logs.push(entry);
	}

	async listLogs(): Promise<ShotlyxLogEntry[]> {
		return [...this.logs];
	}

	async insertCreditLedgerEntryIfAbsent(
		entry: CreditLedgerEntry,
	): Promise<{ entry: CreditLedgerEntry; inserted: boolean }> {
		const existingId = this.creditLedgerIdsByIdempotencyKey.get(
			entry.idempotencyKey,
		);
		if (existingId) {
			const existing = this.creditLedgerById.get(existingId);
			if (existing) return { entry: { ...existing }, inserted: false };
		}
		this.creditLedgerById.set(entry.id, { ...entry });
		this.creditLedgerIdsByIdempotencyKey.set(entry.idempotencyKey, entry.id);
		return { entry: { ...entry }, inserted: true };
	}

	async updateCreditLedgerEntry(
		entry: CreditLedgerEntry,
	): Promise<CreditLedgerEntry> {
		this.creditLedgerById.set(entry.id, { ...entry });
		this.creditLedgerIdsByIdempotencyKey.set(entry.idempotencyKey, entry.id);
		return { ...entry };
	}

	async listCreditLedgerEntriesByUserId(
		userId: string,
	): Promise<CreditLedgerEntry[]> {
		return Array.from(this.creditLedgerById.values())
			.filter((entry) => entry.userId === userId)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
			.map((entry) => ({ ...entry }));
	}

	async createPaymentOrder(order: PaymentOrder): Promise<void> {
		if (this.paymentOrdersByOutTradeNo.has(order.outTradeNo)) {
			throw new Error("payment_order_already_exists");
		}
		this.paymentOrdersByOutTradeNo.set(order.outTradeNo, { ...order });
	}

	async findPaymentOrderByOutTradeNo(
		outTradeNo: string,
	): Promise<PaymentOrder | null> {
		const order = this.paymentOrdersByOutTradeNo.get(outTradeNo);
		return order ? { ...order } : null;
	}

	async updatePaymentOrder(order: PaymentOrder): Promise<PaymentOrder> {
		this.paymentOrdersByOutTradeNo.set(order.outTradeNo, { ...order });
		return { ...order };
	}

	async listPaymentOrdersByUserId(userId: string): Promise<PaymentOrder[]> {
		return Array.from(this.paymentOrdersByOutTradeNo.values())
			.filter((order) => order.userId === userId)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
			.map((order) => ({ ...order }));
	}

	async upsertProject(project: SyncedProject): Promise<void> {
		this.projectsById.set(project.id, {
			...project,
			metadata: { ...project.metadata },
			project: { ...project.project },
		});
	}

	async findProjectByUserId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<SyncedProject | null> {
		const project = this.projectsById.get(projectId);
		if (!project || project.userId !== userId) return null;
		return {
			...project,
			metadata: { ...project.metadata },
			project: { ...project.project },
		};
	}

	async listProjectsByUserId(userId: string): Promise<SyncedProject[]> {
		return Array.from(this.projectsById.values())
			.filter((project) => project.userId === userId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map((project) => ({
				...project,
				metadata: { ...project.metadata },
				project: { ...project.project },
			}));
	}

	async deleteProjectByUserId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<void> {
		const project = this.projectsById.get(projectId);
		if (project?.userId === userId) {
			this.projectsById.delete(projectId);
		}
		await this.deleteMediaAssetsByProjectId({ userId, projectId });
	}

	async upsertMediaAsset(asset: SyncedMediaAsset): Promise<void> {
		this.mediaAssetsById.set(asset.id, { ...asset });
	}

	async findMediaAssetByUserId({
		userId,
		projectId,
		assetId,
	}: {
		userId: string;
		projectId: string;
		assetId: string;
	}): Promise<SyncedMediaAsset | null> {
		const asset = this.mediaAssetsById.get(assetId);
		if (!asset || asset.userId !== userId || asset.projectId !== projectId) {
			return null;
		}
		return { ...asset };
	}

	async listMediaAssetsByProjectId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<SyncedMediaAsset[]> {
		return Array.from(this.mediaAssetsById.values())
			.filter((asset) => asset.userId === userId && asset.projectId === projectId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map((asset) => ({ ...asset }));
	}

	async deleteMediaAssetsByProjectId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<void> {
		for (const [id, asset] of this.mediaAssetsById.entries()) {
			if (asset.userId === userId && asset.projectId === projectId) {
				this.mediaAssetsById.delete(id);
			}
		}
	}

	async getSettings(): Promise<ServerSettings> {
		return { ...this.settings };
	}

	async updateSettings(
		settings: Partial<ServerSettings>,
	): Promise<ServerSettings> {
		this.settings = { ...this.settings, ...settings };
		return { ...this.settings };
	}
}
