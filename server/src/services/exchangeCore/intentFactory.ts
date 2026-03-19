/**
 * IntentFactory — Normalizes trade inputs from any source (manual, AI, API)
 * into a CoreIntentRecord ready for the execution pipeline.
 */
import { randomUUID } from "node:crypto";
import type { CoreIntentRecord, CoreSource, CorePriority, CoreVenue, CoreTpSlSpec } from "./types.ts";

const nowIso = () => new Date().toISOString();

const normalizeSymbol = (raw: string): string => {
  const value = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!value) return "BTCUSDT";
  return value.endsWith("USDT") ? value : `${value}USDT`;
};

export interface ManualIntentInput {
  userId: string;
  exchangeAccountId: string;
  venue: CoreVenue;
  symbolInternal: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP" | "TAKE_PROFIT";
  timeInForce?: "GTC" | "IOC" | "FOK" | "POST_ONLY" | null;
  qty?: number | null;
  notionalUsdt?: number | null;
  price?: number | null;
  leverage?: number | null;
  reduceOnly?: boolean;
  tp?: CoreTpSlSpec | null;
  sl?: CoreTpSlSpec | null;
  clientOrderId?: string;
  idempotencyKey?: string;
}

export class IntentFactory {
  /**
   * Build a CoreIntentRecord from manual trade input.
   * Does NOT persist — that's the caller's job.
   */
  createManualIntent(input: ManualIntentInput): CoreIntentRecord {
    const intentId = randomUUID();
    const now = nowIso();
    const symbol = normalizeSymbol(input.symbolInternal);

    return {
      id: intentId,
      clientOrderId: input.clientOrderId ?? `man-${intentId.slice(0, 12)}`,
      source: "MANUAL" as CoreSource,
      priority: "INTERACTIVE" as CorePriority,
      userId: input.userId,
      runId: "",
      exchangeAccountId: input.exchangeAccountId,
      venue: input.venue,
      marketType: "FUTURES",
      symbolInternal: symbol,
      symbolVenue: symbol,
      side: input.side,
      orderType: input.orderType,
      timeInForce: input.timeInForce ?? null,
      qty: input.qty ?? null,
      notionalUsdt: input.notionalUsdt ?? null,
      price: input.price ?? null,
      reduceOnly: input.reduceOnly ?? false,
      leverage: input.leverage ?? null,
      tp: input.tp ?? null,
      sl: input.sl ?? null,
      state: "ACCEPTED",
      rejectCode: "",
      rejectReason: "",
      createdAt: now,
      updatedAt: now,
    };
  }
}
