import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const COOKIE_NAME = 'wardrobe_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

// Prefix for persisted revoked tokens in app_settings table
const REVOKED_PREFIX = 'revoked_session:';

// In-memory cache for revoked tokens
const revokedTokens = new Map<string, number>();

// Periodic cleanup of expired revoked tokens every 1 hour
setInterval(() => {
	const now = Date.now();
	for (const [token, exp] of revokedTokens.entries()) {
		if (exp <= now) {
			revokedTokens.delete(token);
		}
	}
}, 60 * 60 * 1000).unref();

// --- Login Rate Limiting (5 attempts / 60 seconds per IP) ---
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

setInterval(() => {
	const now = Date.now();
	for (const [ip, entry] of loginAttempts.entries()) {
		if (entry.resetAt <= now) {
			loginAttempts.delete(ip);
		}
	}
}, 5 * 60 * 1000).unref();

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
	const safeIp = ip || 'unknown';
	const now = Date.now();
	const entry = loginAttempts.get(safeIp);

	if (!entry || entry.resetAt <= now) {
		loginAttempts.set(safeIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
		return { allowed: true, retryAfterMs: 0 };
	}

	entry.count++;
	if (entry.count > MAX_LOGIN_ATTEMPTS) {
		return { allowed: false, retryAfterMs: entry.resetAt - now };
	}
	return { allowed: true, retryAfterMs: 0 };
}

function getAuthCredentials(): { username: string; password: string } {
	const username = (env.AUTH_USERNAME || process.env.AUTH_USERNAME || '').trim();
	const password = (env.AUTH_PASSWORD || process.env.AUTH_PASSWORD || '').trim();
	return { username, password };
}

function getSigningSecret(): Buffer {
	const secret = (env.SESSION_SECRET || process.env.SESSION_SECRET || '').trim();
	if (!secret || secret.length < 32) {
		console.error('[Auth] FATAL: SESSION_SECRET must be configured with at least 32 characters.');
		console.error('[Auth] Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
		throw new Error('SESSION_SECRET is missing or too short (minimum 32 characters required).');
	}
	return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Hashes a plaintext password using Scrypt with a random 16-byte cryptographic salt.
 * Produces format: scrypt:<salt_hex>:<hash_hex>
 */
export function hashPassword(plainPassword: string): string {
	const salt = crypto.randomBytes(16).toString('hex');
	const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
	return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

function verifyPasswordMatch(providedPass: string, configuredPassOrHash: string): boolean {
	if (configuredPassOrHash.startsWith('scrypt:')) {
		const parts = configuredPassOrHash.split(':');
		if (parts.length !== 3) return false;
		const [, salt, expectedHashHex] = parts;
		const derivedKey = crypto.scryptSync(providedPass, salt, 64);
		const expectedBuf = Buffer.from(expectedHashHex, 'hex');
		if (derivedKey.length !== expectedBuf.length) return false;
		return crypto.timingSafeEqual(derivedKey, expectedBuf);
	}

	// Constant-time SHA-256 fallback comparison for plaintext configurations
	const passA = crypto.createHash('sha256').update(providedPass).digest();
	const passB = crypto.createHash('sha256').update(configuredPassOrHash).digest();
	return crypto.timingSafeEqual(passA, passB);
}

/**
 * Validates provided credentials against the server-configured AUTH_USERNAME and AUTH_PASSWORD.
 * Supports both Scrypt-hashed passwords (recommended) and plaintext passwords.
 * Performs constant-time comparison via crypto.timingSafeEqual to prevent timing attacks.
 */
export function verifyCredentials(providedUser: string, providedPass: string): boolean {
	const { username, password } = getAuthCredentials();

	if (!username || !password) {
		console.error('[Auth] AUTH_USERNAME or AUTH_PASSWORD is not configured in the server environment.');
		return false;
	}

	if (!providedUser || !providedPass) {
		return false;
	}

	// Username constant-time comparison
	const userA = crypto.createHash('sha256').update(providedUser.trim()).digest();
	const userB = crypto.createHash('sha256').update(username).digest();
	const userMatch = crypto.timingSafeEqual(userA, userB);

	// Password comparison (supports Scrypt hash or plaintext)
	const passMatch = verifyPasswordMatch(providedPass, password);

	return userMatch && passMatch;
}

/**
 * Creates a cryptographically signed tamper-proof session token.
 * Survives container restarts while maintaining 7-day TTL and constant-time signature verification.
 */
export function createSessionToken(username: string): string {
	const exp = Date.now() + SESSION_TTL_MS;
	const nonce = crypto.randomBytes(16).toString('hex');
	const payload = JSON.stringify({ u: username, exp, nonce });
	const payloadB64 = Buffer.from(payload).toString('base64url');

	const secret = getSigningSecret();
	const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

	return `${payloadB64}.${signature}`;
}

export interface SessionValidationResult {
	valid: boolean;
	username?: string;
}

/**
 * Helper to check whether a token is revoked (in-memory fast path, database fallback).
 */
async function isTokenRevoked(token: string): Promise<boolean> {
	if (revokedTokens.has(token)) {
		return true;
	}

	try {
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
		const rows = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, `${REVOKED_PREFIX}${tokenHash}`));

		if (rows.length > 0) {
			const exp = parseInt(rows[0].value, 10);
			if (exp > Date.now()) {
				revokedTokens.set(token, exp);
				return true;
			}
			// Clean up expired record
			await db.delete(appSettings).where(eq(appSettings.key, rows[0].key)).catch(() => {});
		}
	} catch {
		// If DB query fails, fall back to in-memory status
	}

	return false;
}

/**
 * Validates a session token string.
 * Returns valid=true only if signature is valid, token is unexpired, and token has not been revoked.
 */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionValidationResult> {
	if (!token || typeof token !== 'string') {
		return { valid: false };
	}

	const parts = token.split('.');
	if (parts.length !== 2) {
		return { valid: false };
	}

	const [payloadB64, signature] = parts;

	// Check revocation
	if (await isTokenRevoked(token)) {
		return { valid: false };
	}

	// Verify HMAC signature
	const secret = getSigningSecret();
	const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

	const sigBufA = Buffer.from(signature, 'hex');
	const sigBufB = Buffer.from(expectedSignature, 'hex');

	if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
		return { valid: false };
	}

	try {
		const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
		const payload = JSON.parse(payloadJson);

		if (!payload || typeof payload.exp !== 'number' || !payload.u) {
			return { valid: false };
		}

		if (payload.exp <= Date.now()) {
			return { valid: false };
		}

		return { valid: true, username: payload.u };
	} catch {
		return { valid: false };
	}
}

/**
 * Explicitly revokes a session token so it cannot be used again before its natural expiry.
 * Persists to DB (survives restarts) and adds to in-memory set.
 */
export async function revokeSessionToken(token: string | undefined | null): Promise<void> {
	if (!token || typeof token !== 'string') return;
	let exp = Date.now() + SESSION_TTL_MS;

	try {
		const parts = token.split('.');
		if (parts.length === 2) {
			const payloadJson = Buffer.from(parts[0], 'base64url').toString('utf8');
			const payload = JSON.parse(payloadJson);
			if (typeof payload.exp === 'number') {
				exp = payload.exp;
			}
		}
	} catch {
		// Use fallback exp
	}

	// Always record in in-memory map
	revokedTokens.set(token, exp);

	// Persist hash of token to database
	try {
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
		const key = `${REVOKED_PREFIX}${tokenHash}`;
		await db
			.insert(appSettings)
			.values({ key, value: String(exp) })
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: String(exp) }
			});
	} catch (err: any) {
		console.warn('[Auth] Failed to persist session revocation to DB:', err?.message || err);
	}
}

/**
 * Standard cookie configuration for the HTTP-only session cookie.
 */
export function getCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: process.env.NODE_ENV === 'production',
		maxAge: SESSION_TTL_SECONDS
	};
}
