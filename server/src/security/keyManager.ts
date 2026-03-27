/**
 * KeyManager — Centralized master key resolution with multiple source support.
 *
 * Resolution order (first found wins):
 *   1. File: MASTER_KEY_PATH env var (or default /etc/bitrium/master.key)
 *      → chmod 400, owned by deploy user. Most secure option.
 *   2. Env: ENCRYPTION_KEY env var (64 hex chars = 32 bytes)
 *      → Backward compatible with current setup.
 *   3. Dev fallback: deterministic key from DB_PASSWORD (non-production only)
 *
 * Phase 1: File + env var support (this implementation)
 * Phase 2: AWS KMS / DigitalOcean Vault integration (future)
 *
 * Usage:
 *   import { getMasterKey } from "./security/keyManager.ts";
 *   const key = getMasterKey(); // Returns Buffer (32 bytes)
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const DEFAULT_KEY_PATH = "/etc/bitrium/master.key";

/** Cached key — read once at boot, reused for lifetime of process. */
let cachedKey: Buffer | null = null;

/**
 * Resolve the 32-byte master encryption key.
 * Throws if no valid key source is found in production.
 */
export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const workerId = process.env.NODE_APP_INSTANCE ?? "0";

  // ── Source 1: File-based key (most secure) ──────────────────
  const keyPath = process.env.MASTER_KEY_PATH ?? DEFAULT_KEY_PATH;
  if (existsSync(keyPath)) {
    try {
      // Validate file permissions (warn if too open)
      const stat = statSync(keyPath);
      const mode = stat.mode & 0o777;
      if (mode & 0o077) {
        console.warn(
          `[KeyManager] WARNING: ${keyPath} has permissions ${mode.toString(8)} — ` +
          `should be 0400 (owner read-only). Run: chmod 400 ${keyPath}`,
        );
      }

      const raw = readFileSync(keyPath);

      // Support both raw binary (32 bytes) and hex-encoded (64 chars)
      let key: Buffer;
      if (raw.length === 32) {
        key = raw;
      } else {
        // Try hex decode (trim whitespace)
        const hex = raw.toString("utf8").trim();
        key = Buffer.from(hex, "hex");
      }

      if (key.length !== 32) {
        throw new Error(
          `Master key at ${keyPath} must be 32 bytes (raw) or 64 hex chars. Got ${key.length} bytes.`,
        );
      }

      cachedKey = key;
      console.log(`[Worker ${workerId}] Master key loaded from ${keyPath}`);
      return cachedKey;
    } catch (err: any) {
      if (err?.code === "EACCES") {
        console.error(`[KeyManager] Permission denied reading ${keyPath} — check file ownership`);
      } else {
        console.error(`[KeyManager] Failed to read ${keyPath}:`, err?.message);
      }
      // Fall through to env var
    }
  }

  // ── Source 2: Environment variable (backward compatible) ────
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, "hex");
    if (buf.length !== 32) {
      throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
    }
    cachedKey = buf;
    console.log(`[Worker ${workerId}] Using ENCRYPTION_KEY from env`);
    return cachedKey;
  }

  // ── Source 3: Dev fallback (non-production only) ────────────
  if (process.env.NODE_ENV !== "production") {
    const seed = process.env.DB_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "dev-key-not-for-prod";
    cachedKey = createHash("sha256").update(seed).digest();
    console.warn(
      `[Worker ${workerId}] WARNING: Using dev-fallback encryption key. ` +
      `Set ENCRYPTION_KEY or create ${DEFAULT_KEY_PATH} for production.`,
    );
    return cachedKey;
  }

  // ── No key found in production ──────────────────────────────
  throw new Error(
    `No encryption key available. Provide one of:\n` +
    `  1. File: ${keyPath} (chmod 400, 32 raw bytes or 64 hex chars)\n` +
    `  2. Env: ENCRYPTION_KEY=<64 hex chars>\n`,
  );
}

/**
 * Clear cached key from memory (call on graceful shutdown).
 * After this, getMasterKey() will re-read from source.
 */
export function clearKeyCache(): void {
  if (cachedKey) {
    // Zero-fill the buffer before releasing
    cachedKey.fill(0);
    cachedKey = null;
  }
}
