/**
 * Signal Cache — Pre-computed trading signals per symbol, stored in Redis.
 *
 * Written by featureCache.ts (alongside feature writes, every 60s).
 * Read by botDecisionWorker.ts — eliminates redundant signal computation
 * across thousands of bots trading the same symbol.
 *
 * Batch savings:
 *   Old: N bots × O(1) signal compute per job
 *   New: 1 compute at feature-write time → N workers read cached result
 *   For 1000 bots on BTCUSDT: ~1000× fewer signal computations per cycle
 */
import { redis } from "../../db/redis.ts";
import type { BotFeatureSnapshot } from "./featureCache.ts";
import type { TraderDecision } from "./types.ts";

const SIGNAL_KEY_PREFIX = "bot:signal:";
const SIGNAL_TTL_SEC = 120; // same TTL as features

export interface SymbolSignal {
  symbol: string;
  scorePct: number;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  decision: TraderDecision;
  plan: {
    entryLow: number | null;
    entryHigh: number | null;
    sl1: number | null;
    sl2: number | null;
    tp1: number | null;
    tp2: number | null;
  };
  computedAt: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number, d = 4) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

/** Compute signal from feature snapshot (pure function, exported for reuse). */
export function computeSignal(f: BotFeatureSnapshot): SymbolSignal {
  const momentum = clamp(50 + f.change24hPct * 2.2, 0, 100);
  const liquidity = f.depthUsd
    ? clamp(Math.log10(Math.max(1, f.depthUsd)) * 18, 0, 100)
    : 35;
  const spreadScore = clamp(100 - Math.max(0, f.spreadBps ?? 25) * 2, 0, 100);
  const imbalanceBoost = clamp((f.imbalance ?? 0) * 20, -12, 12);
  const scorePct = clamp(
    momentum * 0.42 + liquidity * 0.28 + spreadScore * 0.3 + imbalanceBoost,
    0,
    100,
  );

  const biasSignal = f.change24hPct * 0.6 + (f.imbalance ?? 0) * 40;
  const bias: SymbolSignal["bias"] = biasSignal > 0.8 ? "LONG" : biasSignal < -0.8 ? "SHORT" : "NEUTRAL";

  const decision: TraderDecision = scorePct >= 68 ? "TRADE" : scorePct >= 48 ? "WATCH" : "NO_TRADE";

  // Build trade plan (shared across all bots for this symbol)
  const price = f.price;
  const rangePct = clamp(0.12 + ((100 - scorePct) / 100) * 0.35, 0.12, 0.48) / 100;
  const stopPct = clamp(0.2 + ((100 - scorePct) / 100) * 0.28, 0.2, 0.55) / 100;
  const takePct = clamp(0.35 + (scorePct / 100) * 0.6, 0.35, 0.95) / 100;

  let plan: SymbolSignal["plan"] = { entryLow: null, entryHigh: null, sl1: null, sl2: null, tp1: null, tp2: null };
  if (bias === "LONG") {
    plan = {
      entryLow:  round(price * (1 - rangePct)),
      entryHigh: round(price * (1 + rangePct * 0.35)),
      sl1:       round(price * (1 - stopPct)),
      sl2:       round(price * (1 - stopPct * 1.4)),
      tp1:       round(price * (1 + takePct)),
      tp2:       round(price * (1 + takePct * 1.45)),
    };
  } else if (bias === "SHORT") {
    plan = {
      entryLow:  round(price * (1 - rangePct * 0.35)),
      entryHigh: round(price * (1 + rangePct)),
      sl1:       round(price * (1 + stopPct)),
      sl2:       round(price * (1 + stopPct * 1.4)),
      tp1:       round(price * (1 - takePct)),
      tp2:       round(price * (1 - takePct * 1.45)),
    };
  }

  return { symbol: f.symbol, scorePct, bias, decision, plan, computedAt: Date.now() };
}

/**
 * Write pre-computed signals to Redis (called by featureCache after feature write).
 * Uses pipeline for batch efficiency.
 */
export async function writeSignalCache(features: BotFeatureSnapshot[]): Promise<void> {
  if (!features.length) return;
  const pipeline = redis.pipeline();
  for (const f of features) {
    const sig = computeSignal(f);
    pipeline.set(SIGNAL_KEY_PREFIX + f.symbol, JSON.stringify(sig), "EX", SIGNAL_TTL_SEC);
  }
  await pipeline.exec();
}

/** Read cached signal for a single symbol. Returns null if not found or stale. */
export async function readSignal(symbol: string): Promise<SymbolSignal | null> {
  const raw = await redis.get(SIGNAL_KEY_PREFIX + symbol);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SymbolSignal;
  } catch {
    return null;
  }
}
