/**
 * Auth middleware — extracts userId from session token and attaches to req.
 *
 * Replaces the x-user-id header pattern with token-derived identity.
 * Two variants:
 *   requireAuth  — 401 if no valid token
 *   requireAdmin — 401 if no token, 403 if not admin role
 */
import type { Request, Response, NextFunction } from "express";
import type { AuthService } from "../payments/authService.ts";

// Extend Express Request to carry auth context
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      userEmail?: string;
    }
  }
}

const extractBearer = (header: string | undefined): string | null => {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return header; // fallback: raw token
};

export function requireAuth(auth: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({ ok: false, error: "unauthorized", message: "Bearer token required." });
      return;
    }
    try {
      const ctx = await auth.getUserFromToken(token);
      if (!ctx) {
        res.status(401).json({ ok: false, error: "invalid_token", message: "Invalid or expired token." });
        return;
      }
      req.userId = ctx.user.id;
      req.userRole = ctx.user.role;
      req.userEmail = ctx.user.email;
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
      const ctx = await auth.getUserFromToken(token);
      if (!ctx) {
        res.status(401).json({ ok: false, error: "invalid_token", message: "Invalid or expired token." });
        return;
      }
      if (ctx.user.role !== "ADMIN") {
        res.status(403).json({ ok: false, error: "forbidden", message: "Admin access required." });
        return;
      }
      req.userId = ctx.user.id;
      req.userRole = ctx.user.role;
      req.userEmail = ctx.user.email;
      next();
    } catch {
      res.status(401).json({ ok: false, error: "auth_error", message: "Authentication failed." });
    }
  };
}
