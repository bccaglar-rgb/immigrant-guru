import type { Express, Request, Response, NextFunction } from "express";
import { AuthService } from "../payments/authService.ts";
import type { Role } from "../payments/types.ts";
import { redis } from "../db/redis.ts";

const RATE_WINDOW_SEC = 60;
const RATE_MAX = 20;

/**
 * Redis-based rate limiter — shared across PM2 cluster workers.
 * Uses INCR + EXPIRE (atomic via MULTI/EXEC is not needed — INCR auto-creates key).
 */
const ratelimitAuth = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || "unknown";
  const key = `rl:auth:${ip}`;
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      // First request in window — set TTL
      await redis.expire(key, RATE_WINDOW_SEC);
    }
    if (current > RATE_MAX) {
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }
    return next();
  } catch {
    // If Redis is down, allow the request (fail-open)
    return next();
  }
};

const bearer = (header: string | undefined) => {
  if (!header) return "";
  const [scheme, token] = header.split(" ");
  if ((scheme ?? "").toLowerCase() !== "bearer") return "";
  return token ?? "";
};

const requireAdmin = async (auth: AuthService, req: Request, res: Response) => {
  const token = bearer(req.headers.authorization);
  const ctx = await auth.getUserFromToken(token);
  if (!ctx) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  if (ctx.user.role !== "ADMIN") {
    res.status(403).json({ ok: false, error: "forbidden" });
    return null;
  }
  return ctx;
};

export const registerAuthRoutes = (app: Express, auth: AuthService) => {
  app.post("/api/auth/signup", ratelimitAuth, async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      const ADMIN_EMAILS = ["bccaglar@gmail.com"];
      const role: Role = ADMIN_EMAILS.includes(String(email ?? "").toLowerCase().trim()) ? "ADMIN" : "USER";
      const user = await auth.signup(String(email ?? ""), String(password ?? ""), role);
      return res.json({ ok: true, user: { id: user.id, email: user.email } });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "signup_failed" });
    }
  });

  app.post("/api/auth/login", ratelimitAuth, async (req, res) => {
    try {
      const { email, password, twoFactorCode } = req.body ?? {};
      const result = await auth.login(String(email ?? ""), String(password ?? ""), twoFactorCode ? String(twoFactorCode) : undefined);
      let hasActivePlan = result.user.role === "ADMIN";
      let activePlanTier: string | null = result.user.role === "ADMIN" ? "titan" : null;
      let activePlanEndAt: string | null = result.user.role === "ADMIN" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;
      if (!hasActivePlan) {
        try {
          const { pool } = await import("../db/pool.ts");
          const { rows } = await pool.query(
            `SELECT plan_id, end_at FROM subscriptions WHERE user_id = $1 AND LOWER(status) = 'active' AND (end_at IS NULL OR end_at > NOW()) ORDER BY end_at DESC LIMIT 1`,
            [result.user.id],
          );
          if (rows.length > 0) {
            hasActivePlan = true;
            activePlanTier = String(rows[0].plan_id ?? "").split("-")[0] || "explorer";
            activePlanEndAt = rows[0].end_at ? new Date(rows[0].end_at).toISOString() : null;
          }
          if (!hasActivePlan) {
            const { rows: refRows } = await pool.query(
              `SELECT plan_id, end_at FROM referral_redemptions WHERE user_id = $1 AND status = 'ACTIVE' AND end_at > NOW() ORDER BY end_at DESC LIMIT 1`,
              [result.user.id],
            );
            if (refRows.length > 0) {
              hasActivePlan = true;
              activePlanTier = String(refRows[0].plan_id ?? "").split("-")[0] || "explorer";
              activePlanEndAt = refRows[0].end_at ? new Date(refRows[0].end_at).toISOString() : null;
            }
          }
        } catch { /* fail-open */ }
      }
      return res.json({
        ok: true,
        token: result.session.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          twoFactorEnabled: result.user.twoFactorEnabled,
          hasActivePlan,
          activePlanTier,
          activePlanEndAt,
        },
      });
    } catch (err: any) {
      const code = err?.message ?? "login_failed";
      const status = code === "two_factor_required" ? 401 : 400;
      return res.status(status).json({ ok: false, error: code });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = bearer(req.headers.authorization);
    const ctx = await auth.getUserFromToken(token);
    if (!ctx) return res.status(401).json({ ok: false, error: "unauthorized" });
    // Check active subscription or referral redemption (ADMIN always has full access)
    let hasActivePlan = ctx.user.role === "ADMIN";
    let activePlanTier: string | null = ctx.user.role === "ADMIN" ? "titan" : null;
    let activePlanEndAt: string | null = null;
    if (ctx.user.role === "ADMIN") {
      // Admin gets Titan perpetually — show 1 year from now
      activePlanEndAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (!hasActivePlan) {
      try {
        const { pool } = await import("../db/pool.ts");
        // Check paid subscriptions
        const { rows } = await pool.query(
          `SELECT plan_id, end_at FROM subscriptions WHERE user_id = $1 AND LOWER(status) = 'active' AND (end_at IS NULL OR end_at > NOW()) ORDER BY end_at DESC LIMIT 1`,
          [ctx.user.id],
        );
        if (rows.length > 0) {
          hasActivePlan = true;
          activePlanTier = String(rows[0].plan_id ?? "").split("-")[0] || "explorer";
          activePlanEndAt = rows[0].end_at ? new Date(rows[0].end_at).toISOString() : null;
        }
        // Check referral redemptions
        if (!hasActivePlan) {
          const { rows: refRows } = await pool.query(
            `SELECT plan_id, end_at FROM referral_redemptions WHERE user_id = $1 AND status = 'ACTIVE' AND end_at > NOW() ORDER BY end_at DESC LIMIT 1`,
            [ctx.user.id],
          );
          if (refRows.length > 0) {
            hasActivePlan = true;
            activePlanTier = String(refRows[0].plan_id ?? "").split("-")[0] || "explorer";
            activePlanEndAt = refRows[0].end_at ? new Date(refRows[0].end_at).toISOString() : null;
          }
        }
      } catch { /* fail-open: treat as no plan */ }
    }
    return res.json({
      ok: true,
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        role: ctx.user.role as Role,
        twoFactorEnabled: ctx.user.twoFactorEnabled,
        hasActivePlan,
        activePlanTier,
        activePlanEndAt,
      },
    });
  });

  app.post("/api/auth/2fa/setup", async (req, res) => {
    const token = bearer(req.headers.authorization);
    const ctx = await auth.getUserFromToken(token);
    if (!ctx) return res.status(401).json({ ok: false, error: "unauthorized" });
    try {
      const setup = await auth.setupTwoFactor(ctx.user.id);
      return res.json({ ok: true, ...setup });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "two_factor_setup_failed" });
    }
  });

  app.post("/api/auth/2fa/enable", async (req, res) => {
    const token = bearer(req.headers.authorization);
    const ctx = await auth.getUserFromToken(token);
    if (!ctx) return res.status(401).json({ ok: false, error: "unauthorized" });
    try {
      await auth.enableTwoFactor(ctx.user.id, String(req.body?.token ?? ""));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "two_factor_enable_failed" });
    }
  });

  app.post("/api/auth/password-reset/request", ratelimitAuth, async (req, res) => {
    const { email } = req.body ?? {};
    const result = await auth.requestPasswordReset(String(email ?? ""));
    return res.json({ ok: true, ...(process.env.NODE_ENV !== "production" ? { devResetToken: result.resetToken } : {}) });
  });

  app.post("/api/auth/password-reset/confirm", ratelimitAuth, async (req, res) => {
    try {
      const { token, newPassword } = req.body ?? {};
      const result = await auth.resetPassword(String(token ?? ""), String(newPassword ?? ""));
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "password_reset_failed" });
    }
  });

  app.get("/api/admin/users-lite", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    return res.json({ ok: true, users: await auth.listUsersLite() });
  });

  app.post("/api/admin/users", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const requestedRole = String(req.body?.role ?? "ADMIN").toUpperCase();
      const role: Role = requestedRole === "USER" ? "USER" : "ADMIN";
      const user = await auth.signup(email, password, role);
      return res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "admin_user_create_failed" });
    }
  });

  app.get("/api/admin/referral-codes", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    return res.json({ ok: true, items: await auth.listReferralCodes() });
  });

  app.post("/api/admin/referral-codes", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { assignedUserId, assignedEmail, prefix, maxUses, expiresDays, grantPlanTier, grantDurationDays } = req.body ?? {};
      const code = await auth.createReferralCode({
        createdByUserId: ctx.user.id,
        assignedUserId: assignedUserId ? String(assignedUserId) : undefined,
        assignedEmail: assignedEmail ? String(assignedEmail) : undefined,
        prefix: prefix ? String(prefix) : undefined,
        maxUses: maxUses !== undefined ? Number(maxUses) : undefined,
        expiresDays: expiresDays !== undefined ? Number(expiresDays) : undefined,
        grantPlanTier: grantPlanTier ? String(grantPlanTier) : undefined,
        grantDurationDays: grantDurationDays !== undefined ? Number(grantDurationDays) : undefined,
      });
      return res.json({ ok: true, item: code });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "referral_create_failed" });
    }
  });

  app.patch("/api/admin/referral-codes/:id", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const active = Boolean(req.body?.active);
      const item = await auth.setReferralCodeActive(String(req.params.id), active);
      return res.json({ ok: true, item });
    } catch (err: any) {
      return res.status(404).json({ ok: false, error: err?.message ?? "referral_update_failed" });
    }
  });

  app.delete("/api/admin/referral-codes/:id", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    await auth.deleteReferralCode(String(req.params.id));
    return res.json({ ok: true });
  });

  // ── Delete User (admin only) ──
  app.delete("/api/admin/users/:userId", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    const targetId = String(req.params.userId);
    if (targetId === ctx.user.id) {
      return res.status(400).json({ ok: false, error: "cannot_delete_self" });
    }
    try {
      const { pool } = await import("../db/pool.ts");
      // Delete related data first
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [targetId]);
      await pool.query("DELETE FROM referral_redemptions WHERE user_id = $1", [targetId]).catch(() => {});
      await pool.query("DELETE FROM users WHERE id = $1 AND role != 'ADMIN'", [targetId]);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message ?? "delete_failed" });
    }
  });

  // ── Referral Code Redeem (authenticated user) ──
  app.post("/api/referral/redeem", ratelimitAuth, async (req, res) => {
    const token = bearer(req.headers.authorization);
    const ctx = await auth.getUserFromToken(token);
    if (!ctx) return res.status(401).json({ ok: false, error: "unauthorized" });

    const code = String(req.body?.code ?? "").trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: "code_required" });

    try {
      const { pool } = await import("../db/pool.ts");

      // 1. Find referral code
      const { rows: codeRows } = await pool.query(
        `SELECT * FROM referral_codes WHERE code = $1`,
        [code],
      );
      const refCode = codeRows[0];
      if (!refCode) return res.status(404).json({ ok: false, error: "invalid_code" });
      if (!refCode.active) return res.status(400).json({ ok: false, error: "code_inactive" });
      if (refCode.expires_at && new Date(refCode.expires_at) < new Date()) {
        return res.status(400).json({ ok: false, error: "code_expired" });
      }
      if (refCode.used_count >= refCode.max_uses) {
        return res.status(400).json({ ok: false, error: "code_max_uses_reached" });
      }

      // 2. Check if user already redeemed this code
      const { rows: existing } = await pool.query(
        `SELECT id FROM referral_redemptions WHERE user_id = $1 AND referral_code_id = $2`,
        [ctx.user.id, refCode.id],
      );
      if (existing.length > 0) {
        return res.status(400).json({ ok: false, error: "already_redeemed" });
      }

      // 3. Determine plan from referral code settings
      const durationDays = refCode.grant_duration_days ?? 30;
      const planTier = refCode.grant_plan_tier ?? "explorer";
      const durationLabel = durationDays <= 30 ? "1m" : durationDays <= 90 ? "3m" : durationDays <= 180 ? "6m" : "12m";
      const planId = `${planTier}-${durationLabel}`;
      const now = new Date();

      // Check if user has existing referral subscription — extend from end
      const { rows: activeSubs } = await pool.query(
        `SELECT end_at FROM referral_redemptions WHERE user_id = $1 AND status = 'ACTIVE' AND end_at > NOW() ORDER BY end_at DESC LIMIT 1`,
        [ctx.user.id],
      );
      const startAt = activeSubs[0] ? new Date(activeSubs[0].end_at) : now;
      const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      // 4. Create redemption
      const redeemId = `rdm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await pool.query(
        `INSERT INTO referral_redemptions (id, user_id, referral_code_id, plan_id, duration_days, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
        [redeemId, ctx.user.id, refCode.id, planId, durationDays, startAt.toISOString(), endAt.toISOString()],
      );

      // 5. Increment used_count
      await pool.query(
        `UPDATE referral_codes SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1`,
        [refCode.id],
      );

      return res.json({
        ok: true,
        message: `Referral code redeemed! ${durationDays} days ${planTier.charAt(0).toUpperCase() + planTier.slice(1)} plan activated.`,
        planId,
        durationDays,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message ?? "redeem_failed" });
    }
  });

  // ── Social / OAuth Login ──────────────────────────────────────

  app.post("/api/auth/google", ratelimitAuth, async (req, res) => {
    try {
      const { credential } = req.body ?? {};
      if (!credential) return res.status(400).json({ ok: false, error: "missing_credential" });
      const parts = String(credential).split(".");
      if (parts.length !== 3) return res.status(400).json({ ok: false, error: "invalid_token_format" });
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as { email?: string; email_verified?: boolean; aud?: string };
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (googleClientId && payload.aud !== googleClientId) return res.status(401).json({ ok: false, error: "invalid_audience" });
      if (!payload.email || !payload.email_verified) return res.status(400).json({ ok: false, error: "email_not_verified" });
      const result = await auth.socialLogin(payload.email, "google");
      return res.json({ ok: true, token: result.session.token, user: { id: result.user.id, email: result.user.email, role: result.user.role, twoFactorEnabled: result.user.twoFactorEnabled, hasActivePlan: result.user.role === "ADMIN" } });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "google_auth_failed" });
    }
  });

  app.post("/api/auth/apple", ratelimitAuth, async (req, res) => {
    try {
      const { id_token, user: appleUser } = req.body ?? {};
      if (!id_token) return res.status(400).json({ ok: false, error: "missing_id_token" });
      const parts = String(id_token).split(".");
      if (parts.length !== 3) return res.status(400).json({ ok: false, error: "invalid_token_format" });
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as { email?: string; sub?: string };
      const email = payload.email ?? (appleUser as any)?.email;
      if (!email) return res.status(400).json({ ok: false, error: "email_not_available" });
      const result = await auth.socialLogin(String(email), "apple");
      return res.json({ ok: true, token: result.session.token, user: { id: result.user.id, email: result.user.email, role: result.user.role, twoFactorEnabled: result.user.twoFactorEnabled, hasActivePlan: result.user.role === "ADMIN" } });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "apple_auth_failed" });
    }
  });

  app.post("/api/auth/telegram", ratelimitAuth, async (req, res) => {
    try {
      const { id, hash, auth_date } = req.body ?? {};
      if (!id || !hash) return res.status(400).json({ ok: false, error: "missing_telegram_data" });
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) return res.status(503).json({ ok: false, error: "telegram_not_configured" });
      const { createHash: cHash, createHmac: cHmac } = await import("node:crypto");
      const secretKey = cHash("sha256").update(botToken).digest();
      const checkStr = Object.entries(req.body as Record<string, string>).filter(([k]) => k !== "hash").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
      if (cHmac("sha256", secretKey).update(checkStr).digest("hex") !== hash) return res.status(401).json({ ok: false, error: "invalid_telegram_hash" });
      if (Date.now() / 1000 - Number(auth_date) > 3600) return res.status(401).json({ ok: false, error: "telegram_auth_expired" });
      const email = `telegram_${id}@bitrium.com`;
      const result = await auth.socialLogin(email, "telegram");
      return res.json({ ok: true, token: result.session.token, user: { id: result.user.id, email: result.user.email, role: result.user.role, twoFactorEnabled: false, hasActivePlan: false } });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "telegram_auth_failed" });
    }
  });
};
