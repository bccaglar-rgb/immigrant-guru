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
      const user = await auth.signup(String(email ?? ""), String(password ?? ""), "USER");
      return res.json({ ok: true, user: { id: user.id, email: user.email } });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "signup_failed" });
    }
  });

  app.post("/api/auth/login", ratelimitAuth, async (req, res) => {
    try {
      const { email, password, twoFactorCode } = req.body ?? {};
      const result = await auth.login(String(email ?? ""), String(password ?? ""), twoFactorCode ? String(twoFactorCode) : undefined);
      return res.json({
        ok: true,
        token: result.session.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          twoFactorEnabled: result.user.twoFactorEnabled,
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
    return res.json({
      ok: true,
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        role: ctx.user.role as Role,
        twoFactorEnabled: ctx.user.twoFactorEnabled,
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
      const { assignedUserId, assignedEmail, prefix, maxUses, expiresDays } = req.body ?? {};
      const code = await auth.createReferralCode({
        createdByUserId: ctx.user.id,
        assignedUserId: assignedUserId ? String(assignedUserId) : undefined,
        assignedEmail: assignedEmail ? String(assignedEmail) : undefined,
        prefix: prefix ? String(prefix) : undefined,
        maxUses: maxUses !== undefined ? Number(maxUses) : undefined,
        expiresDays: expiresDays !== undefined ? Number(expiresDays) : undefined,
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
};
