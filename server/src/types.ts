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
	listUsers(): ShotlyxUser[];

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
	listLogs(): ShotlyxLogEntry[];

	getSettings(): ServerSettings;
	updateSettings(settings: Partial<ServerSettings>): ServerSettings;
};
