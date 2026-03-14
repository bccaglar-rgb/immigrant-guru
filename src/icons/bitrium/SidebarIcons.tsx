import type { ReactNode } from "react";

export interface BitriumIconProps {
  size?: number;
  active?: boolean;
  className?: string;
}

const IconBase = ({ size = 24, active = false, className, children }: BitriumIconProps & { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={active ? 2.25 : 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
    {active ? <circle cx="18.5" cy="5.5" r="1.1" fill="currentColor" stroke="none" /> : null}
  </svg>
);

export const IconBitriumQuantEngine = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="5" rx="1.5" />
    <rect x="13" y="11" width="7" height="9" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
  </IconBase>
);

export const IconQuantTradeIdeas = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M4 18h16" />
    <path d="m5 15 4-4 4 3 6-7" />
    <path d="M16 7h3v3" />
  </IconBase>
);

export const IconAiTradeIdeas = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <rect x="4" y="6" width="16" height="12" rx="3" />
    <path d="M9 10h6" />
    <path d="M9 14h3" />
    <path d="M12 4v2" />
    <path d="M8 4.8 9 6.6" />
    <path d="m16 4.8-1 1.8" />
  </IconBase>
);

export const IconGames = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <rect x="4" y="7" width="16" height="10" rx="4.5" />
    <path d="M8.2 12h4.2" />
    <path d="M10.3 9.9v4.2" />
    <circle cx="15.8" cy="10.8" r="1" />
    <circle cx="17.8" cy="13.2" r="1" />
  </IconBase>
);

export const IconAiTrader = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <rect x="6" y="5" width="12" height="11" rx="3" />
    <circle cx="10" cy="10.5" r="0.8" />
    <circle cx="14" cy="10.5" r="0.8" />
    <path d="M10 13.5h4" />
    <path d="M12 16v3" />
    <path d="M8.5 20h7" />
  </IconBase>
);

export const IconExchange = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M5 8h11" />
    <path d="m13 6 3 2-3 2" />
    <path d="M19 16H8" />
    <path d="m11 14-3 2 3 2" />
  </IconBase>
);

export const IconCryptoMarket = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M6 6v12" />
    <path d="M10 9v9" />
    <path d="M14 5v13" />
    <path d="M18 11v7" />
    <path d="M4 18h16" />
  </IconBase>
);

export const IconSuperCharts = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    <path d="m6.5 14.5 3-2.5 3 1.5 4.5-5.5" />
    <path d="M16 8h2.5v2.5" />
  </IconBase>
);

export const IconIndicators = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M6 6v12" />
    <path d="M12 6v12" />
    <path d="M18 6v12" />
    <circle cx="6" cy="10" r="1.5" />
    <circle cx="12" cy="14" r="1.5" />
    <circle cx="18" cy="9" r="1.5" />
  </IconBase>
);

export const IconTools = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="m14 6 4 4" />
    <path d="m13 7 2-2 4 4-2 2" />
    <path d="M5 19h6l4-4-6-6-4 4z" />
  </IconBase>
);

export const IconCoinCalculator = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <rect x="5" y="3.5" width="14" height="17" rx="2.2" />
    <path d="M8 8h8" />
    <path d="M8 12h3" />
    <path d="M13 12h3" />
    <path d="M8 16h3" />
    <path d="M13 16h3" />
  </IconBase>
);

export const IconTokenCreator = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="m12 3 6 3.5v7L12 17l-6-3.5v-7z" />
    <path d="M12 17v4" />
    <path d="M9.5 20h5" />
    <path d="M10.5 9h3" />
    <path d="M12 7.5v3" />
  </IconBase>
);

export const IconBitriumToken = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9 8h3.8a2 2 0 0 1 0 4H9z" />
    <path d="M9 12h4.3a2 2 0 0 1 0 4H9z" />
  </IconBase>
);

export const IconPricing = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="m6 4 11 0 3 3v11H9L6 15z" />
    <path d="M6 4v5h5" />
    <path d="M12 10v5" />
    <path d="M10 12h4" />
  </IconBase>
);

export const IconSettings = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M12 3.8 14 5l2.3-.3 1 2 2 1.4-.6 2.2.6 2.2-2 1.4-1 2-2.3-.3-2 1.2-2-1.2-2.3.3-1-2-2-1.4.6-2.2-.6-2.2 2-1.4 1-2L10 5z" />
    <circle cx="12" cy="12" r="2.4" />
  </IconBase>
);

export const IconAdmin = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M12 4 18 6.5V12c0 3.7-2.3 6.6-6 8-3.7-1.4-6-4.3-6-8V6.5z" />
    <path d="M9.5 11.5 11 13l3.5-3.5" />
  </IconBase>
);

export const IconFullscreenEnter = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M8 4H4v4" />
    <path d="m4 4 5 5" />
    <path d="M16 4h4v4" />
    <path d="m20 4-5 5" />
    <path d="M8 20H4v-4" />
    <path d="m4 20 5-5" />
    <path d="M16 20h4v-4" />
    <path d="m20 20-5-5" />
  </IconBase>
);

export const IconFullscreenExit = ({ size = 24, active = false, className }: BitriumIconProps) => (
  <IconBase size={size} active={active} className={className}>
    <path d="M9 9H4V4" />
    <path d="m4 9 5-5" />
    <path d="M15 9h5V4" />
    <path d="m20 9-5-5" />
    <path d="M9 15H4v5" />
    <path d="m4 15 5 5" />
    <path d="M15 15h5v5" />
    <path d="m20 15-5 5" />
  </IconBase>
);

export const sidebarIconCatalog = [
  { key: "Bitrium Quant Engine", Icon: IconBitriumQuantEngine },
  { key: "Quant Trade Ideas", Icon: IconQuantTradeIdeas },
  { key: "AI Trade Ideas", Icon: IconAiTradeIdeas },
  { key: "Games", Icon: IconGames },
  { key: "AI Trader", Icon: IconAiTrader },
  { key: "Exchange", Icon: IconExchange },
  { key: "Crypto Market", Icon: IconCryptoMarket },
  { key: "Super Charts", Icon: IconSuperCharts },
  { key: "Indicators", Icon: IconIndicators },
  { key: "Tools", Icon: IconTools },
  { key: "Coin Calculator", Icon: IconCoinCalculator },
  { key: "Token Creator", Icon: IconTokenCreator },
  { key: "Bitrium Token", Icon: IconBitriumToken },
  { key: "Pricing", Icon: IconPricing },
  { key: "Settings", Icon: IconSettings },
  { key: "Admin", Icon: IconAdmin },
] as const;
