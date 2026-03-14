import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

export const BalancesSummary = () => {
  const { balances } = useExchangeTerminalStore();
  return (
    <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Wallet / Margin</p>
      {balances.map((b) => (
        <p key={b.asset}>
          {b.asset}: {b.available.toFixed(4)} / {b.total.toFixed(4)}
        </p>
      ))}
    </div>
  );
};

