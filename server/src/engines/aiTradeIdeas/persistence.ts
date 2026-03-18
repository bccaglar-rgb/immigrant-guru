import { randomUUID } from "node:crypto";
import type { TradeIdeaStore } from "../../services/tradeIdeaStore.ts";
import type { TradeIdeaRecord } from "../../services/tradeIdeaTypes.ts";
import type { AiEngineConfig, ValidatedResult } from "./types.ts";
import { redis } from "../../db/redis.ts";

const PREFIX = "[AIEngineV2:Persistence]";

// Validity bars per horizon
const VALID_UNTIL_BARS: Record<string, number> = {
  SCALP: 12,
  INTRADAY: 16,
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

  for (const r of results) {
    // Only persist TRADE and WATCH
    if (r.finalDecision === "NO_TRADE") continue;

    const c = r.candidate;

    try {
      // Check for existing open idea (same user + symbol)
      const existing = await store.findOpenIdea(config.userId, c.symbol);
      if (existing) {
        continue; // skip duplicate
      }

      // Get current price from Redis for IDEA_CREATED event
      const currentPrice = await getCurrentPrice(c.symbol, c.entryMid);

      const now = new Date().toISOString();
      const validUntilBars = VALID_UNTIL_BARS[c.horizon] ?? 12;
      const barMs = BAR_DURATION_MS[c.timeframe] ?? 900_000;
      const validUntilUtc = new Date(Date.now() + validUntilBars * barMs).toISOString();

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
        sl_levels: r.slLevels,
        tp_levels: r.tpLevels,
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
        setup: `AIv2: ${c.setup}`,
        trade_validity: "VALID",
        entry_window: c.entryWindow as TradeIdeaRecord["entry_window"],
        slippage_risk: c.slippageRisk as TradeIdeaRecord["slippage_risk"],
        triggers_to_activate: [],
        invalidation: "",
        timestamp_utc: now,
        valid_until_bars: validUntilBars,
        valid_until_utc: validUntilUtc,
        market_state: extractMarketState(c.quantSnapshot),
        flow_analysis: r.aiResponse.riskFlags,
        trade_intent: [],
        raw_text: r.aiResponse.comment,
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
