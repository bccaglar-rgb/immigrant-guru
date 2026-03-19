/**
 * Internal API — Invoice management endpoints.
 * Called by main platform only (HMAC authenticated).
 */
import type { Express } from "express";
import { requireInternalAuth } from "../security/hmac.ts";
import type { InvoiceService } from "../services/invoiceService.ts";

export function registerInvoiceRoutes(app: Express, invoiceService: InvoiceService) {
  /**
   * POST /internal/invoices
   * Create a new payment invoice with unique deposit address.
   */
  app.post("/internal/invoices", requireInternalAuth, async (req, res) => {
    try {
      const { userId, planId, planSnapshot, expiresInMinutes, referenceId } = req.body;

      if (!userId || !planId || !planSnapshot?.priceUsdt) {
        return res.status(400).json({ ok: false, error: "missing_required_fields" });
      }

      const invoice = await invoiceService.createInvoice({
        userId: String(userId),
        planId: String(planId),
        planName: String(planSnapshot.name ?? planId),
        priceUsdt: Number(planSnapshot.priceUsdt),
        durationDays: Number(planSnapshot.durationDays ?? 30),
        expiresInMinutes: Number(expiresInMinutes ?? 30),
        referenceId: referenceId ? String(referenceId) : undefined,
      });

      return res.json({
        ok: true,
        invoiceId: invoice.id,
        depositAddress: invoice.depositAddress,
        amount: invoice.expectedAmountUsdt,
        token: "USDT",
        network: "TRON",
        expiresAt: invoice.expiresAt,
      });
    } catch (err: any) {
      console.error("[InvoiceAPI] Create failed:", err?.message);
      return res.status(400).json({ ok: false, error: err?.message ?? "invoice_create_failed" });
    }
  });

  /**
   * GET /internal/invoices/:invoiceId
   * Get invoice details (for checkout page refresh).
   */
  app.get("/internal/invoices/:invoiceId", async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoice(req.params.invoiceId);
      if (!invoice) return res.status(404).json({ ok: false, error: "invoice_not_found" });
      return res.json({ ok: true, invoice });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  });

  /**
   * GET /internal/invoices/:invoiceId/status
   * Lightweight status check (for frontend polling).
   */
  app.get("/internal/invoices/:invoiceId/status", async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoice(req.params.invoiceId);
      if (!invoice) return res.status(404).json({ ok: false, error: "invoice_not_found" });
      return res.json({
        ok: true,
        invoiceId: invoice.id,
        status: invoice.status,
        paidAmountUsdt: invoice.paidAmountUsdt,
        expectedAmountUsdt: invoice.expectedAmountUsdt,
        paymentTxHash: invoice.paymentTxHash ?? null,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  });

  /**
   * GET /internal/health
   * Engine health check.
   */
  app.get("/internal/health", async (_req, res) => {
    const poolStatus = await invoiceService.getPoolStatus();
    res.json({
      ok: true,
      service: "crypto-payment-engine",
      pool: poolStatus,
      ts: new Date().toISOString(),
    });
  });
}
