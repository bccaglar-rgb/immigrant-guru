import { randomUUID } from "node:crypto";
import type { TradeIdeaStore } from "../../services/tradeIdeaStore.ts";
import type { TradeIdeaRecord } from "../../services/tradeIdeaTypes.ts";
import type { AiEngineConfig, ValidatedResult } from "./types.ts";
import { redis } from "../../db/redis.ts";

const PREFIX = "[AIEngineV2:Persistence]";

// Mode-specific validity bars: AGG fast, FLOW fast, BAL normal, CG patient
const MODE_VALIDITY: Record<string, Record<string, number>> = {
  AGGRESSIVE:    { SCALP: 6,  INTRADAY: 4,  SWING: 3 },
  FLOW:          { SCALP: 8,  INTRADAY: 5,  SWING: 4 },
  BALANCED:      { SCALP: 12, INTRADAY: 8,  SWING: 6 },
  CAPITAL_GUARD: { SCALP: 16, INTRADAY: 10, SWING: 8 },
};
const VALID_UNTIL_BARS: Record<string, number> = {
  SCALP: 12,
  INTRADAY: 8,
  SWING: 6,
};

// Approximate bar duration in ms for valid_until_utc calculation
const BAR_DURATION_MS: Record<string, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};

/**
 * Persists validated results to trade_ideas table.
 * Reuses existing TradeIdeaStore — no new DB operations.
 */
export async function persistResults(
  results: ValidatedResult[],
  store: TradeIdeaStore,
  config: AiEngineConfig,
): Promise<number> {
  let persisted = 0;

  // ── V12: Max open ideas cap: reduced to prevent flooding ──
  // DATA: ai-qwen2 had 965 ideas/7d, ai-chatgpt 668/7d — too much noise.
  // Reduce from 15→8 per AI user to force only highest conviction ideas.
  const MAX_OPEN_IDEAS = 8;
  let openCount = 0;
  try {
    openCount = await store.countOpenIdeas(config.userId);
  } catch { /* best-effort, proceed with 0 */ }

  if (openCount >= MAX_OPEN_IDEAS) {
    console.log(`${PREFIX} Skip persist: already ${openCount} open ideas (max ${MAX_OPEN_IDEAS})`);
    return 0;
  }
  const remainingSlots = MAX_OPEN_IDEAS - openCount;

  for (const r of results) {
    // Only persist TRADE decisions — WATCH is not high enough conviction
    if (r.finalDecision !== "TRADE") continue;

    if (persisted >= remainingSlots) {
      console.log(`${PREFIX} Open ideas cap reached (${MAX_OPEN_IDEAS}), stopping persist`);
      break;
    }

    const c = r.candidate;

    // -- V12: Minimum score gate — raised significantly --
    // DATA: Ideas with score <40 had catastrophic win rates.
    // Validator TRADE threshold is now blendedScore >= 48, but add safety floor at 40.
    const MIN_PERSIST_SCORE = 40;
    if (r.finalScore < MIN_PERSIST_SCORE) {
      console.log(`${PREFIX} Skip ${c.symbol} ${c.mode}: score ${r.finalScore.toFixed(1)} < min ${MIN_PERSIST_SCORE}`);
      continue;
    }

    try {
      // Check for existing open idea (same user + symbol + mode)
      const existing = await store.findOpenIdea(config.userId, c.symbol, c.mode);
      if (existing) {
        continue; // skip duplicate
      }

      // Get current price from Redis for IDEA_CREATED event
      const currentPrice = await getCurrentPrice(c.symbol, c.entryMid);

      const now = new Date().toISOString();
      const modeV = MODE_VALIDITY[c.mode] ?? VALID_UNTIL_BARS;
      const validUntilBars = (typeof modeV === 'object' ? modeV[c.horizon] : modeV) ?? 12;
      const barMs = BAR_DURATION_MS[c.timeframe] ?? 900_000;
      const validUntilUtc = new Date(Date.now() + validUntilBars * barMs).toISOString();

      // Enrich market_state with Axiom analysis if present
      const marketState = extractMarketState(c.quantSnapshot);
      if (r.axiomAnalysis) {
        (marketState as Record<string, unknown>).axiom_regime = r.axiomAnalysis.regime;
        (marketState as Record<string, unknown>).axiom_thesis = r.axiomAnalysis.primaryThesis;
        (marketState as Record<string, unknown>).axiom_entry_type = r.axiomAnalysis.entryType;
        (marketState as Record<string, unknown>).axiom_invalidation = r.axiomAnalysis.invalidation;
        (marketState as Record<string, unknown>).axiom_bullish_score = r.axiomAnalysis.bullishScore;
        (marketState as Record<string, unknown>).axiom_bearish_score = r.axiomAnalysis.bearishScore;
        (marketState as Record<string, unknown>).axiom_rr = r.axiomAnalysis.rrEstimate;
      }

      // ── Fallback TP/SL: if AI module returns empty, compute from entry price ──
      // V2: SL/TP ratios aligned with MODE_MIN_SL_TP_RATIO for consistent geometry
      // SL wider than TP → higher base P(TP first) under random walk → AI edge pushes above 60%
      const FALLBACK_TPSL: Record<string, { tpMargin: number; slMargin: number }> = {
        FLOW:          { tpMargin: 0.005, slMargin: 0.0075 },  // TP=$5, SL=$7.5, ratio=1.5 → P(TP)=60%
        AGGRESSIVE:    { tpMargin: 0.010, slMargin: 0.0055 },  // TP=$10, SL=$5.5, each win > each loss
        BALANCED:      { tpMargin: 0.006, slMargin: 0.004 },   // TP=$6, SL=$4, each win > each loss
        CAPITAL_GUARD: { tpMargin: 0.005, slMargin: 0.0035 },  // TP=$5, SL=$3.5, tight SL for capital protection
      };
      let finalSlLevels = Array.isArray(r.slLevels) ? r.slLevels.filter((v: number) => Number.isFinite(v) && v > 0) : [];
      let finalTpLevels = Array.isArray(r.tpLevels) ? r.tpLevels.filter((v: number) => Number.isFinite(v) && v > 0) : [];
      if ((!finalSlLevels.length || !finalTpLevels.length) && r.entryLow > 0 && r.entryHigh > 0) {
        const mid = (r.entryLow + r.entryHigh) / 2;
        const fb = FALLBACK_TPSL[c.mode] ?? FALLBACK_TPSL.BALANCED;
        if (!finalTpLevels.length) {
          const tpVal = r.finalDirection === "LONG" ? mid * (1 + fb.tpMargin) : mid * (1 - fb.tpMargin);
          finalTpLevels = [Number(tpVal.toFixed(c.pricePrecision))];
        }
        if (!finalSlLevels.length) {
          const slVal = r.finalDirection === "LONG" ? mid * (1 - fb.slMargin) : mid * (1 + fb.slMargin);
          finalSlLevels = [Number(slVal.toFixed(c.pricePrecision))];
        }
        console.log("[Persistence] Fallback TP/SL for " + c.symbol + " " + c.mode + ": TP=" + finalTpLevels[0] + ", SL=" + finalSlLevels[0]);
      }

      // ── TP/SL geometry enforcement per mode ──
      // Ensure SL distance meets minimum ratio vs TP for win rate targets
      // P(TP first) = SL_dist / (TP_dist + SL_dist)
      // V2: AGGRESSIVE raised 0.8→1.5, BALANCED 1.0→1.2 — old values gave 44%/50% base win rate
      // With ratio 1.5: P(TP) = 60% base + AI directional edge → 62-65% actual
      const MODE_MIN_SL_TP_RATIO: Record<string, number> = {
        FLOW:          1.5,   // P(TP) >= 60%
        AGGRESSIVE:    0.55,  // SL = 55% of TP → TP>SL geometry, each win > each loss after fees
        BALANCED:      0.65,  // SL = 65% of TP → moderate asymmetry, TP > SL for +EV
        CAPITAL_GUARD: 0.70,  // SL = 70% of TP → tight SL for capital protection, TP > SL
      };
      if (finalTpLevels.length && finalSlLevels.length && r.entryLow > 0 && r.entryHigh > 0) {
        const entryMid = (r.entryLow + r.entryHigh) / 2;
        const tpDist = Math.abs(finalTpLevels[0] - entryMid);
        const slDist = Math.abs(finalSlLevels[0] - entryMid);
        const minRatio = MODE_MIN_SL_TP_RATIO[c.mode] ?? 1.0;
        if (tpDist > 0 && slDist / tpDist < minRatio) {
          const newSlDist = tpDist * minRatio;
          const newSl = r.finalDirection === "LONG"
            ? entryMid - newSlDist
            : entryMid + newSlDist;
          console.log("[Persistence] Geometry fix " + c.symbol + " " + c.mode + ": SL/TP=" + (slDist/tpDist).toFixed(2) + " -> " + minRatio.toFixed(1) + ", SL " + finalSlLevels[0] + " -> " + Number(newSl.toFixed(c.pricePrecision)));
          finalSlLevels = [Number(newSl.toFixed(c.pricePrecision))];
        }
      }

      // ── FINAL SAFETY CLAMP: mode-aware TP/SL margin bounds ($100 @ 10x) ──
      // V3: AGGRESSIVE uses TP>SL geometry (tight SL, bigger TP) for profitable asymmetry
      // Other modes keep SL>=TP geometry for higher base win rate
      const LEVERAGE = 10;
      const TP_MARGIN_BOUNDS_MAP: Record<string, [number, number]> = {
        FLOW:          [3, 15],   // min $3, max $15
        AGGRESSIVE:    [8, 15],   // min $8, max $15 — bigger TPs for profit
        BALANCED:      [5, 8],    // min $5, max $8 — moderate TPs for reliable profits
        CAPITAL_GUARD: [4, 7],    // min $4, max $7 — conservative but profitable TPs
      };
      const SL_MARGIN_BOUNDS_MAP: Record<string, [number, number]> = {
        FLOW:          [2, 12],   // min $2, max $12
        AGGRESSIVE:    [3, 5],    // min $3, max $5 — tight SL, controlled losses
        BALANCED:      [3, 5],    // min $3, max $5 — controlled losses, TP must exceed SL
        CAPITAL_GUARD: [3, 4],    // min $3, max $4 — TIGHT SL = capital protection
      };
      const TP_MARGIN_BOUNDS = TP_MARGIN_BOUNDS_MAP[c.mode] ?? [3, 15];
      const SL_MARGIN_BOUNDS = SL_MARGIN_BOUNDS_MAP[c.mode] ?? [2, 12];
      if (finalTpLevels.length && finalSlLevels.length && r.entryLow > 0 && r.entryHigh > 0) {
        const entryMid = (r.entryLow + r.entryHigh) / 2;
        // Clamp TP
        const tpPricePct = Math.abs(finalTpLevels[0] - entryMid) / entryMid * 100;
        const tpMarginPct = tpPricePct * LEVERAGE;
        if (tpMarginPct < TP_MARGIN_BOUNDS[0] || tpMarginPct > TP_MARGIN_BOUNDS[1]) {
          const clampedTpM = Math.min(Math.max(tpMarginPct, TP_MARGIN_BOUNDS[0]), TP_MARGIN_BOUNDS[1]);
          const clampedTpPP = clampedTpM / 100 / LEVERAGE;
          const tpVal = r.finalDirection === "LONG"
            ? entryMid * (1 + clampedTpPP)
            : entryMid * (1 - clampedTpPP);
          finalTpLevels = [Number(tpVal.toFixed(c.pricePrecision))];
        }
        // Clamp SL
        const slPricePct = Math.abs(finalSlLevels[0] - entryMid) / entryMid * 100;
        const slMarginPct = slPricePct * LEVERAGE;
        if (slMarginPct < SL_MARGIN_BOUNDS[0] || slMarginPct > SL_MARGIN_BOUNDS[1]) {
          const clampedSlM = Math.min(Math.max(slMarginPct, SL_MARGIN_BOUNDS[0]), SL_MARGIN_BOUNDS[1]);
          const clampedSlPP = clampedSlM / 100 / LEVERAGE;
          const slVal = r.finalDirection === "LONG"
            ? entryMid * (1 - clampedSlPP)
            : entryMid * (1 + clampedSlPP);
          finalSlLevels = [Number(slVal.toFixed(c.pricePrecision))];
        }
      }

      // Final TP/SL validation: skip if still empty after fallback + geometry fix
      if (!finalTpLevels.length || !finalSlLevels.length) {
        console.log(`${PREFIX} Skip ${c.symbol} ${c.mode}: empty TP/SL even after fallback`);
        continue;
      }

      const idea: TradeIdeaRecord = {
        id: randomUUID(),
        user_id: config.userId,
        symbol: c.symbol,
        direction: r.finalDirection,
        confidence_pct: r.finalScore,
        scoring_mode: c.mode,
        approved_modes: [c.mode],
        mode_scores: c.modeScores,
        entry_low: r.entryLow,
        entry_high: r.entryHigh,
        sl_levels: finalSlLevels,
        tp_levels: finalTpLevels,
        // Always start as PENDING — TradeIdeaTracker activates when price enters entry zone
        status: "PENDING",
        result: "NONE",
        hit_level_type: null,
        hit_level_index: null,
        hit_level_price: null,
        minutes_to_entry: null,
        minutes_to_exit: null,
        minutes_total: null,
        horizon: c.horizon as TradeIdeaRecord["horizon"],
        timeframe: c.timeframe as TradeIdeaRecord["timeframe"],
        setup: r.axiomAnalysis ? `Axiom: ${r.axiomAnalysis.entryType || c.setup}` : `AIv2: ${c.setup}`,
        trade_validity: "VALID",
        entry_window: c.entryWindow as TradeIdeaRecord["entry_window"],
        slippage_risk: c.slippageRisk as TradeIdeaRecord["slippage_risk"],
        triggers_to_activate: r.axiomAnalysis?.entryCondition ? [r.axiomAnalysis.entryCondition] : [],
        invalidation: r.axiomAnalysis?.invalidation ?? "",
        timestamp_utc: now,
        valid_until_bars: validUntilBars,
        valid_until_utc: validUntilUtc,
        market_state: marketState,
        flow_analysis: r.axiomAnalysis?.notes ?? r.aiResponse.riskFlags,
        trade_intent: [],
        raw_text: r.axiomAnalysis?.primaryThesis ?? r.aiResponse.comment,
        incomplete: false,
        price_precision: c.pricePrecision,
        created_at: now,
        activated_at: null, // TradeIdeaTracker sets this on ENTRY_TOUCHED
        resolved_at: null,
      };

      await store.createIdea(idea, currentPrice);

      // Append quant snapshot event for optimizer analytics (same pattern as systemScannerService)
      if (c.quantSnapshot) {
        await store.appendEvent({
          idea_id: idea.id,
          event_type: "QUANT_SNAPSHOT" as any,
          ts: now,
          price: null,
          meta: { ...c.quantSnapshot, aiEngineV2: true, aiVerdict: r.aiResponse.verdict, aiConfidence: r.aiResponse.confidence },
        });
      }

      persisted++;
      console.log(`${PREFIX} Created ${r.finalDecision} idea: ${c.symbol} ${r.finalDirection} score=${r.finalScore.toFixed(1)} mode=${c.mode}`);
    } catch (err) {
      console.error(`${PREFIX} Failed to persist ${c.symbol}:`, (err as Error).message);
    }
  }

  return persisted;
}

/**
 * Extract market_state from quantSnapshot for Optimizer P4 compatibility.
 * The onResolve callback in index.ts reads market_state.trend to derive regime.
 * Without this, all ai-engine-v2 ideas default to "RANGE" regime.
 */
function extractMarketState(snapshot?: Record<string, unknown>): {
  trend: string; htfBias: string; volatility: string; execution: string;
} {
  const empty = { trend: "", htfBias: "", volatility: "", execution: "" };
  if (!snapshot) return empty;

  // quantSnapshot structure: { st: { td, rg, ema, vw }, vo: { cp, fbp }, ex: { en, sl }, ... }
  const st = snapshot.st as Record<string, unknown> | undefined;
  const vo = snapshot.vo as Record<string, unknown> | undefined;
  const ex = snapshot.ex as Record<string, unknown> | undefined;

  if (!st) return empty;

  // Derive trend string from quant fields
  const trendDir = Number(st.td ?? 0);
  const regime = Number(st.rg ?? 0);
  const trendStr = regime === 2 ? "BREAKOUT"
    : regime === 0 ? "RANGE"
    : trendDir > 0 ? "TREND_BULL"
    : trendDir < 0 ? "TREND_BEAR"
    : "NEUTRAL";

  const emaAlignment = Number(st.ema ?? 0);
  const htfBias = emaAlignment > 0 ? "BULLISH" : emaAlignment < 0 ? "BEARISH" : "NEUTRAL";

  const compression = Number(vo?.cp ?? 0);
  const volatility = compression === 1 ? "LOW" : compression === 0 ? "NORMAL" : "HIGH";

  const entryOpen = Number(ex?.en ?? 0) === 1;
  const execution = entryOpen ? "GOOD" : "POOR";

  return { trend: trendStr, htfBias, volatility, execution };
}

async function getCurrentPrice(symbol: string, fallback: number): Promise<number> {
  try {
    const priceStr = await redis.hget(`hub:live:${symbol}`, "lastTradePrice");
    if (priceStr) {
      const price = Number(priceStr);
      if (Number.isFinite(price) && price > 0) return price;
    }
  } catch { /* best-effort */ }
  return fallback;
}
