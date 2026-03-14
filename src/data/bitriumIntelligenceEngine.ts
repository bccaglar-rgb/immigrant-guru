import { ADVANCED_TILES, TILE_DEFINITIONS } from "./tileDefinitions.ts";
import { calculateEma, calculateVwap, deriveKeyLevels, generateAiPanel } from "./liveConsensusEngine.ts";
import type {
  ConsensusInputConfig,
  DashboardSnapshot,
  DataHealthState,
  FeedConfig,
  FeedKey,
  FlowSignalInputsConfig,
  FlowSignalWeightsConfig,
  IndicatorsState,
  OhlcvPoint,
  RiskChecksInputsConfig,
  ScoringMode,
  ScenarioConfig,
  TileState,
} from "../types";

export interface LiveOrderbook {
  spreadBps: number;
  depthUsd: number;
  imbalance: number;
}

export interface LiveTrades {
  deltaBtc1m: number;
  volumeBtc1m: number;
  speedTpm: number;
  volumeZ: number;
}

export interface LiveDerivatives {
  fundingRate: number | null;
  oiValue: number | null;
  oiChange1h: number | null;
  liquidationUsd?: number | null;
}

export interface LiveOnChain {
  exchangeNetflowUsd?: number | null;
  exchangeInflowUsd?: number | null;
  exchangeOutflowUsd?: number | null;
  whaleTxCount?: number | null;
  walletConcentrationPct?: number | null;
  activeAddresses?: number | null;
  nvtRatio?: number | null;
  mvrvRatio?: number | null;
  dormancyDays?: number | null;
}

export interface IntelligenceLiveState {
  ohlcv?: OhlcvPoint[];
  orderbook?: LiveOrderbook;
  trades?: LiveTrades;
  derivatives?: LiveDerivatives;
  onchain?: LiveOnChain;
  lastSeen: Partial<Record<FeedKey, number>>;
  latencyMs?: number;
  feedLatencyMs?: number;
  uiLatencyMs?: number;
}

const sourceLabels: Record<FeedKey, string> = {
  priceOhlcv: "MarketDataRouter: OHLCV",
  orderbook: "MarketDataRouter: Orderbook",
  trades: "MarketDataRouter: Trades",
  rawFeeds: "MarketDataRouter: Raw",
  openInterest: "MarketDataRouter: OI",
  fundingRate: "MarketDataRouter: Funding",
  netFlow: "MarketDataRouter: NetFlow",
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const computeAtrPct = (series: OhlcvPoint[], period = 14): number | null => {
  if (series.length < period + 2) return null;
  let trSum = 0;
  for (let i = series.length - period; i < series.length; i += 1) {
    const curr = series[i];
    const prevClose = series[i - 1].close;
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prevClose), Math.abs(curr.low - prevClose));
    trSum += tr;
  }
  const atr = trSum / period;
  const close = series[series.length - 1].close;
  return close > 0 ? (atr / close) * 100 : null;
};

const updateTile = (
  tiles: TileState[],
  key: string,
  patch: Partial<Pick<TileState, "state" | "value" | "unit" | "confidence" | "rawValue" | "shortExplanation" | "source" | "stale">>,
): TileState[] =>
  tiles.map((tile) => (tile.key === key
    ? {
        ...tile,
        ...patch,
        updatedAt: new Date().toISOString(),
      }
    : tile));

export const computeHealthFromLive = (feeds: FeedConfig, live: IntelligenceLiveState): DataHealthState => {
  const now = Date.now();
  const enabledFeeds = (Object.keys(feeds) as FeedKey[]).filter((feed) => feeds[feed]);
  const requiredEnabledFeeds = enabledFeeds.filter((feed) => feed !== "rawFeeds" && feed !== "netFlow");
  const healthFeeds = requiredEnabledFeeds.length ? requiredEnabledFeeds : enabledFeeds;

  const ages = healthFeeds.map((feed) => {
    const seen = live.lastSeen[feed];
    if (!seen) return 999;
    return Math.max(0, (now - seen) / 1000);
  });

  const maxAge = ages.length ? Math.max(...ages) : 0;
  const missingFields = ages.filter((age) => age >= 999).length;
  const staleFeed = maxAge > 20;

  const feedSources = (Object.keys(feeds) as FeedKey[]).reduce<DataHealthState["feedSources"]>((acc, feed) => {
    const seen = live.lastSeen[feed];
    const age = seen ? (now - seen) / 1000 : 999;
    acc[feed] = {
      source: sourceLabels[feed],
      healthy: !feeds[feed] || age <= 20,
    };
    return acc;
  }, {} as DataHealthState["feedSources"]);

  const feedLatencyMs = isFiniteNumber(live.feedLatencyMs) ? Math.max(0, Math.round(live.feedLatencyMs)) : 0;
  const uiLatencyMs = isFiniteNumber(live.uiLatencyMs) ? Math.max(0, Math.round(live.uiLatencyMs)) : undefined;

  return {
    latencyMs: feedLatencyMs,
    feedLatencyMs,
    uiLatencyMs,
    lastUpdateAgeSec: Math.round(maxAge),
    staleFeed,
    missingFields,
    updatedAt: new Date().toISOString(),
    feedSources,
  };
};

export const createNoMockBaseline = (
  consensusInputs: ConsensusInputConfig,
  scoringMode: ScoringMode,
  flowSignalInputs?: FlowSignalInputsConfig,
  flowSignalWeights?: FlowSignalWeightsConfig,
  riskChecksInputs?: RiskChecksInputsConfig,
): Pick<DashboardSnapshot, "tiles" | "aiPanel" | "ohlcv" | "keyLevels"> => {
  const updatedAt = new Date().toISOString();
  const tiles: TileState[] = Object.values(TILE_DEFINITIONS).map((def) => ({
    key: def.key,
    label: def.label,
    category: def.category,
    state: "N/A",
    confidence: 0,
    rawValue: "No live data",
    shortExplanation: "No live packet received yet.",
    source: def.dependsOnFeeds.length
      ? def.dependsOnFeeds.map((feed) => sourceLabels[feed]).join(" + ")
      : "MarketDataRouter",
    stale: false,
    updatedAt,
    advanced: ADVANCED_TILES.includes(def.key),
    dependsOnFeeds: def.dependsOnFeeds,
    unit: def.unit,
    requiresIndicators: def.requiresIndicators,
  }));
  const aiPanel = generateAiPanel(
    tiles,
    { horizon: "INTRADAY", riskMode: "NORMAL", breakoutOnly: false },
    {
      priceOhlcv: true,
      orderbook: true,
      trades: true,
      rawFeeds: false,
      openInterest: true,
      fundingRate: true,
      netFlow: false,
    },
    consensusInputs,
    undefined,
    scoringMode,
    flowSignalInputs,
    flowSignalWeights,
    riskChecksInputs,
  );
  return { tiles, aiPanel, ohlcv: [], keyLevels: [] };
};

const applyLiveOverrides = (
  snapshot: DashboardSnapshot,
  feeds: FeedConfig,
  scenario: ScenarioConfig,
  indicators: IndicatorsState,
  consensusInputs: ConsensusInputConfig,
  scoringMode: ScoringMode,
  flowSignalInputs: FlowSignalInputsConfig | undefined,
  flowSignalWeights: FlowSignalWeightsConfig | undefined,
  riskChecksInputs: RiskChecksInputsConfig | undefined,
  live: IntelligenceLiveState,
): DashboardSnapshot => {
  let tiles = snapshot.tiles;
  const hasLive = !!live.ohlcv || !!live.orderbook || !!live.trades || !!live.derivatives;
  if (!hasLive) return snapshot;

  const ohlcv = live.ohlcv && live.ohlcv.length > 20 ? live.ohlcv : snapshot.ohlcv;
  const keyLevels = deriveKeyLevels(ohlcv);

  const close = ohlcv[ohlcv.length - 1]?.close ?? 0;
  const ema20 = calculateEma(ohlcv, 20).at(-1)?.value ?? close;
  const vwap = calculateVwap(ohlcv).at(-1)?.value ?? close;
  const trendPct = close > 0 ? ((close - ema20) / close) * 100 : 0;
  const atrPct = computeAtrPct(ohlcv) ?? 1;

  const trendDirection = trendPct > 0.2 ? "UP" : trendPct < -0.2 ? "DOWN" : "NEUTRAL";
  const trendStrength = Math.abs(trendPct) > 1.0 ? "STRONG" : Math.abs(trendPct) > 0.35 ? "MID" : "WEAK";
  const atrRegime = atrPct > 1.5 ? "HIGH" : atrPct > 0.8 ? "NORMAL" : "LOW";
  const marketRegime = Math.abs(trendPct) > 0.9 ? "TREND" : atrPct < 0.7 ? "RANGE" : "CHOP";
  const rangeBars = ohlcv
    .slice(-80)
    .filter((point) => Math.abs(((point.close - ema20) / Math.max(1, ema20)) * 100) <= 0.35).length;
  const structureAge = ohlcv.length < 30 ? "NEW" : ohlcv.length < 120 ? "DEVELOPING" : "MATURE";
  const vwapState = close > vwap * 1.0008 ? "ABOVE" : close < vwap * 0.9992 ? "BELOW" : "AROUND";

  let slippageState: "LOW" | "MED" | "HIGH" = "MED";
  let orderbookState: "STABLE" | "SHIFTING" | "SPOOF_RISK" = "SHIFTING";
  let tradeSide: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  let speedState: "SLOW" | "NORMAL" | "FAST" | "VIOLENT" = "NORMAL";
  let oiState: "UP" | "DOWN" | "FLAT" = "FLAT";
  let fundingState: "CROWDED_LONG" | "CROWDED_SHORT" | "NEUTRAL" = "NEUTRAL";

  tiles = updateTile(tiles, "trend-direction", {
    state: trendDirection,
    confidence: 80,
    rawValue: `price_vs_ema20=${trendPct.toFixed(2)}%`,
    shortExplanation: "Derived from live price distance to EMA20.",
  });

  tiles = updateTile(tiles, "trend-strength", {
    state: trendStrength,
    confidence: 76,
    rawValue: `ema_drift=${trendPct.toFixed(2)}%`,
    shortExplanation: "Magnitude of short-term trend displacement.",
  });

  tiles = updateTile(tiles, "ema-alignment", {
    state: trendDirection === "UP" ? "BULL" : trendDirection === "DOWN" ? "BEAR" : "MIXED",
    confidence: 79,
    rawValue: `ema20=${ema20.toFixed(2)} close=${close.toFixed(2)}`,
    shortExplanation: "Live EMA20 alignment snapshot.",
  });

  tiles = updateTile(tiles, "atr-regime", {
    state: atrRegime,
    confidence: 77,
    rawValue: `atr_pct=${atrPct.toFixed(2)}%`,
    shortExplanation: "ATR(14) computed from live kline buffer.",
  });

  tiles = updateTile(tiles, "compression", {
    state: atrPct < 0.8 ? "ON" : "OFF",
    confidence: 73,
    rawValue: `atr_pct=${atrPct.toFixed(2)}%`,
    shortExplanation: "Low ATR implies compression regime.",
  });

  tiles = updateTile(tiles, "market-regime", {
    state: marketRegime,
    confidence: 79,
    rawValue: `trend_pct=${trendPct.toFixed(2)} atr_pct=${atrPct.toFixed(2)}`,
    shortExplanation: "Regime from trend displacement + volatility regime.",
  });

  tiles = updateTile(tiles, "structure-age", {
    state: structureAge,
    confidence: 74,
    rawValue: `bars=${ohlcv.length}`,
    shortExplanation: "Structure age estimated from available live bars.",
  });

  tiles = updateTile(tiles, "time-in-range", {
    value: marketRegime === "RANGE" ? rangeBars : 0,
    unit: "bars",
    confidence: 72,
    rawValue: `${marketRegime === "RANGE" ? rangeBars : 0} bars`,
    shortExplanation: "Recent bars staying close to short-term mean.",
  });

  tiles = updateTile(tiles, "vwap-position", {
    state: vwapState,
    confidence: 76,
    rawValue: `price=${close.toFixed(2)} vwap=${vwap.toFixed(2)}`,
    shortExplanation: "Live price location against VWAP.",
  });

  if (live.orderbook) {
    const spreadState = live.orderbook.spreadBps < 3 ? "TIGHT" : live.orderbook.spreadBps < 8 ? "NORMAL" : "WIDE";
    const depthState = live.orderbook.depthUsd > 80_000_000 ? "GOOD" : live.orderbook.depthUsd > 35_000_000 ? "OK" : "POOR";
    const obState = live.orderbook.imbalance > 0.08 ? "BUY" : live.orderbook.imbalance < -0.08 ? "SELL" : "NEUTRAL";
    slippageState = spreadState === "WIDE" || depthState === "POOR" ? "HIGH" : spreadState === "NORMAL" ? "MED" : "LOW";
    orderbookState = spreadState === "WIDE" || depthState === "POOR" ? "SPOOF_RISK" : spreadState === "NORMAL" ? "SHIFTING" : "STABLE";
    const liquidityDensity = depthState === "GOOD" ? "HIGH" : depthState === "OK" ? "MID" : "LOW";
    const liquidityDistance = spreadState === "TIGHT" ? 0.24 : spreadState === "NORMAL" ? 0.72 : 1.36;

    tiles = updateTile(tiles, "spread-regime", {
      state: spreadState,
      confidence: 82,
      rawValue: `${live.orderbook.spreadBps.toFixed(2)} bps`,
      shortExplanation: "Best bid/ask spread from live depth stream.",
    });

    tiles = updateTile(tiles, "depth-quality", {
      state: depthState,
      confidence: 80,
      rawValue: `$${Math.round(live.orderbook.depthUsd / 1_000_000)}M`,
      shortExplanation: "Top-20 book notional depth.",
    });

    tiles = updateTile(tiles, "orderbook-imbalance", {
      state: obState,
      confidence: 78,
      rawValue: `imbalance=${live.orderbook.imbalance.toFixed(2)}`,
      shortExplanation: "Bid vs ask depth asymmetry.",
    });

    tiles = updateTile(tiles, "slippage-risk", {
      state: slippageState,
      confidence: 74,
      rawValue: `spread=${live.orderbook.spreadBps.toFixed(2)} depth=$${Math.round(live.orderbook.depthUsd / 1_000_000)}M`,
      shortExplanation: "Spread + depth based impact proxy.",
    });

    tiles = updateTile(tiles, "orderbook-stability", {
      state: orderbookState,
      confidence: 73,
      rawValue: `spread=${spreadState} depth=${depthState}`,
      shortExplanation: "Stability inferred from spread and top-book depth.",
    });

    tiles = updateTile(tiles, "liquidity-density", {
      state: liquidityDensity,
      confidence: 75,
      rawValue: `depth=${depthState}`,
      shortExplanation: "Liquidity concentration around executable zones.",
    });

    tiles = updateTile(tiles, "liquidity-distance", {
      value: liquidityDistance,
      unit: "%",
      confidence: 70,
      rawValue: `${liquidityDistance.toFixed(2)}%`,
      shortExplanation: "Approximate distance to nearest dense liquidity pocket.",
    });
  }

  if (live.trades) {
    const side = live.trades.deltaBtc1m > 15 ? "BUY" : live.trades.deltaBtc1m < -15 ? "SELL" : "NEUTRAL";
    const speed = live.trades.speedTpm > 520 ? "VIOLENT" : live.trades.speedTpm > 360 ? "FAST" : live.trades.speedTpm > 180 ? "NORMAL" : "SLOW";
    tradeSide = side;
    speedState = speed;

    tiles = updateTile(tiles, "buy-sell-imbalance", {
      state: side,
      confidence: 79,
      rawValue: `delta_1m=${live.trades.deltaBtc1m.toFixed(2)} BTC`,
      shortExplanation: "Aggressive taker imbalance over 1m.",
    });

    tiles = updateTile(tiles, "volume-spike", {
      state: live.trades.volumeZ > 1.1 ? "ON" : "OFF",
      confidence: 75,
      rawValue: `z=${live.trades.volumeZ.toFixed(2)} vol_1m=${live.trades.volumeBtc1m.toFixed(2)} BTC`,
      shortExplanation: "Rolling 1m volume anomaly score.",
    });

    tiles = updateTile(tiles, "market-speed", {
      state: speed,
      confidence: 77,
      rawValue: `tpm=${Math.round(live.trades.speedTpm)}`,
      shortExplanation: "Trade prints per minute from spot tape.",
    });

    tiles = updateTile(tiles, "breakout-risk", {
      state: speed === "VIOLENT" || speed === "FAST" ? "HIGH" : speed === "NORMAL" ? "MED" : "LOW",
      confidence: 72,
      rawValue: `speed=${Math.round(live.trades.speedTpm)} atr=${atrPct.toFixed(2)}%`,
      shortExplanation: "Execution speed + volatility breakout pressure.",
      source: sourceLabels.trades,
      stale: false,
    });

    const fakeBreakoutState =
      (orderbookState === "SPOOF_RISK" && (speed === "FAST" || speed === "VIOLENT")) || slippageState === "HIGH"
        ? "HIGH"
        : (marketRegime === "RANGE" && speed !== "SLOW") || orderbookState === "SHIFTING"
          ? "MED"
          : "LOW";

    tiles = updateTile(tiles, "fake-breakout-prob", {
      state: fakeBreakoutState,
      confidence: 72,
      rawValue: `regime=${marketRegime} speed=${speed} book=${orderbookState} slippage=${slippageState}`,
      shortExplanation: "Fake-breakout risk from regime, tape speed, orderbook behavior and slippage.",
      source: sourceLabels.trades,
      stale: false,
    });

    const expansionState =
      (atrRegime === "LOW" && live.trades.volumeZ > 1.1) || speed === "VIOLENT"
        ? "HIGH"
        : speed === "FAST" || live.trades.volumeZ > 0.6
          ? "MED"
          : "LOW";

    tiles = updateTile(tiles, "expansion-prob", {
      state: expansionState,
      confidence: 70,
      rawValue: `atr=${atrRegime} vol_z=${live.trades.volumeZ.toFixed(2)} speed=${speed}`,
      shortExplanation: "Expansion probability from ATR regime, tape speed and live volume anomaly.",
      source: sourceLabels.trades,
      stale: false,
    });
  }

  if (live.derivatives) {
    let fundingRatePct = 0;
    if (typeof live.derivatives.oiChange1h === "number") {
      const oiStateLive = live.derivatives.oiChange1h > 0.6 ? "UP" : live.derivatives.oiChange1h < -0.6 ? "DOWN" : "FLAT";
      oiState = oiStateLive;
      tiles = updateTile(tiles, "oi-change", {
        state: oiStateLive,
        confidence: 76,
        rawValue: `${live.derivatives.oiChange1h.toFixed(2)}%`,
        shortExplanation: "1h open interest change from futures poll.",
      });
    }

    if (typeof live.derivatives.fundingRate === "number") {
      const ratePct = live.derivatives.fundingRate * 100;
      fundingRatePct = ratePct;
      const fundingStateLive = ratePct > 0.015 ? "CROWDED_LONG" : ratePct < -0.015 ? "CROWDED_SHORT" : "NEUTRAL";
      fundingState = fundingStateLive;
      tiles = updateTile(tiles, "funding-bias", {
        state: fundingStateLive,
        confidence: 74,
        rawValue: `${ratePct.toFixed(4)}%`,
        shortExplanation: "Latest 8h funding from perp premium index.",
      });

      const fundingSlopeState =
        ratePct >= 0.03 && oiState === "UP"
          ? "STEEP_UP"
          : ratePct <= -0.03 && oiState === "UP"
            ? "STEEP_DOWN"
            : ratePct > 0.008
              ? "UP"
              : ratePct < -0.008
                ? "DOWN"
                : "FLAT";
      tiles = updateTile(tiles, "funding-slope", {
        state: fundingSlopeState,
        confidence: 72,
        rawValue: `${ratePct.toFixed(4)}% · oi=${oiState}`,
        shortExplanation: "Funding slope from funding-rate drift with OI confirmation.",
      });
    }

    if (typeof live.derivatives.liquidationUsd === "number") {
      const liquidation = live.derivatives.liquidationUsd;
      const liqState =
        liquidation >= 2_000_000 && trendDirection === "DOWN"
          ? "LONGS_FLUSHED"
          : liquidation >= 2_000_000 && trendDirection === "UP"
            ? "SHORTS_FLUSHED"
            : liquidation >= 500_000 && trendDirection === "DOWN"
              ? "LONG_PRESSURE"
              : liquidation >= 500_000 && trendDirection === "UP"
                ? "SHORT_PRESSURE"
                : "BALANCED";
      tiles = updateTile(tiles, "liquidations-bias", {
        state: liqState,
        confidence: liquidation >= 2_000_000 ? 78 : 70,
        rawValue: `$${Math.round(liquidation).toLocaleString()} · funding=${fundingRatePct.toFixed(4)}%`,
        shortExplanation: "Liquidation-side pressure estimate from live liquidation notional.",
      });
    }
  }

  if (live.onchain) {
    const netflow =
      isFiniteNumber(live.onchain.exchangeNetflowUsd)
        ? live.onchain.exchangeNetflowUsd
        : isFiniteNumber(live.onchain.exchangeInflowUsd) && isFiniteNumber(live.onchain.exchangeOutflowUsd)
          ? live.onchain.exchangeInflowUsd - live.onchain.exchangeOutflowUsd
          : null;
    if (netflow !== null) {
      const absNetflow = Math.abs(netflow);
      const netflowState = absNetflow < 100_000 ? "BALANCED" : netflow > 0 ? "INFLOW_DOMINANT" : "OUTFLOW_DOMINANT";
      const confidence = absNetflow > 5_000_000 ? 80 : absNetflow > 1_000_000 ? 74 : 68;
      tiles = updateTile(tiles, "exchange-inflow-outflow", {
        state: netflowState,
        confidence,
        rawValue: `netflow=$${Math.round(netflow).toLocaleString()}`,
        shortExplanation: "Net exchange flow from configured on-chain provider.",
      });
    }

    if (isFiniteNumber(live.onchain.whaleTxCount)) {
      const whales = live.onchain.whaleTxCount;
      const state = whales >= 120 ? "VERY_HIGH" : whales >= 60 ? "HIGH" : whales >= 20 ? "NORMAL" : "LOW";
      tiles = updateTile(tiles, "whale-activity", {
        state,
        confidence: whales >= 60 ? 79 : 72,
        rawValue: `${Math.round(whales)} tx`,
        shortExplanation: "Large transfer activity from on-chain flow stream.",
      });
    }

    if (isFiniteNumber(live.onchain.walletConcentrationPct)) {
      const concentration = live.onchain.walletConcentrationPct;
      const state = concentration >= 65 ? "HIGH_CONCENTRATION" : concentration >= 45 ? "BALANCED" : "DISTRIBUTED";
      tiles = updateTile(tiles, "wallet-distribution", {
        state,
        confidence: 74,
        rawValue: `${concentration.toFixed(2)}%`,
        shortExplanation: "Holder concentration snapshot from on-chain provider.",
      });
    }

    if (isFiniteNumber(live.onchain.activeAddresses)) {
      tiles = updateTile(tiles, "active-addresses", {
        value: live.onchain.activeAddresses,
        unit: "addr",
        confidence: 76,
        rawValue: Math.round(live.onchain.activeAddresses).toLocaleString(),
        shortExplanation: "Active address count sourced from on-chain metrics.",
      });
    }

    if (isFiniteNumber(live.onchain.nvtRatio)) {
      tiles = updateTile(tiles, "nvt-ratio", {
        value: live.onchain.nvtRatio,
        confidence: 73,
        rawValue: live.onchain.nvtRatio.toFixed(2),
        shortExplanation: "Network value to transactions ratio (live on-chain feed).",
      });
    }

    if (isFiniteNumber(live.onchain.mvrvRatio)) {
      tiles = updateTile(tiles, "mvrv-ratio", {
        value: live.onchain.mvrvRatio,
        confidence: 73,
        rawValue: live.onchain.mvrvRatio.toFixed(2),
        shortExplanation: "MVRV ratio from configured on-chain provider.",
      });
    }

    if (isFiniteNumber(live.onchain.dormancyDays)) {
      tiles = updateTile(tiles, "dormancy", {
        value: live.onchain.dormancyDays,
        unit: "days",
        confidence: 71,
        rawValue: `${live.onchain.dormancyDays.toFixed(2)} days`,
        shortExplanation: "Coin dormancy age from on-chain activity.",
      });
    }
  }

  const marketIntent =
    marketRegime === "TREND" && trendDirection !== "NEUTRAL"
      ? "TREND_CONTINUATION"
      : orderbookState === "SPOOF_RISK" || speedState === "VIOLENT"
        ? "LIQUIDITY_HUNT"
        : trendDirection === "NEUTRAL"
          ? "ACCUMULATION"
          : "DISTRIBUTION";

  const marketStress =
    speedState === "VIOLENT" || slippageState === "HIGH" || atrRegime === "HIGH"
      ? "HIGH"
      : speedState === "FAST" || slippageState === "MED"
        ? "BUILDING"
        : "LOW";

  const moveParticipation =
    (tradeSide !== "NEUTRAL" && oiState === "UP") || speedState === "FAST" || speedState === "VIOLENT"
      ? "STRONG"
      : oiState === "FLAT"
        ? "NORMAL"
        : "WEAK";

  const spotVsDeriv =
    fundingState === "CROWDED_LONG" || fundingState === "CROWDED_SHORT" || oiState === "UP"
      ? "DERIV_LED"
      : tradeSide === "BUY" || tradeSide === "SELL"
        ? "SPOT_LED"
        : "BALANCED";

  const entryTiming =
    slippageState === "HIGH" || marketStress === "HIGH"
      ? "CLOSED"
      : slippageState === "MED"
        ? "NARROW"
        : "OPEN";

  const asymmetry =
    entryTiming === "OPEN" && moveParticipation === "STRONG"
      ? "REWARD_DOMINANT"
      : entryTiming === "CLOSED"
        ? "RISK_DOMINANT"
        : "BALANCED";

  const cascadeRisk =
    oiState === "UP" && marketStress === "HIGH"
      ? "HIGH"
      : marketStress === "BUILDING"
        ? "MED"
        : "LOW";

  const suddenMove = marketStress === "HIGH" ? "HIGH" : marketStress === "BUILDING" ? "MED" : "LOW";

  tiles = updateTile(tiles, "market-intent", {
    state: marketIntent,
    confidence: 77,
    rawValue: `regime=${marketRegime} flow=${tradeSide} book=${orderbookState}`,
    shortExplanation: "Intent inferred from regime, flow pressure and orderbook behavior.",
  });

  tiles = updateTile(tiles, "market-stress-level", {
    state: marketStress,
    confidence: 75,
    rawValue: `speed=${speedState} slippage=${slippageState} atr=${atrRegime}`,
    shortExplanation: "Stress score from speed, slippage and volatility.",
  });

  tiles = updateTile(tiles, "sudden-move-risk", {
    state: suddenMove,
    confidence: 73,
    rawValue: `stress=${marketStress}`,
    shortExplanation: "Sudden move risk follows stress regime.",
  });

  tiles = updateTile(tiles, "move-participation-score", {
    state: moveParticipation,
    confidence: 74,
    rawValue: `flow=${tradeSide} oi=${oiState} speed=${speedState}`,
    shortExplanation: "Participation quality from flow + OI + tape speed.",
  });

  tiles = updateTile(tiles, "spot-vs-derivatives-pressure", {
    state: spotVsDeriv,
    confidence: 72,
    rawValue: `funding=${fundingState} oi=${oiState} flow=${tradeSide}`,
    shortExplanation: "Pressure source split across spot and derivatives.",
  });

  tiles = updateTile(tiles, "relative-strength-vs-market", {
    state: trendDirection === "UP" ? "STRONG" : trendDirection === "DOWN" ? "WEAK" : "NEUTRAL",
    confidence: 71,
    rawValue: `trend_pct=${trendPct.toFixed(2)}`,
    shortExplanation: "Relative strength proxy from trend drift.",
  });

  tiles = updateTile(tiles, "entry-timing-window", {
    state: entryTiming,
    confidence: 74,
    rawValue: `slippage=${slippageState} stress=${marketStress}`,
    shortExplanation: "Entry window from live execution conditions.",
  });

  tiles = updateTile(tiles, "asymmetry-score", {
    state: asymmetry,
    confidence: 73,
    rawValue: `entry=${entryTiming} participation=${moveParticipation}`,
    shortExplanation: "Risk/reward asymmetry from entry quality and participation.",
  });

  tiles = updateTile(tiles, "cascade-risk", {
    state: cascadeRisk,
    confidence: 70,
    rawValue: `oi=${oiState} stress=${marketStress}`,
    shortExplanation: "Cascade risk proxy from OI build-up and stress.",
  });

  const conflictVotes = [
    tiles.find((t) => t.key === "trend-direction")?.state,
    tiles.find((t) => t.key === "buy-sell-imbalance")?.state,
    tiles.find((t) => t.key === "orderbook-imbalance")?.state,
  ];

  let conflictScore = 0;
  if (conflictVotes.includes("UP") && conflictVotes.includes("SELL")) conflictScore += 1;
  if (conflictVotes.includes("DOWN") && conflictVotes.includes("BUY")) conflictScore += 1;
  if (scenario.breakoutOnly && tiles.find((t) => t.key === "breakout-risk")?.state === "LOW") conflictScore += 1;
  if (scenario.riskMode === "CONSERVATIVE" && atrRegime === "HIGH") conflictScore += 1;

  const conflict = conflictScore >= 2 ? "HIGH" : conflictScore === 1 ? "MED" : "LOW";
  const riskGate = conflict === "HIGH" ? "BLOCK" : "PASS";

  const entryState =
    riskGate === "BLOCK"
      ? "POOR"
      : trendStrength === "STRONG" && (live.orderbook?.spreadBps ?? 999) < 6
        ? "STRONG"
        : trendStrength === "MID"
          ? "GOOD"
          : "OK";

  const validity = riskGate === "BLOCK" ? "NO-TRADE" : entryState === "STRONG" || entryState === "GOOD" ? "VALID" : "WEAK";

  tiles = updateTile(tiles, "signal-conflict", {
    state: conflict,
    confidence: 78,
    rawValue: `conflict_votes=${conflictScore}`,
    shortExplanation: "Live cross-signal disagreement score.",
  });

  tiles = updateTile(tiles, "risk-gate", {
    state: riskGate,
    confidence: 81,
    rawValue: `risk_mode=${scenario.riskMode}`,
    shortExplanation: "Risk gate from conflict + regime checks.",
  });

  tiles = updateTile(tiles, "entry-quality", {
    state: entryState,
    confidence: 79,
    rawValue: `entry_score=${entryState}`,
    shortExplanation: "Execution-aware entry quality from live feeds.",
  });

  tiles = updateTile(tiles, "trade-validity", {
    state: validity,
    confidence: 82,
    rawValue: `validity=${validity}`,
    shortExplanation: "Final trade filter after live risk gates.",
  });

  tiles = updateTile(tiles, "rr-potential", {
    state: validity === "VALID" ? "HIGH" : validity === "WEAK" ? "NORMAL" : "LOW",
    confidence: 72,
    rawValue: `atr=${atrPct.toFixed(2)} trend=${trendPct.toFixed(2)}%`,
    shortExplanation: "Reward-to-risk proxy from live trend and volatility.",
  });

  const invalidationDistanceState =
    atrPct >= 1.6 ? "WIDE" : atrPct <= 0.55 ? "TIGHT" : "NORMAL";
  const rewardDistanceState =
    Math.abs(trendPct) >= 1.15 ? "EXTENDED" : Math.abs(trendPct) >= 0.45 ? "NORMAL" : "SHORT";
  const riskArrivalSpeedState =
    marketStress === "HIGH" || speedState === "VIOLENT" || speedState === "FAST"
      ? "FAST"
      : marketStress === "BUILDING" || speedState === "NORMAL"
        ? "NORMAL"
        : "SLOW";
  const rewardAccessibilityState =
    validity === "VALID" && entryTiming === "OPEN" && trendStrength === "STRONG"
      ? "EASY"
      : validity === "NO-TRADE" || entryTiming === "CLOSED"
        ? "HARD"
        : "NORMAL";
  const opportunityRankState =
    validity === "VALID" && trendStrength === "STRONG"
      ? "TOP"
      : validity === "VALID" || validity === "WEAK"
        ? "MID"
        : "LOW";
  const btcLeadershipState =
    trendDirection === "UP" && trendStrength === "STRONG"
      ? "LEADING"
      : trendDirection === "DOWN" && trendStrength === "STRONG"
        ? "LAGGING"
        : "BALANCED";

  tiles = updateTile(tiles, "invalidation-distance", {
    state: invalidationDistanceState,
    confidence: 71,
    rawValue: `${Math.max(0.2, atrPct * 0.8).toFixed(2)}%`,
    shortExplanation: "Invalidation distance regime from ATR expansion state.",
  });

  tiles = updateTile(tiles, "reward-distance", {
    state: rewardDistanceState,
    confidence: 70,
    rawValue: `${Math.max(0.4, Math.abs(trendPct) * 1.9).toFixed(2)}%`,
    shortExplanation: "Distance to likely reward zone from trend displacement.",
  });

  tiles = updateTile(tiles, "risk-arrival-speed", {
    state: riskArrivalSpeedState,
    confidence: 69,
    rawValue: `stress=${marketStress} speed=${speedState}`,
    shortExplanation: "Adverse-risk arrival speed from stress and tape speed.",
  });

  tiles = updateTile(tiles, "reward-accessibility", {
    state: rewardAccessibilityState,
    confidence: 70,
    rawValue: `validity=${validity} entry=${entryTiming}`,
    shortExplanation: "Ease of reaching reward zone under current execution window.",
  });

  tiles = updateTile(tiles, "opportunity-rank", {
    state: opportunityRankState,
    confidence: 68,
    rawValue: `validity=${validity} trend=${trendStrength}`,
    shortExplanation: "Cross-market opportunity rank from validity and trend quality.",
  });

  tiles = updateTile(tiles, "btc-leadership-state", {
    state: btcLeadershipState,
    confidence: 67,
    rawValue: `trend=${trendDirection} strength=${trendStrength}`,
    shortExplanation: "BTC leadership behavior from current trend regime.",
  });

  const indicatorsEnabled = indicators.masterEnabled;
  const indicatorTileState = (enabled: boolean, value: string) => (!indicatorsEnabled ? "N/A" : enabled ? value : "OFF");
  const indicatorConfidence = (enabled: boolean, activeConfidence: number) => (!indicatorsEnabled ? 0 : enabled ? activeConfidence : 0);
  const indicatorRawValue = (enabled: boolean, raw: string) => (!indicatorsEnabled ? "Indicators master OFF" : enabled ? raw : "Indicator disabled");
  const indicatorExplanation = (enabled: boolean, enabledExplanation: string) =>
    !indicatorsEnabled
      ? "Indicators master OFF."
      : enabled
        ? enabledExplanation
        : "Enable this indicator in the Indicators panel to include it in scoring.";

  tiles = updateTile(tiles, "rsi-state", {
    state: indicatorTileState(indicators.indicators.rsi.enabled, trendDirection === "UP" ? "NEUTRAL" : trendDirection === "DOWN" ? "OVERSOLD" : "NEUTRAL"),
    rawValue: indicatorRawValue(indicators.indicators.rsi.enabled, `trend=${trendDirection}`),
    shortExplanation: indicatorExplanation(indicators.indicators.rsi.enabled, "RSI proxy aligned to live trend state."),
    confidence: indicatorConfidence(indicators.indicators.rsi.enabled, 70),
  });
  tiles = updateTile(tiles, "macd-state", {
    state: indicatorTileState(indicators.indicators.macd.enabled, trendDirection === "UP" ? "BULL" : trendDirection === "DOWN" ? "BEAR" : "FLAT"),
    rawValue: indicatorRawValue(indicators.indicators.macd.enabled, `trend=${trendDirection}`),
    shortExplanation: indicatorExplanation(indicators.indicators.macd.enabled, "MACD proxy aligned to live trend state."),
    confidence: indicatorConfidence(indicators.indicators.macd.enabled, 72),
  });
  tiles = updateTile(tiles, "adx-state", {
    state: indicatorTileState(indicators.indicators.adx.enabled, trendStrength === "STRONG" ? "STRONG" : trendStrength === "MID" ? "OK" : "WEAK"),
    rawValue: indicatorRawValue(indicators.indicators.adx.enabled, `strength=${trendStrength}`),
    shortExplanation: indicatorExplanation(indicators.indicators.adx.enabled, "ADX proxy aligned to live trend strength."),
    confidence: indicatorConfidence(indicators.indicators.adx.enabled, 70),
  });
  tiles = updateTile(tiles, "bbands-squeeze", {
    state: indicatorTileState(indicators.indicators.bbands.enabled, atrRegime === "LOW" ? "ON" : "OFF"),
    rawValue: indicatorRawValue(indicators.indicators.bbands.enabled, `atr=${atrRegime}`),
    shortExplanation: indicatorExplanation(indicators.indicators.bbands.enabled, "Squeeze proxy aligned to live ATR regime."),
    confidence: indicatorConfidence(indicators.indicators.bbands.enabled, 68),
  });
  tiles = updateTile(tiles, "supertrend-direction", {
    state: indicatorTileState(indicators.indicators.supertrend.enabled, trendDirection === "UP" ? "UP" : trendDirection === "DOWN" ? "DOWN" : "UP"),
    rawValue: indicatorRawValue(indicators.indicators.supertrend.enabled, `trend=${trendDirection}`),
    shortExplanation: indicatorExplanation(indicators.indicators.supertrend.enabled, "Supertrend proxy aligned to live directional bias."),
    confidence: indicatorConfidence(indicators.indicators.supertrend.enabled, 69),
  });
  tiles = updateTile(tiles, "ichimoku-cloud-bias", {
    state: indicatorTileState(indicators.indicators.ichimoku.enabled, trendDirection === "UP" ? "BULL" : trendDirection === "DOWN" ? "BEAR" : "NEUTRAL"),
    rawValue: indicatorRawValue(indicators.indicators.ichimoku.enabled, `trend=${trendDirection}`),
    shortExplanation: indicatorExplanation(indicators.indicators.ichimoku.enabled, "Ichimoku proxy aligned to live trend."),
    confidence: indicatorConfidence(indicators.indicators.ichimoku.enabled, 69),
  });
  tiles = updateTile(tiles, "divergence-state", {
    state: indicatorTileState(indicators.indicators.divergence.enabled, validity === "VALID" ? "NONE" : trendDirection === "UP" ? "BEAR_DIV" : trendDirection === "DOWN" ? "BULL_DIV" : "NONE"),
    rawValue: indicatorRawValue(indicators.indicators.divergence.enabled, `validity=${validity}`),
    shortExplanation: indicatorExplanation(indicators.indicators.divergence.enabled, "Divergence proxy from validity/trend mismatch."),
    confidence: indicatorConfidence(indicators.indicators.divergence.enabled, 66),
  });

  const hasCoreFeeds =
    Boolean(live.ohlcv?.length) &&
    Boolean(live.orderbook) &&
    Boolean(live.trades) &&
    Boolean(live.derivatives) &&
    typeof live.derivatives?.fundingRate === "number" &&
    typeof live.derivatives?.oiChange1h === "number";

  if (!hasCoreFeeds) {
    tiles = updateTile(tiles, "risk-gate", {
      state: "BLOCK",
      confidence: 0,
      rawValue: "missing_live_feeds",
      shortExplanation: "Critical live feeds missing. Trading blocked.",
    });
    tiles = updateTile(tiles, "trade-validity", {
      state: "NO-TRADE",
      confidence: 0,
      rawValue: "missing_live_feeds",
      shortExplanation: "No-trade until all required live feeds are available.",
    });
  }

  const dataHealth = computeHealthFromLive(feeds, live);
  const aiPanel = generateAiPanel(
    tiles,
    scenario,
    feeds,
    consensusInputs,
    dataHealth,
    scoringMode,
    flowSignalInputs,
    flowSignalWeights,
    riskChecksInputs,
  );

  return {
    tiles,
    aiPanel,
    dataHealth,
    ohlcv,
    keyLevels,
  };
};

export const buildBitriumIntelligenceSnapshot = (input: {
  live: IntelligenceLiveState;
  feeds: FeedConfig;
  scenario: ScenarioConfig;
  indicators: IndicatorsState;
  consensusInputs: ConsensusInputConfig;
  scoringMode: ScoringMode;
  flowSignalInputs?: FlowSignalInputsConfig;
  flowSignalWeights?: FlowSignalWeightsConfig;
  riskChecksInputs?: RiskChecksInputsConfig;
}): DashboardSnapshot | null => {
  const { live, feeds, scenario, indicators, consensusInputs, scoringMode, flowSignalInputs, flowSignalWeights, riskChecksInputs } = input;
  const baseline = createNoMockBaseline(consensusInputs, scoringMode, flowSignalInputs, flowSignalWeights, riskChecksInputs);
  return applyLiveOverrides(
    {
      ...baseline,
      dataHealth: computeHealthFromLive(feeds, live),
    },
    feeds,
    scenario,
    indicators,
    consensusInputs,
    scoringMode,
    flowSignalInputs,
    flowSignalWeights,
    riskChecksInputs,
    live,
  );
};
