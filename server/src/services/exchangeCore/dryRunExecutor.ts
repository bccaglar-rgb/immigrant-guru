/**
 * DryRunExecutor — Shadow execution mode.
 *
 * Runs the full pipeline (risk, policy, normalization) but does NOT send to exchange.
 * Logs what WOULD have happened in shadow_executions table.
 * Useful for testing AI strategies without real capital.
 */
import { pool } from "../../db/pool.ts";
import type { CoreIntentRecord } from "./types.ts";

export interface DryRunResult {
  wouldSend: boolean;
  simulatedResult: {
    orderId: string;
    status: string;
    filledQty: number;
    avgPrice: number;
  };
  reasoning: string;
}

export class DryRunExecutor {
  async execute(intent: CoreIntentRecord, lastPrice?: number): Promise<DryRunResult> {
    // Simulate what would happen
    const price = lastPrice ?? intent.price ?? 0;
    const qty = intent.qty ?? 0;

    const result: DryRunResult = {
      wouldSend: qty > 0 && (intent.orderType === "MARKET" || (intent.price != null && intent.price > 0)),
      simulatedResult: {
        orderId: `dry-${intent.id.slice(0, 12)}`,
        status: "FILLED",
        filledQty: qty,
        avgPrice: price,
      },
      reasoning: this.buildReasoning(intent, qty, price),
    };

    // Persist to shadow_executions
    try {
      await pool.query(
        `INSERT INTO shadow_executions (intent_id, would_send, simulated_result, reasoning, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [intent.id, result.wouldSend, JSON.stringify(result.simulatedResult), result.reasoning],
      );
    } catch (err: any) {
      console.error("[DryRunExecutor] Persist failed:", err?.message);
    }

    return result;
  }

  private buildReasoning(intent: CoreIntentRecord, qty: number, price: number): string {
    const parts: string[] = [];
    parts.push(`${intent.source} ${intent.side} ${intent.symbolInternal}`);
    parts.push(`Type: ${intent.orderType}`);
    parts.push(`Qty: ${qty}`);
    if (price > 0) parts.push(`Price: ${price}`);
    if (intent.notionalUsdt) parts.push(`Notional: ${intent.notionalUsdt} USDT`);
    if (intent.leverage) parts.push(`Leverage: ${intent.leverage}x`);
    parts.push(`Venue: ${intent.venue}`);
    if (!qty || qty <= 0) parts.push("WOULD_NOT_SEND: qty is 0 or negative");
    return parts.join(" | ");
  }
}
