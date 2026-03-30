import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { readAdminConfigFromStorage, ADMIN_CONFIG_STORAGE_KEY } from "../hooks/useAdminConfig";
import { useAuthStore } from "../hooks/useAuthStore";
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
  <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="iconGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F5C542" />
        <stop offset="100%" stopColor="#D4A832" />
      </linearGradient>
      <linearGradient id="iconGoldLight" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F5C542" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#D4A832" stopOpacity="0.1" />
      </linearGradient>
    </defs>
    {children}
  </svg>
);

/* ── Gold emblem-style icons ── */
const DashboardIcon = () => <Icon>
  <rect x="4" y="4" width="7" height="7" rx="1.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.3" />
  <rect x="13" y="4" width="7" height="4" rx="1.2" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.3" />
  <rect x="13" y="10" width="7" height="10" rx="1.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.3" />
  <rect x="4" y="13" width="7" height="7" rx="1.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.3" />
  <circle cx="7.5" cy="7.5" r="1.2" fill="url(#iconGold)" />
  <path d="M15 14l2 2 3-3.5" stroke="url(#iconGold)" strokeWidth="1.3" fill="none" />
</Icon>;
const TradeIcon = () => <Icon>
  <path d="M3 20L7.5 12l4 5 5-8.5L21 15" stroke="url(#iconGold)" strokeWidth="1.5" fill="none" />
  <path d="M3 20L7.5 12l4 5 5-8.5L21 15V20H3z" fill="url(#iconGoldLight)" stroke="none" />
  <circle cx="7.5" cy="12" r="1.3" fill="url(#iconGold)" />
  <circle cx="11.5" cy="17" r="1.3" fill="url(#iconGold)" />
  <circle cx="16.5" cy="8.5" r="1.3" fill="url(#iconGold)" />
  <path d="M18 5l3 3.5" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M21 5h-3v3" stroke="url(#iconGold)" strokeWidth="1.3" fill="none" />
</Icon>;
const ExchangeIcon = () => <Icon>
  <circle cx="12" cy="12" r="9" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M7 9.5h7.5" stroke="url(#iconGold)" strokeWidth="1.4" />
  <path d="M12.5 7l2.5 2.5-2.5 2.5" stroke="url(#iconGold)" strokeWidth="1.4" fill="none" />
  <path d="M17 14.5H9.5" stroke="url(#iconGold)" strokeWidth="1.4" />
  <path d="M11.5 12l-2.5 2.5 2.5 2.5" stroke="url(#iconGold)" strokeWidth="1.4" fill="none" />
</Icon>;
const AiTraderIcon = () => <Icon>
  <rect x="3.5" y="6" width="17" height="13" rx="2" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M3.5 10h17" stroke="url(#iconGold)" strokeWidth="0.8" opacity="0.4" />
  <path d="M7 14v3" stroke="url(#iconGold)" strokeWidth="1.6" strokeLinecap="round" />
  <path d="M10.5 12.5v4.5" stroke="url(#iconGold)" strokeWidth="1.6" strokeLinecap="round" />
  <path d="M14 13.5v3.5" stroke="url(#iconGold)" strokeWidth="1.6" strokeLinecap="round" />
  <path d="M17.5 11.5v5.5" stroke="url(#iconGold)" strokeWidth="1.6" strokeLinecap="round" />
  <circle cx="12" cy="4" r="1.5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" />
  <path d="M12 5.5V6" stroke="url(#iconGold)" strokeWidth="1" />
  <path d="M9 3l1.5 1" stroke="url(#iconGold)" strokeWidth="0.8" opacity="0.5" />
  <path d="M15 3l-1.5 1" stroke="url(#iconGold)" strokeWidth="0.8" opacity="0.5" />
</Icon>;
const MarketIcon = () => <Icon>
  <path d="M4 19h16" stroke="url(#iconGold)" strokeWidth="1.3" />
  <rect x="5" y="13" width="3" height="6" rx="0.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1" />
  <rect x="10.5" y="8" width="3" height="11" rx="0.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1" />
  <rect x="16" y="5" width="3" height="14" rx="0.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1" />
  <path d="M6.5 11v2" stroke="url(#iconGold)" strokeWidth="0.8" />
  <path d="M12 5.5v2.5" stroke="url(#iconGold)" strokeWidth="0.8" />
  <path d="M17.5 3v2" stroke="url(#iconGold)" strokeWidth="0.8" />
</Icon>;
const IndicatorIcon = () => <Icon>
  <path d="M3 17c3-1 5-8 9-8s4 6 9 5" stroke="url(#iconGold)" strokeWidth="1.5" fill="none" />
  <path d="M3 17c3-1 5-8 9-8s4 6 9 5V21H3z" fill="url(#iconGoldLight)" stroke="none" opacity="0.5" />
  <circle cx="8" cy="12.5" r="1.8" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" />
  <path d="M8 10.7V7" stroke="url(#iconGold)" strokeWidth="1" />
  <path d="M6.5 8.5L8 7l1.5 1.5" stroke="url(#iconGold)" strokeWidth="1" fill="none" />
  <circle cx="17" cy="13" r="1.5" fill="url(#iconGold)" />
</Icon>;
const BitriumTokenIcon = () => <Icon>
  <circle cx="12" cy="12" r="8.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.3" />
  <circle cx="12" cy="12" r="6" stroke="url(#iconGold)" strokeWidth="0.7" fill="none" opacity="0.4" />
  <path d="M12 5.5l4.5 2.6v5.3L12 16l-4.5-2.6V7.9z" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" />
  <path d="M7.5 7.9l4.5 2.6 4.5-2.6" stroke="url(#iconGold)" strokeWidth="0.8" opacity="0.5" />
  <path d="M12 10.5V16" stroke="url(#iconGold)" strokeWidth="0.8" opacity="0.5" />
</Icon>;
const CreatorIcon = () => <Icon>
  <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.7l-4.9 2.5.9-5.5-4-3.9L9.5 8z" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <circle cx="12" cy="11" r="2" stroke="url(#iconGold)" strokeWidth="1" fill="none" />
</Icon>;
const ToolsIcon = () => <Icon>
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a5 5 0 0 1-7.1 6.3L8 18.2a2.1 2.1 0 1 1-3-3l6.4-6.4a5 5 0 0 1 6.3-7.1z" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
</Icon>;
const SniperIcon = () => <Icon>
  <circle cx="12" cy="12" r="9" stroke="url(#iconGold)" strokeWidth="1.2" fill="url(#iconGoldLight)" />
  <circle cx="12" cy="12" r="5.5" stroke="url(#iconGold)" strokeWidth="0.9" fill="none" />
  <circle cx="12" cy="12" r="2" fill="url(#iconGold)" />
  <path d="M12 3v4" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M12 17v4" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M3 12h4" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M17 12h4" stroke="url(#iconGold)" strokeWidth="1.2" />
</Icon>;
const CoinInsightIcon = () => <Icon>
  <path d="M3 12h2l3-8 4 16 3-12 2 4h4" stroke="url(#iconGold)" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  <circle cx="19" cy="12" r="2" fill="url(#iconGold)" />
  <circle cx="19" cy="12" r="3.5" stroke="url(#iconGold)" strokeWidth="0.6" fill="none" opacity="0.4" />
</Icon>;
const UniverseIcon = () => <Icon>
  <circle cx="12" cy="12" r="9" stroke="url(#iconGold)" strokeWidth="1.2" fill="url(#iconGoldLight)" />
  <ellipse cx="12" cy="12" rx="9" ry="4" stroke="url(#iconGold)" strokeWidth="0.9" fill="none" />
  <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" stroke="url(#iconGold)" strokeWidth="0.9" fill="none" />
  <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)" stroke="url(#iconGold)" strokeWidth="0.9" fill="none" />
  <circle cx="12" cy="12" r="2" fill="url(#iconGold)" />
</Icon>;
const PricingIcon = () => <Icon>
  <rect x="4" y="3" width="16" height="18" rx="2.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M12 7v1.5" stroke="url(#iconGold)" strokeWidth="1.3" strokeLinecap="round" />
  <path d="M12 15.5v1.5" stroke="url(#iconGold)" strokeWidth="1.3" strokeLinecap="round" />
  <path d="M9.5 14.5c0 1.1 1.1 2 2.5 2s2.5-.9 2.5-2-1.1-1.5-2.5-1.5-2.5-.7-2.5-1.5 1.1-2 2.5-2 2.5.9 2.5 2" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" />
</Icon>;
const AiTradeIdeasIcon = () => <Icon>
  <circle cx="12" cy="8" r="5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M10 20h4" stroke="url(#iconGold)" strokeWidth="1.3" strokeLinecap="round" />
  <path d="M10.5 17.5h3" stroke="url(#iconGold)" strokeWidth="1" strokeLinecap="round" />
  <path d="M9 13v1.5c0 1 .4 1.8 1 2.3" stroke="url(#iconGold)" strokeWidth="1.1" fill="none" />
  <path d="M15 13v1.5c0 1-.4 1.8-1 2.3" stroke="url(#iconGold)" strokeWidth="1.1" fill="none" />
  <path d="M10 8.5l2-2 2 2" stroke="url(#iconGold)" strokeWidth="1.3" fill="none" />
  <path d="M12 6.5v4" stroke="url(#iconGold)" strokeWidth="1.3" />
</Icon>;
const SettingsIcon = () => <Icon>
  <circle cx="12" cy="12" r="3.5" stroke="url(#iconGold)" strokeWidth="1.3" fill="url(#iconGoldLight)" />
  <path d="M12 2v3" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M12 19v3" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M4.93 4.93l2.12 2.12" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M16.95 16.95l2.12 2.12" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M2 12h3" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M19 12h3" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M4.93 19.07l2.12-2.12" stroke="url(#iconGold)" strokeWidth="1.3" />
  <path d="M16.95 7.05l2.12-2.12" stroke="url(#iconGold)" strokeWidth="1.3" />
</Icon>;
const AdminIcon = () => <Icon>
  <path d="M12 2L4 6.5v5c0 5.25 3.4 10.15 8 11.5 4.6-1.35 8-6.25 8-11.5v-5z" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M9 12l2 2 4-4" stroke="url(#iconGold)" strokeWidth="1.5" fill="none" />
</Icon>;
const BotIcon = () => <Icon>
  <rect x="5" y="9" width="14" height="10" rx="3" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <circle cx="9" cy="14" r="1.5" fill="url(#iconGold)" />
  <circle cx="15" cy="14" r="1.5" fill="url(#iconGold)" />
  <path d="M12 4v5" stroke="url(#iconGold)" strokeWidth="1.2" />
  <circle cx="12" cy="3" r="1.5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" />
  <path d="M3 14h2" stroke="url(#iconGold)" strokeWidth="1.2" strokeLinecap="round" />
  <path d="M19 14h2" stroke="url(#iconGold)" strokeWidth="1.2" strokeLinecap="round" />
  <path d="M10 17.5h4" stroke="url(#iconGold)" strokeWidth="1" strokeLinecap="round" />
</Icon>;
const PortfolioIcon = () => <Icon>
  <rect x="3" y="6" width="18" height="13" rx="2" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M3 10h18" stroke="url(#iconGold)" strokeWidth="0.8" opacity="0.4" />
  <path d="M8 3h8" stroke="url(#iconGold)" strokeWidth="1.2" strokeLinecap="round" />
  <circle cx="9" cy="14.5" r="2.5" stroke="url(#iconGold)" strokeWidth="1" fill="none" />
  <path d="M9 13v1.5h1.5" stroke="url(#iconGold)" strokeWidth="1" fill="none" />
  <path d="M14 14h4" stroke="url(#iconGold)" strokeWidth="1.2" strokeLinecap="round" />
  <path d="M14 16.5h3" stroke="url(#iconGold)" strokeWidth="1" strokeLinecap="round" />
</Icon>;
const InstitutionalIcon = () => <Icon><rect x="3" y="4" width="18" height="16" rx="2" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><path d="M3 9h18" stroke="url(#iconGold)" strokeWidth="1" /><path d="M8 4V2M16 4V2" stroke="url(#iconGold)" strokeWidth="1.2" /><circle cx="8" cy="14" r="1.5" fill="url(#iconGold)" /><path d="M12 13v4" stroke="url(#iconGold)" strokeWidth="1.2" /><path d="M15 12l2 2-2 2" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /></Icon>;
const WarRoomIcon = () => <Icon><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><path d="M2 17l10 5 10-5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><path d="M2 12l10 5 10-5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><circle cx="12" cy="12" r="2" fill="url(#iconGold)" /></Icon>;
const MasterIcon = () => <Icon><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /><circle cx="7" cy="7" r="1.5" fill="url(#iconGold)" /><circle cx="17" cy="7" r="1.5" fill="url(#iconGold)" /><path d="M5 17l4-4" stroke="url(#iconGold)" strokeWidth="1.2" /><path d="M15 15h4v4" stroke="url(#iconGold)" strokeWidth="1.2" fill="none" /></Icon>;
const SuperChartIcon = () => <Icon><path d="M3 3v18h18" stroke="url(#iconGold)" strokeWidth="1.4" /><path d="M5 18l4.5-5.5 3.5 2.5 7-9" stroke="url(#iconGold)" strokeWidth="1.6" fill="none" /><path d="M17 6h3.5v3.5" stroke="url(#iconGold)" strokeWidth="1.4" /><circle cx="9.5" cy="12.5" r="1" fill="url(#iconGold)" stroke="none" /><circle cx="13" cy="15" r="1" fill="url(#iconGold)" stroke="none" /></Icon>;
const SignInIcon = () => <Icon>
  <rect x="5" y="3" width="14" height="18" rx="2.5" fill="url(#iconGoldLight)" stroke="url(#iconGold)" strokeWidth="1.2" />
  <path d="M9 12h6" stroke="url(#iconGold)" strokeWidth="1.5" strokeLinecap="round" />
  <path d="M13 9l3 3-3 3" stroke="url(#iconGold)" strokeWidth="1.5" fill="none" />
  <circle cx="12" cy="7" r="1.2" fill="url(#iconGold)" />
</Icon>;
const menuItems = [
  { label: "Bitrium Quant Engine", to: "/quant-engine", accent: "var(--menu-accent-1)", icon: () => <DashboardIcon /> },
  { label: "Sniper", to: "/sniper", accent: "#f6465d", icon: () => <SniperIcon /> },
  { label: "Coin Insight", to: "/coin-insight", accent: "#00e0ff", icon: () => <CoinInsightIcon /> },
  { label: "Master", to: "/master", accent: "#F5C542", icon: () => <MasterIcon /> },
  { label: "War Room", to: "/alpha-war-room", accent: "#f6465d", icon: () => <WarRoomIcon /> },
  { label: "Institutional", to: "/institutional", accent: "#5B8DEF", icon: () => <InstitutionalIcon /> },
  { label: "Super Charts", to: "/super-charts", accent: "var(--menu-accent-5)", icon: () => <SuperChartIcon /> },
  { label: "Coin Universe", to: "/coin-universe", accent: "var(--menu-accent-8)", icon: () => <UniverseIcon /> },
  { label: "Crypto Market", to: "/crypto-market", accent: "var(--menu-accent-4)", icon: () => <MarketIcon /> },
  // AI Trader submenu inserted here in render
  { label: "Exchanges", to: "/exchanges", accent: "var(--menu-accent-3)", icon: () => <ExchangeIcon /> },
  { label: "Bots", to: "/bot", accent: "var(--menu-accent-10)", icon: () => <BotIcon /> },
  { label: "Portfolio", to: "/portfolio", accent: "#4ecdc4", icon: () => <PortfolioIcon /> },
  { label: "Indicators", to: "/indicators", accent: "var(--menu-accent-6)", icon: () => <IndicatorIcon /> },
  // Tools submenu inserted here in render
  { label: "Bitrium Token", to: "/bitrium-token", accent: "var(--menu-accent-11)", icon: () => <BitriumTokenIcon /> },
  { label: "Pricing", to: "/pricing", accent: "var(--menu-accent-13)", icon: () => <PricingIcon /> },
] as const;

const aiTraderItem = { label: "AI Trader", accent: "var(--menu-accent-4)", icon: <AiTraderIcon /> } as const;
const toolsItem = { label: "Tools", accent: "var(--menu-accent-12)", icon: <ToolsIcon /> } as const;
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
const adminSubItems = [
  { label: "Members", to: "/admin/members", accent: "#4ade80", icon: () => <Icon><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon> },
  { label: "Admin Users", to: "/admin/users", accent: "#f97316", icon: () => <Icon><path d="M12 3l3 2 4-1 1 4 3 3-3 3-1 4-4-1-3 2-3-2-4 1-1-4-3-3 3-3 1-4 4 1z" /><circle cx="12" cy="12" r="2.5" /></Icon> },
  { label: "Referral Codes", to: "/admin/referrals", accent: "#F5C542", icon: () => <Icon><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></Icon> },
  { label: "Exchange Manager", to: "/admin/exchanges", accent: "#66b3ff", icon: () => <Icon><path d="M4 4h16v16H4z" /><path d="M4 9h16" /><path d="M9 4v16" /></Icon> },
  { label: "Trade Ideas", to: "/admin/trade-ideas", accent: "#2bc48a", icon: () => <Icon><path d="M4 18l4-6 4 3 8-10" /></Icon> },
  { label: "Branding", to: "/admin/branding", accent: "#9f8bff", icon: () => <Icon><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></Icon> },
  { label: "Payment Review", to: "/admin/payments", accent: "#ef4444", icon: () => <Icon><path d="M2 7h20" /><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 12h20" /></Icon> },
  { label: "Logs", to: "/admin/logs", accent: "#a8dadc", icon: () => <Icon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></Icon> },
  { label: "Bug Reports", to: "/admin/bug-reports", accent: "#f4a460", icon: () => <Icon><path d="M8 2l1.88 1.88" /><path d="M14.12 3.88L16 2" /><path d="M9 7.13v-1a3 3 0 1 1 6 0v1" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" /></Icon> },
  { label: "Quant Trade Ideas", to: "/quant-trade-ideas", accent: "var(--menu-accent-2)", icon: () => <TradeIcon /> },
  { label: "AI Trade Ideas", to: "/ai-trade-ideas", accent: "var(--menu-accent-9)", icon: () => <AiTradeIdeasIcon /> },
  { label: "Optimizer", to: "/optimizer", accent: "#66b3ff", icon: () => <Icon><path d="M4 14l4-8 4 4 4-6 4 10" /><path d="M4 18h16" /></Icon> },
  { label: "Mission Control", to: "/mission-control", accent: "#F5C542", icon: () => <Icon><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></Icon> },
  { label: "System Monitor", to: "/system-monitor", accent: "#4ade80", icon: () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 3" /></Icon> },
  { label: "ML Explorer", to: "/ml-explorer", accent: "#a78bfa", icon: () => <Icon><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12h8" /><path d="M12 8v8" /></Icon> },
];
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
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = authUser?.role === "ADMIN";
  const isAuthenticated = authUser !== null;
  const aiTraderActive = location.pathname.startsWith("/ai-trader/");
  const [branding, setBranding] = useState(() => readAdminConfigFromStorage().branding);
  const [showText, setShowText] = useState(expanded || mobile);
  const [collapseWidth, setCollapseWidth] = useState(!(expanded || mobile));
  const [labelTimer, setLabelTimer] = useState<number | null>(null);
  const [shrinkTimer, setShrinkTimer] = useState<number | null>(null);
  const [, setAiTraderOpen] = useState(false);
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

  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);
  const adminCloseTimerRef = useRef<number | null>(null);
  const openAdminMenu = () => { if (adminCloseTimerRef.current) { window.clearTimeout(adminCloseTimerRef.current); adminCloseTimerRef.current = null; } setAdminMenuOpen(true); };
  const closeAdminMenuWithDelay = () => { adminCloseTimerRef.current = window.setTimeout(() => setAdminMenuOpen(false), 200); };
  const adminActive = location.pathname.startsWith("/admin") || location.pathname.startsWith("/optimizer") || location.pathname.startsWith("/system-monitor") || location.pathname.startsWith("/mission-control") || location.pathname.startsWith("/ml-explorer");
  const allAdminSubItems = [adminItem, ...adminSubItems];

  // Close admin menu on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) setAdminMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const versionBlock = useMemo(
    () => (
      <div className={`mt-auto border-t border-[var(--borderSoft)] pt-2 ${showText ? "px-2" : "px-0"}`}>
        {authUser?.email ? (
          <div className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 ${showText ? "" : "justify-center"}`}>
            <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent)]/20 text-xs font-bold text-[var(--accent)]">
              {authUser.email.charAt(0).toUpperCase()}
            </span>
            <span className={`truncate flex-1 text-xs text-[var(--textMuted)] transition-all duration-[180ms] ${showText ? "opacity-100" : "w-0 opacity-0"}`}>
              {authUser.email}
            </span>
            <button
              type="button"
              title="Sign Out"
              onClick={() => { logout(); navigate("/login"); }}
              className={`shrink-0 rounded-md p-1 text-[var(--textMuted)] transition-colors hover:bg-[var(--panelAlt)] hover:text-red-400 ${showText ? "opacity-100" : "hidden"}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        ) : null}
        {!isAuthenticated ? (
          <NavItem
            to="/login"
            label="Sign In"
            accent="#F5C542"
            icon={() => <SignInIcon />}
            expanded={showText}
            onNavigate={onNavigate}
          />
        ) : null}
        <NavItem
          to={settingsItem.to}
          label={settingsItem.label}
          accent={settingsItem.accent}
          icon={settingsItem.icon}
          expanded={showText}
          onNavigate={onNavigate}
        />
        {isAdmin ? (
          <div ref={adminMenuRef} className="relative" onMouseEnter={openAdminMenu} onMouseLeave={closeAdminMenuWithDelay}>
            <button
              type="button"
              title="Admin"
              onClick={openAdminMenu}
              className="group block w-full"
            >
              <span
                className={`relative flex w-full items-center rounded-lg border border-transparent px-2 py-2 text-sm transition-all hover:border-[var(--borderSoft)] hover:bg-[var(--panelAlt)] ${
                  adminActive ? "bg-[var(--panelAlt3)] text-white" : "text-[var(--textMuted)]"
                }`}
                style={{ boxShadow: adminActive ? `inset 2px 0 0 0 ${adminItem.accent}` : undefined }}
              >
                <span
                  className={`inline-grid h-[37px] w-[37px] place-items-center transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "mr-2" : "mx-auto"}`}
                  style={{ color: adminItem.accent }}
                >
                  {(adminItem.icon as any)(adminActive)}
                </span>
                <span className={`truncate transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "translate-x-0 opacity-100" : "w-0 -translate-x-1 opacity-0"}`}>
                  Admin
                </span>
              </span>
            </button>

            <div
              className={`absolute left-full bottom-0 z-[120] ml-2 w-56 rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-2 shadow-2xl transition-all duration-180 ${
                adminMenuOpen ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0"
              }`}
              role="menu"
              aria-label="Admin submenu"
            >
              {allAdminSubItems.map((sub) => (
                  <NavLink
                    key={sub.to}
                    to={sub.to}
                    onClick={() => { setAdminMenuOpen(false); onNavigate?.(); }}
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
                      <span style={{ color: sub.accent }}>{typeof sub.icon === "function" ? (sub.icon as any)(false) : sub.icon}</span>
                      <span>{sub.label}</span>
                    </span>
                  </NavLink>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    ),
    [onNavigate, showText, isAdmin, isAuthenticated, adminMenuOpen, adminActive, authUser?.email, logout, navigate],
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


  const topMenu = menuItems.slice(0, 9);
  // Items between AI Trader and Tools: Exchanges..Indicators (index 9-12)
  const midMenu = menuItems.slice(9, 13);
  // Items after Tools: Bitrium Token, Pricing (index 13+)
  const bottomMenu = menuItems.slice(13);

  return (
    <aside
      onMouseEnter={mobile ? undefined : onMouseEnter}
      onMouseLeave={mobile ? undefined : onMouseLeave}
      className={`relative z-[80] flex h-full ${boxSize} flex-col overflow-visible border-r border-[var(--borderSoft)] bg-[var(--panel)] p-2 transition-[width] duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)]`}
    >
      <SidebarHeader
        logoUrl={displayLogo}
        collapsed={collapsed}
        mobile={mobile}
        mode={mode}
        onModeToggle={onToggleMode}
        onLogoNavigate={onNavigate}
      />

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
        {topMenu.filter(() => true).map((item) => (
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

        {true ? <div
          ref={aiTraderRef}
          className="relative"
          onMouseEnter={openAiTrader}
          onMouseLeave={closeAiTraderWithDelay}
        >
          <button
            type="button"
            title={aiTraderItem.label}
            onClick={() => { navigate("/ai-trader/strategy"); onNavigate?.(); }}
            className="group block w-full"
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
                className={`inline-grid h-[37px] w-[37px] place-items-center transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "mr-2" : "mx-auto"}`}
                style={{ color: aiTraderItem.accent }}
              >
                {aiTraderItem.icon}
              </span>
              <span className={`truncate transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "translate-x-0 opacity-100" : "w-0 -translate-x-1 opacity-0"}`}>
                {aiTraderItem.label}
              </span>
            </span>
          </button>

          {/* Submenu removed — AI Trader navigates directly to /ai-trader/strategy */}
        </div> : null}

        {midMenu.filter(() => true).map((item) => (
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

        {/* Tools menu hidden — will re-enable later */}
        {false && isAuthenticated ? <div
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
                className={`inline-grid h-[37px] w-[37px] place-items-center transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${showText ? "mr-2" : "mx-auto"}`}
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
        </div> : null}

        {bottomMenu.filter(() => true).map((item) => (
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
