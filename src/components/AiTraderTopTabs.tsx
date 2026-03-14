import { NavLink } from "react-router-dom";

const tabs = [
  { label: "Strategy", to: "/ai-trader/strategy", icon: "🧩" },
  { label: "AI Trader", to: "/ai-trader/dashboard", icon: "🤖" },
  { label: "Leaderboard", to: "/ai-trader/leaderboard", icon: "🏆" },
  { label: "AI Arena", to: "/ai-trader/arena", icon: "⚔" },
  { label: "Backtest", to: "/ai-trader/backtest", icon: "📊" },
] as const;

export function AiTraderTopTabs() {
  return (
    <div className="mb-4 rounded-2xl border border-[var(--borderSoft)] bg-[var(--panelAlt)] p-2">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542] shadow-[0_0_0_1px_rgba(245,197,66,0.2)]"
                  : "border-white/10 bg-[#0F1012] text-[var(--textMuted)] hover:border-white/20 hover:text-[var(--text)]"
              }`
            }
          >
            <span className="text-base leading-none" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
