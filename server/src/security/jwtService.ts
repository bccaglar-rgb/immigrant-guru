/**
 * JWT Token Service — Stateless token authentication for Bitrium
 *
 * Token types:
 *   access  — short-lived (15 min), for API requests
 *   refresh — long-lived (7 days), stored in Redis, exchangeable for new access tokens
 *   ws      — very short-lived (5 min), single-use, for WS handshake
 *
 * Uses HMAC-SHA256 (HS256) — no external dependencies, uses Node.js crypto.
 *
 * Backward compatible: existing session tokens still work via AuthService.getUserFromToken().
 */

import { createHmac, randomBytes } from "node:crypto";
import { redisControl } from "../db/redis.ts";

/* ── Constants ──────────────────────────────────────────── */

const ACCESS_TTL_SEC = 15 * 60;           // 15 minutes
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const WS_TTL_SEC = 5 * 60;                // 5 minutes
const REFRESH_REDIS_PREFIX = "jwt:refresh:";
const WS_REDIS_PREFIX = "jwt:ws:";

/* ── Base64url helpers ──────────────────────────────────── */

const b64url = (data: string | Buffer): string => {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
};

const b64urlDecode = (str: string): string =>
  Buffer.from(str, "base64url").toString("utf8");

/* ── JWT types ──────────────────────────────────────────── */

export type TokenType = "access" | "refresh" | "ws";

export interface JwtPayload {
  sub: string;         // userId
  role: string;        // "USER" | "ADMIN"
  email: string;       // user email
  type: TokenType;     // token type
  jti?: string;        // unique token ID (for refresh/ws)
  iat: number;         // issued at (epoch seconds)
  exp: number;         // expires at (epoch seconds)
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export interface WsTokenResult {
  wsToken: string;
  expiresAt: number;
}

/* ── JWT Core ───────────────────────────────────────────── */

let _jwtSecret: Buffer | null = null;

/** Initialize JWT service with secret key */
export function initJwt(secret: Buffer): void {
  if (secret.length < 32) throw new Error("JWT secret must be at least 32 bytes");
  _jwtSecret = secret;
  console.log("[JWT] Service initialized (HS256, access=15m, refresh=7d, ws=5m)");
}

function getSecret(): Buffer {
  if (!_jwtSecret) throw new Error("JWT service not initialized — call initJwt() first");
  return _jwtSecret;
}

/** Sign a JWT with HS256 */
function signJwt(payload: JwtPayload): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", getSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

/** Verify and decode a JWT. Returns null if invalid or expired. */
export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;

    // Verify signature
    const expected = createHmac("sha256", getSecret())
      .update(`${header}.${body}`)
      .digest("base64url");

    // Timing-safe comparison
    if (signature.length !== expected.length) return null;
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    let diff = 0;
    for (let i = 0; i < sigBuf.length; i++) {
      diff |= sigBuf[i] ^ expBuf[i];
    }
    if (diff !== 0) return null;

    // Decode payload
    const payload = JSON.parse(b64urlDecode(body)) as JwtPayload;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

/* ── Token Creation ─────────────────────────────────────── */

/** Issue access + refresh token pair for a user */
export async function issueTokenPair(
  userId: string,
  role: string,
  email: string,
): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomBytes(16).toString("hex");

  // Access token (stateless)
  const accessPayload: JwtPayload = {
    sub: userId,
    role,
    email,
    type: "access",
    iat: now,
    exp: now + ACCESS_TTL_SEC,
  };
  const accessToken = signJwt(accessPayload);

  // Refresh token (tracked in Redis for revocation)
  const refreshPayload: JwtPayload = {
    sub: userId,
    role,
    email,
    type: "refresh",
    jti,
    iat: now,
    exp: now + REFRESH_TTL_SEC,
  };
  const refreshToken = signJwt(refreshPayload);

  // Store refresh token in Redis (for revocation + rotation)
  try {
    await redisControl.set(
      `${REFRESH_REDIS_PREFIX}${jti}`,
      JSON.stringify({ userId, role, email, issuedAt: now }),
      "EX",
      REFRESH_TTL_SEC,
    );
  } catch (err) {
    console.error("[JWT] Failed to store refresh token in Redis:", err);
  }

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: (now + ACCESS_TTL_SEC) * 1000,
    refreshExpiresAt: (now + REFRESH_TTL_SEC) * 1000,
  };
}

/** Issue a short-lived WS token (single-use) */
export async function issueWsToken(
  userId: string,
  role: string,
  email: string,
): Promise<WsTokenResult> {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomBytes(16).toString("hex");

  const payload: JwtPayload = {
    sub: userId,
    role,
    email,
    type: "ws",
    jti,
    iat: now,
    exp: now + WS_TTL_SEC,
  };
  const wsToken = signJwt(payload);

  // Store for single-use verification
  try {
    await redisControl.set(
      `${WS_REDIS_PREFIX}${jti}`,
      JSON.stringify({ userId, role }),
      "EX",
      WS_TTL_SEC,
    );
  } catch (err) {
    console.error("[JWT] Failed to store WS token in Redis:", err);
  }

  return {
    wsToken,
    expiresAt: (now + WS_TTL_SEC) * 1000,
  };
}

/* ── Token Verification ─────────────────────────────────── */

/** Verify an access token. Returns user context or null. */
export function verifyAccessToken(
  token: string,
): { userId: string; role: string; email: string } | null {
  const payload = verifyJwt(token);
  if (!payload || payload.type !== "access") return null;
  return { userId: payload.sub, role: payload.role, email: payload.email };
}

/** Verify a WS token. Single-use: consumed on first verification. */
export async function verifyWsToken(
  token: string,
): Promise<{ userId: string; role: string } | null> {
  const payload = verifyJwt(token);
  if (!payload) return null;

  // Accept both "ws" and "access" tokens for WS handshake
  if (payload.type === "access") {
    return { userId: payload.sub, role: payload.role };
  }

  if (payload.type !== "ws" || !payload.jti) return null;

  // Single-use: consume from Redis
  try {
    const key = `${WS_REDIS_PREFIX}${payload.jti}`;
    const exists = await redisControl.get(key);
    if (!exists) return null; // Already consumed or expired
    await redisControl.del(key); // Consume
  } catch {
    // Redis down — allow the token if signature is valid (fail-open)
  }

  return { userId: payload.sub, role: payload.role };
}

/** Refresh: exchange a valid refresh token for new access + refresh tokens.
 *  Implements token rotation (old refresh token is invalidated). */
export async function refreshTokens(
  refreshTokenStr: string,
): Promise<TokenPair | null> {
  const payload = verifyJwt(refreshTokenStr);
  if (!payload || payload.type !== "refresh" || !payload.jti) return null;

  // Check if refresh token exists in Redis (not revoked)
  try {
    const key = `${REFRESH_REDIS_PREFIX}${payload.jti}`;
    const stored = await redisControl.get(key);
    if (!stored) return null; // Revoked or expired
    await redisControl.del(key); // Rotate: invalidate old refresh token
  } catch {
    // Redis down — reject refresh for safety
    return null;
  }

  // Issue new pair
  return issueTokenPair(payload.sub, payload.role, payload.email);
}

/** Revoke all refresh tokens for a user (logout from all devices) */
export async function revokeAllRefreshTokens(userId: string): Promise<number> {
  try {
    const keys = await redisControl.keys(`${REFRESH_REDIS_PREFIX}*`);
    let revoked = 0;
    for (const key of keys) {
      const val = await redisControl.get(key);
      if (val) {
        try {
          const data = JSON.parse(val);
          if (data.userId === userId) {
            await redisControl.del(key);
            revoked++;
          }
        } catch { /* skip malformed */ }
      }
    }
    return revoked;
  } catch {
    return 0;
  }
}

/** Revoke a single refresh token */
export async function revokeRefreshToken(refreshTokenStr: string): Promise<boolean> {
  const payload = verifyJwt(refreshTokenStr);
  if (!payload || payload.type !== "refresh" || !payload.jti) return false;
  try {
    const key = `${REFRESH_REDIS_PREFIX}${payload.jti}`;
    const deleted = await redisControl.del(key);
    return deleted > 0;
  } catch {
    return false;
  }
}

/* ── Stats ──────────────────────────────────────────────── */

export async function getJwtStats(): Promise<{
  activeRefreshTokens: number;
  activeWsTokens: number;
}> {
  try {
    const refreshKeys = await redisControl.keys(`${REFRESH_REDIS_PREFIX}*`);
    const wsKeys = await redisControl.keys(`${WS_REDIS_PREFIX}*`);
    return {
      activeRefreshTokens: refreshKeys.length,
      activeWsTokens: wsKeys.length,
    };
  } catch {
    return { activeRefreshTokens: 0, activeWsTokens: 0 };
  }
}
