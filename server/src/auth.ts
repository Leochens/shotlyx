import {
	randomBytes,
	randomUUID,
	scryptSync,
	timingSafeEqual,
} from "node:crypto";
import type { NewApiGateway } from "./new-api";
import type {
	NewApiKeyBinding,
	PublicUser,
	ShotlyxLogEntry,
	ShotlyxSession,
	ShotlyxStore,
	ShotlyxUser,
} from "./types";

type AuthServiceConfig = {
	store: ShotlyxStore;
	newApi: NewApiGateway;
	initialQuota: number;
	now?: () => Date;
};

export type RegisterInput = {
	email: string;
	password: string;
	name?: string;
};

export type LoginInput = {
	email: string;
	password: string;
};

export type AuthResult = {
	user: PublicUser;
	session: ShotlyxSession;
	newApiKey: NewApiKeyBinding | null;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function assertValidEmail(email: string): void {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error("invalid_email");
	}
}

function assertValidPassword(password: string): void {
	if (password.length < 8) {
		throw new Error("password_too_short");
	}
}

function hashPassword(password: string): string {
	const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
	const hash = scryptSync(password, salt, PASSWORD_KEY_BYTES).toString("hex");
	return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
	const [algorithm, salt, expected] = storedHash.split("$");
	if (algorithm !== "scrypt" || !salt || !expected) return false;
	const actual = scryptSync(password, salt, PASSWORD_KEY_BYTES);
	const expectedBuffer = Buffer.from(expected, "hex");
	if (actual.length !== expectedBuffer.length) return false;
	return timingSafeEqual(actual, expectedBuffer);
}

function toPublicUser(user: ShotlyxUser): PublicUser {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		createdAt: user.createdAt,
	};
}

function createSession({
	userId,
	now,
}: {
	userId: string;
	now: Date;
}): ShotlyxSession {
	const createdAt = now.toISOString();
	return {
		token: `shotlyx_session_${randomUUID()}`,
		userId,
		createdAt,
		expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
	};
}

function createLog({
	type,
	userId,
	message,
	now,
	meta,
}: {
	type: string;
	userId?: string;
	message: string;
	now: Date;
	meta?: Record<string, unknown>;
}): ShotlyxLogEntry {
	return {
		id: `log_${randomUUID()}`,
		type,
		userId,
		message,
		createdAt: now.toISOString(),
		meta,
	};
}

export function createAuthService({
	store,
	newApi,
	initialQuota,
	now = () => new Date(),
}: AuthServiceConfig) {
	return {
		async register(input: RegisterInput): Promise<AuthResult> {
			const email = normalizeEmail(input.email);
			assertValidEmail(email);
			assertValidPassword(input.password);
			if (await store.findUserByEmail(email)) {
				throw new Error("email_already_registered");
			}

			const timestamp = now().toISOString();
			const user: ShotlyxUser = {
				id: `user_${randomUUID()}`,
				email,
				name: input.name?.trim() || email.split("@")[0] || "Shotlyx User",
				passwordHash: hashPassword(input.password),
				createdAt: timestamp,
				updatedAt: timestamp,
			};

			await store.createUser(user);
			await store.addLog(
				createLog({
					type: "user.registered",
					userId: user.id,
					message: `${user.email} registered`,
					now: now(),
				}),
			);

			const binding = await newApi.createUserKey({
				email: user.email,
				name: user.name,
				initialQuota,
			});
			await store.saveNewApiKeyBinding({
				shotlyxUserId: user.id,
				binding,
			});
			await store.addLog(
				createLog({
					type: "newapi.key.provisioned",
					userId: user.id,
					message: `Provisioned New API key for ${user.email}`,
					now: now(),
					meta: { tokenId: binding.tokenId, quota: binding.quota },
				}),
			);

			const session = createSession({ userId: user.id, now: now() });
			await store.createSession(session);
			return { user: toPublicUser(user), session, newApiKey: binding };
		},

		async login(input: LoginInput): Promise<AuthResult> {
			const email = normalizeEmail(input.email);
			const user = await store.findUserByEmail(email);
			if (!user || !verifyPassword(input.password, user.passwordHash)) {
				throw new Error("invalid_email_or_password");
			}

			const session = createSession({ userId: user.id, now: now() });
			await store.createSession(session);
			return {
				user: toPublicUser(user),
				session,
				newApiKey: await store.findNewApiKeyByShotlyxUserId(user.id),
			};
		},

		async getSessionUser(token: string): Promise<PublicUser | null> {
			const session = await store.findSessionByToken(token);
			if (!session) return null;
			if (new Date(session.expiresAt).getTime() <= now().getTime()) {
				return null;
			}
			const user = await store.findUserById(session.userId);
			return user ? toPublicUser(user) : null;
		},

		async getSessionAccount(token: string): Promise<AuthResult | null> {
			const session = await store.findSessionByToken(token);
			if (!session) return null;
			if (new Date(session.expiresAt).getTime() <= now().getTime()) {
				return null;
			}
			const user = await store.findUserById(session.userId);
			if (!user) return null;
			return {
				user: toPublicUser(user),
				session,
				newApiKey: await store.findNewApiKeyByShotlyxUserId(user.id),
			};
		},

		async rotateNewApiKey(token: string): Promise<NewApiKeyBinding | null> {
			const session = await store.findSessionByToken(token);
			if (!session) return null;
			if (new Date(session.expiresAt).getTime() <= now().getTime()) {
				return null;
			}
			const user = await store.findUserById(session.userId);
			if (!user) return null;

			const binding = await newApi.createUserKey({
				email: user.email,
				name: user.name,
				initialQuota,
			});
			await store.saveNewApiKeyBinding({
				shotlyxUserId: user.id,
				binding,
			});
			await store.addLog(
				createLog({
					type: "newapi.key.rotated",
					userId: user.id,
					message: `Rotated New API key for ${user.email}`,
					now: now(),
					meta: { tokenId: binding.tokenId, quota: binding.quota },
				}),
			);
			return binding;
		},
	};
}
