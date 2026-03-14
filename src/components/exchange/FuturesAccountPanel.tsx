import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

interface Props {
  className?: string;
}

export const FuturesAccountPanel = ({ className = "" }: Props) => {
  const { balances } = useExchangeTerminalStore();
  const usdt = balances.find((b) => b.asset === "USDT");

  return (
    <section className={`${className} rounded-xl border border-white/10 bg-[#121316]`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-sm">
        <span className="font-semibold text-white">Account</span>
        <button type="button" className="text-xs text-[#F5C542]">Switch</button>
      </div>
      <div className="space-y-2 px-3 py-2 text-xs text-[#BFC2C7]">
        <div className="rounded border border-white/10 bg-[#0F1012] p-2">
          <p className="text-[#6B6F76]">Margin Ratio</p>
          <p className="mt-1 text-[#8fc9ab]">0.00%</p>
          <p className="mt-2 text-[#6B6F76]">Margin Balance</p>
          <p className="text-white">{(usdt?.total ?? 0).toFixed(4)} USDT</p>
        </div>
        <div className="rounded border border-white/10 bg-[#0F1012] p-2">
          <p className="text-[#6B6F76]">USDT</p>
          <p className="mt-1 text-white">Balance {(usdt?.available ?? 0).toFixed(4)}</p>
          <p className="text-[#6B6F76]">Unrealized PNL 0.0000 USDT</p>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {["Transfer", "Buy Crypto", "Swap"].map((action) => (
            <button key={action} type="button" className="rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-[#BFC2C7]">
              {action}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
