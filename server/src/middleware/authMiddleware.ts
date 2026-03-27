/**
 * Auth middleware — supports both JWT (new) and session tokens (legacy).
 *
 * Token resolution order:
 *   1. Try JWT verification (stateless, fast)
 *   2. Fallback to session token lookup (Redis → DB)
 *
 * Two variants:
 *   requireAuth  — 401 if no valid token
 *   requireAdmin — 401 if no token, 403 if not admin role
 */
import type { Request, Response, NextFunction } from "express";
import type { AuthService } from "../payments/authService.ts";
import { enrichTrace } from "../services/context/traceContext.ts";

// Extend Express Request to carry auth context
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      userEmail?: string;
      authMethod?: "jwt" | "session";
    }
  }
}

const extractBearer = (header: string | undefined): string | null => {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return header; // fallback: raw token
};

/** Check if a token looks like a JWT (3 dot-separated base64url segments) */
const isJwtFormat = (token: string): boolean =>
  token.split(".").length === 3 && token.length > 60;

/**
 * Resolve token to user context.
 * Returns { userId, role, email, method } or null.
 */
async function resolveToken(
  token: string,
  auth: AuthService,
): Promise<{ userId: string; role: string; email: string; method: "jwt" | "session" } | null> {
  // 1. Try JWT first (stateless, no DB/Redis lookup for access tokens)
  if (isJwtFormat(token)) {
    try {
      const { verifyAccessToken } = await import("../security/jwtService.ts");
      const jwtCtx = verifyAccessToken(token);
      if (jwtCtx) {
        return { userId: jwtCtx.userId, role: jwtCtx.role, email: jwtCtx.email, method: "jwt" };
      }
    } catch {
      // JWT service not initialized or import error — fall through
    }
  }

  // 2. Fallback to session token (Redis-cached → DB)
  const ctx = await auth.getUserFromToken(token);
  if (!ctx) return null;
  return { userId: ctx.user.id, role: ctx.user.role, email: ctx.user.email, method: "session" };
}

export function requireAuth(auth: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({ ok: false, error: "unauthorized", message: "Bearer token required." });
      return;
    }
    try {
      const ctx = await resolveToken(token, auth);
      if (!ctx) {
        res.status(401).json({ ok: false, error: "invalid_token", message: "Invalid or expired token." });
        return;
      }
      req.userId = ctx.userId;
      req.userRole = ctx.role;
      req.userEmail = ctx.email;
      req.authMethod = ctx.method;
      enrichTrace({ userId: ctx.userId });
      next();
    } catch {
      res.status(401).json({ ok: false, error: "auth_error", message: "Authentication failed." });
    }
  };
}

export function requireAdmin(auth: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({ ok: false, error: "unauthorized", message: "Bearer token required." });
      return;
    }
    try {
      const ctx = await resolveToken(token, auth);
      if (!ctx) {
        res.status(401).json({ ok: false, error: "invalid_token", message: "Invalid or expired token." });
        return;
      }
      if (ctx.role !== "ADMIN") {
        res.status(403).json({ ok: false, error: "forbidden", message: "Admin access required." });
        return;
      }
      req.userId = ctx.userId;
      req.userRole = ctx.role;
      req.userEmail = ctx.email;
      req.authMethod = ctx.method;
      enrichTrace({ userId: ctx.userId });
      next();
    } catch {
      res.status(401).json({ ok: false, error: "auth_error", message: "Authentication failed." });
    }
  };
}
