import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { ChartMetricsPanel } from "../ChartMetricsPanel";
import { TILE_DEFINITIONS } from "../../data/tileDefinitions";
import type { TileState } from "../../types";

type TabKey = "positions" | "openOrders" | "sniper" | "orderHistory" | "tradeHistory" | "transactionHistory" | "positionHistory" | "bots" | "assets";

interface Props {
  className?: string;
}

const tabs: Array<{ key: TabKey; label: string; accent?: boolean }> = [
  { key: "sniper", label: "Sniper", accent: true },
  { key: "bots", label: "Bots", accent: true },
  { key: "positions", label: "Positions" },
  { key: "openOrders", label: "Open Orders" },
  { key: "orderHistory", label: "Order History" },
  { key: "tradeHistory", label: "Trade History" },
  { key: "transactionHistory", label: "Transaction History" },
  { key: "positionHistory", label: "Position History" },
  { key: "assets", label: "Assets" },
];

// ── Bot definitions for inline bot panel ──
const INLINE_BOTS = [
  { id: "trend-pullback", name: "Trend Pullback", strategy: "Trend Following", risk: "Medium", rate: "~62%", desc: "EMA trend + RSI pullback entry" },
  { id: "breakout-retest", name: "Breakout Retest", strategy: "Breakout", risk: "Medium", rate: "~58%", desc: "S/R breakout + retest confirmation" },
  { id: "grid", name: "Grid Bot", strategy: "Market Making", risk: "Low", rate: "~70%", desc: "Auto grid orders in price range" },
  { id: "rsi-reversal", name: "RSI Reversal", strategy: "Mean Reversion", risk: "Medium", rate: "~60%", desc: "RSI extreme + candle reversal" },
  { id: "smart-dca", name: "Smart DCA", strategy: "DCA", risk: "Low", rate: "~72%", desc: "Kademeli alim + maliyet yonetimi" },
  { id: "scalping", name: "Scalping", strategy: "Scalping", risk: "High", rate: "~52%", desc: "Orderbook imbalance + micro momentum" },
  { id: "bollinger-reversion", name: "Bollinger", strategy: "Volatility", risk: "Low", rate: "~65%", desc: "Band reversion to mean" },
  { id: "momentum-volume", name: "Momentum+Vol", strategy: "Momentum", risk: "Medium", rate: "~57%", desc: "Price momentum + volume spike" },
  { id: "trend", name: "Trend Bot", strategy: "Trend Following", risk: "Medium", rate: "~55%", desc: "Simple EMA cross system" },
  { id: "vwap-reversion", name: "VWAP Reversion", strategy: "VWAP", risk: "Low", rate: "~63%", desc: "Deviation from fair value" },
] as const;

const riskColor = (r: string) => r === "Low" ? "text-[#2bc48a]" : r === "High" ? "text-[#f6465d]" : "text-[#F5C542]";

const BotsInlinePanel = () => {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#1A1B1F]">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#F5C542]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="12" cy="5" r="3" />
          <path d="M12 8v3" />
          <circle cx="8" cy="16" r="1" />
          <circle cx="16" cy="16" r="1" />
          <path d="M9 19h6" />
        </svg>
      </div>
      <p className="text-sm text-[#6B6F76]">No bots active on this chart.</p>
      <a
        href="/bot"
        className="inline-flex items-center gap-2 rounded-lg border border-[#F5C542]/40 bg-[#2a2418] px-4 py-2 text-sm font-semibold text-[#F5C542] transition hover:border-[#F5C542] hover:bg-[#3a3020]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Add Bot
      </a>
      <p className="text-[10px] text-[#6B6F76]">Go to Bot Library and click <span className="text-[#F5C542]">Use on Chart</span> to attach a bot.</p>
    </div>
  );
};

/** Sniper snapshot hook — fetches full tile snapshot from /api/market/trade-idea (same as SuperCharts) */
const useSniperSnapshot = (symbol: string, exchange: string) => {
  const [tiles, setTiles] = useState<TileState[]>([]);
  const [layerScores, setLayerScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!symbol) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const rawSymbol = symbol.replace("/", "").toUpperCase();
      const exchangeName = exchange || "Binance";
      const apiKey = (() => {
        try { return window.localStorage.getItem("market-data-api-key") || "4f8430d3a7a14b44a16bd10f3a4dd61d"; }
        catch { return "4f8430d3a7a14b44a16bd10f3a4dd61d"; }
      })();
      const qs = new URLSearchParams({
        symbol: rawSymbol, timeframe: "15m", horizon: "INTRADAY",
        exchange: exchangeName, apiKey, source: "fallback",
        scoring_mode: "BALANCED", include_snapshot: "1",
      });
      const res = await fetch(`/api/market/trade-idea?${qs.toString()}`, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (ac.signal.aborted) return;
      const parsed: TileState[] = (body.snapshot_tiles ?? []).map((t: any) => {
        const def = (TILE_DEFINITIONS as Record<string, any>)[t.key];
        return {
          key: t.key,
          label: def?.label ?? t.key.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          category: def?.category ?? ("Price Structure" as const),
          state: t.state, value: t.value, unit: def?.unit, rawValue: t.rawValue,
          confidence: 0, updatedAt: new Date().toISOString(), advanced: false,
          dependsOnFeeds: def?.dependsOnFeeds ?? [],
        };
      });
      setTiles(parsed);
      setLayerScores(body.ai_panel?.layerScores ?? {});
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message ?? "Failed to load sniper data");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [symbol, exchange]);

  useEffect(() => {
    void fetchSnapshot();
    const timer = window.setInterval(() => void fetchSnapshot(), 30_000); // refresh every 30s
    return () => { window.clearInterval(timer); abortRef.current?.abort(); };
  }, [fetchSnapshot]);

  return { tiles, layerScores, loading, error };
};

export const FuturesBottomPanel = ({ className = "" }: Props) => {
  const {
    positions,
    openOrders,
    orderHistory,
    tradeHistory,
    transactionHistory,
    positionHistory,
    botsHistory,
    assetsHistory,
    selectedSymbol,
    selectedExchange,
  } = useExchangeTerminalStore();
  const [active, setActive] = useState<TabKey>("sniper");

  // Sniper data — full snapshot from /api/market/trade-idea (same engine as SuperCharts)
  const sniperData = useSniperSnapshot(selectedSymbol, selectedExchange);

  const counts = useMemo(
    () => ({
      positions: positions.length,
      openOrders: openOrders.length,
      sniper: sniperData.tiles.length,
      orderHistory: orderHistory.length,
      tradeHistory: tradeHistory.length,
      transactionHistory: transactionHistory.length,
      positionHistory: positionHistory.length,
      bots: botsHistory.length,
      assets: assetsHistory.length,
    }),
    [assetsHistory.length, botsHistory.length, openOrders.length, orderHistory.length, positionHistory.length, positions.length, sniperData.tiles.length, tradeHistory.length, transactionHistory.length],
  );

  const empty = <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-[#6B6F76]">No data from exchange API.</div>;

  return (
    <section className={`${className} flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121316]`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-2 py-2 text-sm">
        {tabs.map((tab) => {
          const isSniper = tab.key === "sniper";
          const isBots = tab.key === "bots";
          const sniperColor = "#f6465d";
          const botsColor = "#F5C542";
          const activeColor = isSniper ? sniperColor : isBots ? botsColor : "#F5C542";
          const hoverColor = isSniper ? "hover:text-[#f6465d]" : isBots ? "hover:text-[#F5C542]" : "";
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`inline-flex items-center gap-1 transition ${
                active === tab.key
                  ? `border-b pb-0.5 font-semibold`
                  : `text-[#6B6F76] ${hoverColor}`
              }`}
              style={active === tab.key ? { borderColor: activeColor, color: activeColor } : undefined}
            >
              {isSniper && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
              )}
              {isBots && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="3" /><path d="M12 8v3" /><circle cx="8" cy="16" r="1" /><circle cx="16" cy="16" r="1" />
                </svg>
              )}
              {tab.label}{!isSniper && !isBots ? `(${counts[tab.key]})` : ""}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {active === "positions" ? (
          positions.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Symbol", "Side", "Size", "Entry", "Mark", "Pnl", "Liq.Price", "Leverage"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{p.symbol}</td>
                    <td className={`px-2 py-1.5 ${p.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{p.side}</td>
                    <td className="px-2 py-1.5">{p.size}</td>
                    <td className="px-2 py-1.5">{p.entry.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.mark.toFixed(2)}</td>
                    <td className={`px-2 py-1.5 ${p.pnl >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{p.pnl.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.liquidation.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.leverage}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : empty
        ) : null}

        {active === "openOrders" ? (
          openOrders.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Date", "Pair", "Type", "Side", "Price", "Amount", "Filled", "Total"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => (
                  <tr key={o.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{o.date}</td>
                    <td className="px-2 py-1.5">{o.pair}</td>
                    <td className="px-2 py-1.5">{o.type}</td>
                    <td className={`px-2 py-1.5 ${o.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{o.side}</td>
                    <td className="px-2 py-1.5">{o.price.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{o.amount.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{o.filledPct.toFixed(1)}%</td>
                    <td className="px-2 py-1.5">{o.total.toFixed(2)} USDT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : empty
        ) : null}

        {active === "sniper" ? (
          <div className="p-2">
            <ChartMetricsPanel
              tiles={sniperData.tiles}
              layerScores={sniperData.layerScores}
              loading={sniperData.loading}
              error={sniperData.error}
            />
          </div>
        ) : null}

        {active === "orderHistory" ? (
          orderHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Date", "Pair", "Type", "Side", "Price", "Amount", "Filled", "Status"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderHistory.map((o) => (
                  <tr key={o.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{o.date}</td>
                    <td className="px-2 py-1.5">{o.pair}</td>
                    <td className="px-2 py-1.5">{o.type}</td>
                    <td className="px-2 py-1.5">{o.side}</td>
                    <td className="px-2 py-1.5">{o.price.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{o.amount.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{o.filled.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : empty
        ) : null}

        {active === "tradeHistory" ? (
          tradeHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Date", "Pair", "Side", "Price", "Amount", "Fee", "Realized Pnl"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tradeHistory.map((t) => (
                  <tr key={t.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{t.date}</td>
                    <td className="px-2 py-1.5">{t.pair}</td>
                    <td className="px-2 py-1.5">{t.side}</td>
                    <td className="px-2 py-1.5">{t.price.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{t.amount.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{t.fee.toFixed(4)} {t.feeAsset}</td>
                    <td className={`px-2 py-1.5 ${t.realizedPnl >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{t.realizedPnl.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : empty
        ) : null}

        {active === "transactionHistory" ? (
          transactionHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Date", "Type", "Amount", "Asset", "Symbol", "Info"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactionHistory.map((t) => (
                  <tr key={t.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{t.date}</td>
                    <td className="px-2 py-1.5">{t.type}</td>
                    <td className="px-2 py-1.5">{t.amount.toFixed(4)}</td>
                    <td className="px-2 py-1.5">{t.asset}</td>
                    <td className="px-2 py-1.5">{t.symbol ?? "-"}</td>
                    <td className="px-2 py-1.5">{t.info ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : empty
        ) : null}

        {active === "positionHistory" ? (positionHistory.length ? <pre className="p-2 text-[11px] text-[#BFC2C7]">{JSON.stringify(positionHistory, null, 2)}</pre> : empty) : null}
        {active === "bots" ? (
          <BotsInlinePanel />
        ) : null}
        {active === "assets" ? (
          assetsHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Asset", "Available", "Total"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assetsHistory.map((a) => (
                  <tr key={a.asset} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{a.asset}</td>
                    <td className="px-2 py-1.5">{a.available.toFixed(6)}</td>
                    <td className="px-2 py-1.5">{a.total.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : empty
        ) : null}
      </div>
    </section>
  );
};
