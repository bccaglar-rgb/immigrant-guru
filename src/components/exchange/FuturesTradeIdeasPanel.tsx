import { useEffect, useMemo, useRef, useState } from "react";
import { CoinIcon } from "../CoinIcon";
import { useAdminConfig } from "../../hooks/useAdminConfig";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { useTradeIdeasStream } from "../../hooks/useTradeIdeasStream";

interface Props {
  className?: string;
}

export const FuturesTradeIdeasPanel = ({ className = "" }: Props) => {
  const { config } = useAdminConfig();
  const minConfidence = config.tradeIdeas.minConfidence;
  const {
    selectedSymbol,
    selectedExchange,
    setSelectedSymbol,
    positions,
    setAccountData,
    setActiveSignal,
    clearActiveSignal,
    activeSignal,
    tickers,
    tradeIdeasClosed,
    tradeIdeasCloseReason,
    setTradeIdeasClosed,
  } = useExchangeTerminalStore();
  const { messages } = useTradeIdeasStream(minConfidence, selectedExchange);

  const [coinScope, setCoinScope] = useState<"SELECTED" | "ALL">("ALL");
  const [nowTs, setNowTs] = useState(() => Date.now());
  const timersRef = useRef<Map<string, number>>(new Map());

  const toUiSymbol = (raw: string) => {
    const upper = String(raw ?? "").toUpperCase();
    if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}/USDT`;
    return upper.replace("_", "/");
  };

  const ideas = useMemo(() => {
    const mapped = messages
      .map((m) => ({
        id: m.id,
        symbol: toUiSymbol(m.symbol),
        direction: m.direction,
        confidence: m.confidence,
        entryLow: Number(m.entry.low ?? 0),
        entryHigh: Number(m.entry.high ?? 0),
        stops: [Number(m.stops[0]?.price ?? 0), Number(m.stops[1]?.price ?? m.stops[0]?.price ?? 0)],
        targets: [Number(m.targets[0]?.price ?? 0), Number(m.targets[1]?.price ?? m.targets[0]?.price ?? 0)],
        createdAt: new Date(m.createdAt).getTime() || Date.now(),
        expiresAt: new Date(m.validUntilUtc).getTime() || Date.now() + 180000,
        timeframe: m.timeframe,
        validBars: m.validUntilBars,
      }))
      .filter((m) => Number.isFinite(m.entryLow) && Number.isFinite(m.entryHigh));

    if (coinScope === "SELECTED") {
      return mapped.filter((m) => m.symbol === selectedSymbol);
    }
    return mapped;
  }, [coinScope, messages, selectedSymbol]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (tradeIdeasClosed) return;
    if (!activeSignal) return;
    const ticker = tickers.find((t) => t.symbol === selectedSymbol);
    const price = Number(ticker?.lastPrice ?? NaN);
    if (!Number.isFinite(price) || price <= 0) return;

    const low = Math.min(activeSignal.entryLow, activeSignal.entryHigh);
    const high = Math.max(activeSignal.entryLow, activeSignal.entryHigh);
    const mid = (low + high) / 2;
    const range = Math.max(1e-9, high - low);
    const tolerance = Math.max(mid * 0.0012, range * 0.35); // 0.12% veya range'in %35'i
    const breached = price < low - tolerance || price > high + tolerance;
    if (!breached) return;

    setTradeIdeasClosed(true, "Entry range breached.");
    setAccountData({
      positions: positions.filter((p) => !String(p.id).startsWith("idea-pos-")),
    });
  }, [
    activeSignal?.entryHigh,
    activeSignal?.entryLow,
    positions,
    selectedSymbol,
    setAccountData,
    setTradeIdeasClosed,
    tickers,
    tradeIdeasClosed,
    activeSignal,
  ]);

  useEffect(() => {
    if (tradeIdeasClosed || ideas.length === 0) {
      clearActiveSignal();
    }
  }, [clearActiveSignal, ideas.length, tradeIdeasClosed]);

  const elapsedLabel = (ts: number) => {
    const diff = Math.max(0, Math.floor((nowTs - ts) / 1000));
    const mm = Math.floor(diff / 60);
    const ss = diff % 60;
    return `${mm}m ${String(ss).padStart(2, "0")}s ago`;
  };

  const openFromIdea = (idea: (typeof ideas)[number]) => {
    const posId = `idea-pos-${idea.id}`;
    if (positions.some((p) => p.id === posId)) {
      setSelectedSymbol(idea.symbol);
      return;
    }

    const entry = Number(((idea.entryLow + idea.entryHigh) / 2).toFixed(2));
    const nextPosition = {
      id: posId,
      symbol: idea.symbol,
      side: idea.direction === "LONG" ? ("BUY" as const) : ("SELL" as const),
      size: 1,
      entry,
      mark: entry,
      pnl: 0,
      liquidation: Number(idea.stops[1] || idea.stops[0] || entry),
      leverage: 5,
    };

    setAccountData({ positions: [nextPosition, ...positions] });
    setSelectedSymbol(idea.symbol);
    setActiveSignal({
      direction: idea.direction,
      horizon: "INTRADAY",
      confidence: idea.confidence,
      tradeValidity: "VALID",
      entryWindow: "OPEN",
      slippageRisk: "MED",
      timeframe: idea.timeframe,
      validBars: idea.validBars,
      timestampUtc: new Date().toISOString(),
      validUntilUtc: new Date(Math.max(Date.now() + 60_000, idea.expiresAt)).toISOString(),
      setup: "Live Trade Idea",
      entryLow: idea.entryLow,
      entryHigh: idea.entryHigh,
      stops: idea.stops,
      targets: idea.targets,
    });

    const ttlMs = Math.max(1000, Math.max(Date.now() + 60_000, idea.expiresAt) - Date.now());
    const timerId = window.setTimeout(() => {
      const state = useExchangeTerminalStore.getState();
      state.setAccountData({ positions: state.positions.filter((p) => p.id !== posId) });
      timersRef.current.delete(posId);
    }, ttlMs);
    timersRef.current.set(posId, timerId);
  };

  return (
    <section className={`${className} flex flex-col rounded-xl border border-white/10 bg-[#121316] p-3`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#BFC2C7]">Trade Ideas</div>
        <div className="inline-flex rounded-md border border-white/10 bg-[#0F1012] p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => setCoinScope("SELECTED")}
            className={`rounded px-2 py-1 ${coinScope === "SELECTED" ? "bg-[#2b2417] text-[#F5C542]" : "text-[#8A8F98]"}`}
          >
            {selectedSymbol}
          </button>
          <button
            type="button"
            onClick={() => setCoinScope("ALL")}
            className={`rounded px-2 py-1 ${coinScope === "ALL" ? "bg-[#2b2417] text-[#F5C542]" : "text-[#8A8F98]"}`}
          >
            All
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {tradeIdeasClosed ? (
          <div className="rounded-lg border border-[#704844] bg-[#271a19] p-3 text-center text-xs text-[#d6b3af]">
            Trade ideas closed: {tradeIdeasCloseReason ?? "Entry range breached."}
          </div>
        ) : null}
        {(ideas.length ? ideas : []).map((idea) => (
          <article key={idea.id} className="rounded-lg border border-white/10 bg-[#0F1012] p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CoinIcon symbol={idea.symbol} className="h-4 w-4" />
                <span className="text-xs font-semibold text-white">{idea.symbol}</span>
              </div>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                  idea.direction === "LONG"
                    ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                    : "border-[#704844] bg-[#271a19] text-[#d6b3af]"
                }`}
              >
                {idea.direction}
              </span>
            </div>
            <div className="mb-1 text-[11px] text-[#6B6F76]">Entry {idea.entryLow.toFixed(2)} - {idea.entryHigh.toFixed(2)}</div>
            <div className="mb-1 text-[11px] text-[#d6b3af]">SL1 {idea.stops[0].toFixed(2)} / SL2 {idea.stops[1].toFixed(2)}</div>
            <div className="mb-2 text-[11px] text-[#d8decf]">TP1 {idea.targets[0].toFixed(2)} / TP2 {idea.targets[1].toFixed(2)}</div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F5C542]">{Math.round(idea.confidence * 100)}%</span>
              <button
                type="button"
                onClick={() => openFromIdea(idea)}
                disabled={tradeIdeasClosed}
                className="rounded border border-[#7a6840] bg-[#2a2418] px-2 py-1 text-[11px] font-semibold text-[#F5C542]"
              >
                Trade
              </button>
            </div>
            <div className="mt-1 text-[10px] text-[#6B6F76]">{elapsedLabel(idea.createdAt)}</div>
          </article>
        ))}

        {!ideas.length ? (
          <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3 text-center text-xs text-[#6B6F76]">
            No live trade ideas for current filter.
          </div>
        ) : null}
      </div>
    </section>
  );
};
