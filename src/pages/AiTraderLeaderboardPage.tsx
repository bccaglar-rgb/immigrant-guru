import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AiTraderTopTabs } from "../components/AiTraderTopTabs";
import { type LeaderboardTrader, loadLeaderboardTraders, tickLeaderboardPnl } from "../services/aiTraderLeaderboardStore";
import { setPendingStrategyCopy } from "../services/strategyClipboardStore";

const fmtSigned = (value: number, digits = 2) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const pnlColor = (value: number) => (value >= 0 ? "text-[#34d399]" : "text-[#fb7185]");

export default function AiTraderLeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardTrader[]>(() => loadLeaderboardTraders());
  const navigate = useNavigate();

  useEffect(() => {
    setRows(loadLeaderboardTraders());
    const timer = window.setInterval(() => {
      tickLeaderboardPnl();
      setRows(loadLeaderboardTraders());
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const leader = rows[0] ?? null;
  const avgPnl = useMemo(() => {
    if (!rows.length) return 0;
    const total = rows.reduce((sum, row) => sum + row.pnlPct, 0);
    return total / rows.length;
  }, [rows]);

  const copyStrategy = (row: LeaderboardTrader) => {
    setPendingStrategyCopy({
      name: `${row.name} Copy`,
      traderName: row.name,
      model: row.model,
      venue: row.venue,
      style: "INTRADAY",
    });
    navigate("/ai-trader/strategy");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(58,130,246,0.15),transparent_42%),radial-gradient(circle_at_100%_100%,rgba(14,165,233,0.14),transparent_45%),#0B0F14] p-4 text-[#d9e0ef] md:p-6">
      <div className="mx-auto max-w-[1760px]">
        <AiTraderTopTabs />
        <header className="mb-4 flex items-start justify-between border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-[#2c3549] bg-[#111827] px-2 py-1 text-lg leading-none text-[#7dd3fc]">🏆</span>
              <h1 className="text-3xl font-semibold tracking-tight text-white">AI Competition</h1>
              <span className="rounded-md border border-[#465277] bg-[#121b2e] px-2 py-1 text-xs text-[#93c5fd]">{rows.length} traders</span>
            </div>
            <p className="mt-1 text-sm text-[#8ca0bf]">Live ranking by trader PnL</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-[#8392aa]">Leader</p>
            <p className="text-2xl font-semibold text-[#22d3ee]">{leader?.name ?? "No published trader yet"}</p>
            <p className={`text-xl font-semibold ${leader ? pnlColor(leader.pnlPct) : "text-[#93c5fd]"}`}>
              {leader ? `${fmtSigned(leader.pnlPct)}%` : "Publish a strategy"}
            </p>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.86),rgba(9,14,24,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_60px_rgba(1,5,14,0.5)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-3xl font-semibold text-white">Performance Snapshot</h2>
              <p className="text-sm text-[#7e8faa]">Live PnL % (3s refresh)</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[#2c3549] bg-[#121827] px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-[#8092ad]">Leader</p>
                <p className="mt-1 text-lg font-semibold text-[#f8fafc]">{leader?.name ?? "N/A"}</p>
              </div>
              <div className="rounded-xl border border-[#234a46] bg-[#102726] px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-[#7aa7a2]">Lead PnL</p>
                <p className={`mt-1 text-lg font-semibold ${leader ? pnlColor(leader.pnlPct) : "text-[#cce7de]"}`}>
                  {leader ? `${fmtSigned(leader.pnlPct)}%` : "0.00%"}
                </p>
              </div>
              <div className="rounded-xl border border-[#42306a] bg-[#1a1230] px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-[#9e8ed0]">Average PnL</p>
                <p className={`mt-1 text-lg font-semibold ${pnlColor(avgPnl)}`}>{fmtSigned(avgPnl)}%</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-[#8ca0bf]">
              Publish from <span className="font-semibold text-[#dbeafe]">Strategy</span> page to add a trader here.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.86),rgba(9,14,24,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_60px_rgba(1,5,14,0.5)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-3xl font-semibold text-white">Leaderboard</h2>
              <span className="rounded-md border border-[#2e4f73] bg-[#10263d] px-2 py-1 text-sm font-semibold text-[#7dd3fc]">LIVE</span>
            </div>
            {rows.length ? (
              <div className="space-y-2">
                {rows.map((row, index) => (
                  <div
                    key={row.id}
                    className={`grid grid-cols-[56px_1fr_170px_160px_84px_160px] items-center gap-2 rounded-xl border px-3 py-2 ${
                      index === 0 ? "border-[#4ea1ff]/40 bg-[#121f35] shadow-[0_0_0_1px_rgba(78,161,255,0.2)]" : "border-[#25344f] bg-[#0f1828]"
                    }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#3c4f73] bg-[#141f35] text-sm font-semibold text-[#dbeafe]">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{row.name}</p>
                      <p className="text-xs tracking-wide text-[#86a4d7]">{row.model} + {row.venue}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider text-[#7f92b1]">Equity</p>
                      <p className="text-2xl font-semibold text-[#e8edf7]">{row.equity.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider text-[#7f92b1]">P&L</p>
                      <p className={`text-3xl font-semibold ${pnlColor(row.pnlPct)}`}>{fmtSigned(row.pnlPct)}%</p>
                      <p className={`text-sm ${pnlColor(row.pnlAbs)}`}>{fmtSigned(row.pnlAbs)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider text-[#7f92b1]">POS</p>
                      <p className="text-2xl font-semibold text-[#e8edf7]">{row.openPositions}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className={`h-3.5 w-3.5 rounded-full ${row.live ? "bg-[#34d399] shadow-[0_0_10px_rgba(52,211,153,0.6)]" : "bg-[#fb7185]"}`} />
                      <button
                        type="button"
                        onClick={() => copyStrategy(row)}
                        className="rounded-md border border-[#7a6840] bg-[#2a2418] px-2 py-1 text-[11px] font-semibold text-[#F5C542]"
                      >
                        Copy Strategy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/20 bg-[#0f1828] px-4 py-8 text-center text-sm text-[#9bb0cd]">
                No published trader yet. Open Strategy and publish your first trader.
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
