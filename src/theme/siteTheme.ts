export interface SitePalette {
  id: string;
  name: string;
  colors: {
    background: string;
    panel: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    accentPrimary: string;
    accentSecondary?: string;
  };
}

export interface StoredThemeState {
  paletteId: string;
  customEnabled: boolean;
  customColors: SitePalette["colors"] | null;
}

export const THEME_STORAGE_KEY = "siteThemePalette";

export const PREDEFINED_PALETTES: SitePalette[] = [
  {
    id: "default-current",
    name: "Default (Current)",
    colors: {
      background: "#0B0B0C",
      panel: "#121316",
      border: "#2A2D33",
      textPrimary: "#FFFFFF",
      textSecondary: "#BFC2C7",
      accentPrimary: "#F5C542",
      accentSecondary: "#E8E8E6",
    },
  },
  {
    id: "fintech-gold-terminal",
    name: "Fintech Gold Terminal",
    colors: {
      background: "#0B0F14",
      panel: "#121821",
      border: "#232A36",
      textPrimary: "#E6EAF0",
      textSecondary: "#8B93A7",
      accentPrimary: "#F2C94C",
      accentSecondary: "#FFFFFF",
    },
  },
  {
    id: "ai-saas-blue",
    name: "AI SaaS Blue",
    colors: {
      background: "#0A1120",
      panel: "#111B2E",
      border: "#1F2A44",
      textPrimary: "#EAF2FF",
      textSecondary: "#A7B4CC",
      accentPrimary: "#3B82F6",
      accentSecondary: "#DDE9FF",
    },
  },
  {
    id: "trading-green-pro",
    name: "Trading Green Pro",
    colors: {
      background: "#070A0F",
      panel: "#0F1623",
      border: "#1F2A3A",
      textPrimary: "#E5E7EB",
      textSecondary: "#9CA3AF",
      accentPrimary: "#22C55E",
      accentSecondary: "#D9FBE8",
    },
  },
  {
    id: "premium-minimal-gold",
    name: "Premium Minimal Gold",
    colors: {
      background: "#111111",
      panel: "#1A1A1A",
      border: "#2A2A2A",
      textPrimary: "#F5F5F5",
      textSecondary: "#9CA3AF",
      accentPrimary: "#D4AF37",
      accentSecondary: "#FAF0C7",
    },
  },
];

const defaultStoredState = (): StoredThemeState => ({
  paletteId: PREDEFINED_PALETTES[0].id,
  customEnabled: false,
  customColors: null,
});

export const isValidHex = (value: string) => /^#([0-9a-fA-F]{6})$/.test(value.trim());

const toPanelMuted = (hex: string) => `${hex}CC`;
const toBorderSoft = (hex: string) => `${hex}66`;

const normalizeHex = (hex: string) => {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return "000000";
  return cleaned;
};

const mixHex = (a: string, b: string, ratioToB: number) => {
  const ah = normalizeHex(a);
  const bh = normalizeHex(b);
  const t = Math.max(0, Math.min(1, ratioToB));
  const ch = (i: number) => {
    const av = parseInt(ah.slice(i, i + 2), 16);
    const bv = parseInt(bh.slice(i, i + 2), 16);
    const mv = Math.round(av * (1 - t) + bv * t);
    return mv.toString(16).padStart(2, "0");
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
};

const menuAccentSeries = (accent: string, secondary: string) => {
  const mixSteps = [0, 0.08, 0.14, 0.2, 0.26, 0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.68, 0.74, 0.8];
  return mixSteps.map((step) => mixHex(accent, secondary, step));
};

export const applyPaletteToRoot = (palette: SitePalette["colors"]) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const panelAlt = mixHex(palette.panel, "#000000", 0.12);
  const panelAlt2 = mixHex(palette.panel, "#000000", 0.2);
  const panelAlt3 = mixHex(palette.panel, "#ffffff", 0.04);
  const subtleText = mixHex(palette.textSecondary, palette.background, 0.35);
  root.style.setProperty("--bg", palette.background);
  root.style.setProperty("--panel", palette.panel);
  root.style.setProperty("--border", palette.border);
  root.style.setProperty("--text", palette.textPrimary);
  root.style.setProperty("--textMuted", palette.textSecondary);
  root.style.setProperty("--accent", palette.accentPrimary);
  root.style.setProperty("--accentSecondary", palette.accentSecondary ?? palette.textPrimary);
  root.style.setProperty("--panelMuted", toPanelMuted(palette.panel));
  root.style.setProperty("--panelAlt", panelAlt);
  root.style.setProperty("--panelAlt2", panelAlt2);
  root.style.setProperty("--panelAlt3", panelAlt3);
  root.style.setProperty("--borderSoft", toBorderSoft(palette.border));
  root.style.setProperty("--textSubtle", subtleText);
  const menuAccents = menuAccentSeries(palette.accentPrimary, palette.textSecondary);
  menuAccents.forEach((tone, idx) => {
    root.style.setProperty(`--menu-accent-${idx + 1}`, tone);
  });
};

export const getPaletteById = (id: string): SitePalette => PREDEFINED_PALETTES.find((p) => p.id === id) ?? PREDEFINED_PALETTES[0];

export const readStoredTheme = (): StoredThemeState => {
  if (typeof window === "undefined") return defaultStoredState();
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return defaultStoredState();
    const parsed = JSON.parse(raw) as Partial<StoredThemeState>;
    return {
      paletteId: typeof parsed.paletteId === "string" ? parsed.paletteId : PREDEFINED_PALETTES[0].id,
      customEnabled: Boolean(parsed.customEnabled),
      customColors: parsed.customColors ?? null,
    };
  } catch {
    return defaultStoredState();
  }
};

export const writeStoredTheme = (state: StoredThemeState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("site-theme-updated"));
};

export const resolveEffectivePalette = (state: StoredThemeState): SitePalette["colors"] => {
  if (state.customEnabled && state.customColors) return state.customColors;
  return getPaletteById(state.paletteId).colors;
};

export const applyStoredTheme = () => {
  const state = readStoredTheme();
  applyPaletteToRoot(resolveEffectivePalette(state));
  return state;
};
