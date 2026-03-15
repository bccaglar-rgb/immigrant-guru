import { randomUUID } from "node:crypto";
import type { Express, Request } from "express";
import { TradeIdeaStore } from "../services/tradeIdeaStore.ts";
import type { TradeIdeaDirection, TradeIdeaRecord, TradeIdeaStatus } from "../services/tradeIdeaTypes.ts";
import { isScoringMode, normalizeScoringMode, SCORING_MODES } from "../services/scoringMode.ts";
import type { SystemScannerService } from "../services/systemScannerService.ts";

const readUserId = (req: Request): string => {
  const raw = req.headers["x-user-id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return "demo-user";
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDirection = (value: unknown): TradeIdeaDirection => (String(value ?? "").toUpperCase() === "SHORT" ? "SHORT" : "LONG");

const toTimeframe = (value: unknown): TradeIdeaRecord["timeframe"] => {
  const tf = String(value ?? "").trim() as TradeIdeaRecord["timeframe"];
  if (["1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(tf)) return tf;
  return "15m";
};

const toHorizon = (value: unknown): TradeIdeaRecord["horizon"] => {
  const h = String(value ?? "").toUpperCase();
  if (h === "SCALP") return "SCALP";
  if (h === "SWING") return "SWING";
  return "INTRADAY";
};

const toScoringMode = (value: unknown): TradeIdeaRecord["scoring_mode"] =>
  normalizeScoringMode(String(value ?? "").toUpperCase());

const parseLevels = (raw: unknown): number[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "number" || typeof item === "string") return Number(item);
      if (item && typeof item === "object" && "price" in item) return Number((item as { price: unknown }).price);
      return Number.NaN;
    })
    .filter((n) => Number.isFinite(n));
};

const parseApprovedModes = (
  raw: unknown,
  fallback: TradeIdeaRecord["scoring_mode"],
): TradeIdeaRecord["approved_modes"] => {
  if (!Array.isArray(raw)) return [fallback];
  const modes = raw
    .map((value) => normalizeScoringMode(String(value ?? "").toUpperCase()))
    .filter((mode, index, arr) => arr.indexOf(mode) === index);
  if (!modes.length) return [fallback];
  if (!modes.includes(fallback)) modes.push(fallback);
  return modes;
};

const parseModeScores = (raw: unknown): TradeIdeaRecord["mode_scores"] => {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: TradeIdeaRecord["mode_scores"] = {};
  const toRatio = (value: unknown): number => {
    const numeric = toNumber(value, Number.NaN);
    if (!Number.isFinite(numeric)) return Number.NaN;
    const ratio = numeric > 1 ? numeric / 100 : numeric;
    return Math.max(0, Math.min(1, ratio));
  };
  for (const mode of SCORING_MODES) {
    const ratio = toRatio(input[mode]);
    if (Number.isFinite(ratio)) {
      out[mode] = ratio;
    }
  }
  return out;
};

const minutesOfTimeframe = (tf: TradeIdeaRecord["timeframe"]) => {
  if (tf === "1m") return 1;
  if (tf === "5m") return 5;
  if (tf === "15m") return 15;
  if (tf === "30m") return 30;
  if (tf === "1h") return 60;
  if (tf === "4h") return 240;
  return 1440;
};

const deriveUntilUtc = (timestampUtc: string, timeframe: TradeIdeaRecord["timeframe"], bars: number) => {
  const ts = Date.parse(timestampUtc);
  if (!Number.isFinite(ts)) return new Date().toISOString();
  const safeBars = Math.max(1, bars);
  return new Date(ts + (minutesOfTimeframe(timeframe) * safeBars * 60_000)).toISOString();
};

const validStatuses = new Set<TradeIdeaStatus>(["PENDING", "ACTIVE", "RESOLVED", "CANCELLED", "EXPIRED"]);

const normalizeLegacyIdea = (idea: TradeIdeaRecord): TradeIdeaRecord => {
  if (idea.status !== "EXPIRED") return idea;
  return {
    ...idea,
    status: "RESOLVED",
    result: idea.result === "NONE" ? "FAIL" : idea.result,
  };
};

export const registerTradeIdeasRoutes = (app: Express, store: TradeIdeaStore, systemScanner?: SystemScannerService) => {
  // System scan cache endpoint — returns latest background scan results instantly
  app.get("/api/trade-ideas/system-scan", (_req, res) => {
    if (!systemScanner) {
      return res.json({ ok: true, results: [], lastScanAt: 0, universeSize: 0, scanRound: 0, startedAt: 0, totalScansByMode: {} });
    }
    const mode = typeof _req.query.mode === "string" ? _req.query.mode : undefined;
    const cache = systemScanner.getCache();
    const results = mode ? systemScanner.getLatestResults(mode) : cache.results;
    return res.json({
      ok: true,
      results,
      lastScanAt: cache.lastScanAt,
      universeSize: cache.universeSize,
      scanRound: cache.scanRound,
      startedAt: cache.startedAt,
      totalScansByMode: cache.totalScansByMode,
      highScoreByMode: cache.highScoreByMode,
    });
  });

  // ── Report stats — single endpoint returning consistent stats for ALL modes ──
  app.get("/api/trade-ideas/report-stats", async (_req, res) => {
    const ALL_MODES = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as const;
    const cache = systemScanner?.getCache();
    const totalScansByMode = cache?.totalScansByMode ?? {};
    const highScoreByMode = cache?.highScoreByMode ?? {};
    const startedAt = cache?.startedAt ?? 0;

    // Report includes ideas above each mode's TRADE threshold
    const REPORT_MIN_SCORE: Record<string, number> = {
      FLOW: 55,
      AGGRESSIVE: 60,
      BALANCED: 65,
      CAPITAL_GUARD: 68,
    };

    // Only count system-scanner ideas in the report — demo-user ideas are excluded
    // so that totalIdeas never exceeds totalScans (both are scanner-scoped).
    const allIdeas = await store.listIdeas({ userId: "system-scanner", limit: 5000 });
    const sessionIdeas = allIdeas;

    const statsByMode: Record<string, {
      totalScan: number; highScoreScan: number; totalIdeas: number; resolved: number;
      success: number; failed: number; entryMissed: number; successRate: number;
    }> = {};

    for (const mode of ALL_MODES) {
      const minScore = REPORT_MIN_SCORE[mode] ?? 70;
      const modeIdeas = sessionIdeas.filter(
        (i) => normalizeScoringMode(i.scoring_mode) === mode && i.confidence_pct >= minScore,
      );
      // Entry-missed: created but price never reached entry zone
      const isEntryMissed = (i: typeof modeIdeas[number]) =>
        i.result === "FAIL" && !i.activated_at && !i.hit_level_type;
      const entryMissedCount = modeIdeas.filter((i) => isEntryMissed(i)).length;
      // Real trades: ideas that were activated (entry was reached) and resolved
      const activatedIdeas = modeIdeas.filter((i) => !isEntryMissed(i));
      const success = activatedIdeas.filter((i) => i.result === "SUCCESS").length;
      const failed = activatedIdeas.filter((i) => i.result === "FAIL").length;
      const resolved = success + failed;
      statsByMode[mode] = {
        totalScan: totalScansByMode[mode] ?? 0,
        highScoreScan: highScoreByMode[mode] ?? 0,
        totalIdeas: modeIdeas.length,  // ALL session ideas including entry-missed (Ideas >= Entry Missed always)
        resolved,
        success,
        failed,
        entryMissed: entryMissedCount,
        successRate: resolved > 0 ? (success / resolved) * 100 : 0,
      };
    }

    return res.json({ ok: true, statsByMode, startedAt });
  });

  app.post("/api/trade-ideas", async (req, res) => {
    const userId = readUserId(req);
    const symbol = String(req.body?.symbol ?? "").toUpperCase().trim();
    if (!symbol) return res.status(400).json({ ok: false, error: "symbol_required" });
    const scoringMode = toScoringMode(req.body?.scoring_mode ?? req.body?.scoringMode);
    const approvedModes = parseApprovedModes(req.body?.approved_modes ?? req.body?.approvedModes, scoringMode);
    const modeScores = parseModeScores(req.body?.mode_scores ?? req.body?.modeScores);

    const locked = await store.findOpenIdea(userId, symbol, scoringMode);
    if (locked) {
      return res.status(409).json({
        ok: false,
        reason: "SYMBOL_LOCKED",
        symbol,
        scoring_mode: scoringMode,
        locked_idea_id: locked.id,
      });
    }

    const nowIso = new Date().toISOString();
    const timeframe = toTimeframe(req.body?.timeframe);
    const horizon = toHorizon(req.body?.horizon);
    const confidenceRaw = req.body?.confidence_pct ?? req.body?.confidence ?? 0;
    const confidencePct = (() => {
      // If mode_scores has a score for the active mode, use it for consistency
      const modeScoreRaw = modeScores[scoringMode];
      if (typeof modeScoreRaw === "number" && Number.isFinite(modeScoreRaw) && modeScoreRaw > 0) {
        const pct = modeScoreRaw > 1 ? modeScoreRaw : modeScoreRaw * 100;
        return Math.max(0, Math.min(100, Math.round(pct)));
      }
      const n = toNumber(confidenceRaw, 0);
      if (n <= 1) return Math.max(0, Math.min(100, n * 100));
      return Math.max(0, Math.min(100, n));
    })();

    const entryLow = toNumber(req.body?.entry_low ?? req.body?.entry?.low, 0);
    const entryHigh = toNumber(req.body?.entry_high ?? req.body?.entry?.high, 0);
    const slLevels = parseLevels(req.body?.sl_levels ?? req.body?.stops);
    const tpLevels = parseLevels(req.body?.tp_levels ?? req.body?.targets);
    const tradeValidity = String(req.body?.trade_validity ?? req.body?.tradeValidity ?? "WEAK").toUpperCase() === "VALID"
      ? "VALID"
      : String(req.body?.trade_validity ?? req.body?.tradeValidity ?? "WEAK").toUpperCase() === "NO-TRADE"
        ? "NO-TRADE"
        : "WEAK";
    const isNoTradeSignal = tradeValidity === "NO-TRADE";
    const validUntilBars = Math.max(1, Math.round(toNumber(req.body?.valid_until_bars ?? req.body?.validUntilBars, 6)));
    const timestampUtcRaw = String(req.body?.timestamp_utc ?? req.body?.timestampUtc ?? nowIso);
    const timestampUtc = Number.isFinite(Date.parse(timestampUtcRaw)) ? timestampUtcRaw : nowIso;
    const validUntilRaw = String(req.body?.valid_until_utc ?? req.body?.validUntilUtc ?? "");
    const validUntilUtc = Number.isFinite(Date.parse(validUntilRaw))
      ? validUntilRaw
      : deriveUntilUtc(timestampUtc, timeframe, validUntilBars);

    const idea: TradeIdeaRecord = {
      id: randomUUID(),
      user_id: userId,
      symbol,
      direction: toDirection(req.body?.direction),
      confidence_pct: Math.round(confidencePct),
      scoring_mode: scoringMode,
      approved_modes: approvedModes,
      mode_scores: modeScores,
      entry_low: Math.min(entryLow, entryHigh),
      entry_high: Math.max(entryLow, entryHigh),
      sl_levels: slLevels,
      tp_levels: tpLevels,
      status: isNoTradeSignal ? "RESOLVED" : "PENDING",
      created_at: nowIso,
      activated_at: null,
      resolved_at: isNoTradeSignal ? nowIso : null,
      result: "NONE",
      hit_level_type: null,
      hit_level_index: null,
      hit_level_price: null,
      minutes_to_entry: null,
      minutes_to_exit: null,
      minutes_total: null,
      horizon,
      timeframe,
      setup: String(req.body?.setup ?? "VWAP Reclaim with Trend Continuation"),
      trade_validity: tradeValidity,
      entry_window: String(req.body?.entry_window ?? req.body?.entryWindow ?? "NARROW").toUpperCase() === "OPEN"
        ? "OPEN"
        : String(req.body?.entry_window ?? req.body?.entryWindow ?? "NARROW").toUpperCase() === "CLOSED"
          ? "CLOSED"
          : "NARROW",
      slippage_risk: String(req.body?.slippage_risk ?? req.body?.slippageRisk ?? "MED").toUpperCase() === "LOW"
        ? "LOW"
        : String(req.body?.slippage_risk ?? req.body?.slippageRisk ?? "MED").toUpperCase() === "HIGH"
          ? "HIGH"
          : "MED",
      triggers_to_activate: Array.isArray(req.body?.triggers_to_activate ?? req.body?.triggersToActivate)
        ? (req.body?.triggers_to_activate ?? req.body?.triggersToActivate).map((v: unknown) => String(v)).slice(0, 4)
        : [],
      invalidation: String(req.body?.invalidation ?? "Invalidation not provided"),
      timestamp_utc: timestampUtc,
      valid_until_bars: validUntilBars,
      valid_until_utc: validUntilUtc,
      market_state: {
        trend: String(req.body?.market_state?.trend ?? req.body?.marketState?.trend ?? "N/A"),
        htfBias: String(req.body?.market_state?.htfBias ?? req.body?.marketState?.htfBias ?? "N/A"),
        volatility: String(req.body?.market_state?.volatility ?? req.body?.marketState?.volatility ?? "N/A"),
        execution: String(req.body?.market_state?.execution ?? req.body?.marketState?.execution ?? "N/A"),
      },
      flow_analysis: Array.isArray(req.body?.flow_analysis ?? req.body?.flowAnalysis)
        ? (req.body?.flow_analysis ?? req.body?.flowAnalysis).map((v: unknown) => String(v)).slice(0, 8)
        : [],
      trade_intent: Array.isArray(req.body?.trade_intent ?? req.body?.tradeIntent)
        ? (req.body?.trade_intent ?? req.body?.tradeIntent).map((v: unknown) => String(v)).slice(0, 8)
        : [],
      raw_text: String(req.body?.raw_text ?? req.body?.rawText ?? ""),
      incomplete: Boolean(req.body?.incomplete),
      price_precision: (() => {
        const pp = Number(req.body?.price_precision ?? req.body?.pricePrecision);
        return Number.isFinite(pp) && pp >= 0 && pp <= 18 ? pp : undefined;
      })(),
    };

    const initialPrice = Number(((idea.entry_low + idea.entry_high) / 2).toFixed(8));
    try {
      await store.createIdea(idea, initialPrice);
      return res.json({ ok: true, idea: normalizeLegacyIdea(idea) });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "trade_idea_create_failed",
      });
    }
  });

  app.get("/api/trade-ideas", async (req, res) => {
    const userId = readUserId(req);
    const statuses = String(req.query.status ?? "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item): item is TradeIdeaStatus => validStatuses.has(item as TradeIdeaStatus));
    const symbol = String(req.query.symbol ?? "").toUpperCase().trim();
    const scoringModeRaw = String(req.query.scoring_mode ?? req.query.scoringMode ?? "").toUpperCase().trim();
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit ?? 100)));
    const items = await store.listIdeas({
      userId,
      statuses: statuses.length ? statuses : undefined,
      symbol: symbol || undefined,
      scoringMode: isScoringMode(scoringModeRaw) ? scoringModeRaw : undefined,
      limit,
    });
    return res.json({ ok: true, items: items.map((idea) => normalizeLegacyIdea(idea)) });
  });

  app.get("/api/trade-ideas/locks", async (req, res) => {
    const userId = readUserId(req);
    const items = await store.listLocks(userId);
    return res.json({ ok: true, items });
  });

  app.delete("/api/trade-ideas", async (req, res) => {
    const userId = readUserId(req);
    const result = await store.clearUserIdeas(userId);
    return res.json({ ok: true, ...result });
  });

  /** Reset everything: clear ALL trade ideas + reset scanner stats */
  app.post("/api/trade-ideas/reset", async (_req, res) => {
    const result = await store.clearAll();
    if (systemScanner) systemScanner.resetStats();
    console.log(`[Reset] Cleared ${result.deletedIdeas} ideas, ${result.deletedEvents} events — scanner stats zeroed`);
    return res.json({ ok: true, ...result });
  });

  app.get("/api/trade-ideas/:id/events", async (req, res) => {
    const userId = readUserId(req);
    const id = String(req.params.id ?? "");
    const idea = await store.getIdea(id);
    if (!idea || idea.user_id !== userId) return res.status(404).json({ ok: false, error: "idea_not_found" });
    const events = await store.listEvents(id);
    return res.json({ ok: true, events });
  });

  app.get("/api/trade-ideas/:id", async (req, res) => {
    const userId = readUserId(req);
    const id = String(req.params.id ?? "");
    const idea = await store.getIdea(id);
    if (!idea || idea.user_id !== userId) return res.status(404).json({ ok: false, error: "idea_not_found" });
    return res.json({ ok: true, idea: normalizeLegacyIdea(idea) });
  });
};
