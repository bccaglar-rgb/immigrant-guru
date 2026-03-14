import type { DashboardSnapshot, FeedConfig, FeedKey, IndicatorsState, TileState } from "../types";
import { CONFIDENCE_CAP_PERCENT, CORE_FEEDS, STALE_THRESHOLD_SEC, liquidityDistanceToDensity } from "./thresholds";

export interface CoherenceConfig {
  symbol: string;
  timeframe: string;
  lookbackBars: number;
  horizon: string;
  riskMode: string;
  breakoutOnly: boolean;
}

export interface NormalizeInput {
  snapshot: DashboardSnapshot;
  feeds: FeedConfig;
  indicators: IndicatorsState;
  config: CoherenceConfig;
}

export interface NormalizedState extends DashboardSnapshot {
  configSnapshot: string;
}

const cap = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const tileMapOf = (tiles: TileState[]): Record<string, TileState> =>
  tiles.reduce((acc, tile) => {
    acc[tile.key] = tile;
    return acc;
  }, {} as Record<string, TileState>);

const tileState = (tiles: Record<string, TileState>, key: string): string => tiles[key]?.state ?? "N/A";

const tileValue = (tiles: Record<string, TileState>, key: string): number | null => {
  const v = tiles[key]?.value;
  return typeof v === "number" ? v : null;
};

const normalizeSum100 = <T extends string>(obj: Record<T, number>): Record<T, number> => {
  const keys = Object.keys(obj) as T[];
  const total = keys.reduce((sum, key) => sum + obj[key], 0);
  if (total === 100) return obj;
  if (total <= 0) {
    const even = Math.floor(100 / keys.length);
    const out = {} as Record<T, number>;
    keys.forEach((key, idx) => {
      out[key] = idx === keys.length - 1 ? 100 - even * (keys.length - 1) : even;
    });
    return out;
  }

  const out = {} as Record<T, number>;
  let assigned = 0;
  keys.forEach((key, idx) => {
    if (idx === keys.length - 1) {
      out[key] = 100 - assigned;
    } else {
      out[key] = Math.round((obj[key] / total) * 100);
      assigned += out[key];
    }
  });
  return out;
};

export const normalizeDashboardState = ({ snapshot, feeds, indicators, config }: NormalizeInput): NormalizedState => {
  const normalized: DashboardSnapshot = {
    ...snapshot,
    tiles: snapshot.tiles.map((tile) => ({ ...tile })),
    aiPanel: { ...snapshot.aiPanel },
    dataHealth: {
      ...snapshot.dataHealth,
      feedSources: { ...snapshot.dataHealth.feedSources },
    },
    keyLevels: [...snapshot.keyLevels],
    ohlcv: [...snapshot.ohlcv],
  };

  let tiles = tileMapOf(normalized.tiles);

  // Indicator master consistency: hide all indicator-derived outputs when master is OFF.
  if (!indicators.masterEnabled) {
    normalized.tiles = normalized.tiles.map((tile) => {
      if (!tile.requiresIndicators) return tile;
      return {
        ...tile,
        state: "N/A",
        value: undefined,
        confidence: 0,
        rawValue: "Indicators master OFF",
        shortExplanation: "Indicator-derived signal disabled by master switch.",
      };
    });
    tiles = tileMapOf(normalized.tiles);
  }

  // Rule 1: model agreement totals
  const m = normalized.aiPanel.modelAgreement;
  const totalModels = Math.max(1, m.totalModels || 6);
  const aligned = cap(Math.round(m.aligned || 0), 0, totalModels);
  const neutral = cap(Math.round(m.neutral || 0), 0, totalModels);
  const opposite = cap(Math.round(m.opposite || 0), 0, totalModels);
  const sumKnown = aligned + neutral + opposite;
  const unknown = sumKnown > totalModels ? 0 : totalModels - sumKnown;
  normalized.aiPanel.modelAgreement = {
    totalModels,
    aligned: sumKnown > totalModels ? cap(totalModels - neutral - opposite, 0, totalModels) : aligned,
    neutral,
    opposite,
    unknown,
    direction: normalized.aiPanel.modelAgreement.direction,
  };

  // Rule 3: time-in-range consistency
  const regime = tileState(tiles, "market-regime");
  if (regime !== "RANGE" && tiles["time-in-range"]) {
    tiles["time-in-range"].value = 0;
    tiles["time-in-range"].rawValue = "0 bars";
    tiles["time-in-range"].shortExplanation = "Normalized by coherence engine: active regime is not RANGE.";
    normalized.aiPanel.timeContextSummary = normalized.aiPanel.timeContextSummary.replace(/Time in range \d+ bars/, "Time in range 0 bars");
  }

  // Rule 4: liquidity density mapping by distance thresholds
  const liqDistance = tileValue(tiles, "liquidity-distance");
  if (liqDistance !== null && tiles["liquidity-density"]) {
    tiles["liquidity-density"].state = liquidityDistanceToDensity(liqDistance);
    tiles["liquidity-density"].shortExplanation = "Deterministically mapped from Liquidity Distance thresholds.";
  }

  // Rule 5: urgency vs validity
  const validity = normalized.aiPanel.tradeValidity;
  const entryWindow = tileState(tiles, "entry-timing-window");
  const slippage = tileState(tiles, "slippage-risk");
  const stress = tileState(tiles, "market-stress-level");

  if (validity === "NO-TRADE" && ["ACT", "PREPARE"].includes(normalized.aiPanel.executionUrgency)) {
    normalized.aiPanel.executionUrgency = stress === "HIGH" ? "WAIT" : "WATCH";
  }
  if (entryWindow === "CLOSED" && slippage === "HIGH") {
    normalized.aiPanel.executionUrgency = "WAIT";
  }

  // Rule 2: unmet trigger conditions only
  const desiredConditions = [
    { label: "Entry window OPEN", met: entryWindow === "OPEN" },
    { label: "Slippage <= MED", met: slippage === "LOW" || slippage === "MED" },
    { label: "Liquidity density >= MID", met: ["MID", "HIGH"].includes(tileState(tiles, "liquidity-density")) },
  ];
  const unmetTriggers = desiredConditions.filter((condition) => !condition.met).map((condition) => condition.label);
  normalized.aiPanel.unmetTriggers = unmetTriggers;
  normalized.aiPanel.triggerConditions = unmetTriggers;

  // Enforce percent blocks to sum 100.
  normalized.aiPanel.confidenceDrivers = normalizeSum100(normalized.aiPanel.confidenceDrivers);
  normalized.aiPanel.scenarioOutlook = normalizeSum100(normalized.aiPanel.scenarioOutlook);

  // Rule 6: confidence capping by data health / core feed state.
  const coreDisabled = CORE_FEEDS.some((feed) => !feeds[feed as FeedKey]);
  const staleByAge = normalized.dataHealth.lastUpdateAgeSec > STALE_THRESHOLD_SEC;
  const staleAny = normalized.dataHealth.staleFeed || staleByAge;
  const missingCoreData = CORE_FEEDS.some((feed) => {
    const key = feed as FeedKey;
    if (!feeds[key]) return true;
    return !normalized.dataHealth.feedSources[key]?.healthy;
  });
  const unhealthy = coreDisabled || staleAny || missingCoreData;

  if (unhealthy) {
    const preCapConsensus = normalized.aiPanel.signalConsensus;
    normalized.tiles = normalized.tiles.map((tile) => ({
      ...tile,
      confidence: Math.min(tile.confidence, CONFIDENCE_CAP_PERCENT),
    }));

    normalized.aiPanel.signalConsensus = Math.min(normalized.aiPanel.signalConsensus, CONFIDENCE_CAP_PERCENT);
    normalized.aiPanel.confidenceBand = [
      Math.min(normalized.aiPanel.confidenceBand[0], CONFIDENCE_CAP_PERCENT),
      Math.min(normalized.aiPanel.confidenceBand[1], CONFIDENCE_CAP_PERCENT),
    ];
    normalized.aiPanel.confidenceCapped = true;
    if (normalized.aiPanel.signalConsensus < preCapConsensus) {
      normalized.aiPanel.consensusEngine.formulaLine = `${normalized.aiPanel.consensusEngine.formulaLine} | Health cap applied: ${normalized.aiPanel.signalConsensus}%`;
    }
  } else {
    normalized.aiPanel.confidenceCapped = false;
  }

  // Add tile provenance from data health map.
  normalized.tiles = normalized.tiles.map((tile) => {
    const sourceFeed = tile.dependsOnFeeds[0];
    const sourceHealth = sourceFeed ? normalized.dataHealth.feedSources[sourceFeed] : undefined;
    const stale = sourceFeed
      ? !feeds[sourceFeed] || !sourceHealth?.healthy || normalized.dataHealth.lastUpdateAgeSec > STALE_THRESHOLD_SEC
      : normalized.dataHealth.lastUpdateAgeSec > STALE_THRESHOLD_SEC;

    return {
      ...tile,
      source: sourceHealth?.source ?? "Derived Engine",
      stale,
    };
  });

  const configSnapshot = `${config.symbol} · ${config.timeframe} · ${config.lookbackBars} bars · ${config.horizon} · ${config.riskMode} · Breakout ${config.breakoutOnly ? "ON" : "OFF"}`;

  return {
    ...normalized,
    configSnapshot,
  };
};
