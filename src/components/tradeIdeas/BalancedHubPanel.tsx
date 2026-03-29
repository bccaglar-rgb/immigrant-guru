/**
 * BalancedHubPanel — Full diagnostic detail panel for a selected Hub item
 */
import type { HubSnapshotItem } from "../../hooks/useBalancedHub";

/* ── Score bar helper ───────────────────────────────────── */
function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value >= 65 ? "#53d18a" : value >= 45 ? "#e7d073" : "#d46a6a";
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-[#8c8e93]">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] font-semibold" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  );
}

/* ── Gate chip ────────────────────────────────────────── */
function GateChip({ name, passed }: { name: string; passed: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
      passed ? "border-[#2d6b40]/60 bg-[#142018] text-[#53d18a]" : "border-[#5a3030]/60 bg-[#1c1416] text-[#d46a6a]"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${passed ? "bg-[#53d18a]" : "bg-[#d46a6a]"}`} />
      {name}
    </span>
  );
}

/* ── Bias gauge ───────────────────────────────────────── */
function BiasGauge({ score }: { score: number }) {
  const pct = ((score + 1) / 2) * 100; // -1→0%, 0→50%, +1→100%
  const color = score >= 0.25 ? "#53d18a" : score <= -0.25 ? "#d46a6a" : "#6B6F76";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-[#6B6F76]">
        <span>SHORT</span>
        <span>NEUTRAL</span>
        <span>LONG</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-[#d46a6a]/30 via-[#6B6F76]/20 to-[#53d18a]/30 overflow-hidden">
        <div
          className="absolute top-0 h-full w-2.5 rounded-full border border-white/40 -translate-x-1/2 transition-all"
          style={{ left: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-center text-[11px] font-semibold" style={{ color }}>
        {score >= 0 ? "+" : ""}{score.toFixed(3)}
      </div>
    </div>
  );
}

/* ── TP/SL visual ─────────────────────────────────────── */
function TpSlVisual({ tpSl, direction: _direction }: { tpSl: NonNullable<HubSnapshotItem["payload"]["tpSl"]>; direction: string }) {
  const entryMid = (tpSl.entryZone[0] + tpSl.entryZone[1]) / 2;
  const sl = tpSl.stopLoss;
  const tp = tpSl.tp1.price;
  const slMarginPct = entryMid > 0 ? Math.abs(((sl - entryMid) / entryMid) * 100).toFixed(1) : "0";
  const tpMarginPct = entryMid > 0 ? Math.abs(((tp - entryMid) / entryMid) * 100).toFixed(1) : "0";
  const levels = [
    { label: `SL (${slMarginPct}%)`, price: sl, color: "#d46a6a", alloc: null },
    { label: "Entry", price: entryMid, color: "#F5C542", alloc: null },
    { label: `TP (${tpMarginPct}%)`, price: tp, color: "#53d18a", alloc: null },
  ].sort((a, b) => a.price - b.price);

  const min = levels[0].price;
  const max = levels[levels.length - 1].price;
  const range = max - min || 1;

  return (
    <div className="space-y-1.5">
      <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
        {levels.map((lv) => {
          const pos = ((lv.price - min) / range) * 100;
          return (
            <div
              key={lv.label}
              className="absolute top-0 h-full w-1.5 rounded-full -translate-x-1/2"
              style={{ left: `${pos}%`, backgroundColor: lv.color }}
              title={`${lv.label}: ${lv.price.toFixed(4)}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px]">
        {levels.map((lv) => (
          <div key={lv.label} className="text-center">
            <div className="font-medium" style={{ color: lv.color }}>{lv.label}</div>
            <div className="text-[#6B6F76]">{lv.price < 1 ? lv.price.toFixed(5) : lv.price.toFixed(2)}</div>
            {lv.alloc != null && <div className="text-[#8c8e93]">{(lv.alloc * 100).toFixed(0)}%</div>}
          </div>
        ))}
      </div>
      <div className="text-center text-[10px] text-[#b7bec9]">
        R:R <span className="font-semibold text-white">{tpSl.riskRewardRatio.toFixed(2)}</span>
      </div>
    </div>
  );
}

/* ── Main Panel ───────────────────────────────────────── */
interface Props {
  item: HubSnapshotItem;
  onClose: () => void;
}

const ALL_GATES = ["RiskGate", "DataHealth", "TradeValidity", "EntryWindow", "FillProbability", "ExpectedEdge"];

export function BalancedHubPanel({ item, onClose }: Props) {
  const p = item.payload;
  const coreBreak = p?.coreBreakdown;
  const penalties = p?.penalties ?? {};
  const tpSl = p?.tpSl;
  const posSize = p?.positionSize;

  return (
    <div className="space-y-3 rounded-xl border border-[#7a6840]/50 bg-[#12100c] p-3 shadow-[0_12px_36px_rgba(0,0,0,0.4)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white">{item.symbol.replace("USDT", "")}</span>
          <span className="text-[11px] text-[#6B6F76]">USDT</span>
          <span className={`text-sm font-bold ${
            item.direction === "LONG" ? "text-[#53d18a]" : item.direction === "SHORT" ? "text-[#d46a6a]" : "text-[#6B6F76]"
          }`}>
            {item.direction === "LONG" ? "\u25B2 LONG" : item.direction === "SHORT" ? "\u25BC SHORT" : "\u25C6 NONE"}
          </span>
        </div>
        <button onClick={onClose} className="text-[#6B6F76] hover:text-white transition text-lg leading-none">&times;</button>
      </div>

      {/* Score + Decision */}
      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="text-2xl font-black text-[#e7d9b3]">{item.adjustedScore.toFixed(1)}</div>
          <div className="text-[10px] text-[#6B6F76]">Adjusted</div>
        </div>
        <div className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
          item.decision === "HIGH_QUALITY" ? "border-[#2d6b40] bg-[#142018] text-[#53d18a]"
          : item.decision === "APPROVED" ? "border-[#7a6830] bg-[#1f1e10] text-[#e7d073]"
          : item.decision === "PROBE" ? "border-[#4a6a30] bg-[#1a1f14] text-[#a3c97a]"
          : item.decision === "WATCHLIST" ? "border-[#3d5575] bg-[#1a1e25] text-[#8ca8d4]"
          : "border-[#5a3030] bg-[#1c1416] text-[#d46a6a]"
        }`}>
          {item.decision.replace("_", " ")}
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] text-[#6B6F76]">Regime</div>
          <div className={`text-sm font-semibold ${
            item.regime === "TREND" ? "text-[#53d18a]"
            : item.regime === "BREAKOUT_SETUP" ? "text-[#e7d073]"
            : item.regime === "HIGH_STRESS" ? "text-[#d46a6a]"
            : item.regime === "FAKE_BREAK_RISK" ? "text-[#d4a06a]"
            : "text-[#8ca8d4]"
          }`}>
            {item.regime.replace("_", " ")}
          </div>
          {p?.regimeMultiplier != null && (
            <div className="text-[10px] text-[#8c8e93]">x{p.regimeMultiplier.toFixed(2)}</div>
          )}
        </div>
      </div>

      {/* Core Score Breakdown */}
      {coreBreak && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-[#b7bec9]">Core Score Breakdown</div>
          <ScoreBar label="Structure" value={coreBreak.structure} />
          <ScoreBar label="Liquidity" value={coreBreak.liquidity} />
          <ScoreBar label="Positioning" value={coreBreak.positioning} />
          <ScoreBar label="Volatility" value={coreBreak.volatility} />
          <ScoreBar label="Execution" value={coreBreak.execution} />
          <div className="flex items-center justify-between pt-0.5 border-t border-white/5">
            <span className="text-[11px] text-[#8c8e93]">Weighted Total</span>
            <span className="text-sm font-bold text-[#e7d9b3]">{coreBreak.total.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* Bias Gauge */}
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-[#b7bec9]">Directional Bias</div>
        <BiasGauge score={item.biasScore} />
      </div>

      {/* Gates */}
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-[#b7bec9]">Hard Gates</div>
        <div className="flex flex-wrap gap-1">
          {ALL_GATES.map((g) => (
            <GateChip key={g} name={g} passed={!item.failedGates.includes(g)} />
          ))}
        </div>
      </div>

      {/* Penalty Breakdown */}
      {Object.keys(penalties).length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#b7bec9]">Penalties</span>
            <span className="text-[11px] font-bold text-[#d4a06a]">-{item.penalty.toFixed(1)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {Object.entries(penalties).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[#8c8e93]">{k}</span>
                <span className={v > 0 ? "text-[#d4a06a]" : "text-[#6B6F76]"}>-{Number(v).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edge Details */}
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-[#b7bec9]">Expected Edge</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
          {p?.pWin != null && (
            <div className="flex justify-between"><span className="text-[#8c8e93]">pWin</span><span className="text-white">{(p.pWin * 100).toFixed(1)}%</span></div>
          )}
          {p?.avgWinR != null && (
            <div className="flex justify-between"><span className="text-[#8c8e93]">AvgWinR</span><span className="text-white">{p.avgWinR.toFixed(2)}R</span></div>
          )}
          {p?.costR != null && (
            <div className="flex justify-between"><span className="text-[#8c8e93]">CostR</span><span className="text-white">{p.costR.toFixed(3)}R</span></div>
          )}
          {p?.expectedEdge != null && (
            <div className="flex justify-between"><span className="text-[#8c8e93]">Raw Edge</span><span className="text-white">{p.expectedEdge.toFixed(3)}R</span></div>
          )}
          {p?.riskAdjustedEdge != null && (
            <div className="flex justify-between"><span className="text-[#8c8e93]">Risk-Adj Edge</span>
              <span className={`font-semibold ${p.riskAdjustedEdge >= 0.2 ? "text-[#53d18a]" : p.riskAdjustedEdge >= 0.1 ? "text-[#e7d073]" : "text-[#d46a6a]"}`}>
                {p.riskAdjustedEdge.toFixed(3)}R
              </span>
            </div>
          )}
          {p?.dataHealth != null && (
            <div className="flex justify-between"><span className="text-[#8c8e93]">Data Health</span><span className="text-white">{(p.dataHealth * 100).toFixed(0)}%</span></div>
          )}
        </div>
      </div>

      {/* TP/SL Visual */}
      {tpSl && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-[#b7bec9]">TP / SL Levels</div>
          <TpSlVisual tpSl={tpSl} direction={item.direction} />
        </div>
      )}

      {/* Position Size */}
      {posSize && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-[#b7bec9]">Position Sizing</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            <div className="flex justify-between"><span className="text-[#8c8e93]">Multiplier</span><span className="font-semibold text-white">{(posSize.sizeMultiplier * 100).toFixed(0)}%</span></div>
            <div className="flex justify-between"><span className="text-[#8c8e93]">Tier</span><span className="text-white">{posSize.confidenceTier}</span></div>
            <div className="flex justify-between"><span className="text-[#8c8e93]">Risk %</span><span className="text-white">{(posSize.riskPct * 100).toFixed(2)}%</span></div>
          </div>
          {posSize.reasons.length > 0 && (
            <div className="mt-1 text-[9px] text-[#6B6F76]">{posSize.reasons.join(" \u2022 ")}</div>
          )}
        </div>
      )}

      {/* Reasons */}
      {p?.reasons && p.reasons.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-[#b7bec9]">Reasoning</div>
          <ul className="space-y-0.5 text-[10px] text-[#8c8e93]">
            {p.reasons.map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-[#6B6F76] shrink-0">\u2022</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
