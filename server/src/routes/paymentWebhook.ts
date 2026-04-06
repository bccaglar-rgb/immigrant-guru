/**
 * Payment Webhook Handler — Receives confirmed payment events from the crypto payment engine.
 * Validates HMAC signature, checks idempotency, activates subscription.
 */
import type { Express } from "express";
import { createHmac } from "node:crypto";
import { pool } from "../db/pool.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("webhook");

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

function verifySignature(body: string, timestamp: number, signature: string): boolean {
  const expected = createHmac("sha256", INTERNAL_SECRET).update(`${timestamp}:${body}`).digest("hex");
  if (expected !== signature) return false;
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;
  return true;
}

const nowIso = () => new Date().toISOString();
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400_000).toISOString();
const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function registerPaymentWebhookRoutes(app: Express) {
  app.post("/internal/payment-events", async (req, res) => {
    // Verify HMAC signature
    const signature = String(req.headers["x-signature"] ?? "");
    const timestamp = Number(req.headers["x-timestamp"] ?? 0);
    const rawBody = JSON.stringify(req.body ?? {});

    if (!verifySignature(rawBody, timestamp, signature)) {
      log.warn("webhook_invalid_signature", { ip: req.ip, timestamp });
      return res.status(401).json({ ok: false, error: "invalid_signature" });
    }

    const event = req.body;
    if (!event || typeof event !== "object") {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }

    const eventId = String(event.eventId ?? "");
    const eventType = String(event.eventType ?? "");

    if (!eventId || !eventType) {
      return res.status(400).json({ ok: false, error: "missing_event_fields" });
    }

    console.log(`[PaymentWebhook] stage=event_received eventId=${eventId} eventType=${eventType}`);
    log.info("event_received", { eventId, eventType });

    // Idempotency check
    try {
      const { rows: existingEvt } = await pool.query(
        `SELECT id FROM payment_webhook_events WHERE event_id = $1`, [eventId],
      );
      if (existingEvt.length > 0) {
        console.log(`[PaymentWebhook] stage=already_processed eventId=${eventId}`);
        return res.json({ ok: true, processed: false, reason: "already_processed" });
      }
    } catch {
      // Table might not exist yet — continue
    }

    try {
      if (eventType === "invoice.paid_confirmed") {
        const userId = String(event.userId ?? "");
        const planId = String(event.planId ?? "");
        const amount = Number(event.amount ?? 0);
        const txHash = String(event.txHash ?? "");

        // Validate all required fields for paid_confirmed events
        const missingFields: string[] = [];
        if (!userId) missingFields.push("userId");
        if (!planId) missingFields.push("planId");
        if (!txHash) missingFields.push("txHash");
        if (!amount || amount <= 0) missingFields.push("amount");
        if (missingFields.length > 0) {
          log.error("validation_failed", { eventId, missingFields });
        console.error(`[PaymentWebhook] stage=validation_failed eventId=${eventId} missing=[${missingFields.join(",")}]`);
          return res.status(400).json({ ok: false, error: "missing_required_fields", fields: missingFields });
        }

        // Get plan info
        const { rows: plans } = await pool.query(`SELECT * FROM plans WHERE id = $1`, [planId]);
        const plan = plans[0];
        if (!plan) {
          console.error(`[PaymentWebhook] Plan ${planId} not found for event ${eventId}`);
          return res.status(400).json({ ok: false, error: "plan_not_found" });
        }

        // Idempotency: check if subscription already exists for this txHash
        const { rows: existingSubs } = await pool.query(
          `SELECT id FROM subscriptions WHERE payment_tx_hash = $1`, [txHash],
        );
        if (existingSubs.length > 0) {
          console.log(`[PaymentWebhook] Subscription already exists for tx ${txHash}`);
        } else {
          // Check for active subscription to stack on top
          const { rows: activeSubs } = await pool.query(
            `SELECT end_at FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY end_at DESC LIMIT 1`,
            [userId],
          );
          const activeEndAt = activeSubs[0]?.end_at;
          const startAt = activeEndAt && Date.parse(activeEndAt) > Date.now() ? String(activeEndAt) : nowIso();
          const endAt = addDays(startAt, Number(plan.duration_days));

          // Also check referral_redemptions for stacking
          const { rows: activeRef } = await pool.query(
            `SELECT end_at FROM referral_redemptions WHERE user_id = $1 AND status = 'ACTIVE' AND end_at > NOW() ORDER BY end_at DESC LIMIT 1`,
            [userId],
          ).catch(() => ({ rows: [] }));
          const refEndAt = activeRef[0]?.end_at;
          const finalStartAt = refEndAt && Date.parse(refEndAt) > Date.parse(startAt) ? String(refEndAt) : startAt;
          const finalEndAt = addDays(finalStartAt, Number(plan.duration_days));

          await pool.query(
            `INSERT INTO subscriptions (id, user_id, plan_id, start_at, end_at, status, payment_tx_hash, paid_amount_usdt, paid_at, plan_snapshot, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, NOW(), NOW())`,
            [
              makeId("sub"), userId, planId, finalStartAt, finalEndAt, txHash, amount, nowIso(),
              JSON.stringify({ name: String(plan.name), priceUsdt: Number(plan.price_usdt), durationDays: Number(plan.duration_days), features: plan.features ?? [] }),
            ],
          );
          log.info("subscription_activated", { eventId, userId, planId, txHash, amount, startAt: finalStartAt, endAt: finalEndAt });
        console.log(`[PaymentWebhook] Subscription activated: ${planId} for ${userId} (${finalStartAt} → ${finalEndAt})`);
        }
      }

      // Record processed event
      try {
        await pool.query(
          `INSERT INTO payment_webhook_events (event_id, event_type, payload, processed_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
          [eventId, eventType, JSON.stringify(event)],
        );
      } catch {
        // Best effort — table might not exist
      }

      log.info("event_processed", { eventId, eventType });
      console.log(`[PaymentWebhook] stage=event_processed eventId=${eventId} eventType=${eventType}`);
      return res.json({ ok: true, processed: true });
    } catch (err: any) {
      log.error("processing_failed", { eventId, eventType, error: err?.message });
      console.error(`[PaymentWebhook] stage=processing_failed eventId=${eventId} eventType=${eventType} error=${err?.message}`);
      return res.status(500).json({ ok: false, error: err?.message ?? "webhook_processing_failed" });
    }
  });
}
