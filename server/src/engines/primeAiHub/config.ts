/**
 * Bitrium Prime AI Hub — Configuration
 *
 * Environment-based config with sensible defaults.
 * All thresholds, clamps, and limits are code-enforced (NOT AI-dependent).
 *
 * Cycle: 60s (longer than FLOW/AGG due to LLM latency)
 * Max coins: 8 per cycle
 * LLM timeout: 120s
 * Temperature: 0.05 (near-deterministic)
 *
 * TP/SL in price % (at 10x leverage: $100 margin):
 *   TP: 0.3-2.0% price = 3-20% margin = $3-$20 profit
 *   SL: 0.2-0.8% price = 2-8% margin = max $8 loss
 */

import type { PrimeAiConfig } from "./types.ts";

export function loadPrimeAiConfig(): PrimeAiConfig {
  return {
    enabled: process.env.PRIME_AI_HUB_ENABLED === "true",
    intervalMs: Number(process.env.PRIME_AI_INTERVAL_MS) || 60_000,
    maxCoins: Number(process.env.PRIME_AI_MAX_COINS) || 8,
    timeoutMs: Number(process.env.PRIME_AI_TIMEOUT_MS) || 120_000,
    temperature: Number(process.env.PRIME_AI_TEMPERATURE) || 0.05,
    maxTokens: Number(process.env.PRIME_AI_MAX_TOKENS) || 8000,
    model: process.env.PRIME_AI_MODEL || "claude-sonnet-4-6",
    dryRun: process.env.PRIME_AI_DRY_RUN === "true",
    apiKey: process.env.CLAUDE_API_KEY || "",

    thresholds: {
      confirmed: { score: 78, edge: 0.20 },
      probe: { score: 68, edge: 0.12 },
      watchlist: { score: 58 },
    },

    limits: {
      maxConfirmedPerDay: 2,
      maxProbePerDay: 3,
      cooldownMinutes: 90,
      revengeBlockMinutes: 120,
      duplicateFilterMinutes: 5,
    },

    clamps: {
      sl: [0.2, 0.8],
      tp: [0.3, 2.0],
    },

    gates: {
      dataHealth: 0.85,
      fillProb: 0.22,
      realizedEdge: 0.08,
      biasThreshold: 0.22,
    },
  };
}

// ── Block Weights (MUST match system prompt) ──
export const BLOCK_WEIGHTS = {
  MQ: 0.26,
  DQ: 0.24,
  EQ: 0.22,
  EdgeQ: 0.28,
} as const;

// ── Entry Zone Weights (code-only, NOT AI) ──
export const ENTRY_ZONE_WEIGHTS = {
  vwap: 0.35,
  pullback: 0.20,
  acceptance: 0.20,
  liqReclaim: 0.15,
  ema: 0.10,
} as const;

export const ENTRY_ZONE_ATR = {
  longBias: { below: 0.15, above: 0.05 },
  shortBias: { below: 0.05, above: 0.15 },
} as const;

// ── Position Sizing Tiers (code-only, NOT AI) ──
export const SIZE_TIERS = [
  { min: 90, modifier: 1.00, tier: "FULL" },
  { min: 78, modifier: 0.85, tier: "HIGH" },
  { min: 68, modifier: 0.60, tier: "MODERATE" },
  { min: 58, modifier: 0.35, tier: "LOW" },
] as const;

export const SIZE_MODIFIERS = {
  stressHigh: 0.50,
  weekend: 0.70,
  slipHigh: 0,
  fakeBreakHigh: 0,
} as const;

// ── Regime Multipliers ──
export const REGIME_MULTIPLIERS: Record<string, number> = {
  TREND: 1.00,
  RANGE: 0.92,
  BREAKOUT_SETUP: 0.96,
  FAKE_BREAK_RISK: 0.80,
  HIGH_STRESS: 0.75,
};

// ── Session Multipliers ──
export const SESSION_MULTIPLIERS: Record<string, number> = {
  NY: 1.00,
  LONDON: 0.98,
  ASIAN: 0.90,
  WEEKEND: 0.80,
};

// ── SL/TP Clamp Config (price % — 0.2-0.8% SL, 0.3-2.0% TP) ──
export const SL_CLAMP: [number, number] = [0.2, 0.8];
export const TP_CLAMP: [number, number] = [0.3, 2.0];

// ── Score Formula Tolerance ──
export const SCORE_TOLERANCE = 5; // ±5pt before override

// ── Redis Key Prefixes ──
export const REDIS_KEYS = {
  snapshot: "bitrium:prime-ai-hub:snapshot",
  snapshotTtl: 300,
  dailyConfirmed: (date: string) => `bitrium:prime-ai:daily:${date}:confirmed`,
  dailyProbe: (date: string) => `bitrium:prime-ai:daily:${date}:probe`,
  cooldown: (symbol: string) => `bitrium:prime-ai:cooldown:${symbol}`,
  revenge: (symbol: string) => `bitrium:prime-ai:revenge:${symbol}`,
  dedup: (symbol: string, side: string, tf: string) =>
    `bitrium:prime-ai:dedup:${symbol}:${side}:${tf}`,
} as const;

// ── Degradation Penalties ──
export const DEGRADATION = {
  missingOrderbook: { eqMax: 60, penalty: 10 },
  missingFunding: { penalty: 8 },
  missingEdge: { edgeQMax: 30 },
  missingHtf: { penalty: 10 },
  staleFeedPenaltyPerMinute: 0.5,
} as const;

// ── Leverage (for margin % conversion) ──
export const LEVERAGE = 10;

// ── Logging Prefix ──
export const LOG_PREFIX = "[PrimeAI]";
