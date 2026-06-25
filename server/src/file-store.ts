import fs from "node:fs/promises";
import path from "node:path";
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

type FileStoreData = {
	version: 1;
	users: ShotlyxUser[];
	sessions: ShotlyxSession[];
	newApiKeysByUserId: Record<string, NewApiKeyBinding>;
	logs: ShotlyxLogEntry[];
	creditLedger: CreditLedgerEntry[];
	paymentOrders: PaymentOrder[];
	projects: SyncedProject[];
	mediaAssets: SyncedMediaAsset[];
	settings: ServerSettings;
};

function createEmptyData(): FileStoreData {
	return {
		version: 1,
		users: [],
		sessions: [],
		newApiKeysByUserId: {},
		logs: [],
		creditLedger: [],
		paymentOrders: [],
		projects: [],
		mediaAssets: [],
		settings: { ...DEFAULT_SETTINGS },
	};
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeData(value: unknown): FileStoreData {
	const empty = createEmptyData();
	if (!isObject(value)) return empty;
	const settings = isObject(value.settings) ? value.settings : {};
	return {
		version: 1,
		users: Array.isArray(value.users) ? clone(value.users) : [],
		sessions: Array.isArray(value.sessions) ? clone(value.sessions) : [],
		newApiKeysByUserId: isObject(value.newApiKeysByUserId)
			? clone(value.newApiKeysByUserId)
			: {},
		logs: Array.isArray(value.logs) ? clone(value.logs) : [],
		creditLedger: Array.isArray(value.creditLedger)
			? clone(value.creditLedger)
			: [],
		paymentOrders: Array.isArray(value.paymentOrders)
			? clone(value.paymentOrders)
			: [],
		projects: Array.isArray(value.projects) ? clone(value.projects) : [],
		mediaAssets: Array.isArray(value.mediaAssets)
			? clone(value.mediaAssets)
			: [],
		settings: {
			...DEFAULT_SETTINGS,
			...clone(settings),
		},
	};
}

async function readJsonFile(filePath: string): Promise<unknown> {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return createEmptyData();
		}
		throw error;
	}
}

export class FileShotlyxStore implements ShotlyxStore {
	private writeQueue = Promise.resolve();

	constructor(private readonly filePath: string) {}

	private async readData(): Promise<FileStoreData> {
		return normalizeData(await readJsonFile(this.filePath));
	}

	private async writeData(data: FileStoreData): Promise<void> {
		await fs.mkdir(path.dirname(this.filePath), { recursive: true });
		const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
		await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, {
			mode: 0o600,
		});
		await fs.rename(tempPath, this.filePath);
	}

	private async updateData<T>(
		mutate: (data: FileStoreData) => T | Promise<T>,
	): Promise<T> {
		const run = this.writeQueue.then(async () => {
			const data = await this.readData();
			const result = await mutate(data);
			await this.writeData(data);
			return result;
		});
		this.writeQueue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	async createUser(user: ShotlyxUser): Promise<void> {
		await this.updateData((data) => {
			const existingIndex = data.users.findIndex(({ id }) => id === user.id);
			if (existingIndex >= 0) {
				data.users[existingIndex] = clone(user);
				return;
			}
			data.users.push(clone(user));
		});
	}

	async findUserByEmail(email: string): Promise<ShotlyxUser | null> {
		const data = await this.readData();
		const user = data.users.find((candidate) => candidate.email === email);
		return user ? clone(user) : null;
	}

	async findUserById(id: string): Promise<ShotlyxUser | null> {
		const data = await this.readData();
		const user = data.users.find((candidate) => candidate.id === id);
		return user ? clone(user) : null;
	}

	async listUsers(): Promise<ShotlyxUser[]> {
		const data = await this.readData();
		return clone(data.users);
	}

	async createSession(session: ShotlyxSession): Promise<void> {
		await this.updateData((data) => {
			const existingIndex = data.sessions.findIndex(
				({ token }) => token === session.token,
			);
			if (existingIndex >= 0) {
				data.sessions[existingIndex] = clone(session);
				return;
			}
			data.sessions.push(clone(session));
		});
	}

	async findSessionByToken(token: string): Promise<ShotlyxSession | null> {
		const data = await this.readData();
		const session = data.sessions.find((candidate) => candidate.token === token);
		return session ? clone(session) : null;
	}

	async saveNewApiKeyBinding({
		shotlyxUserId,
		binding,
	}: {
		shotlyxUserId: string;
		binding: NewApiKeyBinding;
	}): Promise<void> {
		await this.updateData((data) => {
			data.newApiKeysByUserId[shotlyxUserId] = clone(binding);
		});
	}

	async findNewApiKeyByShotlyxUserId(
		shotlyxUserId: string,
	): Promise<NewApiKeyBinding | null> {
		const data = await this.readData();
		const binding = data.newApiKeysByUserId[shotlyxUserId];
		return binding ? clone(binding) : null;
	}

	async addLog(entry: ShotlyxLogEntry): Promise<void> {
		await this.updateData((data) => {
			data.logs.push(clone(entry));
		});
	}

	async listLogs(): Promise<ShotlyxLogEntry[]> {
		const data = await this.readData();
		return clone(data.logs);
	}

	async insertCreditLedgerEntryIfAbsent(
		entry: CreditLedgerEntry,
	): Promise<{ entry: CreditLedgerEntry; inserted: boolean }> {
		return this.updateData((data) => {
			const existing = data.creditLedger.find(
				(candidate) => candidate.idempotencyKey === entry.idempotencyKey,
			);
			if (existing) {
				return { entry: clone(existing), inserted: false };
			}
			data.creditLedger.push(clone(entry));
			return { entry: clone(entry), inserted: true };
		});
	}

	async updateCreditLedgerEntry(
		entry: CreditLedgerEntry,
	): Promise<CreditLedgerEntry> {
		return this.updateData((data) => {
			const existingIndex = data.creditLedger.findIndex(
				(candidate) => candidate.id === entry.id,
			);
			if (existingIndex >= 0) {
				data.creditLedger[existingIndex] = clone(entry);
			} else {
				data.creditLedger.push(clone(entry));
			}
			return clone(entry);
		});
	}

	async listCreditLedgerEntriesByUserId(
		userId: string,
	): Promise<CreditLedgerEntry[]> {
		const data = await this.readData();
		return data.creditLedger
			.filter((entry) => entry.userId === userId)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
			.map((entry) => clone(entry));
	}

	async createPaymentOrder(order: PaymentOrder): Promise<void> {
		await this.updateData((data) => {
			if (
				data.paymentOrders.some(
					(candidate) => candidate.outTradeNo === order.outTradeNo,
				)
			) {
				throw new Error("payment_order_already_exists");
			}
			data.paymentOrders.push(clone(order));
		});
	}

	async findPaymentOrderByOutTradeNo(
		outTradeNo: string,
	): Promise<PaymentOrder | null> {
		const data = await this.readData();
		const order = data.paymentOrders.find(
			(candidate) => candidate.outTradeNo === outTradeNo,
		);
		return order ? clone(order) : null;
	}

	async updatePaymentOrder(order: PaymentOrder): Promise<PaymentOrder> {
		return this.updateData((data) => {
			const existingIndex = data.paymentOrders.findIndex(
				(candidate) => candidate.outTradeNo === order.outTradeNo,
			);
			if (existingIndex >= 0) {
				data.paymentOrders[existingIndex] = clone(order);
			} else {
				data.paymentOrders.push(clone(order));
			}
			return clone(order);
		});
	}

	async listPaymentOrdersByUserId(userId: string): Promise<PaymentOrder[]> {
		const data = await this.readData();
		return data.paymentOrders
			.filter((order) => order.userId === userId)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
			.map((order) => clone(order));
	}

	async upsertProject(project: SyncedProject): Promise<void> {
		await this.updateData((data) => {
			const existingIndex = data.projects.findIndex(({ id }) => id === project.id);
			if (existingIndex >= 0) {
				data.projects[existingIndex] = clone(project);
				return;
			}
			data.projects.push(clone(project));
		});
	}

	async findProjectByUserId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<SyncedProject | null> {
		const data = await this.readData();
		const project = data.projects.find(
			(candidate) => candidate.userId === userId && candidate.id === projectId,
		);
		return project ? clone(project) : null;
	}

	async listProjectsByUserId(userId: string): Promise<SyncedProject[]> {
		const data = await this.readData();
		return data.projects
			.filter((project) => project.userId === userId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map((project) => clone(project));
	}

	async deleteProjectByUserId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<void> {
		await this.updateData((data) => {
			data.projects = data.projects.filter(
				(project) => project.userId !== userId || project.id !== projectId,
			);
			data.mediaAssets = data.mediaAssets.filter(
				(asset) => asset.userId !== userId || asset.projectId !== projectId,
			);
		});
	}

	async upsertMediaAsset(asset: SyncedMediaAsset): Promise<void> {
		await this.updateData((data) => {
			const existingIndex = data.mediaAssets.findIndex(({ id }) => id === asset.id);
			if (existingIndex >= 0) {
				data.mediaAssets[existingIndex] = clone(asset);
				return;
			}
			data.mediaAssets.push(clone(asset));
		});
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
		const data = await this.readData();
		const asset = data.mediaAssets.find(
			(candidate) =>
				candidate.userId === userId &&
				candidate.projectId === projectId &&
				candidate.id === assetId,
		);
		return asset ? clone(asset) : null;
	}

	async listMediaAssetsByProjectId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<SyncedMediaAsset[]> {
		const data = await this.readData();
		return data.mediaAssets
			.filter((asset) => asset.userId === userId && asset.projectId === projectId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map((asset) => clone(asset));
	}

	async deleteMediaAssetsByProjectId({
		userId,
		projectId,
	}: {
		userId: string;
		projectId: string;
	}): Promise<void> {
		await this.updateData((data) => {
			data.mediaAssets = data.mediaAssets.filter(
				(asset) => asset.userId !== userId || asset.projectId !== projectId,
			);
		});
	}

	async getSettings(): Promise<ServerSettings> {
		const data = await this.readData();
		return clone(data.settings);
	}

	async updateSettings(
		settings: Partial<ServerSettings>,
	): Promise<ServerSettings> {
		return this.updateData((data) => {
			data.settings = { ...data.settings, ...settings };
			return clone(data.settings);
		});
	}
}
