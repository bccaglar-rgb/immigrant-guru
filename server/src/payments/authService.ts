import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "../security/crypto.ts";
import type { ReferralCodeRecord, Role, SessionRecord, UserRecord } from "./types.ts";
import { PaymentStore } from "./storage.ts";
import { redis } from "../db/redis.ts";

const SESSION_CACHE_TTL = 60 * 60; // 1 hour in Redis (session itself has 30-day DB expiry)

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

const hashPassword = (password: string, salt = randomBytes(16).toString("hex")) => {
  const derived = pbkdf2Sync(password, salt, 310_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${salt}$${derived}`;
};

const verifyPassword = (password: string, fullHash: string) => {
  const [algo, salt, value] = fullHash.split("$");
  if (algo !== "pbkdf2_sha256" || !salt || !value) return false;
  const derived = pbkdf2Sync(password, salt, 310_000, 32, "sha256").toString("hex");
  const a = Buffer.from(value, "hex");
  const b = Buffer.from(derived, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const toBase32 = (buffer: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
};

const fromBase32 = (str: string): Buffer => {
  const clean = str.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = base32Alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

const hotp = (secret: Buffer, counter: number): string => {
  const c = Buffer.alloc(8);
  c.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  c.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = createHmac("sha1", secret).update(c).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
};

const verifyTotp = (secretBase32: string, token: string, step = 30, drift = 1): boolean => {
  const nowCounter = Math.floor(Date.now() / 1000 / step);
  const secret = fromBase32(secretBase32);
  for (let i = -drift; i <= drift; i += 1) {
    if (hotp(secret, nowCounter + i) === token) return true;
  }
  return false;
};

export class AuthService {
  private readonly store: PaymentStore;
  private readonly encryptionKey: Buffer;

  constructor(store: PaymentStore, encryptionKey: Buffer) {
    this.store = store;
    this.encryptionKey = encryptionKey;
  }

  async signup(email: string, password: string, role: Role = "USER") {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password || password.length < 8) {
      throw new Error("invalid_email_or_password");
    }
    const existing = await this.store.getUserByEmail(normalized);
    if (existing) throw new Error("email_already_exists");
    const now = nowIso();
    const user: UserRecord = {
      id: makeId("usr"),
      email: normalized,
      passwordHash: hashPassword(password),
      role,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.setUser(user);
    return user;
  }

  async login(email: string, password: string, twoFactorCode?: string) {
    const user = await this.store.getUserByEmail(email.trim().toLowerCase());
    if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("invalid_credentials");

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) throw new Error("two_factor_required");
      if (!user.twoFactorSecretEnc) throw new Error("two_factor_not_configured");
      const secret = decryptSecret(user.twoFactorSecretEnc, this.encryptionKey);
      if (!verifyTotp(secret, twoFactorCode)) throw new Error("invalid_two_factor_code");
    }

    const now = Date.now();
    const session: SessionRecord = {
      token: randomBytes(24).toString("hex"),
      userId: user.id,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(),
    };
    await this.store.setSession(session);
    // Cache session + user in Redis for fast auth lookups
    try {
      const cachePayload = JSON.stringify({ session, user: { id: user.id, email: user.email, role: user.role, twoFactorEnabled: user.twoFactorEnabled } });
      await redis.set(`session:${session.token}`, cachePayload, "EX", SESSION_CACHE_TTL);
    } catch { /* Redis miss is ok — fallback to DB */ }
    return { session, user };
  }

  /** Social/OAuth login: find existing user by email or create new one. No password required. */
  async socialLogin(email: string, provider: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw new Error("invalid_email");

    let user = await this.store.getUserByEmail(normalized);
    if (!user) {
      // Auto-create user from OAuth
      const ADMIN_EMAILS = ["bccaglar@gmail.com"];
      const role: Role = ADMIN_EMAILS.includes(normalized) ? "ADMIN" : "USER";
      const now = nowIso();
      user = {
        id: makeId("usr"),
        email: normalized,
        passwordHash: hashPassword(randomBytes(32).toString("hex")), // random password — OAuth users don't need it
        role,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      };
      await this.store.setUser(user);
    }

    // Create session
    const now = Date.now();
    const session: SessionRecord = {
      token: randomBytes(24).toString("hex"),
      userId: user.id,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(),
    };
    await this.store.setSession(session);
    try {
      const cachePayload = JSON.stringify({ session, user: { id: user.id, email: user.email, role: user.role, twoFactorEnabled: user.twoFactorEnabled } });
      await redis.set(`session:${session.token}`, cachePayload, "EX", SESSION_CACHE_TTL);
    } catch { /* Redis miss ok */ }
    return { session, user, provider };
  }

  async getUserFromToken(token: string | undefined) {
    if (!token) return null;

    // 1. Try Redis cache first
    try {
      const cached = await redis.get(`session:${token}`);
      if (cached) {
        const parsed = JSON.parse(cached) as { session: SessionRecord; user: UserRecord };
        if (Date.parse(parsed.session.expiresAt) > Date.now()) {
          return parsed;
        }
        // Expired — clean up
        await redis.del(`session:${token}`);
      }
    } catch { /* Redis miss — fall through to DB */ }

    // 2. Fallback to PostgreSQL
    const session = await this.store.getSession(token);
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= Date.now()) {
      await this.store.deleteSession(token);
      return null;
    }
    const user = await this.store.getUser(session.userId);
    if (!user) return null;

    // 3. Populate Redis cache for next time
    try {
      const cachePayload = JSON.stringify({ session, user: { id: user.id, email: user.email, role: user.role, twoFactorEnabled: user.twoFactorEnabled } });
      await redis.set(`session:${token}`, cachePayload, "EX", SESSION_CACHE_TTL);
    } catch { /* ignore */ }

    return { session, user };
  }

  async setupTwoFactor(userId: string) {
    const user = await this.store.getUser(userId);
    if (!user) throw new Error("user_not_found");
    const secret = toBase32(randomBytes(20));
    user.twoFactorSecretEnc = encryptSecret(secret, this.encryptionKey);
    user.updatedAt = nowIso();
    await this.store.setUser(user);
    return {
      secret,
      otpauthUrl: `otpauth://totp/Bitrium:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Bitrium`,
    };
  }

  async enableTwoFactor(userId: string, token: string) {
    const user = await this.store.getUser(userId);
    if (!user || !user.twoFactorSecretEnc) throw new Error("two_factor_not_initialized");
    const secret = decryptSecret(user.twoFactorSecretEnc, this.encryptionKey);
    if (!verifyTotp(secret, token)) throw new Error("invalid_two_factor_code");
    user.twoFactorEnabled = true;
    user.updatedAt = nowIso();
    await this.store.setUser(user);
    return true;
  }

  async requestPasswordReset(email: string) {
    const user = await this.store.getUserByEmail(email.trim().toLowerCase());
    if (!user) return { ok: true };
    const rawToken = randomBytes(24).toString("hex");
    user.passwordResetTokenHash = createHash("sha256").update(rawToken).digest("hex");
    user.passwordResetExpiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    user.updatedAt = nowIso();
    await this.store.setUser(user);
    return { ok: true, resetToken: rawToken };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) throw new Error("weak_password");
    const tokenHash = createHash("sha256").update(resetToken).digest("hex");
    const user = await this.store.getUserByResetTokenHash(tokenHash);
    if (!user) throw new Error("invalid_reset_token");
    if (!user.passwordResetExpiresAt || Date.parse(user.passwordResetExpiresAt) < Date.now()) {
      throw new Error("reset_token_expired");
    }
    user.passwordHash = hashPassword(newPassword);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.updatedAt = nowIso();
    await this.store.setUser(user);
    return { ok: true };
  }

  async listUsersLite() {
    const users = await this.store.listUsers();
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }));
  }

  async listReferralCodes() {
    return this.store.listReferralCodes();
  }

  async createReferralCode(input: {
    createdByUserId: string;
    assignedUserId?: string;
    assignedEmail?: string;
    prefix?: string;
    maxUses?: number;
    expiresDays?: number;
  }) {
    const now = new Date();
    const nowIsoStr = now.toISOString();
    const maxUses = Number.isFinite(input.maxUses) ? Math.max(1, Math.min(9999, Number(input.maxUses))) : 1;
    const prefix = (input.prefix ?? "BITRIUM").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "BITRIUM";
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    const code = `${prefix}-${suffix}`;

    const expiresDays = Number.isFinite(input.expiresDays) ? Math.max(1, Math.min(3650, Number(input.expiresDays))) : 30;
    const expiresAt = new Date(now.getTime() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

    const record: ReferralCodeRecord = {
      id: makeId("ref"),
      code,
      assignedUserId: input.assignedUserId,
      assignedEmail: (input.assignedEmail ?? "").trim().toLowerCase() || undefined,
      createdByUserId: input.createdByUserId,
      maxUses,
      usedCount: 0,
      active: true,
      expiresAt,
      createdAt: nowIsoStr,
      updatedAt: nowIsoStr,
    };
    await this.store.setReferralCode(record);
    return record;
  }

  async setReferralCodeActive(id: string, active: boolean) {
    const record = await this.store.getReferralCode(id);
    if (!record) throw new Error("referral_not_found");
    record.active = active;
    record.updatedAt = nowIso();
    await this.store.setReferralCode(record);
    return record;
  }

  async deleteReferralCode(id: string) {
    await this.store.deleteReferralCode(id);
  }
}
