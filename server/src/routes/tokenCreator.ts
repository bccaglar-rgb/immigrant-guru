import type { Express, Request, Response } from "express";
import { AuthService } from "../payments/authService.ts";
import { TokenCreatorService } from "../payments/tokenCreatorService.ts";

const bearer = (header: string | undefined) => {
  if (!header) return "";
  const [scheme, token] = header.split(" ");
  if ((scheme ?? "").toLowerCase() !== "bearer") return "";
  return token ?? "";
};

const requireAuth = async (auth: AuthService, req: Request, res: Response) => {
  const token = bearer(req.headers.authorization);
  const ctx = await auth.getUserFromToken(token);
  if (!ctx) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return ctx;
};

const requireAdmin = async (auth: AuthService, req: Request, res: Response) => {
  const ctx = await requireAuth(auth, req, res);
  if (!ctx) return null;
  if (ctx.user.role !== "ADMIN") {
    res.status(403).json({ ok: false, error: "forbidden" });
    return null;
  }
  return ctx;
};

export const registerTokenCreatorRoutes = (app: Express, auth: AuthService, tokenCreator: TokenCreatorService) => {
  app.get("/api/token-creator/config", (_req, res) => {
    res.json({ ok: true, config: tokenCreator.getFeeConfig() });
  });

  app.post("/api/token-creator/quote", (req, res) => {
    try {
      const quote = tokenCreator.calculateQuote(req.body ?? {});
      res.json({ ok: true, quote });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err?.message ?? "quote_failed" });
    }
  });

  app.post("/api/token-creator/orders", async (req, res) => {
    const ctx = await requireAuth(auth, req, res);
    if (!ctx) return;
    try {
      const created = await tokenCreator.createOrder(ctx.user, req.body ?? {});
      res.json({ ok: true, ...created });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err?.message ?? "order_create_failed" });
    }
  });

  app.get("/api/token-creator/orders/me", async (req, res) => {
    const ctx = await requireAuth(auth, req, res);
    if (!ctx) return;
    res.json({ ok: true, orders: await tokenCreator.listOrders(ctx.user.id) });
  });

  app.get("/api/admin/token-creator/orders", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    res.json({ ok: true, orders: await tokenCreator.listOrders() });
  });

  app.post("/api/admin/token-creator/config", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const config = await tokenCreator.updateFeeConfig(req.body ?? {});
      res.json({ ok: true, config });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err?.message ?? "config_update_failed" });
    }
  });
};
