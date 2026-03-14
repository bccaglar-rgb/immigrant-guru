import { useEffect } from "react";
import { useMarketDataStatus } from "../hooks/useMarketData";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { MarketDataRouter } from "../data/MarketDataRouter";

export const DataSourceStatusBar = () => {
  const status = useMarketDataStatus();
  const selectedExchange = useExchangeTerminalStore((state) => state.selectedExchange);
  const connectionStatus = useExchangeTerminalStore((state) => state.connectionStatus);

  useEffect(() => {
    MarketDataRouter.mount();
    return () => {
      MarketDataRouter.unmount();
    };
  }, []);

  useEffect(() => {
    MarketDataRouter.setConnectionState(selectedExchange, connectionStatus);
  }, [selectedExchange, connectionStatus]);

  const tone = "border-white/10 bg-[var(--panel)] text-[var(--textMuted)]";

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[var(--text)]">{status.sourceChip}</span>
        {status.stale ? (
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-[#d6b3af]">
            STALE {status.staleAgeSec}s
          </span>
        ) : (
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-[#cfe5cf]">LIVE</span>
        )}
      </div>
    </div>
  );
};
