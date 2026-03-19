/**
 * PaymentEngineClient — Main platform adapter for the crypto payment engine.
 * Replaces direct payment logic with internal API calls to the engine.
 *
 * When engine is not configured (ENGINE_URL not set), falls back to
 * the existing local payment flow for backward compatibility.
 */
import { createHmac } from "node:crypto";

const ENGINE_URL = process.env.PAYMENT_ENGINE_URL ?? "";
const ENGINE_SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

function signPayload(body: string, timestamp: number): string {
  return createHmac("sha256", ENGINE_SECRET).update(`${timestamp}:${body}`).digest("hex");
}

async function engineReq<T>(path: string, init?: RequestInit): Promise<T> {
  if (!ENGINE_URL) throw new Error("PAYMENT_ENGINE_URL not configured");
  const body = init?.body ? String(init.body) : "{}";
  const timestamp = Date.now();
  const signature = signPayload(body, timestamp);

  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": String(timestamp),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error ?? `engine_http_${res.status}`);
  return data as T;
}

export function isEngineConfigured(): boolean {
  return Boolean(ENGINE_URL);
}

export async function createEngineInvoice(input: {
  userId: string;
  planId: string;
  planName: string;
  priceUsdt: number;
  durationDays: number;
  referenceId?: string;
}) {
  return engineReq<{
    ok: true;
    invoiceId: string;
    depositAddress: string;
    amount: number;
    token: string;
    network: string;
    expiresAt: string;
  }>("/internal/invoices", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId,
      planId: input.planId,
      planSnapshot: {
        name: input.planName,
        priceUsdt: input.priceUsdt,
        durationDays: input.durationDays,
      },
      expiresInMinutes: 30,
      referenceId: input.referenceId,
    }),
  });
}

export async function getEngineInvoice(invoiceId: string) {
  return engineReq<{ ok: true; invoice: any }>(`/internal/invoices/${invoiceId}`);
}

export async function getEngineInvoiceStatus(invoiceId: string) {
  return engineReq<{
    ok: true;
    invoiceId: string;
    status: string;
    paidAmountUsdt: number;
    expectedAmountUsdt: number;
    paymentTxHash: string | null;
  }>(`/internal/invoices/${invoiceId}/status`);
}

export async function getEngineHealth() {
  return engineReq<{ ok: true; service: string; pool: Record<string, number> }>("/internal/health");
}
