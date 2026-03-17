import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoinIcon } from "../components/CoinIcon";
import { EmailModal } from "../components/EmailModal";
import { ShareModal } from "../components/ShareModal";
import { useAdminConfig } from "../hooks/useAdminConfig";
import { useMarketDataStatus } from "../hooks/useMarketData";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { useTradeIdeasStream, type ScannedModeRow } from "../hooks/useTradeIdeasStream";
import { useUserSettings } from "../hooks/useUserSettings";
import { scoringModeLabel } from "../data/scoringEngine";
import type { ScoringMode, TradePlan } from "../types";
import type { ExchangeTradeSignal } from "../types/exchange";
import { formatTradePlan } from "../utils/parseTradePlan";
import { readUserModeConsensusMinPct, writeUserModeConsensusMinPct } from "../utils/modeConsensusRangeStorage";
import { resolveMinConfidence } from "../utils/resolveModeConfidence";
import { fetchAiTradeIdeasState, type AiProviderId } from "../services/adminAiProvidersApi";

const ALL = "ALL";
const SCAN_MODE_ORDER: ScoringMode[] = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"];
const MODE_ROW_THEME: Record<ScoringMode, { label: string; labelClass: string; chipClass: string }> = {
  FLOW: {
    label: "Flow",
    labelClass: "border-[#3d5f8f]/80 bg-[#132033] text-[#b8d3ff]",
    chipClass: "border-[#3d5f8f]/70 bg-[#132033] text-[#b8d3ff]",
  },
  AGGRESSIVE: {
    label: "Aggressive",
    labelClass: "border-[#6b4fa8]/80 bg-[#241a3c] text-[#dbcdfd]",
    chipClass: "border-[#6b4fa8]/70 bg-[#241a3c] text-[#dbcdfd]",
  },
  BALANCED: {
    label: "Balanced",
    labelClass: "border-[#7a6840]/80 bg-[#2a2418] text-[#e7d9b3]",
    chipClass: "border-[#7a6840]/70 bg-[#2a2418] text-[#e7d9b3]",
  },
  CAPITAL_GUARD: {
    label: "Capital Guard",
    labelClass: "border-[#46546a]/80 bg-[#1a212d] text-[#cfd9ea]",
    chipClass: "border-[#46546a]/70 bg-[#1a212d] text-[#cfd9ea]",
  },
};

const AI_MODULE_THEME: Record<AiProviderId, { label: string; labelClass: string; chipClass: string }> = {
  CHATGPT: {
    label: "ChatGPT",
    labelClass: "border-[#3d5f8f]/80 bg-[#132033] text-[#b8d3ff]",
    chipClass: "border-[#3d5f8f]/70 bg-[#132033] text-[#b8d3ff]",
  },
  QWEN: {
    label: "Qwen",
    labelClass: "border-[#6b4fa8]/80 bg-[#241a3c] text-[#dbcdfd]",
    chipClass: "border-[#6b4fa8]/70 bg-[#241a3c] text-[#dbcdfd]",
  },
};

type AiScanRow = {
  module: AiProviderId;
  symbol: string;
  tf: string;
  profile?: string;
  contract?: string;
  scorePct: number;
  reason: string;
  ok: boolean;
  decision: string;
  side: "LONG" | "SHORT" | "NO_TRADE" | "WAIT" | "UNKNOWN";
  scannedAt: string;
  setup?: string;
  bias?: string;
  edgePct?: number;
  breakProbPct?: number;
  structureFlags?: { vwapConfluence?: boolean; htfAlignment?: boolean };
  marketState?: {
    regime?: string;
    trendDir?: string;
    emaAlignment?: string;
    vwapPosition?: string;
  };
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
  layerScores?: { structure?: number; liquidity?: number; positioning?: number; execution?: number };
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
};

type AiModuleStatus = {
  running: boolean;
  lastRunAt: string;
  error: string;
};

type ModeConsensusRange = { min: number; max: number };
type ModeConsensusRanges = Record<ScoringMode, ModeConsensusRange>;

const FLOW_MIN_CONSENSUS = 40;
const REPORT_MIN_CONSENSUS = 70;
const AI_REPORT_MIN_SCORE = 60;

const chip = (active: boolean) =>
  `rounded-full border px-2 py-1 text-xs font-semibold ${
    active ? "border-[#F5C542]/60 bg-[#2b2417] text-[#F5C542]" : "border-white/10 bg-[#0F1012] text-[#BFC2C7]"
  }`;

const tone = (v: string) => {
  if (v === "LONG") return "border-[#6f765f] bg-[#1f251b] text-[#d8decf]";
  if (v === "SHORT") return "border-[#704844] bg-[#271a19] text-[#d6b3af]";
  return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
};

const toFinite = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const normalizeScorePct = (raw: unknown): number => {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  const pct = numeric > 1 ? numeric : numeric * 100;
  return clampPercent(pct);
};

const resolveConsensusPct = (plan: TradePlan): number => normalizeScorePct(plan.confidence);

const resolveModeScorePct = (plan: TradePlan, mode: ScoringMode): number => {
  const modeRaw = plan.modeScores?.[mode];
  if (typeof modeRaw === "number" && Number.isFinite(modeRaw)) {
    return normalizeScorePct(modeRaw);
  }
  // If modeScores exists but doesn't have this mode, score is 0 for that mode
  if (plan.modeScores && Object.keys(plan.modeScores).length > 0) return 0;
  // Legacy ideas without modeScores: fall back to confidence only for matching mode
  const planMode = (plan.scoringMode ?? "BALANCED") as ScoringMode;
  return planMode === mode ? resolveConsensusPct(plan) : 0;
};

const resolveModeScoreForFilterPct = (plan: TradePlan, mode: ScoringMode): number => {
  return resolveModeScorePct(plan, mode);
};

const consensusGuidance = (pct: number): { text: string; className: string } => {
  if (pct >= 90) {
    return {
      text: "90-100: Prime execution window.",
      className: "text-[#7dd3a6]",
    };
  }
  if (pct >= 80) {
    return {
      text: "80-89: Strong tradable momentum.",
      className: "text-[#F5C542]",
    };
  }
  if (pct >= 70) {
    return {
      text: "70-79: Tradable with controlled risk.",
      className: "text-white",
    };
  }
  return {
    text: "Below 70: Not trade-ready.",
    className: "text-[#a7adbc]",
  };
};

const cardDecisionTone = (validity: string) => {
  if (validity === "VALID") return {
    boxClass: "border-[#2e7a5e]/80 bg-[#103326] shadow-[0_0_0_1px_rgba(46,122,94,0.2)]",
    textClass: "text-[#b9f5dc]",
    titleClass: "text-[#8fd4b8]",
    label: "TRADE",
    badgeClass: "border-[#2e7a5e]/80 bg-[#103326] text-[#b9f5dc]",
  };
  if (validity === "WEAK") return {
    boxClass: "border-[#9a7b2e]/80 bg-[#3a2c13] shadow-[0_0_0_1px_rgba(154,123,46,0.2)]",
    textClass: "text-[#f7e2a4]",
    titleClass: "text-[#d9c47e]",
    label: "WATCH",
    badgeClass: "border-[#9a7b2e]/80 bg-[#3a2c13] text-[#f7e2a4]",
  };
  return {
    boxClass: "border-[#31415b]/70 bg-[#121a27] shadow-[0_0_0_1px_rgba(49,65,91,0.2)]",
    textClass: "text-[#cdd8ec]",
    titleClass: "text-[#a8b8d0]",
    label: "NO TRADE",
    badgeClass: "border-[#31415b]/70 bg-[#121a27] text-[#cdd8ec]",
  };
};

const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // noop
  }
};

const elapsedText = (iso: string, nowMs: number) => {
  const base = new Date(iso).getTime();
  if (!Number.isFinite(base)) return "0m 00s ago";
  const diffSec = Math.max(0, Math.floor((nowMs - base) / 1000));
  const mm = Math.floor(diffSec / 60);
  const ss = diffSec % 60;
  return `${mm}m ${String(ss).padStart(2, "0")}s ago`;
};

const basePricePrecision = (value: number): number => {
  const abs = Math.abs(value);
  if (abs >= 1000) return 2;
  if (abs >= 1) return 2;
  if (abs >= 0.1) return 4;
  if (abs >= 0.01) return 5;
  if (abs >= 0.001) return 6;
  return 8;
};

const formatPx = (value: number, fixedDecimals?: number) => {
  if (!Number.isFinite(value)) return "-";
  const decimals = typeof fixedDecimals === "number" ? fixedDecimals : basePricePrecision(value);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const resolveDisplayDecimals = (values: number[], planPrecision?: number): number => {
  // If Binance precision is known, use it directly
  if (typeof planPrecision === "number" && planPrecision > 0) return planPrecision;
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return 2;
  let decimals = Math.max(...finite.map((v) => basePricePrecision(v)));
  const uniqueRawCount = new Set(finite.map((v) => Number(v).toPrecision(12))).size;
  while (decimals < 10) {
    const shownCount = new Set(
      finite.map((v) =>
        v.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }),
      ),
    ).size;
    if (shownCount >= uniqueRawCount) break;
    decimals += 1;
  }
  return decimals;
};

const toUiSymbol = (symbol: string) => {
  const upper = symbol.toUpperCase().trim();
  if (upper.includes("/")) return upper;
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}/USDT`;
  return upper;
};

const toDashboardCoin = (symbol: string) => {
  const pair = toUiSymbol(symbol);
  const [base] = pair.split("/");
  return (base ?? pair).toUpperCase().trim();
};

export default function TradeIdeasPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAiTradeIdeasPage = location.pathname.startsWith("/ai-trade-ideas");
  const { config: adminConfig } = useAdminConfig();
  const selectedExchange = useExchangeTerminalStore((state) => state.selectedExchange);
  const setSelectedExchange = useExchangeTerminalStore((state) => state.setSelectedExchange);
  const setSelectedSymbol = useExchangeTerminalStore((state) => state.setSelectedSymbol);
  const setActiveSignal = useExchangeTerminalStore((state) => state.setActiveSignal);
  const setAccountMode = useExchangeTerminalStore((state) => state.setAccountMode);
  const { scoringMode } = useUserSettings();
  const appliedMinConfidenceRaw = resolveMinConfidence(scoringMode, undefined, {
    minConfidence: adminConfig.tradeIdeas.minConfidence,
    modeMinConfidence: adminConfig.tradeIdeas.modeMinConfidence,
  }).value;
  const effectiveExchange = isAiTradeIdeasPage ? "Binance" : selectedExchange;
  const appliedMinConfidence = isAiTradeIdeasPage ? 0.4 : appliedMinConfidenceRaw;
  const marketStatus = useMarketDataStatus();
  const { messages, streamError, lastSuccessAt, diagnostics } = useTradeIdeasStream(appliedMinConfidence, effectiveExchange);

  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedScanModes, setSelectedScanModes] = useState<ScoringMode[]>([...SCAN_MODE_ORDER]);
  const [direction, setDirection] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [aiDecisionFilter, setAiDecisionFilter] = useState<"ALL" | "TRADE" | "WATCH" | "NO_TRADE">("ALL");
  const [quantDecisionFilter, setQuantDecisionFilter] = useState<"ALL" | "TRADE" | "NO_TRADE">("ALL");
  const [mode, setMode] = useState<"ALL" | "SCALP" | "INTRADAY" | "SWING">("ALL");
  const [search, setSearch] = useState("");
  const [scanPanelExpanded, setScanPanelExpanded] = useState(true);
  const [modeMinConsensus, setModeMinConsensus] = useState<Record<ScoringMode, number>>(() => {
    const stored = readUserModeConsensusMinPct();
    return {
      FLOW: Number.isFinite(stored.FLOW) ? Number(stored.FLOW) : FLOW_MIN_CONSENSUS,
      AGGRESSIVE: Number.isFinite(stored.AGGRESSIVE) ? Number(stored.AGGRESSIVE) : FLOW_MIN_CONSENSUS,
      BALANCED: Number.isFinite(stored.BALANCED) ? Number(stored.BALANCED) : FLOW_MIN_CONSENSUS,
      CAPITAL_GUARD: Number.isFinite(stored.CAPITAL_GUARD) ? Number(stored.CAPITAL_GUARD) : FLOW_MIN_CONSENSUS,
    };
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [visibleCount, setVisibleCount] = useState(80);
  const [sharePlan, setSharePlan] = useState<TradePlan | null>(null);
  const [emailPlan, setEmailPlan] = useState<TradePlan | null>(null);
  const [popupScanRow, setPopupScanRow] = useState<{ row: ScannedModeRow; mode: ScoringMode } | null>(null);
  const [aiModules, setAiModules] = useState<Record<AiProviderId, boolean>>({
    CHATGPT: true,
    QWEN: true,
  });
  const [aiModuleStatus, setAiModuleStatus] = useState<Record<AiProviderId, AiModuleStatus>>({
    CHATGPT: { running: false, lastRunAt: "", error: "" },
    QWEN: { running: false, lastRunAt: "", error: "" },
  });
  const [aiScansByModule, setAiScansByModule] = useState<Record<AiProviderId, AiScanRow[]>>({
    CHATGPT: [],
    QWEN: [],
  });
  const [aiUniverseCount, setAiUniverseCount] = useState(0);
  const [aiLastUpdatedAt, setAiLastUpdatedAt] = useState("");
  const [aiStateError, setAiStateError] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!popupScanRow) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPopupScanRow(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [popupScanRow]);

  useEffect(() => {
    if (!isAiTradeIdeasPage) return;
    if (selectedExchange === "Binance") return;
    setSelectedExchange("Binance");
  }, [isAiTradeIdeasPage, selectedExchange, setSelectedExchange]);

  useEffect(() => {
    if (isAiTradeIdeasPage) return;
    if (selectedScanModes.length) return;
    setSelectedScanModes([...SCAN_MODE_ORDER]);
  }, [isAiTradeIdeasPage, selectedScanModes.length]);

  useEffect(() => {
    setModeMinConsensus((prev) => ({
      FLOW: Math.max(FLOW_MIN_CONSENSUS, Math.min(100, Math.round(prev.FLOW || FLOW_MIN_CONSENSUS))),
      AGGRESSIVE: Math.max(FLOW_MIN_CONSENSUS, Math.min(100, Math.round(prev.AGGRESSIVE || FLOW_MIN_CONSENSUS))),
      BALANCED: Math.max(FLOW_MIN_CONSENSUS, Math.min(100, Math.round(prev.BALANCED || FLOW_MIN_CONSENSUS))),
      CAPITAL_GUARD: Math.max(FLOW_MIN_CONSENSUS, Math.min(100, Math.round(prev.CAPITAL_GUARD || FLOW_MIN_CONSENSUS))),
    }));
  }, []);

  const symbolOptions = useMemo(() => {
    if (!isAiTradeIdeasPage) {
      return Array.from(new Set(messages.map((m) => m.symbol))).sort((a, b) => a.localeCompare(b));
    }
    const set = new Set<string>();
    for (const moduleId of Object.keys(aiScansByModule) as AiProviderId[]) {
      for (const row of aiScansByModule[moduleId] ?? []) {
        const symbol = String(row.symbol ?? "").toUpperCase().trim();
        if (symbol) set.add(symbol);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [aiScansByModule, isAiTradeIdeasPage, messages]);
  const selectedAiModules = useMemo(
    () => (Object.entries(aiModules).filter(([, enabled]) => enabled).map(([id]) => id) as AiProviderId[]),
    [aiModules],
  );
  const effectiveAiModules = useMemo<AiProviderId[]>(
    () => (selectedAiModules.length ? selectedAiModules : (Object.keys(aiModules) as AiProviderId[])),
    [aiModules, selectedAiModules],
  );
  useEffect(() => {
    setSelectedSymbols((prev) => prev.filter((symbol) => symbolOptions.includes(symbol)));
  }, [symbolOptions]);
  useEffect(() => {
    if (isAiTradeIdeasPage) setSelectedSymbols([]);
  }, [isAiTradeIdeasPage]);
  /* aiHasScanRows — available for conditional render of AI scan section */

  const modeConsensusRanges = useMemo<ModeConsensusRanges>(
    () =>
      SCAN_MODE_ORDER.reduce((acc, modeKey) => {
        const rawMin = Number(modeMinConsensus[modeKey] ?? FLOW_MIN_CONSENSUS);
        acc[modeKey] = {
          min: Math.max(FLOW_MIN_CONSENSUS, Math.min(100, Math.round(rawMin))),
          max: 100,
        };
        return acc;
      }, {} as ModeConsensusRanges),
    [modeMinConsensus],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scored = messages.flatMap((m) => {
      if (selectedSymbols.length && !selectedSymbols.includes(m.symbol)) return [];
      if (direction !== ALL && m.direction !== direction) return [];
      if (mode !== ALL && m.horizon !== mode) return [];
      if (quantDecisionFilter === "TRADE" && m.tradeValidity !== "VALID") return [];
      if (quantDecisionFilter === "NO_TRADE" && m.tradeValidity === "VALID") return [];
      if (!selectedScanModes.length) return [];
      let bestMatchedScore = -1;
      const modeMatched = SCAN_MODE_ORDER.some((modeKey) => {
        if (!selectedScanModes.includes(modeKey)) return false;
        const scorePct = resolveModeScoreForFilterPct(m, modeKey);
        const range = modeConsensusRanges[modeKey];
        if (scorePct >= range.min && scorePct <= range.max) {
          bestMatchedScore = Math.max(bestMatchedScore, scorePct);
          return true;
        }
        return false;
      });
      if (!modeMatched) return [];

      if (q && !(
        m.symbol.toLowerCase().includes(q) ||
        m.setup.toLowerCase().includes(q) ||
        m.flowAnalysis.join(" ").toLowerCase().includes(q) ||
        m.tradeIntent.join(" ").toLowerCase().includes(q)
      )) {
        return [];
      }
      return [{ plan: m, sortScore: bestMatchedScore }];
    });
    scored.sort((a, b) => {
      if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
      return Date.parse(b.plan.timestampUtc) - Date.parse(a.plan.timestampUtc);
    });
    return scored.map((item) => item.plan);
  }, [direction, messages, mode, modeConsensusRanges, quantDecisionFilter, search, selectedSymbols, selectedScanModes]);
  const aiFilteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selected = effectiveAiModules;
    const rows = selected.flatMap((moduleId) => aiScansByModule[moduleId] ?? []);
    const recentRows = rows
      .slice()
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
      .slice(0, 40);
    const filteredRows = recentRows.filter((row) => {
      const decision = String(row.decision ?? "").toUpperCase();
      if (aiDecisionFilter === "TRADE" && decision !== "TRADE") return false;
      if (aiDecisionFilter === "WATCH" && decision !== "WATCH") return false;
      if (aiDecisionFilter === "NO_TRADE" && decision !== "NO_TRADE") return false;
      const symbol = String(row.symbol ?? "").toUpperCase();
      if (selectedSymbols.length && !selectedSymbols.includes(symbol)) return false;
      if (direction === "LONG" && row.side !== "LONG") return false;
      if (direction === "SHORT" && row.side !== "SHORT") return false;
      if (!q) return true;
      return (
        symbol.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q) ||
        row.module.toLowerCase().includes(q) ||
        row.decision.toLowerCase().includes(q)
      );
    });
    return filteredRows.sort((a, b) => {
      if (b.scorePct !== a.scorePct) return b.scorePct - a.scorePct;
      return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime();
    });
  }, [aiDecisionFilter, aiScansByModule, direction, effectiveAiModules, search, selectedSymbols]);
  /* hasLastScannedRows + scanCycleStats — computed from diagnostics, available for UI stats */
  const streamAgeMs = lastSuccessAt ? Math.max(0, nowMs - lastSuccessAt) : null;
  const diagnosticsAgeMs = diagnostics.lastLoopAt ? Math.max(0, nowMs - diagnostics.lastLoopAt) : null;
  const hasRecentLoop = Boolean(diagnosticsAgeMs !== null && diagnosticsAgeMs <= 45_000);
  const hasRecentPacket = Boolean(streamAgeMs !== null && streamAgeMs <= 45_000);
  const routerLiveSignal = Boolean(
    !marketStatus.stale &&
      marketStatus.latencyMs !== null &&
      marketStatus.latencyMs !== undefined &&
      Number.isFinite(marketStatus.latencyMs) &&
      marketStatus.latencyMs <= 5_000,
  );
  // Keep live state stable across a single failed loop. A recent successful packet
  // is the primary truth for feed liveness; current-loop payload counters can be zero
  // during transient exchange hiccups.
  const streamLiveSignal = Boolean(hasRecentPacket && hasRecentLoop);
  // Router heartbeat can stay healthy even if streamError still holds an old transient error.
  // In that case, keep Live Feed on and suppress stale error text.
  const isLiveFlow = Boolean(streamLiveSignal || routerLiveSignal);
  const latencyLabel = isLiveFlow && marketStatus.latencyMs !== null && marketStatus.latencyMs !== undefined
    ? `Latency ${Math.round(marketStatus.latencyMs)}ms`
    : "Latency -";
  const showStreamWarning = !isLiveFlow;
  const liveFlowText = isLiveFlow ? "Live Feed" : "No Live Feed";
  const diagnosticsAgeSec = diagnostics.lastLoopAt ? Math.max(0, Math.floor((nowMs - diagnostics.lastLoopAt) / 1000)) : null;
  const effectiveStreamError = routerLiveSignal ? null : streamError;
  const streamWarningText = !isLiveFlow
    ? (
      effectiveStreamError ??
      `No live packet from selected exchange.${diagnosticsAgeSec !== null ? ` Last scan ${diagnosticsAgeSec}s ago.` : ""}`
    )
    : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setVisibleCount(40);
  }, [search, direction, mode, selectedSymbols, modeMinConsensus, aiScansByModule, aiDecisionFilter, quantDecisionFilter, isAiTradeIdeasPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          const total = isAiTradeIdeasPage ? aiFilteredRows.length : filtered.length;
          setVisibleCount((prev) => Math.min(prev + 30, total));
        }
      },
      { root: null, rootMargin: "0px 0px 320px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [aiFilteredRows.length, filtered.length, isAiTradeIdeasPage]);

  // Convert scan row items to TradePlan objects for card display.
  // Cards show the SAME coins as the scan row and update when scan refreshes.
  const scanBasedPlans = useMemo((): TradePlan[] => {
    if (!selectedScanModes.length) return [];
    const plans: TradePlan[] = [];
    for (const modeKey of SCAN_MODE_ORDER) {
      if (!selectedScanModes.includes(modeKey)) continue;
      const rows: ScannedModeRow[] = diagnostics.lastScannedByMode[modeKey] ?? [];
      const range = modeConsensusRanges[modeKey];
      for (const row of rows) {
        if (!row.entryLow && !row.entryHigh) continue; // skip items without price data
        // Apply consensus range filter — hide cards below the user's minimum
        if (Number.isFinite(row.confidencePct) && row.confidencePct < range.min) continue;
        const q = search.trim().toLowerCase();
        if (q && !row.symbol.toLowerCase().includes(q)) continue;
        if (direction !== ALL && row.direction !== direction) continue;
        if (quantDecisionFilter === "TRADE" && row.tradeValidity !== "VALID") continue;
        if (quantDecisionFilter === "NO_TRADE" && row.tradeValidity === "VALID") continue;
        plans.push({
          id: `scan-${modeKey}-${row.symbol}-${row.scannedAt}`,
          symbol: row.symbol,
          direction: (row.direction as "LONG" | "SHORT") ?? "LONG",
          confidence: row.confidencePct / 100,
          scoringMode: modeKey,
          approvedModes: [modeKey],
          modeScores: row.modeScores as TradePlan["modeScores"],
          entry: { low: row.entryLow, high: row.entryHigh, raw: "" },
          stops: row.slLevels.map((price, i) => ({ price, label: `SL${i + 1}`, sharePct: i === 0 ? 50 : 50 })),
          targets: row.tpLevels.map((price, i) => ({ price, label: `TP${i + 1}`, sharePct: i === 0 ? 50 : 50 })),
          status: "PENDING",
          result: "NONE",
          createdAt: Number.isFinite(row.scannedAt) ? new Date(row.scannedAt).toISOString() : new Date().toISOString(),
          timestampUtc: Number.isFinite(row.scannedAt) ? new Date(row.scannedAt).toISOString() : new Date().toISOString(),
          horizon: (row.horizon as TradePlan["horizon"]) ?? "INTRADAY",
          timeframe: (row.timeframe as TradePlan["timeframe"]) ?? "15m",
          setup: row.setup ?? "",
          tradeValidity: (row.tradeValidity as TradePlan["tradeValidity"]) ?? "NO-TRADE",
          entryWindow: (row.entryWindow as TradePlan["entryWindow"]) ?? "CLOSED",
          slippageRisk: (row.slippageRisk as TradePlan["slippageRisk"]) ?? "HIGH",
          triggersToActivate: [],
          invalidation: "",
          validUntilBars: 0,
          validUntilUtc: "",
          marketState: { trend: "", htfBias: "", volatility: "", execution: "" },
          flowAnalysis: [],
          tradeIntent: [],
          rawText: "",
          incomplete: false,
          hitLevelType: null,
          hitLevelIndex: null,
          hitLevelPrice: null,
          minutesToEntry: null,
          minutesToExit: null,
          minutesTotal: null,
          pricePrecision: row.pricePrecision,
          disclaimer: "",
        });
      }
    }
    // Sort by score descending
    plans.sort((a, b) => b.confidence - a.confidence);
    return plans;
  }, [diagnostics.lastScannedByMode, selectedScanModes, search, direction, quantDecisionFilter, modeConsensusRanges]);

  const visible = scanBasedPlans.slice(0, visibleCount);
  const visibleAiRows = aiFilteredRows.slice(0, Math.min(40, visibleCount));
  const noVisibleCards = isAiTradeIdeasPage ? !visibleAiRows.length : !visible.length;
  const reportBase = useMemo(
    () =>
      messages
        .filter((m) => {
          if (Array.isArray(m.approvedModes) && m.approvedModes.length > 0) {
            if (!m.approvedModes.includes(scoringMode)) return false;
            return resolveModeScorePct(m, scoringMode) >= REPORT_MIN_CONSENSUS;
          }
          if ((m.scoringMode ?? "BALANCED") !== scoringMode) return false;
          return resolveModeScorePct(m, scoringMode) >= REPORT_MIN_CONSENSUS;
        })
        .slice(0, 100),
    [messages, scoringMode],
  );
  const reportStats = useMemo(() => {
    if (isAiTradeIdeasPage) {
      const activeModules = effectiveAiModules;
      const rows = activeModules.flatMap((id) => aiScansByModule[id] ?? []);
      const reportRows = rows.filter((row) => row.scorePct >= AI_REPORT_MIN_SCORE);
      const total = reportRows.length;
      const successful = reportRows.filter((row) => row.ok).length;
      const failed = reportRows.filter((row) => !row.ok).length;
      const successRate = total ? (successful / total) * 100 : 0;
      return { total, successful, failed, successRate };
    }
    const resolved = reportBase.filter((m) => m.status === "RESOLVED");
    const successful = resolved.filter((m) => m.result === "SUCCESS").length;
    const failed = resolved.filter((m) => m.result === "FAIL").length;
    const total = resolved.length;
    const successRate = total ? (successful / total) * 100 : 0;
    return { total, successful, failed, successRate };
  }, [aiScansByModule, effectiveAiModules, isAiTradeIdeasPage, reportBase]);

  // Per-mode report stats — fetched from API for consistency with detail report page
  const [reportTimeRange, setReportTimeRange] = useState<string>("24h");
  const [reportStatsByMode, setReportStatsByMode] = useState<Record<string, {
    totalScan: number; highScoreScan: number; totalIdeas: number; active: number; resolved: number;
    successful: number; failed: number; entryMissed: number; successRate: number;
  }>>({});
  // When reset is triggered, bump epoch to bypass the backwards-guard for one cycle
  const [reportResetEpoch, setReportResetEpoch] = useState(0);
  const [reportResetting, setReportResetting] = useState(false);
  useEffect(() => {
    if (isAiTradeIdeasPage) return;
    let mounted = true;
    const fetchReportStats = async () => {
      try {
        const res = await fetch(`/api/trade-ideas/report-stats?range=${reportTimeRange}`);
        if (!res.ok || !mounted) return;
        const body = await res.json() as {
          ok?: boolean;
          startedAt?: number;
          statsByMode?: Record<string, {
            totalScan: number; highScoreScan: number; totalIdeas: number; active: number; resolved: number;
            success: number; failed: number; entryMissed: number; successRate: number;
          }>;
        };
        if (!body?.ok || !body.statsByMode || !mounted) return;
        const mapped: Record<string, { totalScan: number; highScoreScan: number; totalIdeas: number; active: number; resolved: number; successful: number; failed: number; entryMissed: number; successRate: number }> = {};
        for (const [mode, s] of Object.entries(body.statsByMode)) {
          mapped[mode] = {
            totalScan: s.totalScan,
            highScoreScan: s.highScoreScan ?? 0,
            totalIdeas: s.totalIdeas,
            active: s.active ?? 0,
            resolved: s.resolved,
            successful: s.success,
            failed: s.failed,
            entryMissed: s.entryMissed ?? 0,
            successRate: s.successRate,
          };
        }
        // Guard: if any mode's totalScan went backwards (cache not ready yet),
        // keep previous data to avoid 0-flickering on the UI.
        // Skip guard right after a reset so zeros are shown.
        setReportStatsByMode((prev) => {
          if (reportResetEpoch > 0) return mapped; // bypass guard after reset
          for (const [mode, s] of Object.entries(mapped)) {
            const p = prev[mode];
            if (p && s.totalScan < p.totalScan) return prev;
          }
          return mapped;
        });
      } catch { /* keep existing data */ }
    };
    void fetchReportStats();
    const timer = window.setInterval(() => void fetchReportStats(), 10_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [isAiTradeIdeasPage, reportTimeRange, reportResetEpoch]);

  // Reset report: clear all trade ideas + scan counts + scanner stats
  const handleReportReset = async () => {
    if (reportResetting) return;
    if (!window.confirm("Reset all trade ideas, scan counts and scanner stats? This cannot be undone.")) return;
    setReportResetting(true);
    try {
      const res = await fetch("/api/trade-ideas/reset", { method: "POST" });
      if (res.ok) {
        setReportStatsByMode({});
        setReportResetEpoch((e) => e + 1);
      }
    } catch { /* ignore */ }
    setReportResetting(false);
  };

  const sourceLabelFromDiagnostics = (sourceKey: string): string => {
    const value = String(sourceKey ?? "").trim().toUpperCase();
    const exchangeId = value.includes(":") ? value.split(":")[1] ?? value : value;
    if (exchangeId.includes("BYBIT")) return "Bybit";
    if (exchangeId.includes("OKX")) return "OKX";
    if (exchangeId.includes("GATE")) return "Gate.io";
    if (exchangeId.includes("BINANCE")) return "Binance";
    return "Binance";
  };

  const sourceName = useMemo(() => {
    if (!isLiveFlow) {
      return sourceLabelFromDiagnostics(String(effectiveExchange ?? "Binance"));
    }
    if (typeof diagnostics.lastSourceExchange === "string" && diagnostics.lastSourceExchange.trim()) {
      return sourceLabelFromDiagnostics(diagnostics.lastSourceExchange);
    }
    if (diagnostics.lastSourceUsed === "FALLBACK_API") return "Bitrium Labs API";
    return sourceLabelFromDiagnostics(diagnostics.sourceKey || String(effectiveExchange));
  }, [diagnostics.lastSourceExchange, diagnostics.lastSourceUsed, diagnostics.sourceKey, effectiveExchange, isLiveFlow]);
  useEffect(() => {
    if (!isAiTradeIdeasPage) return;
    let cancelled = false;

    const syncSharedState = async () => {
      try {
        const state = await fetchAiTradeIdeasState();
        if (cancelled || !state?.ok) return;
        setAiLastUpdatedAt(String(state.updatedAt ?? ""));
        setAiUniverseCount(Number(state.universeCount ?? 0));
        const moduleStatusNext: Record<AiProviderId, AiModuleStatus> = {
          CHATGPT: { running: false, lastRunAt: "", error: "" },
          QWEN: { running: false, lastRunAt: "", error: "" },
        };
        const enabledModules: Partial<Record<AiProviderId, boolean>> = {};
        for (const moduleState of state.modules ?? []) {
          moduleStatusNext[moduleState.id] = {
            running: Boolean(moduleState.running),
            lastRunAt: String(moduleState.lastRunAt ?? ""),
            error: String(moduleState.error ?? ""),
          };
          enabledModules[moduleState.id] = Boolean(moduleState.enabled);
        }
        setAiModuleStatus(moduleStatusNext);
        if (Object.keys(enabledModules).length) {
          setAiModules((prev) => ({
            CHATGPT: enabledModules.CHATGPT === false ? false : prev.CHATGPT,
            QWEN: enabledModules.QWEN === false ? false : prev.QWEN,
          }));
        }
        const byModule = state.scansByModule ?? { CHATGPT: [], QWEN: [] };
        setAiScansByModule({
          CHATGPT: (byModule.CHATGPT ?? []) as AiScanRow[],
          QWEN: (byModule.QWEN ?? []) as AiScanRow[],
        });
        setAiStateError("");
      } catch {
        setAiStateError("AI state endpoint unavailable");
      }
    };

    void syncSharedState();
    const timer = window.setInterval(() => {
      void syncSharedState();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAiTradeIdeasPage]);

  const openTradeInExchange = (plan: TradePlan) => {
    const signal: ExchangeTradeSignal = {
      direction: plan.direction,
      horizon: plan.horizon,
      confidence: plan.confidence,
      tradeValidity: plan.tradeValidity,
      entryWindow: plan.entryWindow,
      slippageRisk: plan.slippageRisk,
      timeframe: plan.timeframe,
      validBars: plan.validUntilBars,
      timestampUtc: plan.timestampUtc,
      validUntilUtc: plan.validUntilUtc,
      setup: plan.setup,
      entryLow: plan.entry.low,
      entryHigh: plan.entry.high,
      stops: [plan.stops[0]?.price ?? plan.entry.low, plan.stops[1]?.price ?? plan.stops[0]?.price ?? plan.entry.low],
      targets: [plan.targets[0]?.price ?? plan.entry.high, plan.targets[1]?.price ?? plan.targets[0]?.price ?? plan.entry.high],
    };
    setAccountMode("Futures");
    setSelectedSymbol(toUiSymbol(plan.symbol));
    setActiveSignal(signal);
    navigate("/exchange-terminal");
  };

  const setModeRangeMin = (modeKey: ScoringMode, nextMin: number) => {
    const clamped = Math.max(FLOW_MIN_CONSENSUS, Math.min(100, clampPercent(nextMin)));
    setModeMinConsensus((prev) => {
      const next = {
        ...prev,
        [modeKey]: clamped,
      };
      writeUserModeConsensusMinPct(next);
      return next;
    });
  };
  const toggleScanMode = (modeKey: ScoringMode) => {
    setSelectedScanModes((prev) =>
      prev.includes(modeKey) ? prev.filter((key) => key !== modeKey) : [...prev, modeKey],
    );
  };

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#121316,#0d0f13)] p-3 shadow-[0_24px_52px_rgba(0,0,0,0.42)] md:p-4">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(245,197,66,0.10),transparent_68%)]" />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(90,146,255,0.08),transparent_68%)]" />

          <div className="relative space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1.2fr)]">
              <div className="rounded-xl border border-white/10 bg-[linear-gradient(145deg,#10141b,#0d1118)] px-3 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h1 className="text-lg font-semibold text-white">{isAiTradeIdeasPage ? "AI Trade Ideas" : "Quant Trade Ideas"}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      isLiveFlow
                        ? "border-[#6f765f]/70 bg-[#1f251b] text-[#d8decf]"
                        : "border-[#704844]/70 bg-[#271a19] text-[#efb5b5]"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isLiveFlow ? "bg-[#53d18a]" : "bg-[#d46a6a]"}`} />
                    {liveFlowText}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[#BFC2C7]">Source:</span>
                  <span className="font-semibold text-white">{sourceName}</span>
                  <span className="rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[10px] text-[#BFC2C7]">
                    {latencyLabel}
                  </span>
                </div>

                <p className="mt-2 text-sm text-[#6B6F76]">
                  {isAiTradeIdeasPage
                    ? "Bitrium Quant Engine — Where Market Structure Meets Execution"
                    : "Flow settings can be customized by users, and outcomes are reflected here."}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,197,66,0.08),transparent_45%),linear-gradient(180deg,#101216,#0D0F13)] px-3 py-2.5 shadow-[0_12px_24px_rgba(0,0,0,0.34)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">Trade Ideas Report</p>
                  <div className="flex items-center gap-1.5">
                    {!isAiTradeIdeasPage && (["1h", "4h", "24h", "7d"] as const).map((range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setReportTimeRange(range)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                          reportTimeRange === range
                            ? "bg-[#F5C542]/20 text-[#F5C542] border border-[#F5C542]/40"
                            : "text-[#6B6F76] hover:text-[#b7bec9] border border-transparent"
                        }`}
                      >
                        {range}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => navigate(isAiTradeIdeasPage ? "/ai-trade-ideas/report" : "/quant-trade-ideas/report")}
                      className="shrink-0 rounded-lg border border-white/10 bg-[#11151c] px-2.5 py-1 text-[11px] text-[#b7bec9] transition hover:text-white"
                    >
                      Open detailed report
                    </button>
                    {!isAiTradeIdeasPage && (
                      <button
                        type="button"
                        onClick={() => void handleReportReset()}
                        disabled={reportResetting}
                        className="shrink-0 rounded-lg border border-red-500/20 bg-[#1a0f0f] px-2.5 py-1 text-[11px] text-red-400/80 transition hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                        title="Reset all trade ideas, scan counts and scanner stats"
                      >
                        {reportResetting ? "Resetting..." : "Reset"}
                      </button>
                    )}
                  </div>
                </div>
                {isAiTradeIdeasPage ? (
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
                    <div className="rounded-lg border border-[#31415b]/60 bg-[#121a27] px-2 py-1.5 text-center">
                      <p className="text-[#7f8796]">Total</p>
                      <p className="text-base font-semibold text-white">{reportStats.total}</p>
                    </div>
                    <div className="rounded-lg border border-[#2f5a4d]/60 bg-[#11201b] px-2 py-1.5 text-center">
                      <p className="text-[#7f8796]">Success</p>
                      <p className="text-base font-semibold text-[#8fc9ab]">{reportStats.successful}</p>
                    </div>
                    <div className="rounded-lg border border-[#5f3a3a]/60 bg-[#221516] px-2 py-1.5 text-center">
                      <p className="text-[#7f8796]">Failed</p>
                      <p className="text-base font-semibold text-[#d49f9a]">{reportStats.failed}</p>
                    </div>
                    <div className="rounded-lg border border-[#5b4b2c]/60 bg-[#221c12] px-2 py-1.5 text-center">
                      <p className="text-[#7f8796]">Success %</p>
                      <p className="text-base font-semibold text-[#F5C542]">{reportStats.successRate.toFixed(1)}%</p>
                    </div>
                  </div>
                ) : (
                  <table className="mt-1.5 w-full text-[11px]">
                    <thead>
                      <tr className="text-[#7f8796]">
                        <th className="pb-1 pl-2 text-left font-medium">Mode</th>
                        <th className="pb-1 text-center font-medium">Total Scan</th>
                        <th className="pb-1 text-center font-medium">Ideas</th>
                        <th className="pb-1 text-center font-medium">Entry Missed</th>
                        <th className="pb-1 text-center font-medium">Active</th>
                        <th className="pb-1 text-center font-medium">Resolved</th>
                        <th className="pb-1 text-center font-medium">Success</th>
                        <th className="pb-1 text-center font-medium">Failed</th>
                        <th className="pb-1 pr-2 text-center font-medium">S/R</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as const).map((mode) => {
                        const s = reportStatsByMode[mode] ?? { totalScan: 0, totalIdeas: 0, active: 0, resolved: 0, successful: 0, failed: 0, entryMissed: 0, successRate: 0 };
                        const modeColors: Record<string, string> = {
                          FLOW: "border-[#3d5f8f]/50 text-[#b8d3ff]",
                          AGGRESSIVE: "border-[#8b5cf6]/50 text-[#c4b5fd]",
                          BALANCED: "border-[#d4a74a]/50 text-[#F5C542]",
                          CAPITAL_GUARD: "border-[#2f8a5e]/50 text-[#8fc9ab]",
                        };
                        return (
                          <tr key={mode} className="border-t border-white/5">
                            <td className="py-1 pl-2">
                              <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${modeColors[mode]}`}>
                                {scoringModeLabel(mode)}
                              </span>
                            </td>
                            <td className="py-1 text-center font-semibold text-[#8f95a3]">{s.totalScan}</td>
                            <td className="py-1 text-center font-semibold text-white">{s.totalIdeas}</td>
                            <td className="py-1 text-center font-semibold text-[#8A8F98]">{s.entryMissed}</td>
                            <td className="py-1 text-center font-semibold text-[#F5C542]">{s.active}</td>
                            <td className="py-1 text-center font-semibold text-[#b7bec9]">{s.resolved}</td>
                            <td className="py-1 text-center font-semibold text-[#8fc9ab]">{s.successful}</td>
                            <td className="py-1 text-center font-semibold text-[#d49f9a]">{s.failed}</td>
                            <td className="py-1 pr-2 text-center font-semibold text-[#F5C542]">{s.successRate.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {isAiTradeIdeasPage && (
                  <p className="mt-1 text-center text-[11px] text-[#8A8F98]">
                    AI report tracks only ideas scoring 60% and above.
                  </p>
                )}
              </div>
	            </div>

            <div className="flex flex-col gap-2">
            <div
              className={`grid gap-2 ${
                isAiTradeIdeasPage
                  ? "md:grid-cols-[minmax(220px,1.2fr)_auto_auto_auto_170px_1fr]"
                  : "md:grid-cols-[minmax(220px,1.2fr)_auto_auto_170px_1fr]"
              } ${isAiTradeIdeasPage ? "order-2" : "order-1"}`}
            >
            <details className="rounded-lg border border-white/15 bg-[#0F1012] p-2">
              <summary className="cursor-pointer text-xs text-[#BFC2C7]">Symbols {selectedSymbols.length ? `(${selectedSymbols.length})` : "(ALL)"}</summary>
              <div className="mt-2 grid max-h-32 grid-cols-2 gap-1 overflow-auto text-xs">
                {symbolOptions.map((symbol) => (
                  <label key={symbol} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[#F5C542]"
                      checked={selectedSymbols.includes(symbol)}
                      onChange={(e) =>
                        setSelectedSymbols((prev) =>
                          e.target.checked ? [...prev, symbol] : prev.filter((item) => item !== symbol),
                        )
                      }
                    />
                    <CoinIcon symbol={symbol} className="h-3.5 w-3.5" />
                    <span>{symbol}</span>
                  </label>
                ))}
              </div>
            </details>

            <div className="flex items-center gap-1">
              {(["ALL", "LONG", "SHORT"] as const).map((dir) => (
                <button key={dir} type="button" className={chip(direction === dir)} onClick={() => setDirection(dir)}>
                  {dir}
                </button>
              ))}
            </div>
            {isAiTradeIdeasPage ? (
              <div className="flex items-center gap-1">
                {(["ALL", "TRADE", "WATCH", "NO_TRADE"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={chip(aiDecisionFilter === value)}
                    onClick={() => setAiDecisionFilter(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {(["ALL", "TRADE", "NO_TRADE"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={chip(quantDecisionFilter === value)}
                    onClick={() => setQuantDecisionFilter(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}

            <select
              className="rounded-lg border border-white/15 bg-[#0F1012] px-2 py-1.5 text-xs text-[#BFC2C7]"
              value={mode}
              onChange={(e) => setMode(e.target.value as "ALL" | "SCALP" | "INTRADAY" | "SWING")}
            >
              <option value="ALL">All modes</option>
              <option value="SCALP">Scalp</option>
              <option value="INTRADAY">Intraday</option>
              <option value="SWING">Swing</option>
            </select>

	            <input
	              className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#E7E9ED] outline-none placeholder:text-[#6B6F76]"
	              value={search}
	              onChange={(e) => setSearch(e.target.value)}
	              placeholder="Search symbol/setup/flow/intent"
	            />
	            </div>
            {!isAiTradeIdeasPage ? (
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2.5">
              <button
                type="button"
                onClick={() => setScanPanelExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-left"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8f95a3]">
                  {isAiTradeIdeasPage ? "Last AI scan results" : "Last scanned by mode"}
                </p>
                <div className="flex items-center gap-2">
                  {!isAiTradeIdeasPage && (
                    <span className="text-[11px] text-[#6B6F76]">
                      Coin Universe ({Math.max(0, diagnostics.universeFilteredPairs)}) · Updated {diagnosticsAgeSec !== null ? `${diagnosticsAgeSec}s` : "-"} ago
                    </span>
                  )}
                  <span className="text-xs text-[#8f95a3]">{scanPanelExpanded ? "▾" : "▸"}</span>
                </div>
              </button>
              {scanPanelExpanded ? (
                <div className="mt-2 space-y-2.5">
                  {isAiTradeIdeasPage
                    ? (Object.keys(aiModules) as AiProviderId[]).map((moduleId) => {
                      const theme = AI_MODULE_THEME[moduleId];
                      const rows = aiScansByModule[moduleId] ?? [];
                      return (
                        <div
                          key={`scan-row-ai-${moduleId}`}
                          className="rounded-lg border border-white/10 bg-[#0f1622] px-2.5 py-2"
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => setAiModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))}
                              className={`min-w-[108px] rounded-md border px-2 py-1.5 text-center text-xs font-semibold transition ${theme.labelClass} ${
                                aiModules[moduleId] ? "" : "opacity-45 grayscale"
                              }`}
                            >
                              {theme.label}
                            </button>
                            <div className="min-w-0 flex-1 overflow-x-auto pb-0.5">
                              <div className="inline-flex min-h-[30px] items-start gap-1.5 pr-1">
                                {rows.length ? (
                                  rows.map((row, idx) => {
                                    const passTone = row.scorePct >= 60
                                      ? "border-[#2e7a5e]/80 bg-[#103326] text-[#b9f5dc]"
                                      : row.scorePct >= 40
                                        ? "border-[#9a7b2e]/80 bg-[#3a2c13] text-[#f7e2a4]"
                                        : "border-[#31415b]/70 bg-[#121a27] text-[#cdd8ec]";
                                    return (
                                      <span
                                        key={`${moduleId}-${row.symbol}-${idx}`}
                                        className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-[11px] ${passTone}`}
                                        title={row.reason}
                                      >
                                        {row.symbol} • {row.scorePct}% • {row.reason}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-[11px] text-[#6B6F76]">No AI scan results yet.</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                    : SCAN_MODE_ORDER.map((modeKey) => {
                      const theme = MODE_ROW_THEME[modeKey];
                      const rows = diagnostics.lastScannedByMode[modeKey] ?? [];
                      return (
                        <div
                          key={`scan-row-${modeKey}`}
                          className="rounded-lg border border-white/10 bg-[#0f1622] px-2.5 py-2"
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleScanMode(modeKey)}
                              className={`min-w-[108px] rounded-md border px-2 py-1.5 text-center text-xs font-semibold transition ${theme.labelClass} ${
                                selectedScanModes.includes(modeKey) ? "" : "opacity-45 grayscale"
                              }`}
                            >
                              {theme.label}
                            </button>
                            <div className="min-w-0 flex-1 overflow-x-auto pb-0.5">
                              <div className="inline-flex min-h-[30px] items-start gap-1.5 pr-1">
                                {rows.length ? (
                                  rows.map((row, idx) => {
                                    const scorePct = Math.max(0, Math.min(100, Math.round(row.confidencePct)));
                                    const dec = (row.decision ?? "").toUpperCase();
                                    const isTrade = dec === "TRADE";
                                    const isWatch = dec === "WATCH";
                                    const decLabel = isTrade ? "TRADE" : isWatch ? "WATCH" : "NO TRADE";
                                    const passTone = isTrade
                                      ? "border-[#2e7a5e]/80 bg-[#103326] text-[#b9f5dc]"
                                      : isWatch
                                        ? "border-[#9a7b2e]/80 bg-[#3a2c13] text-[#f7e2a4]"
                                        : "border-[#31415b]/70 bg-[#121a27] text-[#cdd8ec]";
                                    const createdTone = row.created ? "shadow-[0_0_0_1px_rgba(93,207,154,0.28)]" : "";
                                    return (
                                      <button
                                        type="button"
                                        key={`${modeKey}-${row.symbol}-${idx}`}
                                        onClick={() => setPopupScanRow({ row, mode: modeKey })}
                                        className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-[11px] cursor-pointer transition hover:brightness-110 ${passTone} ${createdTone}`}
                                        title={row.reason}
                                      >
                                        {row.symbol} • {scorePct}% • {decLabel}
                                      </button>
                                    );
                                  })
                                ) : (
                                  <span className="text-[11px] text-[#6B6F76]">No scanned symbols yet.</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : null}
            </div>
            ) : null}
            <div className={`rounded-lg border border-white/10 bg-[#0F1012] px-3 py-3 ${isAiTradeIdeasPage ? "order-1" : "order-2"}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8f95a3]">
                      {isAiTradeIdeasPage ? "AI module filters" : "Mode consensus filters"}
                    </p>
                    <p className="text-[11px] text-[#6B6F76]">
                      {isAiTradeIdeasPage
                        ? `AI Trade Ideas scans shared backend batches every 3 minutes. Universe ${aiUniverseCount} coins.`
                        : "All modes are user adjustable from 40%-100%."}
                    </p>
                  </div>
                </div>

              <div className="grid gap-2 xl:grid-cols-4">
                {isAiTradeIdeasPage
                  ? (Object.keys(aiModules) as AiProviderId[]).map((moduleId) => {
                    const active = aiModules[moduleId];
                    const status = aiModuleStatus[moduleId];
                    return (
                      <div
                        key={`ai-module-${moduleId}`}
                        className={`rounded-lg border bg-[#11151c] p-2 transition ${
                          active ? "border-white/10" : "border-white/5 opacity-55"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setAiModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))}
                            className={`rounded-md border px-2 py-1.5 text-left text-xs font-semibold ${
                              moduleId === "CHATGPT"
                                ? "border-[#3d5f8f]/80 bg-[#132033] text-[#b8d3ff]"
                                : "border-[#6b4fa8]/80 bg-[#241a3c] text-[#dbcdfd]"
                            } ${active ? "" : "opacity-45 grayscale"}`}
                          >
                            {moduleId === "CHATGPT" ? "ChatGPT" : "Qwen"}
                          </button>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              active
                                ? "border-[#6f765f]/70 bg-[#1f251b] text-[#d8decf]"
                                : "border-white/10 bg-[#0F1012] text-[#8f95a3]"
                            }`}
                          >
                            {active ? "ON" : "OFF"}
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] text-[#8f95a3]">Compact vector · Interval 3m</p>
                        <p className="mt-1 text-[10px] text-[#8f95a3]">
                          Last scan: {status.lastRunAt ? elapsedText(status.lastRunAt, nowMs) : "Not yet"}
                        </p>
                        <p className="mt-1 text-[10px] text-[#8f95a3]">
                          Updated: {aiLastUpdatedAt ? elapsedText(aiLastUpdatedAt, nowMs) : "Not yet"}
                        </p>
                        <p
                          className={`mt-1 text-[10px] font-semibold ${
                            status.error
                              ? "text-[#d6b3af]"
                              : status.running
                                ? "text-[#F5C542]"
                                : active
                                  ? "text-[#8fc9ab]"
                                  : "text-[#8f95a3]"
                          }`}
                        >
                          {status.error
                            ? `Warning: ${status.error}`
                            : status.running
                              ? "AI running..."
                              : active
                                ? (status.lastRunAt ? "AI idle (last scan OK)" : "AI idle (ready)")
                                : "Module off"}
                        </p>
                      </div>
                    );
                  })
                  : SCAN_MODE_ORDER.map((modeKey) => {
                  const active = selectedScanModes.includes(modeKey);
                  const range = modeConsensusRanges[modeKey];
                  const theme = MODE_ROW_THEME[modeKey];
                  return (
                    <div
                      key={`mode-filter-${modeKey}`}
                      className={`rounded-lg border bg-[#11151c] p-2 transition ${
                        active ? "border-white/10" : "border-white/5 opacity-55"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => toggleScanMode(modeKey)}
                          className={`rounded-md border px-2 py-1.5 text-left text-xs font-semibold transition ${theme.labelClass} ${
                            active ? "" : "opacity-45 grayscale"
                          }`}
                          aria-pressed={active}
                        >
                          {theme.label}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleScanMode(modeKey)}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            active
                              ? "border-[#6f765f]/70 bg-[#1f251b] text-[#d8decf]"
                              : "border-white/10 bg-[#0F1012] text-[#8f95a3]"
                          }`}
                          aria-pressed={active}
                        >
                          {active ? "ON" : "OFF"}
                        </button>
                      </div>
                      <div className={active ? "" : "opacity-45"}>
                        <div className="mb-1 flex items-center justify-between text-[10px] text-[#8f95a3]">
                          <span>Consensus range</span>
                          <span>{range.min}% - 100%</span>
                        </div>
                        <div className="relative" data-flow-slider>
                          <input
                            type="range"
                            min={FLOW_MIN_CONSENSUS}
                            max={100}
                            step={1}
                            value={range.min}
                            onChange={(e) => setModeRangeMin(modeKey, Number(e.target.value))}
                            disabled={false}
                            className="relative z-20 h-1.5 w-full cursor-pointer accent-[#F5C542]"
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-[#6B6F76]">
                          {`User configurable · Min ${range.min}%`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!isAiTradeIdeasPage && !selectedScanModes.length ? (
                <p className="mt-2 text-[11px] text-[#d6b3af]">No mode selected. Enable at least one mode to list trade ideas.</p>
              ) : null}
            </div>
            </div>
          </div>
        </section>
        {showStreamWarning && streamWarningText ? (
          <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
            {streamWarningText}
            {lastSuccessAt ? ` Last successful stream: ${new Date(lastSuccessAt).toLocaleTimeString()}` : ""}
          </div>
        ) : null}

        <section className="space-y-2">
          {isAiTradeIdeasPage && aiStateError ? (
            <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
              {aiStateError}
            </div>
          ) : null}
          {isAiTradeIdeasPage
            ? visibleAiRows.map((row, idx) => {
              const scoreTone = row.scorePct >= 60
                ? "border-[#2e7a5e]/80 bg-[#103326] text-[#b9f5dc]"
                : row.scorePct >= 40
                  ? "border-[#9a7b2e]/80 bg-[#3a2c13] text-[#f7e2a4]"
                  : "border-[#31415b]/70 bg-[#121a27] text-[#cdd8ec]";
              const decisionValue = String(row.decision ?? "").toUpperCase();
              const isTradeCard = decisionValue === "TRADE";
              const edge = row.edgeDetails;
              const executionEntryWindow =
                row.executionDetails?.entryWindow ?? undefined;
              const executionSlippage =
                row.executionDetails?.slippage ?? row.risk?.slippage ?? "-";
              const executionFill =
                typeof row.executionDetails?.fill === "number"
                  ? row.executionDetails.fill
                  : typeof row.risk?.fill_prob === "number"
                    ? row.risk.fill_prob
                    : undefined;
              const executionCapacity =
                typeof row.executionDetails?.capacity === "number"
                  ? row.executionDetails.capacity
                  : undefined;
              const sideLabel: AiScanRow["side"] =
                row.side === "UNKNOWN"
                  ? (decisionValue === "WATCH" ? "WAIT" : "NO_TRADE")
                  : row.side;
              const decisionTone =
                sideLabel === "LONG"
                  ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                  : sideLabel === "SHORT"
                    ? "border-[#704844] bg-[#271a19] text-[#d6b3af]"
                    : sideLabel === "WAIT"
                      ? "border-[#6e5b31] bg-[#262015] text-[#cfbf98]"
                      : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
              const moduleTheme = AI_MODULE_THEME[row.module];
              const zoneCandidates = Array.isArray(row.entry?.zone)
                ? row.entry.zone.map((value) => Number(value)).filter((value) => Number.isFinite(value))
                : [];
              const resistanceLevels = (row.sr?.resistance ?? [])
                .map((level) => toFinite(level?.p))
                .filter((value): value is number => value !== null);
              const supportLevels = (row.sr?.support ?? [])
                .map((level) => toFinite(level?.p))
                .filter((value): value is number => value !== null);
              const rangeHigh = toFinite(row.sr?.range?.high) ?? resistanceLevels[0] ?? null;
              const rangeLow = toFinite(row.sr?.range?.low) ?? supportLevels[0] ?? null;
              let resolvedEntryLow: number | null = null;
              let resolvedEntryHigh: number | null = null;
              if (zoneCandidates.length >= 2) {
                resolvedEntryLow = Math.min(zoneCandidates[0], zoneCandidates[1]);
                resolvedEntryHigh = Math.max(zoneCandidates[0], zoneCandidates[1]);
              } else if (rangeHigh !== null && rangeLow !== null) {
                const high = Math.max(rangeHigh, rangeLow);
                const low = Math.min(rangeHigh, rangeLow);
                const width = Math.max(high - low, Math.max(Math.abs(high), 1) * 0.0015);
                if (sideLabel === "SHORT") {
                  resolvedEntryLow = high - width * 0.2;
                  resolvedEntryHigh = high;
                } else if (sideLabel === "LONG") {
                  resolvedEntryLow = low;
                  resolvedEntryHigh = low + width * 0.2;
                } else {
                  const mid = (high + low) / 2;
                  resolvedEntryLow = mid - width * 0.1;
                  resolvedEntryHigh = mid + width * 0.1;
                }
              }
              const zoneWidth =
                resolvedEntryLow !== null && resolvedEntryHigh !== null
                  ? Math.max(resolvedEntryHigh - resolvedEntryLow, Math.max(Math.abs((resolvedEntryHigh + resolvedEntryLow) / 2), 1) * 0.0012)
                  : null;
              const slCandidates = [
                ...(Array.isArray(row.entry?.sl) ? row.entry.sl : []),
                row.entry?.stop,
              ]
                .map((value) => toFinite(value))
                .filter((value): value is number => value !== null);
              if (!slCandidates.length && resolvedEntryLow !== null && resolvedEntryHigh !== null && zoneWidth !== null) {
                if (sideLabel === "LONG") {
                  slCandidates.push(resolvedEntryLow - zoneWidth * 0.22, resolvedEntryLow - zoneWidth * 0.42);
                } else if (sideLabel === "SHORT") {
                  slCandidates.push(resolvedEntryHigh + zoneWidth * 0.22, resolvedEntryHigh + zoneWidth * 0.42);
                }
              }
              const sl1 = slCandidates[0] ?? null;
              const sl2 = slCandidates[1] ?? sl1;
              const tpCandidates = (Array.isArray(row.entry?.tp) ? row.entry.tp : [])
                .map((value) => toFinite(value))
                .filter((value): value is number => value !== null);
              if (!tpCandidates.length) {
                if (sideLabel === "LONG") {
                  if (rangeHigh !== null) tpCandidates.push(rangeHigh);
                  if (rangeHigh !== null && zoneWidth !== null) tpCandidates.push(rangeHigh + zoneWidth * 0.32);
                } else if (sideLabel === "SHORT") {
                  if (rangeLow !== null) tpCandidates.push(rangeLow);
                  if (rangeLow !== null && zoneWidth !== null) tpCandidates.push(rangeLow - zoneWidth * 0.32);
                }
              }
              const tp1 = tpCandidates[0] ?? null;
              const tp2 = tpCandidates[1] ?? tp1;
              return (
                <article
                  key={`${row.module}-${row.symbol}-${idx}-${row.scannedAt}`}
                  className={`rounded-xl border border-white/10 bg-[#121316] ${isTradeCard ? "p-4 shadow-[0_14px_36px_rgba(0,0,0,0.32)]" : "p-2.5"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CoinIcon symbol={row.symbol} className="h-5 w-5" />
                      <span className="text-sm font-semibold text-white">{row.symbol}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${moduleTheme.chipClass}`}>
                        {moduleTheme.label}
                      </span>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${scoreTone}`}>
                      Score {row.scorePct}%
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${decisionTone}`}>{sideLabel}</span>
                    <span className="rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[#BFC2C7]">
                      {row.tf}
                    </span>
                    {row.profile ? (
                      <span className="rounded-full border border-[#31415b]/70 bg-[#121a27] px-2 py-0.5 text-[#d5def0]">
                        {row.profile}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[#BFC2C7]">
                      Decision {row.decision}
                    </span>
                    {row.setup ? (
                      <span className="rounded-full border border-[#31415b]/70 bg-[#121a27] px-2 py-0.5 text-[#d5def0]">
                        Setup {row.setup}
                      </span>
                    ) : null}
                    {row.bias ? (
                      <span className="rounded-full border border-[#31415b]/70 bg-[#121a27] px-2 py-0.5 text-[#d5def0]">
                        Bias {row.bias}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-[#31415b]/70 bg-[#121a27] px-2 py-0.5 text-[#d5def0]">
                      Source {sourceName}
                    </span>
                    <span className="rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[#8f95a3]">
                      {elapsedText(row.scannedAt, nowMs)}
                    </span>
                  </div>
                  {isTradeCard ? (
                    <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2">
                      <div className="rounded-md border border-white/10 bg-[#0F1012] px-2 py-1.5 text-[#BFC2C7]">
                        <p className="text-[10px] uppercase tracking-wide text-[#8f95a3]">Confidence</p>
                        <p>Edge {row.edgePct ?? 0}% · Break {row.breakProbPct ?? 0}%</p>
                        <p>
                          Structure: VWAP {row.structureFlags?.vwapConfluence ? "YES" : "NO"} · HTF {row.structureFlags?.htfAlignment ? "YES" : "NO"}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-[#0F1012] px-2 py-1.5 text-[#BFC2C7]">
                        <p className="text-[10px] uppercase tracking-wide text-[#8f95a3]">Risk / Entry</p>
                        <p>
                          Slippage {row.risk?.slippage ?? "-"} · Fill {typeof row.risk?.fill_prob === "number" ? row.risk.fill_prob.toFixed(2) : "-"}
                        </p>
                        <p>
                          EdgeR {typeof row.risk?.risk_adj_edge_r === "number" ? row.risk.risk_adj_edge_r.toFixed(2) : "-"} · RR {typeof row.entry?.rr === "number" ? row.entry.rr.toFixed(2) : "-"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1.5 text-[11px] text-[#BFC2C7]">
                      <p className="text-[10px] uppercase tracking-wide text-[#8f95a3]">AI Summary</p>
                      <p>{row.reason || "No reason returned by AI module."}</p>
                      {Array.isArray(row.blockers) && row.blockers.length ? (
                        <p className="mt-1 text-[#d6b3af]">Blockers: {row.blockers.slice(0, 3).join(" · ")}</p>
                      ) : null}
                    </div>
                  )}
                  {isTradeCard ? (
                    <div className="mt-2 grid gap-2 lg:grid-cols-3">
                      <div className="rounded-lg border border-[#7a6840]/60 bg-[#2a2418] p-2.5">
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-[#d7c9a1]">Entry Zone</p>
                        <div className="grid gap-1.5">
                          <div className="rounded-md border border-[#7a6840]/70 bg-[#1f1a12] px-2.5 py-1.5 text-sm font-semibold text-[#f0dfb0]">
                            <span className="mr-1">LOW:</span>
                            <span className="font-bold text-[#F5C542]">
                              {resolvedEntryLow !== null ? formatPx(resolvedEntryLow) : "-"}
                            </span>
                          </div>
                          <div className="rounded-md border border-[#7a6840]/70 bg-[#1f1a12] px-2.5 py-1.5 text-sm font-semibold text-[#f0dfb0]">
                            <span className="mr-1">HIGH:</span>
                            <span className="font-bold text-[#F5C542]">
                              {resolvedEntryHigh !== null ? formatPx(resolvedEntryHigh) : "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#704844]/60 bg-[#271a19] p-2.5">
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-[#e0b1ac]">Stops</p>
                        <div className="grid gap-1.5">
                          <div className="rounded-md border border-[#704844]/70 bg-[#1d1414] px-2.5 py-1.5 text-sm font-semibold text-[#f0c3bf]">
                            <span className="mr-1">SL1:</span>
                            <span className="font-bold">
                              {sl1 !== null ? formatPx(sl1) : "-"}
                            </span>
                          </div>
                          <div className="rounded-md border border-[#704844]/70 bg-[#1d1414] px-2.5 py-1.5 text-sm font-semibold text-[#f0c3bf]">
                            <span className="mr-1">SL2:</span>
                            <span className="font-bold">
                              {sl2 !== null ? formatPx(sl2) : "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#6f765f]/60 bg-[#1f251b] p-2.5">
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-[#d8decf]">Targets</p>
                        <div className="grid gap-1.5">
                          <div className="rounded-md border border-[#6f765f]/70 bg-[#171f16] px-2.5 py-1.5 text-sm font-semibold text-[#dce4d0]">
                            <span className="mr-1">TP1:</span>
                            <span className="font-bold">{tp1 !== null ? formatPx(tp1) : "-"}</span>
                          </div>
                          <div className="rounded-md border border-[#6f765f]/70 bg-[#171f16] px-2.5 py-1.5 text-sm font-semibold text-[#dce4d0]">
                            <span className="mr-1">TP2:</span>
                            <span className="font-bold">{tp2 !== null ? formatPx(tp2) : "-"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {isTradeCard && (row.sr?.resistance?.length || row.sr?.support?.length) ? (
                    <p className="mt-2 text-xs text-[#BFC2C7]">
                      SR · R: {(row.sr?.resistance ?? []).slice(0, 2).map((l) => formatPx(Number(l?.p ?? 0))).join(" / ") || "-"} ·
                      S: {(row.sr?.support ?? []).slice(0, 2).map((l) => formatPx(Number(l?.p ?? 0))).join(" / ") || "-"}
                    </p>
                  ) : null}
                  {isTradeCard && Array.isArray(row.triggers) && row.triggers.length ? (
                    <p className="mt-2 text-xs text-[#8fc9ab]">Triggers: {row.triggers.join(" · ")}</p>
                  ) : null}
                  {isTradeCard && Array.isArray(row.blockers) && row.blockers.length ? (
                    <p className="mt-2 text-xs text-[#d6b3af]">Blockers: {row.blockers.join(" · ")}</p>
                  ) : null}
                  {isTradeCard && Array.isArray(row.activateIf) && row.activateIf.length ? (
                    <p className="mt-2 text-xs text-[#cfbf98]">Activate if: {row.activateIf.join(" · ")}</p>
                  ) : null}
                  {isTradeCard && row.watchZones ? (
                    <p className="mt-2 text-xs text-[#BFC2C7]">
                      Watch zones: upper {Number.isFinite(Number(row.watchZones.upper_reclaim)) ? formatPx(Number(row.watchZones.upper_reclaim)) : "-"} · lower{" "}
                      {Number.isFinite(Number(row.watchZones.lower_break)) ? formatPx(Number(row.watchZones.lower_break)) : "-"}
                    </p>
                  ) : null}
                  {isTradeCard && row.notes?.one_liner ? <p className="mt-2 text-xs text-[#BFC2C7]">{row.notes.one_liner}</p> : null}
                  {isTradeCard ? (
                    <p className="mt-2 text-xs text-[#BFC2C7]">
                      {row.reason || "No reason returned by AI module."}
                    </p>
                  ) : null}
                  {isTradeCard && row.invalidIf ? (
                    <p className="mt-2 text-xs text-[#d6b3af]">Invalid if {row.invalidIf}</p>
                  ) : null}
                  {isTradeCard && row.marketComment ? (
                    <p className="mt-1 text-xs text-[#BFC2C7]">{row.marketComment}</p>
                  ) : null}
                  {isTradeCard && edge ? (
                    <p className="mt-1 text-xs text-[#BFC2C7]">
                      • Edge {Number.isFinite(Number(edge.edgeR)) ? Number(edge.edgeR).toFixed(2) : "-"}R (pWin{" "}
                      {Number.isFinite(Number(edge.pWin)) ? Number(edge.pWin).toFixed(2) : "-"}, avgWin{" "}
                      {Number.isFinite(Number(edge.avgWinR)) ? Number(edge.avgWinR).toFixed(2) : "-"}R, cost{" "}
                      {Number.isFinite(Number(edge.costR)) ? Number(edge.costR).toFixed(2) : "-"}R)
                    </p>
                  ) : null}
                  {isTradeCard && edge ? (
                    <p className="mt-1 text-xs text-[#BFC2C7]">
                      • Pstop {Number.isFinite(Number(edge.pStop)) ? Number(edge.pStop).toFixed(2) : "-"}, expRR{" "}
                      {Number.isFinite(Number(edge.expRR)) ? Number(edge.expRR).toFixed(2) : "-"}, risk-adjusted edge{" "}
                      {Number.isFinite(Number(edge.riskAdjEdgeR)) ? Number(edge.riskAdjEdgeR).toFixed(2) : "-"}R, hold ~
                      {Number.isFinite(Number(edge.holdBars)) ? Math.round(Number(edge.holdBars)) : "-"} bars
                    </p>
                  ) : null}
                  {isTradeCard ? (
                    <p className="mt-1 text-xs text-[#BFC2C7]">
                      • Entry {String(executionEntryWindow ?? row.decision ?? "-").toUpperCase()}, slippage{" "}
                      {String(executionSlippage ?? "-").toUpperCase()}, fill{" "}
                      {typeof executionFill === "number" ? executionFill.toFixed(2) : "-"}, capacity{" "}
                      {typeof executionCapacity === "number" ? executionCapacity.toFixed(2) : "-"}
                    </p>
                  ) : null}
                  {isTradeCard ? (
                    <p className="mt-1 text-xs text-[#8f95a3]">
                      Deterministic decision: {row.decision} with final score {row.scorePct}
                    </p>
                  ) : null}
                  {isTradeCard && row.scoringMode ? (
                    <p className="mt-1 text-xs text-[#8f95a3]">
                      Scoring mode {row.scoringMode}: {row.scoringMode === "AGGRESSIVE" ? "High-frequency shared profile" : "Adaptive profile"}
                    </p>
                  ) : null}
                  {isTradeCard && Number.isFinite(Number(row.layerConsensus)) ? (
                    <p className="mt-1 text-xs text-[#8f95a3]">
                      Layer consensus {Math.round(Number(row.layerConsensus))} with edge{" "}
                      {Number.isFinite(Number(edge?.edgeR)) ? Number(edge?.edgeR).toFixed(2) : "-"}R and fill{" "}
                      {typeof executionFill === "number" ? executionFill.toFixed(2) : "-"}
                    </p>
                  ) : null}
                  {isTradeCard && row.disclaimer ? (
                    <p className="mt-1 text-xs text-[#8f95a3]">{row.disclaimer}</p>
                  ) : null}
                </article>
              );
            })
            : visible.map((plan) => {
            const formatted = formatTradePlan(plan);
            const entryDecimals = resolveDisplayDecimals([plan.entry.low, plan.entry.high], plan.pricePrecision);
            const stopDecimals = resolveDisplayDecimals(plan.stops.map((s) => s.price), plan.pricePrecision);
            const targetDecimals = resolveDisplayDecimals(plan.targets.map((t) => t.price), plan.pricePrecision);
            // Use the plan's own scoring mode — matches the scan row it came from
            const primaryModeKey: ScoringMode = (plan.scoringMode as ScoringMode) ?? "BALANCED";
            const consensusPct = Math.round((plan.confidence ?? 0) * 100);
            const primaryModeLabel = scoringModeLabel(primaryModeKey);
            const consensusHint = consensusGuidance(consensusPct);
            const decision = cardDecisionTone(plan.tradeValidity);
            return (
              <article key={plan.id} className="rounded-xl border border-white/10 bg-[#121316] p-3">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <CoinIcon symbol={plan.symbol} className="h-5 w-5" />
                      <span className="text-sm font-semibold text-white">{plan.symbol}</span>
                    </div>
                    {plan.incomplete ? <span className="rounded-full border border-[#704844] bg-[#271a19] px-2 py-0.5 text-[11px] font-semibold text-[#d6b3af]">INCOMPLETE</span> : null}
                  </div>
                </div>

                <div className="mt-1 grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="space-y-1.5">
                    <p className="text-base font-semibold text-white md:text-lg">{plan.setup}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 font-semibold ${plan.tradeValidity === "VALID" ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : plan.tradeValidity === "NO-TRADE" ? "border-[#704844] bg-[#271a19] text-[#d6b3af]" : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"}`}>
                        {plan.tradeValidity}
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 ${plan.entryWindow === "OPEN" ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : plan.entryWindow === "CLOSED" ? "border-[#704844] bg-[#271a19] text-[#d6b3af]" : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"}`}>
                        {plan.entryWindow}
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 ${plan.slippageRisk === "LOW" ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : plan.slippageRisk === "HIGH" ? "border-[#704844] bg-[#271a19] text-[#d6b3af]" : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"}`}>
                        Slippage {plan.slippageRisk}
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 font-semibold ${tone(plan.direction)}`}>{plan.direction}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="shrink-0 rounded-full border border-white/10 bg-[#121316] px-2 py-0.5 text-[#BFC2C7]">{plan.timeframe}</span>
                      <span className="shrink-0 rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[#8f95a3]">Valid ~{plan.validUntilBars} bars</span>
                      <span className="shrink-0 rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5">{plan.horizon}</span>
                      <span className="shrink-0 rounded-full border border-[#31415b]/70 bg-[#121a27] px-2 py-0.5 text-[#d5def0]">
                        Source {sourceName}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-[210px] self-start flex-col items-center justify-start">
                    {plan.tradeValidity === "NO-TRADE" && consensusPct < 70 ? (
                      <span className="mb-1 inline-flex items-center rounded-full border border-[#704844]/80 bg-[#271a19] px-2 py-0.5 text-[10px] font-semibold text-[#efb5b5]">
                        NO-TRADE warning
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => navigate("/quant-engine", { state: { selectedCoin: toDashboardCoin(plan.symbol) } })}
                      className={`w-full rounded-xl border px-3 py-2 text-center transition hover:brightness-110 ${decision.boxClass}`}
                      title={`Open Bitrium Quant Engine for ${toDashboardCoin(plan.symbol)}`}
                    >
                      <p className={`text-[10px] uppercase tracking-[0.12em] ${decision.titleClass}`}>{primaryModeLabel} · {decision.label}</p>
                      <p className={`text-2xl font-bold leading-none ${decision.textClass}`}>{consensusPct}%</p>
                    </button>
                    <p className={`mt-1 text-center text-[10px] font-medium ${consensusHint.className}`}>{consensusHint.text}</p>
                  </div>
                </div>
                {plan.setup === "Raw message" ? (
                  <pre className="mt-2 overflow-auto rounded-lg border border-white/10 bg-[#0F1012] p-2 text-[11px] text-[#BFC2C7]">
                    {plan.rawText}
                  </pre>
                ) : null}
                <div className="mt-2 grid gap-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-[#7a6840]/60 bg-[#2a2418] p-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wider text-[#d7c9a1]">Entry Zone</p>
                    <div className="grid gap-1.5">
                      <div className="rounded-md border border-[#7a6840]/70 bg-[#1f1a12] px-2.5 py-1.5 text-sm font-semibold text-[#f0dfb0]">
                        <span className="mr-1">LOW:</span>
                        <span className="font-bold text-[#F5C542]">{formatPx(plan.entry.low, entryDecimals)}</span>
                      </div>
                      <div className="rounded-md border border-[#7a6840]/70 bg-[#1f1a12] px-2.5 py-1.5 text-sm font-semibold text-[#f0dfb0]">
                        <span className="mr-1">HIGH:</span>
                        <span className="font-bold text-[#F5C542]">{formatPx(plan.entry.high, entryDecimals)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#704844]/60 bg-[#271a19] p-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wider text-[#e0b1ac]">Stops</p>
                    <div className="grid gap-1.5">
                      {plan.stops.map((s) => (
                        <div key={s.label} className="rounded-md border border-[#704844]/70 bg-[#1d1414] px-2.5 py-1.5 text-sm font-semibold text-[#f0c3bf]">
                          <span className="mr-1">{s.label}:</span>
                          <span className="font-bold">{formatPx(s.price, stopDecimals)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#6f765f]/60 bg-[#1f251b] p-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wider text-[#d8decf]">Targets</p>
                    <div className="grid gap-1.5">
                      {plan.targets.map((t) => (
                        <div key={t.label} className="rounded-md border border-[#6f765f]/70 bg-[#171f16] px-2.5 py-1.5 text-sm font-semibold text-[#dce4d0]">
                          <span className="mr-1">{t.label}:</span>
                          <span className="font-bold">{formatPx(t.price, targetDecimals)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-xs text-[#BFC2C7]">Invalid if {plan.invalidation.replace(/^Invalid if\s*/i, "")}</p>
                {(plan.tradeValidity !== "VALID" || plan.entryWindow !== "OPEN") && plan.triggersToActivate.length ? (
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <span className="text-[#6B6F76]">Activation:</span>
                    {plan.triggersToActivate.slice(0, 2).map((trigger) => (
                      <span key={trigger} className="rounded border border-[#7a6840] bg-[#2a2418] px-2 py-0.5 text-[#e7d9b3]">{"⏳ " + trigger}</span>
                    ))}
                  </div>
                ) : null}

                <p className="mt-2 text-xs text-[#BFC2C7]">
                  Market State: Trend {plan.marketState.trend} · HTF {plan.marketState.htfBias} · Volatility {plan.marketState.volatility} · {plan.marketState.execution}
                </p>

                <ul className="mt-2 space-y-1 text-xs text-[#BFC2C7]">
                  {plan.flowAnalysis.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>

                <div className="mt-2 space-y-1 text-xs text-[#BFC2C7]">
                  {plan.tradeIntent
                    .filter((line) => !/^Plan\s*·\s*Entry/i.test(line))
                    .map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px] text-[#6B6F76]">
                  <span>{plan.horizon}/{plan.timeframe} · Always manage your own risk.</span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <p className="text-[11px] leading-4 text-[#6B6F76]">
                      Time: {(() => { try { return new Date(plan.timestampUtc).toISOString(); } catch { return "-"; } })()} | {elapsedText(plan.timestampUtc, nowMs)} | until {(() => { try { return new Date(plan.validUntilUtc).toISOString(); } catch { return "-"; } })()}
                    </p>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void copy(formatted)} className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px] text-[#BFC2C7]">
                        Copy
                      </button>
                      <button type="button" onClick={() => setSharePlan(plan)} className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px] text-[#BFC2C7]">
                        Share
                      </button>
                      <button type="button" onClick={() => setEmailPlan(plan)} className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px] text-[#BFC2C7]">
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => openTradeInExchange(plan)}
                        className="rounded border border-[#7a6840] bg-[#2a2418] px-2 py-1 text-[11px] font-semibold text-[#F5C542]"
                      >
                        Trade
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {noVisibleCards && !showStreamWarning ? (
            <div className="rounded-xl border border-white/10 bg-[#121316] p-4 text-sm text-[#6B6F76]">
              {isAiTradeIdeasPage
                ? (aiStateError
                  ? `No AI trade idea cards yet. ${aiStateError}.`
                  : "No AI trade idea cards yet. System is scanning AI modules.")
                : !selectedScanModes.length
                ? "No mode selected. Enable at least one mode filter."
                : messages.length
                ? "No trade ideas matching current filters."
                : isLiveFlow
                  ? `No valid trade idea yet. Scanning live market data${diagnostics.rejected.validity || diagnostics.rejected.confidence ? ` · Blocked this cycle: Validity ${diagnostics.rejected.validity}, Confidence ${diagnostics.rejected.confidence}` : ""}.`
                  : "Trade Ideas data is unavailable."}
            </div>
          ) : null}

          <div ref={sentinelRef} className="h-10" />
        </section>
      </div>

      {/* Scan badge popup */}
      {popupScanRow && (() => {
        const { row, mode } = popupScanRow;
        const theme = MODE_ROW_THEME[mode];
        const scorePct = Math.max(0, Math.min(100, Math.round(row.confidencePct)));
        const dec = (row.decision ?? "").toUpperCase();
        const isTrade = dec === "TRADE";
        const isWatch = dec === "WATCH";
        const precision = row.pricePrecision ?? 4;
        const fmt = (n: number) => n.toFixed(precision);
        const decColor = isTrade
          ? "border-[#2e7a5e]/80 bg-[#103326] text-[#b9f5dc]"
          : isWatch
            ? "border-[#9a7b2e]/80 bg-[#3a2c13] text-[#f7e2a4]"
            : "border-[#31415b]/70 bg-[#121a27] text-[#cdd8ec]";
        const dirColor = row.direction === "LONG"
          ? "border-[#2e7a5e]/60 bg-[#0e2a1d] text-[#5dcf9a]"
          : row.direction === "SHORT"
            ? "border-[#7a2e2e]/60 bg-[#2a0e0e] text-[#e87c7c]"
            : "border-white/10 bg-[#1a1a1a] text-[#8f95a3]";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPopupScanRow(null)}>
            <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#121316] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CoinIcon symbol={row.symbol} className="h-6 w-6" />
                  <span className="text-sm font-bold text-white">{row.symbol}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${theme.chipClass}`}>{theme.label}</span>
                </div>
                <button type="button" onClick={() => setPopupScanRow(null)} className="rounded p-1 text-[#6B6F76] transition hover:bg-white/10 hover:text-white">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>

              {/* Score + Decision */}
              <div className="mb-3 flex items-center gap-3">
                <span className="text-3xl font-bold text-white">{scorePct}%</span>
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${decColor}`}>
                  {isTrade ? "TRADE" : isWatch ? "WATCH" : "NO TRADE"}
                </span>
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${dirColor}`}>
                  {row.direction || "—"}
                </span>
              </div>

              {/* Info badges */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {row.setup ? <span className="rounded border border-white/10 bg-[#1a1d22] px-2 py-0.5 text-[10px] text-[#8f95a3]">{row.setup}</span> : null}
                <span className="rounded border border-white/10 bg-[#1a1d22] px-2 py-0.5 text-[10px] text-[#8f95a3]">{row.horizon} · {row.timeframe}</span>
                <span className={`rounded border px-2 py-0.5 text-[10px] ${row.tradeValidity === "VALID" ? "border-[#2e7a5e]/50 text-[#5dcf9a]" : row.tradeValidity === "WEAK" ? "border-[#9a7b2e]/50 text-[#f7e2a4]" : "border-[#7a2e2e]/50 text-[#e87c7c]"}`}>{row.tradeValidity}</span>
                <span className={`rounded border px-2 py-0.5 text-[10px] ${row.entryWindow === "OPEN" ? "border-[#2e7a5e]/50 text-[#5dcf9a]" : row.entryWindow === "NARROW" ? "border-[#9a7b2e]/50 text-[#f7e2a4]" : "border-[#7a2e2e]/50 text-[#e87c7c]"}`}>Entry: {row.entryWindow}</span>
              </div>

              {/* Entry / SL / TP */}
              {(row.entryLow > 0 || row.entryHigh > 0) && (
                <div className="mb-2 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#6B6F76]">Entry Zone</p>
                    <p className="text-xs text-white">{fmt(row.entryLow)}</p>
                    <p className="text-xs text-white">{fmt(row.entryHigh)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#e87c7c]">Stops</p>
                    {row.slLevels.length ? row.slLevels.map((sl, i) => (
                      <p key={i} className="text-xs text-[#e87c7c]">{fmt(sl)}</p>
                    )) : <p className="text-xs text-[#6B6F76]">—</p>}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#5dcf9a]">Targets</p>
                    {row.tpLevels.length ? row.tpLevels.map((tp, i) => (
                      <p key={i} className="text-xs text-[#5dcf9a]">{fmt(tp)}</p>
                    )) : <p className="text-xs text-[#6B6F76]">—</p>}
                  </div>
                </div>
              )}

              {/* Mode Scores */}
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {(["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as ScoringMode[]).map((m) => {
                  const s = Math.round((row.modeScores[m] ?? 0) * 100);
                  const isActive = m === mode;
                  return (
                    <div key={m} className={`rounded border p-1.5 text-center ${isActive ? "border-white/20 bg-white/5" : "border-white/5 bg-[#0F1012]"}`}>
                      <p className="text-[9px] text-[#6B6F76]">{MODE_ROW_THEME[m].label}</p>
                      <p className={`text-sm font-bold ${s >= 60 ? "text-[#5dcf9a]" : s >= 40 ? "text-[#f7e2a4]" : "text-[#6B6F76]"}`}>{s}%</p>
                    </div>
                  );
                })}
              </div>

              {/* Open in Quant Engine */}
              <button
                type="button"
                onClick={() => { setPopupScanRow(null); navigate("/quant-engine", { state: { selectedCoin: toDashboardCoin(row.symbol) } }); }}
                className="w-full rounded-lg border border-[#F5C542]/30 bg-[#2a2418] py-2 text-center text-xs font-semibold text-[#F5C542] transition hover:bg-[#3a3020]"
              >
                Open in Quant Engine
              </button>
            </div>
          </div>
        );
      })()}

      <ShareModal
        open={!!sharePlan}
        text={sharePlan ? formatTradePlan(sharePlan) : ""}
        shareLink={sharePlan ? `${window.location.origin}/quant-trade-ideas?msgId=${sharePlan.id}` : `${window.location.origin}/quant-trade-ideas`}
        onClose={() => setSharePlan(null)}
      />

      <EmailModal
        open={!!emailPlan}
        defaultSubject={emailPlan ? `BITRIUM AI TRADE PLAN – ${emailPlan.symbol} – ${emailPlan.direction} – ${emailPlan.confidence.toFixed(2)}` : "BITRIUM AI TRADE PLAN"}
        defaultBody={emailPlan ? formatTradePlan(emailPlan) : ""}
        onClose={() => setEmailPlan(null)}
      />
    </main>
  );
}
