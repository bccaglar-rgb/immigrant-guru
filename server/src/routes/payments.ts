import type { Express, Request, Response } from "express";
import { PaymentService } from "../payments/paymentService.ts";
import { AuthService } from "../payments/authService.ts";
import { PAYMENT_CONFIG } from "../payments/config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("payments");

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

export const registerPaymentsRoutes = (app: Express, auth: AuthService, payments: PaymentService, addressPool?: any) => {
  app.get("/api/payments/plans", async (_req, res) => {
    res.json({ ok: true, plans: await payments.listPlans() });
  });

  app.post("/api/payments/invoices", async (req, res) => {
    const ctx = await requireAuth(auth, req, res);
    if (!ctx) return;
    try {
      const { planId } = req.body ?? {};
      const invoice = await payments.createInvoice(ctx.user, String(planId ?? ""));
      log.info("invoice_created", { invoiceId: invoice.id, userId: ctx.user.id, planId, amount: invoice.expectedAmountUsdt, depositAddress: invoice.depositAddress });
      const qrPayload = `tron:${invoice.depositAddress}?amount=${invoice.expectedAmountUsdt}&token=${PAYMENT_CONFIG.usdtContractAddress}`;
      return res.json({ ok: true, invoice, qrPayload });
    } catch (err: any) {
      log.error("invoice_create_failed", { userId: ctx.user.id, planId: req.body?.planId, error: err?.message });
      return res.status(400).json({ ok: false, error: err?.message ?? "invoice_create_failed" });
    }
  });

  app.get("/api/payments/invoices/:invoiceId", async (req, res) => {
    const ctx = await requireAuth(auth, req, res);
    if (!ctx) return;
    const invoice = await payments.getInvoice(req.params.invoiceId);
    if (!invoice || invoice.userId !== ctx.user.id) {
      return res.status(404).json({ ok: false, error: "invoice_not_found" });
    }
    return res.json({ ok: true, invoice });
  });

  app.get("/api/payments/subscriptions/me", async (req, res) => {
    const ctx = await requireAuth(auth, req, res);
    if (!ctx) return;
    return res.json({ ok: true, subscriptions: await payments.listSubscriptions(ctx.user.id) });
  });

  app.get("/api/admin/plans", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    return res.json({ ok: true, plans: await payments.listPlans() });
  });

  app.post("/api/admin/plans", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { id, name, priceUsdt, durationDays, features, enabled } = req.body ?? {};
      const plan = await payments.upsertPlan({
        id: id ? String(id) : undefined,
        name: String(name ?? ""),
        priceUsdt: Number(priceUsdt ?? 0),
        durationDays: Number(durationDays ?? 0),
        features: Array.isArray(features) ? features.map((v) => String(v)) : [],
        enabled: Boolean(enabled),
      });
      return res.json({ ok: true, plan });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "plan_upsert_failed" });
    }
  });

  app.delete("/api/admin/plans/:id", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    await payments.deletePlan(req.params.id);
    return res.json({ ok: true });
  });

  app.get("/api/admin/invoices", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    const [invoices, subscriptions] = await Promise.all([
      payments.listInvoices(),
      payments.listSubscriptions(),
    ]);
    return res.json({ ok: true, invoices, subscriptions });
  });

  app.post("/api/admin/invoices/:invoiceId/mark-paid", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { txHash, amountUsdt, reason } = req.body ?? {};
      const invoice = await payments.manualMarkPaid(req.params.invoiceId, String(txHash ?? "manual"), Number(amountUsdt ?? 0), String(reason ?? "manual_override"));
      log.info("invoice_manual_mark_paid", { invoiceId: req.params.invoiceId, adminUserId: ctx.user.id, txHash, amountUsdt, reason });
      return res.json({ ok: true, invoice });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "manual_mark_paid_failed" });
    }
  });

  app.post("/api/admin/subscriptions/:subscriptionId/extend", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { days } = req.body ?? {};
      const sub = await payments.extendSubscription(req.params.subscriptionId, Number(days ?? 0));
      return res.json({ ok: true, subscription: sub });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "subscription_extend_failed" });
    }
  });

  app.get("/api/admin/members/overview", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;

    const now = Date.now();
    const allUsers = await auth.listUsersLite();
    const users = allUsers.filter((u) => u.role === "USER");
    const subscriptions = await payments.listSubscriptions();
    const allInvoices = await payments.listInvoices();
    const paidInvoices = allInvoices.filter((inv) => inv.invoiceType === "PLAN" && inv.status === "paid");

    const rows = users.map((user) => {
      const userSubs = subscriptions
        .filter((s) => s.userId === user.id)
        .sort((a, b) => Date.parse(a.endAt) - Date.parse(b.endAt));

      const activeSub = [...userSubs]
        .filter((s) => s.status === "active" && Date.parse(s.endAt) > now)
        .sort((a, b) => Date.parse(b.endAt) - Date.parse(a.endAt))[0];

      const totalPaidUsdt = paidInvoices
        .filter((inv) => inv.userId === user.id)
        .reduce((sum, inv) => sum + Number(inv.paidAmountUsdt || 0), 0);

      const purchasedDays = userSubs.reduce((sum, sub) => sum + Number(sub.planSnapshot?.durationDays ?? 0), 0);
      const purchasedMonths = Number((purchasedDays / 30).toFixed(1));
      const daysRemaining =
        activeSub && Date.parse(activeSub.endAt) > now
          ? Math.max(0, Math.ceil((Date.parse(activeSub.endAt) - now) / (24 * 60 * 60 * 1000)))
          : 0;

      return {
        userId: user.id,
        email: user.email,
        createdAt: user.createdAt,
        membershipStatus: activeSub ? "ACTIVE" : "INACTIVE",
        activePlanName: activeSub?.planSnapshot?.name ?? "-",
        endAt: activeSub?.endAt ?? null,
        daysRemaining,
        purchasedMonths,
        totalPaidUsdt: Number(totalPaidUsdt.toFixed(2)),
        subscriptionsCount: userSubs.length,
      };
    });

    const totals = {
      users: rows.length,
      activeUsers: rows.filter((r) => r.membershipStatus === "ACTIVE").length,
      totalPaidUsdt: Number(rows.reduce((sum, r) => sum + r.totalPaidUsdt, 0).toFixed(2)),
      avgPaidUsdt: rows.length ? Number((rows.reduce((sum, r) => sum + r.totalPaidUsdt, 0) / rows.length).toFixed(2)) : 0,
    };

    return res.json({
      ok: true,
      totals,
      members: rows.sort((a, b) => b.totalPaidUsdt - a.totalPaidUsdt),
    });
  });

  // ── Address Pool Status ──
  app.get("/api/payments/address-pool-status", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const pool = addressPool ? await addressPool.getPoolStatus() : {};
      return res.json({ ok: true, pool });
    } catch {
      return res.json({ ok: true, pool: {} });
    }
  });

  // ── All Invoices (admin) ──
  app.get("/api/payments/invoices", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    return res.json({ ok: true, invoices: await payments.listInvoices() });
  });

  // ── Admin Mark Paid ──
  app.post("/api/admin/payments/mark-paid", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { invoiceId, txHash, amountUsdt, reason } = req.body ?? {};
      const invoice = await payments.manualMarkPaid(
        String(invoiceId ?? ""),
        String(txHash ?? "admin-manual"),
        Number(amountUsdt ?? 0),
        String(reason ?? "admin_manual"),
        ctx.user.id,
      );
      log.info("admin_mark_paid", { invoiceId, adminUserId: ctx.user.id, txHash, amountUsdt, reason });
      return res.json({ ok: true, invoice });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message ?? "mark_paid_failed" });
    }
  });
};
