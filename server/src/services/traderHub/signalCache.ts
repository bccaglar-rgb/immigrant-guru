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

/**
 * Compute signal from feature snapshot (pure function, exported for reuse).
 *
 * V2 signal engine — uses ALL available features:
 *   momentum (24h change), liquidity (depth), spread, imbalance,
 *   RSI14, ATR volatility, S/R proximity, funding rate, composite/tier scores.
 *
 * Key improvements over V1:
 *   - RSI overbought/oversold filter prevents chasing extended moves
 *   - ATR-based SL/TP instead of fixed percentages → volatility-adjusted levels
 *   - Funding rate alignment bonus → trade with the funding wind
 *   - S/R proximity boost → enter near key levels
 *   - Higher TRADE threshold (75 vs 68) → fewer but better trades
 *   - Multi-factor bias with RSI + funding + imbalance + momentum
 *   - Tier/composite score integration from CoinUniverse engine
 */
export function computeSignal(f: BotFeatureSnapshot): SymbolSignal {
  // ── 1. Core momentum (from 24h change, capped at ±10%) ─────────────────
  const momentum = clamp(50 + f.change24hPct * 2.5, 0, 100);

  // ── 2. Liquidity quality (orderbook depth) ─────────────────────────────
  const liquidity = f.depthUsd
    ? clamp(Math.log10(Math.max(1, f.depthUsd)) * 18, 0, 100)
    : 30; // lower default if no depth data

  // ── 3. Spread quality (tighter = better) ───────────────────────────────
  const spreadScore = clamp(100 - Math.max(0, f.spreadBps ?? 30) * 2.5, 0, 100);

  // ── 4. Orderbook imbalance boost ───────────────────────────────────────
  const imbalanceBoost = clamp((f.imbalance ?? 0) * 15, -10, 10);

  // ── 5. RSI quality score (mid-range = best, extremes = penalty) ────────
  const rsi = f.rsi14 ?? 50;
  // Ideal RSI zone: 35-65 for entries. Extremes signal exhaustion.
  let rsiScore: number;
  if (rsi >= 35 && rsi <= 65) {
    // Golden zone — full score
    rsiScore = 80;
  } else if (rsi >= 25 && rsi < 35) {
    // Near oversold — good for longs, penalize shorts
    rsiScore = 65;
  } else if (rsi > 65 && rsi <= 75) {
    // Near overbought — good for shorts, penalize longs
    rsiScore = 65;
  } else if (rsi < 25) {
    // Deep oversold — only strong longs survive
    rsiScore = 40;
  } else {
    // Deep overbought (> 75) — only strong shorts survive
    rsiScore = 40;
  }

  // ── 6. Funding rate alignment ──────────────────────────────────────────
  // Negative funding = shorts pay longs → bullish pressure
  // Positive funding = longs pay shorts → bearish pressure
  const funding = f.fundingRate ?? 0;
  const fundingScore = clamp(50 - funding * 8000, 20, 80); // 0.01% funding → ±80 offset

  // ── 7. S/R proximity (closer to S/R = better entry) ────────────────────
  // srDistPct: distance to nearest support/resistance as % of price
  const srDist = f.srDistPct ?? 3.0; // default 3% if unavailable
  const srScore = clamp(100 - srDist * 25, 0, 100); // 0% dist = 100, 4% dist = 0

  // ── 8. Tier/composite score from CoinUniverse engine ───────────────────
  // These are already computed quality scores (0-100)
  const tierBoost = clamp(
    (f.tier1Score ?? 50) * 0.4 + (f.compositeScore ?? 50) * 0.6,
    0,
    100,
  );

  // ── 9. Volume quality (higher 24h volume = more reliable signals) ──────
  const volScore = f.volume24hUsd
    ? clamp(Math.log10(Math.max(1, f.volume24hUsd)) * 12 - 10, 0, 100)
    : 30;

  // ── COMPOSITE SCORE ────────────────────────────────────────────────────
  // Weight allocation (total 1.0):
  //   momentum:   0.18  (down from 0.42 — less reliance on raw momentum)
  //   liquidity:  0.10  (down from 0.28 — still important but not dominant)
  //   spread:     0.10  (down from 0.30 — execution quality)
  //   rsi:        0.15  (NEW — trend health filter)
  //   funding:    0.08  (NEW — funding wind alignment)
  //   srProx:     0.12  (NEW — entry quality near key levels)
  //   tierScore:  0.12  (NEW — CoinUniverse quality score)
  //   volume:     0.08  (NEW — signal reliability)
  //   imbalance:  additive (±10)
  const scorePct = clamp(
    momentum   * 0.18 +
    liquidity  * 0.10 +
    spreadScore * 0.10 +
    rsiScore   * 0.15 +
    fundingScore * 0.08 +
    srScore    * 0.12 +
    tierBoost  * 0.12 +
    volScore   * 0.08 +
    imbalanceBoost,
    0,
    100,
  );

  // ── MULTI-FACTOR BIAS ─────────────────────────────────────────────────
  // Combine multiple directional signals instead of just change + imbalance
  const momentumBias = f.change24hPct * 0.4;                     // positive = bullish
  const imbalanceBias = (f.imbalance ?? 0) * 25;                 // positive = more bids = bullish
  const fundingBias = -(funding * 3000);                         // negative funding = bullish pressure
  const rsiBias = rsi < 40 ? (40 - rsi) * 0.05 : rsi > 60 ? (60 - rsi) * 0.05 : 0; // oversold = bullish

  const biasSignal = momentumBias + imbalanceBias + fundingBias + rsiBias;
  const bias: SymbolSignal["bias"] = biasSignal > 1.0 ? "LONG" : biasSignal < -1.0 ? "SHORT" : "NEUTRAL";

  // ── RSI VETO — prevent chasing exhausted moves ────────────────────────
  let rsiVeto = false;
  if (bias === "LONG" && rsi > 78) rsiVeto = true;   // don't buy overbought
  if (bias === "SHORT" && rsi < 22) rsiVeto = true;   // don't sell oversold

  // ── DECISION ──────────────────────────────────────────────────────────
  // V2: Higher threshold (75 vs 68) for TRADE, WATCH at 52 (vs 48)
  let decision: TraderDecision;
  if (rsiVeto) {
    decision = "WATCH"; // RSI extreme → wait regardless of score
  } else {
    decision = scorePct >= 75 ? "TRADE" : scorePct >= 52 ? "WATCH" : "NO_TRADE";
  }

  // ── ATR-BASED SL/TP ──────────────────────────────────────────────────
  // Use ATR percentage for volatility-adjusted levels instead of fixed %
  const price = f.price;
  const atrPct = f.atrPct ?? 1.5; // default 1.5% ATR if unavailable

  // Entry range: 0.3-0.8× ATR (tighter for high-score, wider for low-score)
  const entryMultiplier = clamp(0.3 + ((100 - scorePct) / 100) * 0.5, 0.3, 0.8);
  const rangePct = (atrPct * entryMultiplier) / 100;

  // SL: 1.0-1.8× ATR (wider for low-score setups → more room to breathe)
  const slMultiplier = clamp(1.0 + ((100 - scorePct) / 100) * 0.8, 1.0, 1.8);
  const stopPct = (atrPct * slMultiplier) / 100;

  // TP: 1.5-3.0× ATR (higher for high-score → let winners run)
  const tpMultiplier = clamp(1.5 + (scorePct / 100) * 1.5, 1.5, 3.0);
  const takePct = (atrPct * tpMultiplier) / 100;

  // Ensure minimum RR ratio of 1.8:1
  const effectiveTakePct = Math.max(takePct, stopPct * 1.8);

  let plan: SymbolSignal["plan"] = { entryLow: null, entryHigh: null, sl1: null, sl2: null, tp1: null, tp2: null };
  if (bias === "LONG") {
    plan = {
      entryLow:  round(price * (1 - rangePct)),
      entryHigh: round(price * (1 + rangePct * 0.35)),
      sl1:       round(price * (1 - stopPct)),
      sl2:       round(price * (1 - stopPct * 1.4)),
      tp1:       round(price * (1 + effectiveTakePct)),
      tp2:       round(price * (1 + effectiveTakePct * 1.5)),
    };
  } else if (bias === "SHORT") {
    plan = {
      entryLow:  round(price * (1 - rangePct * 0.35)),
      entryHigh: round(price * (1 + rangePct)),
      sl1:       round(price * (1 + stopPct)),
      sl2:       round(price * (1 + stopPct * 1.4)),
      tp1:       round(price * (1 - effectiveTakePct)),
      tp2:       round(price * (1 - effectiveTakePct * 1.5)),
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

/** Read cached signals for multiple symbols at once (batch, uses MGET). */
export async function readSignalBatch(symbols: string[]): Promise<Map<string, SymbolSignal>> {
  const map = new Map<string, SymbolSignal>();
  if (!symbols.length) return map;
  const keys = symbols.map((s) => SIGNAL_KEY_PREFIX + s);
  const values = await redis.mget(...keys);
  for (let i = 0; i < symbols.length; i++) {
    const raw = values[i];
    if (raw) {
      try {
        map.set(symbols[i], JSON.parse(raw) as SymbolSignal);
      } catch { /* malformed — skip */ }
    }
  }
  return map;
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
