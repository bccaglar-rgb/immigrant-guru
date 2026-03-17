import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { readAdminConfigFromStorage, ADMIN_CONFIG_STORAGE_KEY } from "../hooks/useAdminConfig";
import { NavItem } from "./NavItem";
import { SidebarHeader } from "./SidebarHeader";

interface Props {
  onNavigate?: () => void;
  expanded: boolean;
  mode?: "auto" | "manual";
  mobile?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onToggleMode?: () => void;
}

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const DashboardIcon = () => <Icon><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></Icon>;
const TradeIcon = () => <Icon><path d="M3 16l5-5 4 3 8-8" /><path d="M15 6h5v5" /></Icon>;
const ExchangeIcon = () => <Icon><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /><circle cx="7" cy="7" r="1.1" /><circle cx="11" cy="12" r="1.1" /><circle cx="16" cy="17" r="1.1" /></Icon>;
const AiTraderIcon = () => <Icon><path d="M5 18V6" /><path d="M9 18V10" /><path d="M13 18V8" /><path d="M17 18V12" /><path d="M21 18V5" /></Icon>;
const MarketIcon = () => <Icon><path d="M4 18V6" /><path d="M8 18V10" /><path d="M12 18V8" /><path d="M16 18V12" /><path d="M20 18V5" /></Icon>;
const SuperChartIcon = () => <Icon><path d="M3 17l5-4 4 2 7-8" /><path d="M19 7h2v2" /><path d="M3 21h18" /></Icon>;
const IndicatorIcon = () => <Icon><path d="M4 18l4-6 4 3 8-10" /><circle cx="8" cy="12" r="1.2" /><circle cx="12" cy="15" r="1.2" /></Icon>;
const BitriumTokenIcon = () => <Icon><path d="M12 2l8 4.5v11L12 22l-8-4.5v-11z" /><path d="M8.5 10.5h7" /><path d="M8.5 14h5" /></Icon>;
const CreatorIcon = () => <Icon><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M10 10l4 4" /><path d="M17 6v3" /><path d="M15.5 7.5h3" /></Icon>;
const ToolsIcon = () => <Icon><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /><circle cx="18" cy="17" r="2" /></Icon>;
const UniverseIcon = () => <Icon><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="9" ry="4" /><path d="M12 3v18" /></Icon>;
const PricingIcon = () => <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 11h10" /><path d="M7 15h6" /></Icon>;
const AiTradeIdeasIcon = () => <Icon><rect x="4" y="6" width="16" height="12" rx="3" /><path d="M9 10h6" /><path d="M9 14h3" /><path d="M12 4v2" /><path d="M8 4.8 9 6.6" /><path d="m16 4.8-1 1.8" /></Icon>;
const SettingsIcon = () => <Icon><path d="M12 3l2.2 1.1 2.4-.3.9 2.2 1.9 1.5-.9 2.2.4 2.3-1.9 1.5-.9 2.2-2.4-.3L12 21l-2.2-1.1-2.4.3-.9-2.2-1.9-1.5.9-2.2-.4-2.3 1.9-1.5.9-2.2 2.4.3z" /><circle cx="12" cy="12" r="2.2" /></Icon>;
const AdminIcon = () => <Icon><path d="M12 3l3 2 4-1 1 4 3 3-3 3-1 4-4-1-3 2-3-2-4 1-1-4-3-3 3-3 1-4 4 1z" /><circle cx="12" cy="12" r="2.5" /></Icon>;

const menuItems = [
  { label: "Bitrium Quant Engine", to: "/quant-engine", accent: "var(--menu-accent-1)", icon: () => <DashboardIcon /> },
  { label: "Quant Trade Ideas", to: "/quant-trade-ideas", accent: "var(--menu-accent-2)", icon: () => <TradeIcon /> },
  { label: "AI Trade Ideas", to: "/ai-trade-ideas", accent: "var(--menu-accent-9)", icon: () => <AiTradeIdeasIcon /> },
  { label: "Exchanges", to: "/exchanges", accent: "var(--menu-accent-3)", icon: () => <ExchangeIcon /> },
  { label: "Crypto Market", to: "/crypto-market", accent: "var(--menu-accent-4)", icon: () => <MarketIcon /> },
  { label: "Coin Universe", to: "/coin-universe", accent: "var(--menu-accent-8)", icon: () => <UniverseIcon /> },
  { label: "Super Charts", to: "/super-charts", accent: "var(--menu-accent-5)", icon: () => <SuperChartIcon /> },
  { label: "Indicators", to: "/indicators", accent: "var(--menu-accent-6)", icon: () => <IndicatorIcon /> },
  { label: "Bitrium Token", to: "/bitrium-token", accent: "var(--menu-accent-11)", icon: () => <BitriumTokenIcon /> },
  { label: "Pricing", to: "/pricing", accent: "var(--menu-accent-13)", icon: () => <PricingIcon /> },
] as const;

const aiTraderItem = { label: "AI Trader", accent: "var(--menu-accent-4)", icon: <AiTraderIcon /> } as const;
const toolsItem = { label: "Tools", accent: "var(--menu-accent-12)", icon: <ToolsIcon /> } as const;
const aiTraderSubItems = [
  {
    label: "Leaderboard",
    to: "/ai-trader/leaderboard",
    accent: "#66b3ff",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 19h14" />
        <path d="M7 17V9" />
        <path d="M12 17V5" />
        <path d="M17 17v-7" />
      </svg>
    ),
  },
  {
    label: "AI Trader",
    to: "/ai-trader/dashboard",
    accent: "#F5C542",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
      </svg>
    ),
  },
  {
    label: "Strategy",
    to: "/ai-trader/strategy",
    accent: "#9f8bff",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 18l4-6 4 3 8-10" />
        <circle cx="8" cy="12" r="1.2" />
      </svg>
    ),
  },
  {
    label: "AI Arena",
    to: "/ai-trader/arena",
    accent: "#2bc48a",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    ),
  },
  {
    label: "Backtest",
    to: "/ai-trader/backtest",
    accent: "#f4906c",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 19h16" />
        <path d="M7 16l3-3 2 2 5-6" />
      </svg>
    ),
  },
] as const;
const toolsSubItems = [
  {
    label: "Coin Calculator",
    to: "/coin-calculator",
    accent: "#6ec4ff",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 8h8" />
        <path d="M8 12h3" />
        <path d="M13 12h3" />
        <path d="M8 16h3" />
        <path d="M13 16h3" />
      </svg>
    ),
  },
  {
    label: "Token Creator",
    to: "/token-creator",
    accent: "#f5c542",
    icon: <CreatorIcon />,
  },
] as const;

const adminItem = { label: "Admin", to: "/admin", accent: "var(--menu-accent-14)", icon: () => <AdminIcon /> };
const settingsItem = { label: "Settings", to: "/settings", accent: "var(--menu-accent-7)", icon: () => <SettingsIcon /> };

export const Sidebar = ({
  onNavigate,
  expanded,
  mode = "auto",
  mobile = false,
  onMouseEnter,
  onMouseLeave,
  onToggleMode,
}: Props) => {
  const location = useLocation();
  const aiTraderActive = location.pathname.startsWith("/ai-trader/");
  const [branding, setBranding] = useState(() => readAdminConfigFromStorage().branding);
  const [showText, setShowText] = useState(expanded || mobile);
  const [collapseWidth, setCollapseWidth] = useState(!(expanded || mobile));
  const [labelTimer, setLabelTimer] = useState<number | null>(null);
  const [shrinkTimer, setShrinkTimer] = useState<number | null>(null);
  const [aiTraderOpen, setAiTraderOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const aiTraderRef = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const aiTraderCloseTimerRef = useRef<number | null>(null);
  const toolsCloseTimerRef = useRef<number | null>(null);
  const toolsActive = location.pathname.startsWith("/coin-calculator") || location.pathname.startsWith("/token-creator");

  useEffect(() => {
    const sync = () => setBranding(readAdminConfigFromStorage().branding);
    window.addEventListener("storage", sync);
    window.addEventListener("admin-config-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("admin-config-updated", sync);
    };
  }, []);

  // Fetch branding from server on mount so all visitors see the logo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/providers/config");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const logo = data?.branding?.logoDataUrl;
        const emblem = data?.branding?.emblemDataUrl;
        if (!logo && !emblem) return;
        if (cancelled) return;
        // Persist to localStorage so it's available on next load
        try {
          window.localStorage.setItem("admin-config-branding-v1", JSON.stringify({ logoDataUrl: logo, emblemDataUrl: emblem }));
          // Also update the main config storage branding
          const existing = readAdminConfigFromStorage();
          existing.branding = { logoDataUrl: logo ?? existing.branding.logoDataUrl, emblemDataUrl: emblem ?? existing.branding.emblemDataUrl };
          window.localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(existing));
        } catch { /* storage full — still update in-memory */ }
        setBranding((prev) => ({
          logoDataUrl: logo ?? prev.logoDataUrl,
          emblemDataUrl: emblem ?? prev.emblemDataUrl,
        }));
      } catch { /* server unreachable */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mobile) {
      setShowText(true);
      setCollapseWidth(false);
      return;
    }

    if (labelTimer) window.clearTimeout(labelTimer);
    if (shrinkTimer) window.clearTimeout(shrinkTimer);

    if (expanded) {
      setCollapseWidth(false);
      const t = window.setTimeout(() => setShowText(true), 120);
      setLabelTimer(t);
    } else {
      setShowText(false);
      const t = window.setTimeout(() => setCollapseWidth(true), 120);
      setShrinkTimer(t);
    }

    return () => {
      if (labelTimer) window.clearTimeout(labelTimer);
      if (shrinkTimer) window.clearTimeout(shrinkTimer);
    };
  }, [expanded, mobile]);

  const boxSize = collapseWidth && !mobile ? "w-[72px]" : "w-[260px]";
  const collapsed = !showText;
  const displayLogo = collapsed ? branding.emblemDataUrl ?? branding.logoDataUrl : branding.logoDataUrl ?? branding.emblemDataUrl;

  const versionBlock = useMemo(
    () => (
      <div className={`mt-auto border-t border-[var(--borderSoft)] pt-2 ${showText ? "px-2" : "px-0"}`}>
        <NavItem
          to={settingsItem.to}
          label={settingsItem.label}
          accent={settingsItem.accent}
          icon={settingsItem.icon}
          expanded={showText}
          onNavigate={onNavigate}
        />
        <NavItem
          to={adminItem.to}
          label={adminItem.label}
          accent={adminItem.accent}
          icon={adminItem.icon}
          expanded={showText}
          onNavigate={onNavigate}
        />
      </div>
    ),
    [onNavigate, showText],
  );

  useEffect(() => {
    setAiTraderOpen(false);
    setToolsOpen(false);
  }, [expanded, mobile, showText]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!aiTraderRef.current) return;
      if (!aiTraderRef.current.contains(event.target as Node)) setAiTraderOpen(false);
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) setToolsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAiTraderOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const openAiTrader = () => {
    if (aiTraderCloseTimerRef.current) {
      window.clearTimeout(aiTraderCloseTimerRef.current);
      aiTraderCloseTimerRef.current = null;
    }
    setAiTraderOpen(true);
  };

  const closeAiTraderWithDelay = () => {
    if (aiTraderCloseTimerRef.current) window.clearTimeout(aiTraderCloseTimerRef.current);
    aiTraderCloseTimerRef.current = window.setTimeout(() => setAiTraderOpen(false), 120);
  };
  const openTools = () => {
    if (toolsCloseTimerRef.current) {
      window.clearTimeout(toolsCloseTimerRef.current);
      toolsCloseTimerRef.current = null;
    }
    setToolsOpen(true);
  };
  const closeToolsWithDelay = () => {
    if (toolsCloseTimerRef.current) window.clearTimeout(toolsCloseTimerRef.current);
    toolsCloseTimerRef.current = window.setTimeout(() => setToolsOpen(false), 120);
  };

  const topMenu = menuItems.slice(0, 3);
  const bottomMenu = menuItems.slice(3);

  return (
    <aside
      onMouseEnter={mobile ? undefined : onMouseEnter}
      onMouseLeave={mobile ? undefined : onMouseLeave}
      className={`relative z-[80] flex h-full ${boxSize} flex-col overflow-visible border-r border-[var(--borderSoft)] bg-[var(--panel)] p-2 transition-[width] duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)]`}
    >
      <NavLink to="/quant-engine" onClick={onNavigate} title="Bitrium Quant Engine">
        <SidebarHeader
          logoUrl={displayLogo}
          collapsed={collapsed}
          mobile={mobile}
          mode={mode}
          onModeToggle={onToggleMode}
        />
      </NavLink>

      <nav className="space-y-1">
        {topMenu.map((item) => (
          <NavItem
            key={item.label}
            to={item.to}
            label={item.label}
            accent={item.accent}
            icon={item.icon}
            expanded={showText}
            onNavigate={onNavigate}
          />
        ))}

        <div
          ref={aiTraderRef}
          className="relative"
          onMouseEnter={openAiTrader}
          onMouseLeave={closeAiTraderWithDelay}
        >
          <button
            type="button"
            title={aiTraderItem.label}
            onClick={openAiTrader}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setAiTraderOpen((v) => !v);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setAiTraderOpen(true);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setAiTraderOpen(false);
              }
            }}
            className="group block w-full"
            aria-haspopup="menu"
            aria-expanded={aiTraderOpen}
          >
            <span
              className={`relative flex w-full items-center rounded-lg border border-transparent px-2 py-2 text-sm transition-all hover:border-[var(--borderSoft)] hover:bg-[var(--panelAlt)] ${
                aiTraderActive ? "bg-[var(--panelAlt3)] text-white" : "text-[var(--textMuted)]"
              }`}
              style={{
                boxShadow: aiTraderActive ? `inset 2px 0 0 0 ${aiTraderItem.accent}` : undefined,
              }}
            >
              <span
                className={`inline-grid h-7 w-7 place-items-center transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "mr-2" : "mx-auto"}`}
                style={{ color: aiTraderItem.accent }}
              >
                {aiTraderItem.icon}
              </span>
              <span className={`truncate transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "translate-x-0 opacity-100" : "w-0 -translate-x-1 opacity-0"}`}>
                {aiTraderItem.label}
              </span>
            </span>
          </button>

          <div
            className={`absolute left-full top-1/2 z-[120] ml-2 w-56 -translate-y-1/2 rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-2 shadow-2xl transition-all duration-180 ${
              aiTraderOpen ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0"
            }`}
            role="menu"
            aria-label="AI Trader submenu"
          >
            {aiTraderSubItems.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                onClick={() => {
                  setAiTraderOpen(false);
                  onNavigate?.();
                }}
                className={({ isActive }) =>
                  `block rounded-md border px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "border-[var(--borderSoft)] bg-[var(--panelAlt3)] text-white"
                      : "border-transparent text-[var(--textMuted)] hover:border-[var(--borderSoft)] hover:bg-[var(--panelAlt)]"
                  }`
                }
                role="menuitem"
              >
                <span className="flex items-center gap-2">
                  <span style={{ color: sub.accent }}>{sub.icon}</span>
                  <span>{sub.label}</span>
                </span>
              </NavLink>
            ))}
          </div>
        </div>

        <div
          ref={toolsRef}
          className="relative"
          onMouseEnter={openTools}
          onMouseLeave={closeToolsWithDelay}
        >
          <button
            type="button"
            title={toolsItem.label}
            onClick={openTools}
            className="group block w-full"
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
          >
            <span
              className={`relative flex w-full items-center rounded-lg border border-transparent px-2 py-2 text-sm transition-all hover:border-[var(--borderSoft)] hover:bg-[var(--panelAlt)] ${
                toolsActive ? "bg-[var(--panelAlt3)] text-white" : "text-[var(--textMuted)]"
              }`}
              style={{
                boxShadow: toolsActive ? `inset 2px 0 0 0 ${toolsItem.accent}` : undefined,
              }}
            >
              <span
                className={`inline-grid h-7 w-7 place-items-center transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "mr-2" : "mx-auto"}`}
                style={{ color: toolsItem.accent }}
              >
                {toolsItem.icon}
              </span>
              <span className={`truncate transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "translate-x-0 opacity-100" : "w-0 -translate-x-1 opacity-0"}`}>
                {toolsItem.label}
              </span>
            </span>
          </button>

          <div
            className={`absolute left-full top-1/2 z-[120] ml-2 w-56 -translate-y-1/2 rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-2 shadow-2xl transition-all duration-180 ${
              toolsOpen ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0"
            }`}
            role="menu"
            aria-label="Tools submenu"
          >
            {toolsSubItems.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                onClick={() => {
                  setToolsOpen(false);
                  onNavigate?.();
                }}
                className={({ isActive }) =>
                  `block rounded-md border px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "border-[var(--borderSoft)] bg-[var(--panelAlt3)] text-white"
                      : "border-transparent text-[var(--textMuted)] hover:border-[var(--borderSoft)] hover:bg-[var(--panelAlt)]"
                  }`
                }
                role="menuitem"
              >
                <span className="flex items-center gap-2">
                  <span style={{ color: sub.accent }}>{sub.icon}</span>
                  <span>{sub.label}</span>
                </span>
              </NavLink>
            ))}
          </div>
        </div>

        {bottomMenu.map((item) => (
          <NavItem
            key={item.label}
            to={item.to}
            label={item.label}
            accent={item.accent}
            icon={item.icon}
            expanded={showText}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {versionBlock}
    </aside>
  );
};
