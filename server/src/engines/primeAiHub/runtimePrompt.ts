/**
 * Bitrium Prime AI Hub — Runtime Prompt Builder
 *
 * Builds the per-cycle user prompt containing:
 *   - Timestamp + session info
 *   - Number of coins
 *   - Structured JSON payload per coin
 *
 * The payload is the PrimeAiCoinInput structure built by inputBuilder.ts.
 */

import type { PrimeAiCoinInput } from "./types.ts";

function getSessionName(): string {
  const hour = new Date().getUTCHours();
  const day = new Date().getUTCDay();
  if (day === 0 || day === 6) return "Weekend";
  if (hour >= 0 && hour < 8) return "Asian";
  if (hour >= 8 && hour < 14) return "London";
  return "New York";
}

/**
 * Build the runtime (user) prompt for a cycle.
 */
export function buildRuntimePrompt(coins: PrimeAiCoinInput[]): string {
  const now = new Date().toISOString();
  const session = getSessionName();

  const parts: string[] = [
    `Timestamp: ${now}`,
    `Session: ${session}`,
    `Evaluate ${coins.length} coin(s). Return one evaluation per coin in the "evaluations" array.`,
    "",
  ];

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    parts.push(`--- Coin ${i + 1}/${coins.length}: ${coin.symbol} ---`);
    parts.push(JSON.stringify(coin, null, 2));
    parts.push("");
  }

  parts.push("Respond with valid JSON only.");

  return parts.join("\n");
}
