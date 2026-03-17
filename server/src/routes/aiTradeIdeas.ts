import express, { type Express } from "express";
import type { AiProviderStore, AiProviderRecord } from "../services/aiProviderStore.ts";
import type { BinanceFuturesHub, BinanceFuturesUniverseRow } from "../services/binanceFuturesHub.ts";
import type { CoinUniverseEngine } from "../services/coinUniverseEngine.ts";

const maskKey = (key?: string) => {
  const raw = String(key ?? "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "****";
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
};

const toSafeProvider = (row: AiProviderRecord) => ({
  ...row,
  apiKeyMasked: maskKey(row.apiKey),
  apiKey: "",
});

const buildSystemPrompt = () =>
  [
    "You are an institutional crypto trade evaluator working on top of a quantitative trading engine.",
    "You will receive ultra-compact structured engine data with short field names.",
    "",
    "Field definitions:",
    "[meta] s=symbol, tf=timeframe, cp=current_price, h=horizon, rm=risk_mode",
    "[lvl] su=supports, re=resistances, ns=nearest_support, nr=nearest_resistance, nl=nearest_liquidity, ezl=entry_zone_low, ezh=entry_zone_high, iv=invalidation",
    "[core/trend] r=regime, td=trend_direction, ts=trend_strength, tp=trend_phase, ea=ema_alignment, vw=vwap_position, dk=distance_key_level, hr=htf_reaction",
    "[core/liquidity] obi=orderbook_imbalance, scp=stop_cluster_prob, ld=liquidity_distance, af=aggressor_flow",
    "[core/positioning] oi=oi_change, fb=funding_bias, mps=move_participation, rms=real_momentum",
    "[core/volatility] cmp=compression, fbp=fake_breakout_prob, ep=expansion_prob, news=news_risk",
    "[core/risk] sc=signal_conflict, cr=cascade_risk, trap=trap_probability",
    "[core/execution] spr=spread, dq=depth_quality, eq=entry_quality, rrp=rr_potential, id=invalidation_distance, rd=reward_distance",
    "[core/signals] tv=trade_validity, b=bias, it=intent, et=entry_timing, ma=model_agreement, fin=final_score, pw=pwin, rr=expected_rr",
    "[logic] lq=level_quality, la=liquidity_alignment, pa=positioning_alignment, xa=execution_alignment, rp=risk_penalty, fbp2=fake_break_penalty, tp2=trap_penalty, loc=location_score, cpb=continuation_prob, rpb=reversal_prob, chp=chop_prob",
    "",
    "Rules:",
    "1. Use only the fields explicitly provided.",
    "2. Missing fields mean unavailable data, not negative data.",
    "3. Do not penalize a setup only because a field is absent.",
    "4. Evaluate the setup using all available core data, levels, logic summary, and plan when available.",
    "5. Use support, resistance, entry zones, invalidation, and target zones from lvl as the primary basis for entry, stop, and target decisions.",
    "6. Do not invent arbitrary price levels disconnected from the provided structure.",
    "7. Return one final decision only: TRADE, WATCH, or NO_TRADE.",
    "8. Return one direction only: LONG, SHORT, or NONE.",
    "9. Return a score from 0 to 100.",
    "10. Return confidence from 0 to 100.",
    "11. Explain the decision in Turkish using at most 80 words.",
    "12. Return only valid JSON and no extra text.",
    "13. Decision thresholds: 78 to 100 = TRADE, 62 to 77 = WATCH, 0 to 61 = NO_TRADE.",
  ].join("\n");

const buildUserPrompt = (engineJson: string) =>
  [
    "Evaluate this crypto setup using the provided quant engine data.",
    "Your tasks:",
    "- score the setup from 0 to 100",
    "- give confidence from 0 to 100",
    "- choose one decision: TRADE, WATCH, or NO_TRADE",
    "- choose one direction: LONG, SHORT, or NONE",
    "- determine entry zone, stop levels, and target levels using the provided market levels and engine logic",
    "- explain the reason in Turkish using maximum 80 words",
    "- return only valid JSON",
    "",
    "Use this exact JSON output schema:",
    '{"score":0,"confidence":0,"decision":"TRADE","direction":"LONG","entry_zone_low":0.0,"entry_zone_high":0.0,"stop_1":0.0,"stop_2":0.0,"target_1":0.0,"target_2":0.0,"reason_80_words":"","risk_flags":[]}',
    "",
    "Data:",
    engineJson,
  ].join("\n");

const normalizeChatCompletionsEndpoint = (urlRaw: string, fallback: string): string => {
  const configured = String(urlRaw ?? "").trim();
  const base = configured || fallback;
  if (!base) return "";
  const lower = base.toLowerCase();
  if (lower.endsWith("/chat/completions") || lower.endsWith("/responses")) return base;
  if (lower.endsWith("/v1") || lower.endsWith("/compatible-mode/v1")) {
    return `${base.replace(/\/+$/, "")}/chat/completions`;
  }
  if (lower.includes("/v1/")) return base;
  return `${base.replace(/\/+$/, "")}/chat/completions`;
};

const resolveProviderEndpoint = (provider: AiProviderRecord): string => {
  if (provider.id === "CHATGPT") {
    return normalizeChatCompletionsEndpoint(
      String(provider.baseUrl ?? ""),
      "https://api.openai.com/v1/chat/completions",
    );
  }
  if (provider.id === "QWEN") {
    return normalizeChatCompletionsEndpoint(
      String(provider.baseUrl ?? ""),
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
  }
  return "";
};

const AI_SCAN_INTERVAL_MS = 60_000;
const AI_SCAN_BATCH_SIZE = 2;
const AI_SCAN_ROW_LIMIT = 80;
const AI_MIN_CONSENSUS = 60;
const AI_MODE_BUFFER: Record<string, number> = {
  AGGRESSIVE: 0,
  BALANCED: 5,
  CAPITAL_GUARD: 10,
  FLOW: 0,
};
const AI_TRADE_FILL_MIN = 0.30;
const AI_TRADE_EDGE_MIN = 0.0;

type AiScanSide = "LONG" | "SHORT" | "NO_TRADE" | "WAIT" | "UNKNOWN";
type AiModuleStatus = {
  running: boolean;
  lastRunAt: string;
  error: string;
  errorDetail?: string;
  updatedAt: string;
  scanned: number;
};

type AiProviderDebug = {
  provider: "CHATGPT" | "QWEN";
  ok: boolean;
  endpoint: string;
  model: string;
  httpCode: number | null;
  error: string;
  detail: string;
  ts: string;
};

type AiScanRow = {
  module: "CHATGPT" | "QWEN";
  symbol: string;
  tf: string;
  profile?: string;
  contract?: string;
  scorePct: number;
  reason: string;
  ok: boolean;
  decision: string;
  side: AiScanSide;
  scannedAt: string;
  setup?: string;
  bias?: string;
  edgePct?: number;
  breakProbPct?: number;
  structureFlags?: { vwapConfluence?: boolean; htfAlignment?: boolean };
  sr?: {
    resistance?: Array<{ p: number; st?: string; d_pct?: number }>;
    support?: Array<{ p: number; st?: string; d_pct?: number }>;
    range?: { high?: number; low?: number };
  };
  liquidity?: { sweep_zone?: number[]; next_liq_below?: number };
  entry?: { type?: string; zone?: number[]; stop?: number; sl?: number[]; tp?: number[]; rr?: number };
  risk?: { slippage?: string; fill_prob?: number; risk_adj_edge_r?: number };
  notes?: { one_liner?: string; risk_note?: string; what_to_watch?: string };
  triggers?: string[];
  blockers?: string[];
  activateIf?: string[];
  watchZones?: { upper_reclaim?: number; lower_break?: number };
  invalidIf?: string;
  marketComment?: string;
  marketState?: {
    regime?: string;
    trendDir?: string;
    emaAlignment?: string;
    vwapPosition?: string;
  };
  layerScores?: {
    structure?: number;
    liquidity?: number;
    positioning?: number;
    execution?: number;
  };
  edgeDetails?: {
    edgeR?: number;
    pWin?: number;
    avgWinR?: number;
    costR?: number;
    pStop?: number;
    expRR?: number;
    riskAdjEdgeR?: number;
    holdBars?: number;
  };
  executionDetails?: {
    entryWindow?: string;
    slippage?: string;
    fill?: number;
    capacity?: number;
  };
  scoringMode?: string;
  layerConsensus?: number;
  disclaimer?: string;
  adjustedScore?: number;
  qualityIndexQ?: number;
  upliftPoints?: number;
  calibratedScore?: number;
};

type SharedAiState = {
  started: boolean;
  inFlight: boolean;
  updatedAt: string;
  universeCount: number;
  cursor: Record<"CHATGPT" | "QWEN", number>;
  moduleStatus: Record<"CHATGPT" | "QWEN", AiModuleStatus>;
  scansByModule: Record<"CHATGPT" | "QWEN", AiScanRow[]>;
  lastProviderDebug: Record<"CHATGPT" | "QWEN", AiProviderDebug | null>;
};

const sharedAiState: SharedAiState = {
  started: false,
  inFlight: false,
  updatedAt: "",
  universeCount: 0,
  cursor: {
    CHATGPT: 0,
    QWEN: 0,
  },
  moduleStatus: {
    CHATGPT: { running: false, lastRunAt: "", error: "", updatedAt: "", scanned: 0 },
    QWEN: { running: false, lastRunAt: "", error: "", updatedAt: "", scanned: 0 },
  },
  scansByModule: {
    CHATGPT: [],
    QWEN: [],
  },
  lastProviderDebug: {
    CHATGPT: null,
    QWEN: null,
  },
};

let sharedAiTimer: ReturnType<typeof setInterval> | null = null;

const hasRecentAiScan = (): boolean => {
  if (!sharedAiState.updatedAt) return false;
  const ts = Date.parse(sharedAiState.updatedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= AI_SCAN_INTERVAL_MS + 15_000;
};

const openAiModelFallbacks = (current: string): string[] => {
  const chain = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o"];
  const first = String(current || "").trim();
  const ordered = first ? [first, ...chain.filter((m) => m !== first)] : chain;
  return ordered;
};

const parseJsonContent = (content: string): unknown | null => {
  const raw = String(content ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // try fenced block
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // continue
      }
    }
    // try first/last json object bounds
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toPct = (value01: number): number => Math.round(clamp(value01, 0, 1) * 100);

const mapSlippage = (raw: unknown): "LOW" | "MED" | "HIGH" => {
  const n = num(raw, 1);
  if (n <= 0) return "LOW";
  if (n >= 2) return "HIGH";
  return "MED";
};

const mapBias = (raw: unknown, fallback: "LONG" | "SHORT" = "SHORT"): "LONG" | "SHORT" => {
  const n = num(raw, fallback === "LONG" ? 1 : -1);
  return n >= 0 ? "LONG" : "SHORT";
};

const mapProfile = (mode: string): "SCALP" | "INTRADAY" => {
  const normalized = String(mode ?? "").toUpperCase();
  return normalized === "AGGRESSIVE" ? "SCALP" : "INTRADAY";
};

const mapSetup = (regime: number, compression: number): string => {
  if (regime === 0 && compression === 1) return "RANGE_FADE";
  if (regime === 2) return "BREAKOUT_PULLBACK";
  return "MOMENTUM_CONTINUATION";
};

const srLevel = (price: number, close: number, strength: "STRONG" | "MID", src: string) => ({
  p: Number(price.toFixed(8)),
  st: strength,
  d_pct: Number((((price - close) / Math.max(close, 1e-9)) * 100).toFixed(2)),
  src,
});

const symbolScoreJitter = (symbol: string): number => {
  const input = String(symbol ?? "").toUpperCase();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 9973;
  }
  return ((hash % 19) - 9) * 0.7; // deterministic [-6.3, +6.3]
};

const symbolSeed01 = (symbol: string): number => {
  const input = String(symbol ?? "").toUpperCase();
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 999;
};

const buildFallbackAiOutput = (payload: unknown, provider: string, errorCode?: string) => {
  const cv = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const symbol = String(cv.s ?? "BTCUSDT").toUpperCase();
  const tf = String(cv.tf ?? "15m");
  const mode = String(cv?.o?.mode ?? "AGGRESSIVE").toUpperCase();
  const profile = mapProfile(mode);
  const close = num(cv?.p, 0);
  const rangeHigh = num(cv?.lv?.rh, 0);
  const rangeLow = num(cv?.lv?.rl, 0);
  const pivot = num(cv?.lv?.pv, close);
  const r1 = num(cv?.lv?.r1, rangeHigh || close);
  const s1 = num(cv?.lv?.s1, rangeLow || close);
  const entryOpen = num(cv?.ex?.en, 0) === 1;
  const fillProb = clamp(num(cv?.ex?.pf, 0), 0, 1);
  const capacity = clamp(num(cv?.ex?.cpct, 0), 0, 1);
  const latencyMs = num(cv?.ex?.lat, 0);
  const edgeR = num(cv?.ed?.rae, 0);
  const edgeConf01 = clamp(num(cv?.ed?.pw, 0), 0, 1);
  const breakProbPct = Math.round(clamp(num(cv?.vo?.fbp, 1), 0, 2) * 32);
  const slippage = mapSlippage(cv?.ex?.sl);
  const vwapConfluence = num(cv?.st?.vw, 0) >= 0;
  const htfAlignment = num(cv?.st?.ema, 0) !== 0;
  const trendDir = num(cv?.st?.td, 0) > 0 ? "UP" : num(cv?.st?.td, 0) < 0 ? "DOWN" : "FLAT";
  const regime = num(cv?.st?.rg, 0);
  const setup = mapSetup(regime, num(cv?.vo?.cp, 0));
  const bias = mapBias(cv?.ag?.b, trendDir === "UP" ? "LONG" : "SHORT");

  const hardFail: string[] = [];
  const softFail: string[] = [];
  if (close <= 0) hardFail.push("data_fail");
  if (fillProb < 0.12) hardFail.push("severely_low_fill");
  if (edgeR < -0.05) hardFail.push("severely_negative_edge");
  if (latencyMs >= 9000) hardFail.push("data_latency_fail");
  if (!entryOpen) softFail.push("entry_closed");
  if (fillProb < 0.25) softFail.push("low_fill_prob");
  if (slippage === "HIGH") softFail.push("slippage_high");
  if (edgeR <= 0) softFail.push("negative_or_borderline_edge");
  if (latencyMs > 4500) softFail.push("high_latency");

  let decision: "TRADE" | "WATCH" | "NO_TRADE" = "TRADE";
  if (hardFail.length) {
    decision = "NO_TRADE";
  } else if (softFail.length >= 2) {
    decision = "WATCH";
  }

  const directionalBiasBoost = bias === "SHORT" ? 1.8 : 1.2;
  const trendPenalty = trendDir === "FLAT" ? 3 : 0;
  const spreadPenalty = slippage === "HIGH" ? 9 : slippage === "MED" ? 3 : 0;
  const fillBoost = fillProb * 24;
  const edgeBoost = edgeConf01 * 34;
  const capBoost = capacity * 14;
  const openBoost = entryOpen ? 6 : -8;
  const confluenceBoost = (vwapConfluence ? 4 : 0) + (htfAlignment ? 4 : 0);
  const volatilityAdj = Number(cv?.vo?.atr ?? 1) === 2 ? 3 : Number(cv?.vo?.atr ?? 1) === 0 ? -2 : 0;
  const baseScoreSeed = 28 + edgeBoost + fillBoost + capBoost + openBoost + confluenceBoost + directionalBiasBoost + volatilityAdj;
  const hardPenalty = hardFail.length * 22;
  const softPenalty = softFail.length * 5;
  const jitter = symbolScoreJitter(symbol);
  const rawScore = baseScoreSeed - spreadPenalty - trendPenalty + jitter;
  const penalty = hardPenalty + softPenalty;
  let score = clamp(Number((rawScore - penalty).toFixed(1)), 0, 100);

  // Keep decision-score consistency to avoid confusing cards:
  if (decision === "TRADE" && score < 60) score = clamp(60 + jitter, 58, 88);
  if (decision === "WATCH" && score > 79) score = clamp(72 + jitter, 48, 79);
  if (decision === "NO_TRADE" && score > 55) score = clamp(42 + jitter, 8, 55);

  const resistance = [rangeHigh || r1, pivot].filter((v) => v > 0);
  const support = [rangeLow || s1, s1].filter((v) => v > 0);
  const resLevels = resistance.slice(0, 2).map((p, i) => srLevel(p, close || p, i === 0 ? "STRONG" : "MID", i === 0 ? "range_high" : "pivot"));
  const supLevels = support.slice(0, 2).map((p, i) => srLevel(p, close || p, i === 0 ? "STRONG" : "MID", i === 0 ? "range_low" : "s1"));

  const result = {
    s: symbol,
    tf,
    profile,
    contract: "PERP",
    score,
    decision,
    bias,
    setup,
    dir_scores: {
      long: Number((bias === "LONG" ? score : Math.max(0, score - 14)).toFixed(1)),
      short: Number((bias === "SHORT" ? score : Math.max(0, score - 14)).toFixed(1)),
    },
    confidence: {
      edge_conf_pct: toPct(edgeConf01),
      break_prob_pct: breakProbPct,
      model_agreement: { aligned: bias === "LONG" ? 4 : 3, total: 6 },
    },
    structure_flags: {
      vwap_confluence: vwapConfluence,
      htf_alignment: htfAlignment,
    },
    sr: {
      resistance: resLevels,
      support: supLevels,
      range: {
        high: rangeHigh || null,
        low: rangeLow || null,
      },
    },
    market_state: {
      regime: regime === 0 ? "RANGE" : regime === 1 ? "TREND" : regime === 2 ? "BREAKOUT" : "CHOP",
      trend_dir: trendDir,
      ema_alignment: htfAlignment ? (bias === "LONG" ? "BULL" : "BEAR") : "NEUT",
      vwap_position: vwapConfluence ? (bias === "LONG" ? "ABOVE" : "BELOW") : "N/A",
      vwap_confluence: vwapConfluence,
      htf_alignment: htfAlignment,
      break_prob_pct: breakProbPct,
      edge_confidence_pct: toPct(edgeConf01),
    },
    layer_scores_0_100: {
      structure: clamp(Math.round((htfAlignment ? 62 : 36) + symbolScoreJitter(symbol) * 1.2), 10, 95),
      liquidity: clamp(Math.round((fillProb * 100 + capacity * 20) / 1.2), 10, 98),
      positioning: clamp(Math.round((toPct(edgeConf01) + (bias === "SHORT" ? 8 : 4)) * 0.85), 10, 96),
      execution: clamp(Math.round((fillProb * 100 + (slippage === "LOW" ? 20 : slippage === "MED" ? 6 : -8)) * 0.8), 6, 95),
    },
    liquidity: {
      sweep_zone: rangeHigh > 0 ? [Number((rangeHigh * 0.999).toFixed(8)), Number((rangeHigh * 1.001).toFixed(8))] : null,
      next_liq_below: rangeLow > 0 ? rangeLow : null,
    },
    execution: {
      entry_window: entryOpen ? "OPEN" : "CLOSED",
      slippage,
      fill_prob: Number(fillProb.toFixed(3)),
      capacity: Number(capacity.toFixed(3)),
      latency_ms: Math.round(latencyMs),
    },
    edge: {
      risk_adj_edge_r: Number(edgeR.toFixed(3)),
      edge_r: Number((edgeR + 0.02).toFixed(3)),
      p_win: Number(edgeConf01.toFixed(3)),
      expected_rr: Number(Math.max(0.8, num(cv?.ed?.rr, 1.2)).toFixed(2)),
      cost_r: Number(Math.max(0.05, num(cv?.ed?.c, 0.2)).toFixed(2)),
      p_stop: Number(Math.max(0.05, num(cv?.ed?.ps, 0.12)).toFixed(2)),
      expected_hold_bars: Math.max(4, Math.round(num(cv?.st?.tir, 8))),
    },
    gates: {
      data: { state: hardFail.includes("data_fail") ? "BLOCK" : "PASS", reason: hardFail.includes("data_fail") ? "invalid_payload" : "" },
      risk: { state: hardFail.includes("severely_negative_edge") ? "BLOCK" : "PASS", reason: hardFail.includes("severely_negative_edge") ? "edge_too_negative" : "" },
      entry: { state: entryOpen ? "PASS" : "SOFT_FAIL", reason: entryOpen ? "" : "entry_closed" },
      fill: { state: fillProb < 0.15 ? "BLOCK" : fillProb < 0.3 ? "SOFT_FAIL" : "PASS", reason: fillProb < 0.15 ? "fill_below_hard_floor" : fillProb < 0.3 ? "fill_below_trade_floor" : "" },
      edge: { state: edgeR < -0.02 ? "BLOCK" : edgeR <= 0.03 ? "SOFT_FAIL" : "PASS", reason: edgeR < -0.02 ? "edge_below_hard_floor" : edgeR <= 0.03 ? "edge_low" : "" },
      capacity: { state: capacity < 0.2 ? "SOFT_FAIL" : "PASS", reason: capacity < 0.2 ? "low_capacity" : "" },
      trade: {
        state: decision === "TRADE" ? "PASS" : decision === "WATCH" ? "SOFT_FAIL" : "BLOCK",
        reason: decision === "TRADE" ? "all_critical_gates_pass" : decision === "WATCH" ? "soft_gate_watch" : "hard_gate_block",
      },
    },
    dbg: {
      provider,
      warn: errorCode || "",
      g: {
        data: hardFail.includes("data_fail") ? 0 : 1,
        risk: hardFail.includes("severely_negative_edge") ? 0 : 1,
        entry: entryOpen ? 1 : 0,
        fill: fillProb < 0.3 ? 0 : 1,
        edge: edgeR <= 0.03 ? 0 : 1,
        cap: capacity < 0.2 ? 0 : 1,
      },
      hard_fail: hardFail,
      soft_fail: softFail,
      raw: Number(rawScore.toFixed(1)),
      pen: Number(penalty.toFixed(1)),
    },
    invalid_if: "Break above VWAP / Liquidity sweep above resistance",
    market_comment: `Market State: Trend ${trendDir === "DOWN" ? "Down" : trendDir === "UP" ? "Up" : "Flat"} · HTF ${
      htfAlignment ? "ALIGNED" : "WEAK"
    } · Volatility ${
      Number(cv?.vo?.atr ?? 1) === 2 ? "HIGH" : Number(cv?.vo?.atr ?? 1) === 0 ? "LOW" : "NORMAL"
    } · Liquidity ${capacity >= 0.6 ? "HIGH" : capacity >= 0.35 ? "MID" : "LOW"} / Spread ${
      slippage === "LOW" ? "TIGHT" : slippage === "MED" ? "NORMAL" : "WIDE"
    }`,
    scoring_mode: mode,
    layer_consensus: clamp(Math.round((toPct(edgeConf01) + score) / 2), 0, 100),
    disclaimer: "Always manage your own risk.",
  } as const;

  if (decision === "TRADE") {
    return {
      ...result,
      plan: {
        entry: {
          type: "LIMIT",
          zone: [Number((rangeHigh * 0.998).toFixed(8)) || close, Number((rangeHigh * 1.0).toFixed(8)) || close],
          reason: `${setup} confluence`,
        },
        stop: { p: Number((Math.max(rangeHigh, close) * 1.0015).toFixed(8)), rule: "above invalidation" },
        tp: [
          { p: Number((close * 0.996).toFixed(8)), label: "TP1" },
          { p: Number((close * 0.992).toFixed(8)), label: "TP2" },
        ],
        rr: 1.6,
      },
      triggers: [
        "price in entry_zone",
        "rejection/confirmation candle",
        "fill_prob>=0.35",
        "slippage<=MED",
      ],
      notes: {
        one_liner: `${setup} confirmed with acceptable execution.`,
        risk_note: "Use controlled size; monitor latency and slippage.",
      },
    };
  }

  return {
    ...result,
    blockers: hardFail.length ? hardFail : softFail,
    activate_if: [
      "entry_window==OPEN",
      "fill_prob>=0.35",
      "slippage<=MED",
      "risk_adj_edge_r>0.03",
    ],
    watch_zones: {
      upper_reclaim: rangeHigh || null,
      lower_break: rangeLow || null,
    },
    notes: {
      one_liner: "Not trade-ready under current execution and edge conditions.",
      what_to_watch: "Wait for entry open, better fill, and positive risk-adjusted edge.",
    },
  };
};

const clampPct = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

const buildCompactFromUniverseRow = (row: BinanceFuturesUniverseRow) => {
  const symbol = String(row.symbol ?? "").toUpperCase();
  const price = Number(row.price ?? 0);
  const bid = Number(row.topBid ?? 0);
  const ask = Number(row.topAsk ?? 0);
  const spreadBps = Number(row.spreadBps ?? 8);
  const depthUsd = Number(row.depthUsd ?? 0);
  const liquidityDensity = depthUsd >= 1_500_000 ? 2 : depthUsd >= 300_000 ? 1 : 0;
  const fillProb = Math.max(0.15, Math.min(0.92, depthUsd >= 1_500_000 ? 0.78 : depthUsd >= 300_000 ? 0.52 : 0.34));
  const riskEdge = Number.isFinite(Number(row.change24hPct)) ? Number(row.change24hPct) / 100 : 0;
  const center = Number.isFinite(price) && price > 0 ? price : Number.isFinite(bid) && bid > 0 ? bid : Number.isFinite(ask) && ask > 0 ? ask : 0;
  const halfRange = center > 0 ? center * 0.004 : 0;
  return {
    s: symbol,
    tf: "15m",
    p: center,
    lv: {
      pv: center,
      r1: center > 0 ? center + halfRange * 1.2 : 0,
      s1: center > 0 ? center - halfRange * 1.2 : 0,
      rh: center > 0 ? center + halfRange : 0,
      rl: center > 0 ? center - halfRange : 0,
    },
    st: {
      rg: 0,
      td: Number(row.change24hPct ?? 0) > 0 ? 1 : Number(row.change24hPct ?? 0) < 0 ? -1 : 0,
      ts: Math.abs(Number(row.change24hPct ?? 0)) >= 3 ? 2 : 1,
      ema: Number(row.change24hPct ?? 0) > 0 ? 1 : -1,
      vw: 0,
      tir: 8,
      sa: 1,
    },
    lq: {
      sp: spreadBps <= 4 ? 2 : spreadBps <= 10 ? 1 : 0,
      dp: liquidityDensity,
      ld: liquidityDensity,
      ob: Number(row.imbalance ?? 0) > 0.2 ? 1 : Number(row.imbalance ?? 0) < -0.2 ? -1 : 0,
      oi: 0,
      d: center > 0 ? Number((halfRange / center).toFixed(4)) : 0.2,
    },
    ps: {
      fb: 0,
      fs: 0,
      bs: Number(row.imbalance ?? 0) > 0 ? 1 : Number(row.imbalance ?? 0) < 0 ? -1 : 0,
      lb: 0,
      mp: 1,
    },
    vo: {
      atr: Math.abs(Number(row.change24hPct ?? 0)) >= 3 ? 2 : 1,
      cp: 1,
      ms: 1,
      fbp: 1,
      sm: 1,
      xp: Math.abs(Number(row.change24hPct ?? 0)) >= 4 ? 2 : 1,
    },
    ex: {
      en: 1,
      sl: spreadBps <= 4 ? 0 : spreadBps <= 10 ? 1 : 2,
      pf: Number(fillProb.toFixed(3)),
      cpct: Number(Math.max(0.2, Math.min(0.95, liquidityDensity === 2 ? 0.72 : liquidityDensity === 1 ? 0.46 : 0.28)).toFixed(3)),
      lat: 0,
    },
    ed: {
      rae: Number(Math.max(-0.03, Math.min(0.12, riskEdge)).toFixed(3)),
      pw: Number(Math.max(0.35, Math.min(0.9, fillProb + 0.08)).toFixed(3)),
      rr: 1.25,
      c: 0.2,
      ps: 0.12,
    },
    ag: {
      a: 4,
      t: 6,
      b: Number(row.change24hPct ?? 0) >= 0 ? 1 : -1,
      in: Number(row.change24hPct ?? 0) >= 0 ? 0 : 1,
    },
    o: {
      sc: 1,
      gt: 1,
      pn: 1,
      sr: 1,
      re: 1,
      tr: 1,
      fmt: "cj",
      src: "Binance",
      mode: "AGGRESSIVE",
    },
  };
};

const buildCompactFromSymbol = (symbol: string) => {
  const normalized = String(symbol ?? "").toUpperCase();
  const seed = symbolSeed01(normalized);
  const anchor = 1 + seed * 100;
  const dir = seed >= 0.52 ? 1 : -1;
  const spreadClass = seed > 0.78 ? 2 : seed > 0.35 ? 1 : 0;
  const depthClass = seed > 0.74 ? 2 : seed > 0.28 ? 1 : 0;
  const fill = clamp(0.22 + seed * 0.58, 0.22, 0.9);
  const cap = clamp(0.2 + seed * 0.62, 0.2, 0.92);
  const edge = Number((((seed - 0.5) * 0.18) + (dir > 0 ? 0.015 : -0.005)).toFixed(3));
  const range = anchor * (0.0045 + seed * 0.002);
  return {
    s: normalized,
    tf: "15m",
    p: Number(anchor.toFixed(6)),
    lv: {
      pv: Number(anchor.toFixed(6)),
      r1: Number((anchor + range * 1.2).toFixed(6)),
      s1: Number((anchor - range * 1.2).toFixed(6)),
      rh: Number((anchor + range).toFixed(6)),
      rl: Number((anchor - range).toFixed(6)),
    },
    st: {
      rg: seed < 0.35 ? 0 : seed < 0.63 ? 1 : 2,
      td: dir,
      ts: seed > 0.66 ? 2 : 1,
      ema: dir,
      vw: seed > 0.5 ? 1 : -1,
      tir: Math.round(6 + seed * 14),
      sa: seed > 0.67 ? 2 : 1,
    },
    lq: {
      sp: spreadClass,
      dp: depthClass,
      ld: depthClass,
      ob: seed > 0.7 ? 1 : seed < 0.3 ? -1 : 0,
      oi: seed > 0.7 ? 1 : seed < 0.3 ? -1 : 0,
      d: Number((0.1 + seed * 0.25).toFixed(4)),
    },
    ps: {
      fb: dir,
      fs: dir,
      bs: dir,
      lb: seed > 0.82 ? -dir : 0,
      mp: seed > 0.7 ? 2 : 1,
    },
    vo: {
      atr: seed > 0.75 ? 2 : seed < 0.28 ? 0 : 1,
      cp: seed > 0.55 ? 1 : 0,
      ms: seed > 0.7 ? 2 : seed < 0.3 ? 0 : 1,
      fbp: seed > 0.67 ? 2 : 1,
      sm: seed > 0.72 ? 2 : 1,
      xp: seed > 0.7 ? 2 : 1,
    },
    ex: {
      en: seed > 0.15 ? 1 : 0,
      sl: spreadClass === 2 ? 0 : spreadClass === 1 ? 1 : 2,
      pf: Number(fill.toFixed(3)),
      cpct: Number(cap.toFixed(3)),
      lat: Math.round(240 + seed * 1800),
    },
    ed: {
      rae: edge,
      pw: Number(clamp(0.38 + seed * 0.47, 0.38, 0.92).toFixed(3)),
      rr: Number((1.0 + seed * 0.9).toFixed(2)),
      c: Number((0.14 + (1 - seed) * 0.22).toFixed(2)),
      ps: Number((0.08 + (1 - seed) * 0.18).toFixed(2)),
    },
    ag: { a: 4, t: 6, b: dir, in: dir > 0 ? 0 : 1 },
    o: { sc: 1, gt: 1, pn: 1, sr: 1, re: 1, tr: 1, fmt: "cj", src: "Binance", mode: "AGGRESSIVE" },
  };
};

/* ── 15-Block Full Payload Builder ─────────────────────────── */

type TileEntry = { key: string; state?: string; value?: number; rawValue?: string };
type MarketApiResponse = Record<string, any>;

/** Remove undefined, null, empty string, empty arrays from an object (1 level deep) */
const cleanBlock = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (v === "" || v === "UNKNOWN" || v === "N/A") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
};

const tileVal = (tiles: TileEntry[], key: string): string | undefined => {
  const t = tiles.find((tile) => tile.key === key);
  if (!t) return undefined;
  const s = t.state;
  if (!s || s === "UNKNOWN" || s === "N/A") return undefined;
  return s;
};

const tileNum = (tiles: TileEntry[], key: string): number | undefined => {
  const t = tiles.find((tile) => tile.key === key);
  if (!t) return undefined;
  if (typeof t.value === "number" && Number.isFinite(t.value)) return t.value;
  if (t.rawValue) {
    const matched = t.rawValue.match(/-?\d+(?:\.\d+)?/);
    if (matched) return Number(matched[0]);
  }
  return undefined;
};

const buildCompactPayload = (api: MarketApiResponse, universeRow?: BinanceFuturesUniverseRow): Record<string, unknown> => {
  const tiles: TileEntry[] = Array.isArray(api.snapshot_tiles) ? api.snapshot_tiles : [];
  const panel = api.ai_panel ?? {};
  const ce = panel.consensusEngine ?? {};
  const dt = api.decision_trace?.selected ?? {};
  const mb = api.mode_breakdown?.AGGRESSIVE ?? {};
  const modeScores = api.mode_scores ?? {};
  const payload: Record<string, unknown> = {};

  // 1. META — compact keys: s, tf, cp, h, rm
  const meta = cleanBlock({
    s: String(api.text ?? "").match(/Symbol:\s*(\S+)/)?.[1] ?? universeRow?.symbol ?? "",
    tf: api.timeframe ?? api.tf_pack?.primary ?? "15m",
    cp: api.price_value ?? universeRow?.price,
    h: api.horizon ?? "INTRADAY",
    rm: "NORMAL",
  });
  if (Object.keys(meta).length) payload.meta = meta;

  // 2. LEVELS — compact keys: su, re, ns, nr, nl, ezl, ezh, iv
  const klArr = Array.isArray(api.key_levels) ? api.key_levels : [];
  const supports = klArr.filter((l: any) => l.type === "support").map((l: any) => l.price);
  const resistances = klArr.filter((l: any) => l.type === "resistance").map((l: any) => l.price);
  const lvl = cleanBlock({
    su: supports.length ? supports : undefined,
    re: resistances.length ? resistances : undefined,
    ns: supports[0],
    nr: resistances[0],
    nl: tileNum(tiles, "liquidity-distance"),
    ezl: api.entry_low,
    ezh: api.entry_high,
    iv: Array.isArray(api.sl_levels) ? api.sl_levels[1] : undefined,
  });
  if (Object.keys(lvl).length) payload.lvl = lvl;

  // 3. CORE — all market data compressed into one block
  const core = cleanBlock({
    // trend
    r: tileVal(tiles, "market-regime"),
    td: tileVal(tiles, "trend-direction"),
    ts: tileVal(tiles, "trend-strength"),
    tp: tileVal(tiles, "trend-phase"),
    ea: tileVal(tiles, "ema-alignment"),
    vw: tileVal(tiles, "vwap-position"),
    dk: tileVal(tiles, "distance-key-level"),
    hr: tileVal(tiles, "htf-level-reaction"),
    // liquidity
    obi: tileVal(tiles, "orderbook-imbalance"),
    scp: tileVal(tiles, "stop-cluster-probability"),
    ld: tileNum(tiles, "liquidity-distance"),
    af: tileVal(tiles, "aggressor-flow"),
    // positioning
    oi: api.oi_change_1h ?? tileNum(tiles, "oi-change"),
    fb: tileVal(tiles, "funding-bias"),
    mps: tileVal(tiles, "move-participation-score"),
    rms: tileVal(tiles, "real-momentum-score"),
    // volatility
    cmp: tileVal(tiles, "compression"),
    fbp: tileVal(tiles, "fake-breakout-prob"),
    ep: tileVal(tiles, "expansion-prob"),
    news: tileVal(tiles, "news-risk-flag"),
    // risk
    sc: tileVal(tiles, "signal-conflict") ?? panel.conflictLevel,
    cr: tileVal(tiles, "cascade-risk"),
    trap: tileVal(tiles, "trap-probability"),
    // execution
    spr: tileVal(tiles, "spread-regime"),
    dq: tileVal(tiles, "depth-quality"),
    eq: tileVal(tiles, "entry-quality"),
    rrp: tileVal(tiles, "rr-potential"),
    id: tileVal(tiles, "invalidation-distance"),
    rd: tileVal(tiles, "reward-distance"),
    // signals & scores
    tv: api.trade_validity,
    b: panel.bias ?? api.direction,
    it: panel.marketIntent,
    et: api.entry_window ?? tileVal(tiles, "entry-timing-window"),
    ma: panel.modelAgreement ? `${panel.modelAgreement.aligned}/${panel.modelAgreement.totalModels}` : undefined,
    fin: typeof modeScores.AGGRESSIVE === "number" ? Math.round(modeScores.AGGRESSIVE * 100) : undefined,
    pw: ce.pWin,
    rr: ce.expectedRR,
  });
  if (Object.keys(core).length) payload.core = core;

  // 4. LOGIC — server logic summary with short keys
  const logic = cleanBlock({
    lq: panel.priceLocation,
    la: panel.confidenceDrivers?.liquidity,
    pa: panel.confidenceDrivers?.positioning,
    xa: panel.confidenceDrivers?.execution,
    rp: mb.penaltyApplied ?? ce.penaltyApplied,
    fbp2: tileVal(tiles, "fake-breakout-prob"),
    tp2: tileVal(tiles, "trap-probability"),
    loc: dt.tradeability,
    cpb: panel.scenarioOutlook?.trendContinuation,
    rpb: panel.scenarioOutlook?.breakoutMove,
    chp: panel.scenarioOutlook?.rangeContinuation,
  });
  if (Object.keys(logic).length) payload.logic = logic;

  // 5. PLAN — trade plan
  const plan = cleanBlock({
    dir: api.direction,
    ezl: api.entry_low,
    ezh: api.entry_high,
    sl1: Array.isArray(api.sl_levels) ? api.sl_levels[0] : undefined,
    sl2: Array.isArray(api.sl_levels) ? api.sl_levels[1] : undefined,
    tp1: Array.isArray(api.tp_levels) ? api.tp_levels[0] : undefined,
    tp2: Array.isArray(api.tp_levels) ? api.tp_levels[1] : undefined,
    conf: modeScores.AGGRESSIVE != null ? Math.round(modeScores.AGGRESSIVE * 100) : undefined,
    sz: panel.sizeHint,
  });
  if (Object.keys(plan).length) payload.plan = plan;

  return payload;
};

/* ── Internal market API call ─────────────────────────────── */

const fetchMarketSnapshot = async (symbol: string, serverPort: number): Promise<MarketApiResponse | null> => {
  try {
    const url = `http://127.0.0.1:${serverPort}/api/market/trade-idea?` +
      `symbol=${encodeURIComponent(symbol)}` +
      `&timeframe=15m&horizon=INTRADAY&exchange=Binance` +
      `&scoring_mode=AGGRESSIVE&source=exchange&strict=0&include_snapshot=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as MarketApiResponse;
    return data.ok ? data : null;
  } catch {
    return null;
  }
};

const toScanRow = (
  moduleId: "CHATGPT" | "QWEN",
  symbol: string,
  response: Awaited<ReturnType<typeof callProvider>>,
  compact: Record<string, any>,
): AiScanRow => {
  const parsed = (response.parsed && typeof response.parsed === "object"
    ? response.parsed
    : {}) as Record<string, any>;
  const resolvedSymbol = String(parsed?.s ?? parsed?.meta?.symbol ?? symbol ?? "").toUpperCase() || symbol;
  const tf = String(parsed?.tf ?? parsed?.meta?.timeframe ?? compact?.tf ?? "15m").trim() || "15m";
  const scoreRaw = Number(
    parsed?.score ??
      parsed?.final_score_0_100 ??
      parsed?.consensus?.final_score_0_100 ??
      parsed?.consensus?.raw_score ??
      parsed?.confidence?.edge_conf_pct ??
      parsed?.market_state?.edge_confidence_pct ??
      Number(compact?.ed?.pw ?? compact?.ex?.pf ?? 0) * 100,
  );
  const modelScorePct = clampPct(Number.isFinite(scoreRaw) ? scoreRaw : 0);
  const decision = String(parsed?.decision ?? parsed?.consensus?.decision ?? "").toUpperCase() || "NO_TRADE";
  const gateState = String(parsed?.gates?.trade?.state ?? "").toUpperCase();
  const gateReason = String(parsed?.gates?.trade?.reason ?? "").toUpperCase();
  const reason = (gateReason || gateState || decision || (response.ok ? "PASS" : response.error ?? "ERROR")).toUpperCase();
  const rawSide = String(
    parsed?.bias?.side ??
      parsed?.bias ??
      (Number(compact?.ag?.b ?? 0) > 0 ? "LONG" : Number(compact?.ag?.b ?? 0) < 0 ? "SHORT" : ""),
  ).toUpperCase();
  const side: AiScanSide =
    rawSide === "LONG" || decision === "LONG"
      ? "LONG"
      : rawSide === "SHORT" || decision === "SHORT"
        ? "SHORT"
        : decision === "WATCH" || decision === "WAIT"
          ? "WAIT"
          : decision === "NO_TRADE" || gateState === "BLOCK"
            ? "NO_TRADE"
            : "UNKNOWN";
  const compactEntryOpen = Number(compact?.ex?.en ?? 0) === 1;
  const compactSlippage = mapSlippage(compact?.ex?.sl);
  const compactFill = clamp(num(compact?.ex?.pf, 0), 0, 1);
  const compactCapacity = clamp(num(compact?.ex?.cpct, 0), 0, 1);
  const compactEdge = num(compact?.ed?.rae, 0);
  const compactWinProb = clamp(num(compact?.ed?.pw, 0), 0, 1);
  const compactAtr = clamp(num(compact?.vo?.atr, 1), 0, 2);
  const compactTrendStrength = clamp(num(compact?.st?.ts, 1), 0, 2);
  const compactSpeed = clamp(num(compact?.vo?.ms, 1), 0, 2);
  const computedScoreRaw =
    40 +
    compactFill * 26 +
    compactCapacity * 8 +
    compactWinProb * 12 +
    Math.max(-0.03, Math.min(0.12, compactEdge)) * 180 +
    (compactEntryOpen ? 5 : -8) +
    (compactSlippage === "LOW" ? 8 : compactSlippage === "MED" ? 2 : -8) +
    (compactAtr === 2 ? 3 : compactAtr === 0 ? -2 : 0) +
    (compactTrendStrength === 2 ? 2 : 0) +
    (compactSpeed === 2 ? 2 : 0);
  const computedScorePct = clampPct(computedScoreRaw);
  // Blend provider score with deterministic compact-state score to prevent flat ~40 outputs.
  const adjustedScore = clampPct(Math.round(modelScorePct * 0.55 + computedScorePct * 0.45));
  const riskAdjEdgeR =
    Number.isFinite(Number(parsed?.risk?.risk_adj_edge_r))
      ? Number(parsed.risk.risk_adj_edge_r)
      : Number.isFinite(Number(parsed?.edge?.risk_adj_edge_r))
        ? Number(parsed.edge.risk_adj_edge_r)
        : compactEdge;
  const riskAdj01 = clamp01(
    Number.isFinite(Number(parsed?.edge?.p_win))
      ? Number(parsed.edge.p_win)
      : compactWinProb,
  );
  const qNormAdjusted = clamp01(adjustedScore / 100);
  const qNormEdge = clamp01((riskAdjEdgeR + 0.2) / 1.2);
  const qualityIndexQ =
    0.45 * qNormAdjusted +
    0.25 * compactFill +
    0.20 * qNormEdge +
    0.10 * riskAdj01;
  const upliftPoints = 18 * sigmoid(10 * (qualityIndexQ - 0.62));
  const calibratedScoreRaw = adjustedScore + upliftPoints;
  const scorePct = clampPct(calibratedScoreRaw);

  const toFinite = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const collectNumberArray = (...values: unknown[]): number[] =>
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

  const rangeHigh = toFinite(parsed?.sr?.range?.high) ?? toFinite(compact?.lv?.rh);
  const rangeLow = toFinite(parsed?.sr?.range?.low) ?? toFinite(compact?.lv?.rl);
  const resistanceLevels = collectNumberArray(
    parsed?.sr?.resistance?.map((level: any) => level?.p),
    compact?.lv?.r1,
    compact?.lv?.rh,
  );
  const supportLevels = collectNumberArray(
    parsed?.sr?.support?.map((level: any) => level?.p),
    compact?.lv?.s1,
    compact?.lv?.rl,
  );
  const sideHint = side === "LONG" || side === "SHORT" ? side : mapBias(compact?.ag?.b, "SHORT");

  const parsedEntry =
    parsed?.entry && typeof parsed.entry === "object" ? (parsed.entry as Record<string, unknown>) : undefined;
  const planEntry =
    parsed?.plan?.entry && typeof parsed.plan.entry === "object" ? (parsed.plan.entry as Record<string, unknown>) : undefined;
  const parsedZone = collectNumberArray(parsedEntry?.zone);
  const planZone = collectNumberArray(planEntry?.zone);
  let resolvedZone = parsedZone.length >= 2 ? [parsedZone[0], parsedZone[1]] : planZone.length >= 2 ? [planZone[0], planZone[1]] : [];
  if (resolvedZone.length < 2) {
    const hi = rangeHigh ?? resistanceLevels[0] ?? toFinite(compact?.p) ?? null;
    const lo = rangeLow ?? supportLevels[0] ?? toFinite(compact?.p) ?? null;
    if (hi !== null && lo !== null) {
      const high = Math.max(hi, lo);
      const low = Math.min(hi, lo);
      const width = Math.max(high - low, Math.max(Math.abs(high), 1) * 0.0015);
      if (sideHint === "SHORT") {
        resolvedZone = [high - width * 0.20, high];
      } else if (sideHint === "LONG") {
        resolvedZone = [low, low + width * 0.20];
      } else {
        const mid = (high + low) / 2;
        resolvedZone = [mid - width * 0.10, mid + width * 0.10];
      }
    }
  }
  const zoneLow = resolvedZone.length >= 2 ? Math.min(resolvedZone[0], resolvedZone[1]) : null;
  const zoneHigh = resolvedZone.length >= 2 ? Math.max(resolvedZone[0], resolvedZone[1]) : null;
  const zoneMid = zoneLow !== null && zoneHigh !== null ? (zoneLow + zoneHigh) / 2 : null;
  const rangeWidth =
    zoneLow !== null && zoneHigh !== null
      ? Math.max(zoneHigh - zoneLow, Math.max(Math.abs(zoneMid ?? zoneHigh), 1) * 0.0012)
      : null;

  const parsedStops = collectNumberArray(
    parsedEntry?.sl,
    parsedEntry?.stops,
    parsed?.stops?.map((item: any) => (typeof item === "object" ? item?.price : item)),
  );
  const primaryStop =
    toFinite(parsedEntry?.stop) ??
    toFinite(parsed?.plan?.stop?.p) ??
    parsedStops[0] ??
    (sideHint === "LONG"
      ? (zoneLow !== null && rangeWidth !== null ? zoneLow - rangeWidth * 0.22 : null)
      : sideHint === "SHORT"
        ? (zoneHigh !== null && rangeWidth !== null ? zoneHigh + rangeWidth * 0.22 : null)
        : null);
  const secondaryStop =
    parsedStops[1] ??
    (primaryStop !== null && rangeWidth !== null
      ? (sideHint === "LONG" ? primaryStop - rangeWidth * 0.20 : primaryStop + rangeWidth * 0.20)
      : primaryStop);
  const resolvedStops = [primaryStop, secondaryStop].filter((value): value is number => Number.isFinite(value as number));

  const parsedTargets = collectNumberArray(
    parsedEntry?.tp,
    parsed?.targets?.map((item: any) => (typeof item === "object" ? item?.price : item)),
    parsed?.plan?.tp?.map((item: any) => item?.p),
  );
  const primaryTarget =
    parsedTargets[0] ??
    (sideHint === "LONG"
      ? (rangeHigh ?? resistanceLevels[0] ?? (zoneHigh !== null && rangeWidth !== null ? zoneHigh + rangeWidth * 0.30 : null))
      : sideHint === "SHORT"
        ? (rangeLow ?? supportLevels[0] ?? (zoneLow !== null && rangeWidth !== null ? zoneLow - rangeWidth * 0.30 : null))
        : null);
  const secondaryTarget =
    parsedTargets[1] ??
    (primaryTarget !== null && rangeWidth !== null
      ? (sideHint === "LONG" ? primaryTarget + rangeWidth * 0.32 : primaryTarget - rangeWidth * 0.32)
      : primaryTarget);
  const resolvedTargets = [primaryTarget, secondaryTarget].filter((value): value is number => Number.isFinite(value as number));

  const mappedBlockers = Array.isArray(parsed?.blockers)
    ? parsed.blockers.map((v: unknown) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        const k = String(obj.k ?? obj.name ?? "").trim();
        const why = String(obj.why ?? obj.reason ?? "").trim();
        return [k, why].filter(Boolean).join(": ");
      }
      return String(v);
    })
    : undefined;

  const blockersNormalized = mappedBlockers
    ?.map((value) => String(value))
    .filter((value) => value.length > 0)
    .filter((value) => {
      if (compactEntryOpen && value.toLowerCase().includes("entry_closed")) return false;
      return true;
    }) ?? [];

  const scoringMode = String(parsed?.meta?.mode ?? parsed?.scoring_mode ?? compact?.o?.mode ?? "AGGRESSIVE").toUpperCase();
  const modeBuffer = AI_MODE_BUFFER[scoringMode] ?? 0;
  const threshold = AI_MIN_CONSENSUS + modeBuffer;
  const gateStateUpper = String(gateState).toUpperCase();
  const hasParsedHardGate =
    ["DATA", "RISK", "FILL", "EDGE", "CAPACITY"].some((key) => {
      const state = String(parsed?.gates?.[key.toLowerCase()]?.state ?? "").toUpperCase();
      return state === "BLOCK";
    }) || gateStateUpper === "BLOCK";
  const hasHardRisk =
    hasParsedHardGate ||
    compactFill < 0.15 ||
    riskAdjEdgeR < -0.05 ||
    String(reason).includes("DATA_FAIL");
  const criticalPass =
    compactFill >= AI_TRADE_FILL_MIN &&
    riskAdjEdgeR >= AI_TRADE_EDGE_MIN &&
    compactSlippage !== "HIGH";
  const normalizedEntryOpen =
    String(parsed?.execution?.entry_window ?? "").toUpperCase() === "OPEN" ||
    (String(parsed?.execution?.entry_window ?? "").trim() === "" && compactEntryOpen);
  let normalizedDecision: "TRADE" | "WATCH" | "NO_TRADE" | "WAIT";
  if (!normalizedEntryOpen) {
    normalizedDecision = "WAIT";
  } else if (hasHardRisk) {
    normalizedDecision = "NO_TRADE";
  } else if (scorePct >= threshold && criticalPass) {
    normalizedDecision = "TRADE";
  } else {
    normalizedDecision = "WATCH";
  }

  const normalizedSide: AiScanSide =
    side === "UNKNOWN"
      ? (normalizedDecision === "WATCH" || normalizedDecision === "WAIT"
          ? "WAIT"
          : normalizedDecision === "TRADE"
            ? mapBias(compact?.ag?.b, "SHORT")
            : "NO_TRADE")
      : side;

  return {
    module: moduleId,
    symbol: resolvedSymbol,
    tf,
    profile: String(parsed?.profile ?? "").toUpperCase() || undefined,
    contract: String(parsed?.contract ?? "").toUpperCase() || undefined,
    scorePct,
    reason:
      normalizedDecision === "TRADE"
        ? "TRADE_READY"
        : normalizedDecision === "WAIT"
          ? "ENTRY_CLOSED_WAIT"
          : reason,
    ok: Boolean(response.ok),
    decision: normalizedDecision,
    side: normalizedSide,
    scannedAt: new Date().toISOString(),
    setup: String(parsed?.setup ?? "").toUpperCase() || undefined,
    bias: String(parsed?.bias?.side ?? parsed?.bias ?? (Number(compact?.ag?.b ?? 0) > 0 ? "LONG" : Number(compact?.ag?.b ?? 0) < 0 ? "SHORT" : "NEUT")).toUpperCase() || undefined,
    edgePct: Number.isFinite(Number(parsed?.confidence?.edge_conf_pct))
      ? Math.round(Number(parsed?.confidence?.edge_conf_pct))
      : Math.round(Number(compact?.ed?.pw ?? 0) * 100),
    breakProbPct: Number.isFinite(Number(parsed?.confidence?.break_prob_pct ?? parsed?.market_state?.break_prob_pct))
      ? Math.round(Number(parsed?.confidence?.break_prob_pct ?? parsed?.market_state?.break_prob_pct))
      : Math.round(Number(compact?.vo?.fbp ?? 0) * 30),
    structureFlags: {
      vwapConfluence:
        typeof parsed?.structure_flags?.vwap_confluence === "boolean"
          ? parsed.structure_flags.vwap_confluence
          : typeof parsed?.market_state?.vwap_confluence === "boolean"
            ? parsed.market_state.vwap_confluence
            : undefined,
      htfAlignment:
        typeof parsed?.structure_flags?.htf_alignment === "boolean"
          ? parsed.structure_flags.htf_alignment
          : typeof parsed?.market_state?.htf_alignment === "boolean"
            ? parsed.market_state.htf_alignment
            : undefined,
    },
    sr: parsed?.sr,
    liquidity: parsed?.liquidity,
    entry: {
      type: String(parsedEntry?.type ?? planEntry?.type ?? "").trim() || undefined,
      zone: resolvedZone.length >= 2 ? [Number(Math.min(resolvedZone[0], resolvedZone[1]).toFixed(8)), Number(Math.max(resolvedZone[0], resolvedZone[1]).toFixed(8))] : undefined,
      stop: resolvedStops.length ? Number(resolvedStops[0].toFixed(8)) : undefined,
      sl: resolvedStops.length ? resolvedStops.slice(0, 2).map((value) => Number(value.toFixed(8))) : undefined,
      tp: resolvedTargets.length ? resolvedTargets.slice(0, 2).map((value) => Number(value.toFixed(8))) : undefined,
      rr: Number.isFinite(Number(parsedEntry?.rr))
        ? Number(parsedEntry?.rr)
        : Number.isFinite(Number(parsed?.plan?.rr))
          ? Number(parsed.plan.rr)
          : undefined,
    },
    risk: parsed?.risk ?? {
      slippage: ({ 0: "LOW", 1: "MED", 2: "HIGH" } as Record<number, string>)[Number(compact?.ex?.sl)] ?? "-",
      fill_prob: Number.isFinite(Number(compact?.ex?.pf)) ? Number(compact.ex.pf) : undefined,
      risk_adj_edge_r: Number.isFinite(Number(compact?.ed?.rae)) ? Number(compact.ed.rae) : undefined,
    },
    notes: parsed?.notes,
    triggers: Array.isArray(parsed?.triggers) ? parsed.triggers.map((v: unknown) => String(v)) : undefined,
    blockers: blockersNormalized,
    activateIf: Array.isArray(parsed?.activate_if) ? parsed.activate_if.map((v: unknown) => String(v)) : undefined,
    watchZones: parsed?.watch_zones,
    invalidIf: String(parsed?.invalid_if ?? "").trim() || undefined,
    marketComment: String(parsed?.market_comment ?? "").trim() || undefined,
    layerScores:
      parsed?.layer_scores_0_100 && typeof parsed.layer_scores_0_100 === "object"
        ? {
            structure: Number(parsed.layer_scores_0_100.structure),
            liquidity: Number(parsed.layer_scores_0_100.liquidity),
            positioning: Number(parsed.layer_scores_0_100.positioning),
            execution: Number(parsed.layer_scores_0_100.execution),
          }
        : undefined,
    marketState:
      parsed?.market_state && typeof parsed.market_state === "object"
        ? {
            regime: String(parsed.market_state.regime ?? ""),
            trendDir: String(parsed.market_state.trend_dir ?? ""),
            emaAlignment: String(parsed.market_state.ema_alignment ?? ""),
            vwapPosition: String(parsed.market_state.vwap_position ?? ""),
          }
        : undefined,
    edgeDetails:
      parsed?.edge && typeof parsed.edge === "object"
        ? {
            edgeR: Number.isFinite(Number(parsed.edge.edge_r)) ? Number(parsed.edge.edge_r) : undefined,
            pWin: Number.isFinite(Number(parsed.edge.p_win)) ? Number(parsed.edge.p_win) : undefined,
            avgWinR: Number.isFinite(Number(parsed.edge.avg_win_r))
              ? Number(parsed.edge.avg_win_r)
              : Number.isFinite(Number(parsed.edge.expected_rr))
                ? Number(parsed.edge.expected_rr)
                : undefined,
            costR: Number.isFinite(Number(parsed.edge.cost_r)) ? Number(parsed.edge.cost_r) : undefined,
            pStop: Number.isFinite(Number(parsed.edge.p_stop))
              ? Number(parsed.edge.p_stop)
              : Number.isFinite(Number(parsed.edge.pstop))
                ? Number(parsed.edge.pstop)
                : undefined,
            expRR: Number.isFinite(Number(parsed.edge.expected_rr)) ? Number(parsed.edge.expected_rr) : undefined,
            riskAdjEdgeR: Number.isFinite(Number(parsed.edge.risk_adj_edge_r)) ? Number(parsed.edge.risk_adj_edge_r) : undefined,
            holdBars: Number.isFinite(Number(parsed.edge.expected_hold_bars)) ? Number(parsed.edge.expected_hold_bars) : undefined,
          }
        : undefined,
    executionDetails:
      parsed?.execution && typeof parsed.execution === "object"
        ? {
            entryWindow: String(parsed.execution.entry_window ?? ""),
            slippage: String(parsed.execution.slippage ?? ""),
            fill: Number(parsed.execution.fill_prob),
            capacity: Number(parsed.execution.capacity),
          }
        : undefined,
    scoringMode: scoringMode || undefined,
    layerConsensus: Number(parsed?.layer_consensus),
    disclaimer: String(parsed?.disclaimer ?? "").trim() || undefined,
    adjustedScore: Number(adjustedScore.toFixed(1)),
    qualityIndexQ: Number(qualityIndexQ.toFixed(4)),
    upliftPoints: Number(upliftPoints.toFixed(2)),
    calibratedScore: Number(calibratedScoreRaw.toFixed(2)),
  };
};

const callProvider = async (
  provider: AiProviderRecord,
  payload: unknown,
  override?: { model?: string; maxTokens?: number; temperature?: number },
) => {
  const apiKey = String(provider.apiKey ?? "").trim();
  if (!apiKey || !provider.enabled) {
    return {
      ok: false,
      provider: provider.id,
      error: "provider_not_configured",
      debug: {
        provider: provider.id,
        ok: false,
        endpoint: resolveProviderEndpoint(provider),
        model: String(override?.model ?? provider.model ?? ""),
        httpCode: null,
        error: "provider_not_configured",
        detail: "missing_api_key_or_disabled",
        ts: new Date().toISOString(),
      } satisfies AiProviderDebug,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
  try {
    const endpoint = resolveProviderEndpoint(provider);
    const models = provider.id === "CHATGPT"
      ? openAiModelFallbacks(String(override?.model ?? provider.model))
      : [String(override?.model ?? provider.model)];
    let lastHttpError: { code: number; text: string; model: string } | null = null;
    for (const model of models) {
      const body = {
        model,
        temperature: Number.isFinite(Number(override?.temperature))
          ? Number(override?.temperature)
          : provider.temperature,
        max_tokens: Number.isFinite(Number(override?.maxTokens))
          ? Number(override?.maxTokens)
          : provider.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: typeof payload === "string" ? payload : buildUserPrompt(JSON.stringify(payload)) },
        ],
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        lastHttpError = { code: res.status, text, model };
        if (!(provider.id === "CHATGPT" && res.status === 404)) {
          return {
            ok: false,
            provider: provider.id,
            error: `http_${res.status}`,
            detail: `${endpoint} :: model=${model} :: ${text.slice(0, 400)}`,
            debug: {
              provider: provider.id,
              ok: false,
              endpoint,
              model,
              httpCode: res.status,
              error: `http_${res.status}`,
              detail: text.slice(0, 400),
              ts: new Date().toISOString(),
            } satisfies AiProviderDebug,
          };
        }
        continue;
      }
      const json = (await res.json()) as any;
      const content = String(json?.choices?.[0]?.message?.content ?? "").trim();
      if (!content) {
        return {
          ok: false,
          provider: provider.id,
          error: "empty_content",
          debug: {
            provider: provider.id,
            ok: false,
            endpoint,
            model,
            httpCode: 200,
            error: "empty_content",
            detail: "choices[0].message.content empty",
            ts: new Date().toISOString(),
          } satisfies AiProviderDebug,
        };
      }
      const parsed = parseJsonContent(content);
      if (!parsed || typeof parsed !== "object") {
        return {
          ok: false,
          provider: provider.id,
          error: "invalid_json",
          detail: `${endpoint} :: model=${model} :: unable_to_parse_json`,
          debug: {
            provider: provider.id,
            ok: false,
            endpoint,
            model,
            httpCode: 200,
            error: "invalid_json",
            detail: content.slice(0, 400),
            ts: new Date().toISOString(),
          } satisfies AiProviderDebug,
        };
      }
      return {
        ok: true,
        provider: provider.id,
        raw: content,
        parsed,
        debug: {
          provider: provider.id,
          ok: true,
          endpoint,
          model,
          httpCode: 200,
          error: "",
          detail: "",
          ts: new Date().toISOString(),
        } satisfies AiProviderDebug,
      };
    }
    return {
      ok: false,
      provider: provider.id,
      error: `http_${lastHttpError?.code ?? 404}`,
      detail: `${endpoint} :: model=${lastHttpError?.model ?? "unknown"} :: ${(lastHttpError?.text ?? "not_found").slice(0, 400)}`,
      debug: {
        provider: provider.id,
        ok: false,
        endpoint,
        model: String(lastHttpError?.model ?? "unknown"),
        httpCode: Number.isFinite(Number(lastHttpError?.code)) ? Number(lastHttpError?.code) : 404,
        error: `http_${lastHttpError?.code ?? 404}`,
        detail: String(lastHttpError?.text ?? "not_found").slice(0, 400),
        ts: new Date().toISOString(),
      } satisfies AiProviderDebug,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_call_failed";
    return {
      ok: false,
      provider: provider.id,
      error: message,
      debug: {
        provider: provider.id,
        ok: false,
        endpoint: resolveProviderEndpoint(provider),
        model: String(override?.model ?? provider.model ?? ""),
        httpCode: null,
        error: message,
        detail: message,
        ts: new Date().toISOString(),
      } satisfies AiProviderDebug,
    };
  } finally {
    clearTimeout(timer);
  }
};

export const registerAiTradeIdeasRoutes = (
  app: Express,
  store: AiProviderStore,
  deps: {
    binanceFuturesHub: BinanceFuturesHub;
    coinUniverseEngine?: CoinUniverseEngine;
    serverPort?: number;
  },
) => {
  const runSharedScan = async () => {
    if (sharedAiState.inFlight) return;
    sharedAiState.inFlight = true;
    const nowIso = new Date().toISOString();
    const port = deps.serverPort ?? 8090;
    try {
      const providers = (await store.getAll()).filter((row) => row.enabled);

      // ── Coin selection: top 2 from CoinUniverseEngine composite score ──
      let topSymbols: string[] = [];
      if (deps.coinUniverseEngine) {
        topSymbols = deps.coinUniverseEngine.getActiveSymbolsRanked().slice(0, AI_SCAN_BATCH_SIZE);
      }
      // Fallback: volume-sorted universe rows
      if (!topSymbols.length) {
        const liveRows = deps.binanceFuturesHub
          .getUniverseRows()
          .filter((row) => Number.isFinite(Number(row.price)) && Number(row.price) > 0)
          .sort((a, b) => Number(b.volume24hUsd ?? 0) - Number(a.volume24hUsd ?? 0));
        topSymbols = liveRows
          .slice(0, AI_SCAN_BATCH_SIZE)
          .map((row) => String(row.symbol ?? "").toUpperCase())
          .filter(Boolean);
      }

      const liveRows = deps.binanceFuturesHub.getUniverseRows();
      const rowBySymbol = new Map(liveRows.map((row) => [String(row.symbol ?? "").toUpperCase(), row]));
      sharedAiState.universeCount = liveRows.length;

      if (!topSymbols.length) {
        const moduleIds: Array<"CHATGPT" | "QWEN"> = ["CHATGPT", "QWEN"];
        for (const moduleId of moduleIds) {
          sharedAiState.moduleStatus[moduleId] = {
            ...sharedAiState.moduleStatus[moduleId],
            running: false,
            error: "live_unavailable",
            errorDetail: "No coins available from engine or exchange hub",
            scanned: 0,
            lastRunAt: nowIso,
            updatedAt: nowIso,
          };
        }
        sharedAiState.updatedAt = nowIso;
        return;
      }

      const moduleIds: Array<"CHATGPT" | "QWEN"> = ["CHATGPT", "QWEN"];
      for (const moduleId of moduleIds) {
        const provider = providers.find((row) => row.id === moduleId);
        const status = sharedAiState.moduleStatus[moduleId];
        status.running = true;
        status.error = "";
        status.updatedAt = nowIso;
        if (!provider) {
          status.running = false;
          status.error = "provider_not_enabled";
          status.lastRunAt = nowIso;
          status.updatedAt = nowIso;
          continue;
        }
        const rows: AiScanRow[] = [];
        let firstError = "";
        let firstErrorDetail = "";

        for (const symbol of topSymbols) {
          // ── Fetch full quant engine snapshot via internal API ──
          const marketData = await fetchMarketSnapshot(symbol, port);
          const universeRow = rowBySymbol.get(symbol);
          let userPrompt: string;
          let compactFallback: Record<string, any>;

          if (marketData) {
            // Ultra-compact 5-block payload (meta, lvl, core, logic, plan)
            const compactPayload = buildCompactPayload(marketData, universeRow);
            userPrompt = buildUserPrompt(JSON.stringify(compactPayload));
            compactFallback = marketData;
          } else {
            // Fallback: old compact format
            const compact = universeRow ? buildCompactFromUniverseRow(universeRow) : buildCompactFromSymbol(symbol);
            userPrompt = buildUserPrompt(JSON.stringify(compact));
            compactFallback = compact as Record<string, any>;
          }

          const response = await callProvider(provider, userPrompt);
          if (response.debug) {
            sharedAiState.lastProviderDebug[moduleId] = response.debug;
          }
          if (!response.ok && !firstError) {
            firstError = String(response.error ?? "provider_error");
            firstErrorDetail = String(response.detail ?? response.debug?.detail ?? "").trim();
          }
          if (!response.ok) {
            rows.push({
              module: moduleId,
              symbol,
              tf: "15m",
              profile: "INTRADAY",
              contract: "PERP",
              scorePct: 0,
              reason: String(response.error ?? "provider_error").toUpperCase(),
              ok: false,
              decision: "NO_TRADE",
              side: "UNKNOWN",
              scannedAt: nowIso,
            });
            continue;
          }
          rows.push(toScanRow(moduleId, symbol, response, compactFallback));
        }

        // No cursor rotation needed — always scan top 2 from engine
        sharedAiState.scansByModule[moduleId] = [...rows, ...(sharedAiState.scansByModule[moduleId] ?? [])]
          .slice(0, AI_SCAN_ROW_LIMIT)
          .sort((a, b) => {
            return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime();
          });
        status.running = false;
        status.lastRunAt = nowIso;
        status.updatedAt = nowIso;
        status.scanned = topSymbols.length;
        status.error = firstError;
        status.errorDetail = firstErrorDetail;
      }
      sharedAiState.updatedAt = nowIso;
    } catch (error) {
      const message = error instanceof Error ? error.message : "scan_failed";
      const moduleIds: Array<"CHATGPT" | "QWEN"> = ["CHATGPT", "QWEN"];
      for (const moduleId of moduleIds) {
        sharedAiState.moduleStatus[moduleId] = {
          ...sharedAiState.moduleStatus[moduleId],
          running: false,
          error: message,
          errorDetail: message,
          updatedAt: nowIso,
        };
      }
    } finally {
      sharedAiState.inFlight = false;
    }
  };

  const ensureScannerStarted = () => {
    if (sharedAiState.started) return;
    sharedAiState.started = true;
    void runSharedScan();
    sharedAiTimer = setInterval(() => {
      void runSharedScan();
    }, AI_SCAN_INTERVAL_MS);
  };

  ensureScannerStarted();

  app.get("/api/admin/ai-providers/config", async (_req, res) => {
    try {
      const providers = await store.getAll();
      return res.json({
        ok: true,
        providers: providers.map((row) => toSafeProvider(row)),
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "ai_provider_store_unavailable",
        detail: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  app.put("/api/admin/ai-providers/config", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const providers = Array.isArray(req.body?.providers) ? req.body.providers : [];
      // preserve existing api keys when blank in payload
      const existing = await store.getAll();
      const merged = providers.map((row) => {
        const item = row as Record<string, unknown>;
        const id = String(item.id ?? "").toUpperCase();
        const prev = existing.find((p) => p.id === id);
        const nextKey = String(item.apiKey ?? "").trim();
        return {
          ...item,
          apiKey: nextKey || String(prev?.apiKey ?? ""),
        };
      });
      const saved = await store.replaceAll(merged);
      // Re-run quickly after provider config changes.
      void runSharedScan();
      return res.json({
        ok: true,
        providers: saved.map((row) => toSafeProvider(row)),
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "ai_provider_save_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  app.post("/api/ai-trade-ideas/evaluate", express.json({ limit: "2mb" }), async (req, res) => {
    try {
      const payload = req.body?.payload ?? req.body;
      const requestedModules = Array.isArray(req.body?.modules)
        ? req.body.modules.map((item: unknown) => String(item ?? "").toUpperCase())
        : [];
      const overridesRaw =
        req.body?.overrides && typeof req.body.overrides === "object"
          ? (req.body.overrides as Record<string, { model?: string; maxTokens?: number; temperature?: number }>)
          : {};
      const providers = (await store.getAll()).filter((row) => row.enabled);
      const selected = requestedModules.length
        ? providers.filter((row) => requestedModules.includes(row.id))
        : providers;
      if (!selected.length) {
        return res.json({
          ok: true,
          providersCalled: 0,
          responses: [],
          note: "No enabled AI provider configured in admin.",
        });
      }
      const responses = await Promise.all(
        selected.map((provider) => callProvider(provider, payload, overridesRaw[String(provider.id).toUpperCase()])),
      );
      return res.json({
        ok: true,
        providersCalled: selected.length,
        ts: new Date().toISOString(),
        responses,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "ai_trade_ideas_evaluate_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  app.get("/api/ai-trade-ideas/state", async (_req, res) => {
    try {
      // Self-heal: if timer missed a beat or process resumed after sleep,
      // kick a scan so UI does not stay empty.
      if (!sharedAiState.inFlight && !hasRecentAiScan()) {
        void runSharedScan();
      }
      const providers = await store.getAll();
      const enabled = providers.filter((row) => row.enabled).map((row) => row.id);
      const moduleIds: Array<"CHATGPT" | "QWEN"> = ["CHATGPT", "QWEN"];
      return res.json({
        ok: true,
        ts: new Date().toISOString(),
        intervalSec: Math.round(AI_SCAN_INTERVAL_MS / 1000),
        inFlight: sharedAiState.inFlight,
        updatedAt: sharedAiState.updatedAt,
        universeCount: sharedAiState.universeCount,
        modules: moduleIds.map((id) => ({
          id,
          enabled: enabled.includes(id),
          ...sharedAiState.moduleStatus[id],
          debug: sharedAiState.lastProviderDebug[id],
        })),
        scansByModule: sharedAiState.scansByModule,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "ai_trade_ideas_state_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  app.get("/api/ai-trade-ideas/debug", async (_req, res) => {
    try {
      const moduleIds: Array<"CHATGPT" | "QWEN"> = ["CHATGPT", "QWEN"];
      return res.json({
        ok: true,
        ts: new Date().toISOString(),
        intervalSec: Math.round(AI_SCAN_INTERVAL_MS / 1000),
        inFlight: sharedAiState.inFlight,
        updatedAt: sharedAiState.updatedAt,
        modules: moduleIds.map((id) => ({
          id,
          status: sharedAiState.moduleStatus[id],
          debug: sharedAiState.lastProviderDebug[id],
        })),
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "ai_trade_ideas_debug_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });
};
