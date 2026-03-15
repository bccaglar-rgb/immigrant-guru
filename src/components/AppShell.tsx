import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useSidebarStore } from "../hooks/SidebarStore";
import { applyStoredTheme } from "../theme/siteTheme";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const titleForPath = (path: string) => {
  if (path.startsWith("/quant-engine")) return "Bitrium Quant Engine";
  if (path.startsWith("/admin")) return "Admin";
  if (path.startsWith("/exchange-terminal") || path.startsWith("/exchanges")) return "Exchange";
  if (path.startsWith("/trade-ideas")) return "Quant Trade Ideas";
  if (path.startsWith("/ai-trade-ideas")) return "AI Trade Ideas";
  if (path.startsWith("/games")) return "Games";
  if (path.startsWith("/ai-trader/leaderboard")) return "AI Trader · Leaderboard";
  if (path.startsWith("/ai-trader/dashboard")) return "AI Trader · Dashboard";
  if (path.startsWith("/ai-trader/strategy")) return "AI Trader · Strategy";
  if (path.startsWith("/ai-trader/arena")) return "AI Trader · AI Arena";
  if (path.startsWith("/ai-trader/backtest")) return "AI Trader · Backtest";
  if (path.startsWith("/crypto-market")) return "Crypto Market";
  if (path.startsWith("/super-charts")) return "Super Charts";
  if (path.startsWith("/indicators")) return "Indicators";
  if (path.startsWith("/icon-gallery")) return "Icon Gallery";
  if (path.startsWith("/bitrium-token") || path.startsWith("/bitrium-token")) return "Bitrium Token";
  if (path.startsWith("/token-creator")) return "Token Creator";
  if (path.startsWith("/pricing")) return "Pricing";
  if (path.startsWith("/settings")) return "Settings";
  return "Bitrium Quant Engine";
};

export const AppShell = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const title = useMemo(() => titleForPath(location.pathname), [location.pathname]);
  const sidebarExpanded = useSidebarStore((s) => s.expanded);
  const sidebarMode = useSidebarStore((s) => s.mode);
  const setHovered = useSidebarStore((s) => s.setHovered);
  const toggleMode = useSidebarStore((s) => s.toggleMode);
  const clearPinned = useSidebarStore((s) => s.clearPinned);

  useEffect(() => {
    applyStoredTheme();
    const sync = () => {
      applyStoredTheme();
    };
    window.addEventListener("site-theme-updated", sync);
    return () => window.removeEventListener("site-theme-updated", sync);
  }, []);

  useEffect(() => {
    if (sidebarMode === "auto") {
      clearPinned();
    }
  }, [location.pathname, sidebarMode, clearPinned]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--textMuted)]">
      <div className="hidden md:fixed md:inset-y-0 md:left-0 md:z-[70] md:block">
        <Sidebar
          expanded={sidebarExpanded}
          mode={sidebarMode}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onToggleMode={toggleMode}
        />
      </div>

      <div className={`transition-[padding] duration-300 ${sidebarExpanded ? "md:pl-[260px]" : "md:pl-16"}`}>
        <TopBar title={title} onMenuClick={() => setMobileOpen(true)} />
        <Outlet />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/55" onClick={() => setMobileOpen(false)} aria-label="Close menu backdrop" />
          <div className="relative h-full w-[260px] border-r border-[var(--borderSoft)] bg-[var(--panel)]">
            <Sidebar mobile expanded mode="manual" onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
};
