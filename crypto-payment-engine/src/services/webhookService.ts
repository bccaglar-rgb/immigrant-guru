/**
 * WebhookService — Sends payment events to the main platform.
 * Uses HMAC signed callbacks.
 */
import { randomBytes } from "node:crypto";
import { ENGINE_CONFIG } from "../config.ts";
import { signPayload } from "../security/hmac.ts";

export interface PaymentEvent {
  eventType: "invoice.paid_confirmed" | "invoice.expired" | "invoice.manual_review";
  eventId: string;
  invoiceId: string;
  userId: string;
  planId: string;
  amount: number;
  network: string;
  token: string;
  txHash?: string;
  depositAddress: string;
  confirmedAt: string;
}

export class WebhookService {
  async sendPaymentEvent(event: PaymentEvent): Promise<boolean> {
    const url = ENGINE_CONFIG.mainPlatformCallbackUrl;
    if (!url) {
      console.warn("[Webhook] No callback URL configured");
      return false;
    }

    event.eventId = event.eventId || `evt_${randomBytes(8).toString("hex")}`;
    const body = JSON.stringify(event);
    const timestamp = Date.now();
    const signature = signPayload(body, timestamp);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-Timestamp": String(timestamp),
        },
        body,
      });

      if (res.ok) {
        console.log(`[Webhook] Event ${event.eventType} sent for invoice ${event.invoiceId}`);
        return true;
      }

      console.error(`[Webhook] Failed ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    } catch (err: any) {
      console.error(`[Webhook] Send error:`, err?.message);
      return false;
    }
  }
}
