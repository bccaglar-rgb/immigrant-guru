import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminConfig, FieldMapping, ProviderConfig, ScoringMode } from "../types";
import { ADMIN_CONFIG } from "../data/adminConfig";
import { mergeProviderPresets } from "../data/providerPresets";
import { fetchAdminProvidersConfig, saveAdminBrandingConfig, saveAdminProvidersConfig } from "../services/adminProvidersConfigApi";

const STORAGE_KEY = "admin-config-v1";
const BRANDING_STORAGE_KEY = "admin-config-branding-v1";
const DEFAULT_TRADE_IDEAS_MIN_CONFIDENCE = ADMIN_CONFIG.tradeIdeas.minConfidenceGlobal;
const DEFAULT_MODE_MIN_CONFIDENCE: Record<ScoringMode, number> = {
  ...ADMIN_CONFIG.tradeIdeas.modeMinConfidence,
};
const LEGACY_MODE_MIN_CONFIDENCE: Partial<Record<"HEDGE_FUND" | "NORMAL", number>> = {
  HEDGE_FUND: 0.68,
  NORMAL: 0.7,
};
const TRADE_IDEAS_MIN_CONF_MIGRATION_KEY = "admin-config-min-confidence-migrated-v20260226-070";

const clampMinConfidence = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  const scaled = value > 1 ? value / 100 : value;
  return Math.max(0.4, Math.min(1.0, scaled));
};

const normalizeModeMinConfidence = (
  raw: Partial<Record<ScoringMode | "HEDGE_FUND" | "NORMAL", number>> | undefined,
  globalMinConfidence: number,
): Record<ScoringMode, number> => {
  return {
    FLOW: clampMinConfidence(Number(raw?.FLOW), DEFAULT_MODE_MIN_CONFIDENCE.FLOW ?? globalMinConfidence),
    AGGRESSIVE: clampMinConfidence(
      Number(raw?.AGGRESSIVE ?? raw?.HEDGE_FUND),
      DEFAULT_MODE_MIN_CONFIDENCE.AGGRESSIVE ?? LEGACY_MODE_MIN_CONFIDENCE.HEDGE_FUND ?? globalMinConfidence,
    ),
    BALANCED: clampMinConfidence(
      Number(raw?.BALANCED ?? raw?.NORMAL),
      DEFAULT_MODE_MIN_CONFIDENCE.BALANCED ?? LEGACY_MODE_MIN_CONFIDENCE.NORMAL ?? globalMinConfidence,
    ),
    CAPITAL_GUARD: clampMinConfidence(Number(raw?.CAPITAL_GUARD), DEFAULT_MODE_MIN_CONFIDENCE.CAPITAL_GUARD ?? globalMinConfidence),
  };
};

export const REQUIRED_FIELD_KEYS = [
  "price",
  "priceChange24hPct",
  "fundingRatePct",
  "volume24hUsd",
  "volumeChange24hPct",
  "marketCapUsd",
  "oiUsd",
  "oiChange1hPct",
  "oiChange24hPct",
  "liquidation24hUsd",
] as const;

const defaultMappings = (): FieldMapping[] =>
  REQUIRED_FIELD_KEYS.map((fieldKey) => ({
    fieldKey,
    providerId: "",
    endpointPath: "",
    parseRule: "",
    refreshSec: 30,
    enabled: true,
  }));

const defaultConfig = (): AdminConfig => ({
  providers: mergeProviderPresets([]),
  mappings: defaultMappings(),
  globalRefreshSec: 15,
  feeds: {
    prices: true,
    derivatives: true,
    marketCap: true,
  },
  tradeIdeas: {
    minConfidence: DEFAULT_TRADE_IDEAS_MIN_CONFIDENCE,
    modeMinConfidence: {
      ...DEFAULT_MODE_MIN_CONFIDENCE,
    },
    sharedMode: "BALANCED",
    flowDefaults: {
      minConsensus: 70,
      minValidBars: 4,
      requireValidTrade: true,
    },
    dashboardConsensus: {
      activeMin: 70,
      strongMin: 80,
      eliteMin: 90,
    },
    dashboardIdeaRisk: {
      entryAtrFactor: 0.35,
      stopAtrFactor: 0.75,
      targetAtrFactor: 1.15,
      target2Multiplier: 1.65,
    },
  },
  branding: {
    logoDataUrl: undefined,
    emblemDataUrl: undefined,
  },
  tradingView: {
    enabled: false,
    apiKey: undefined,
    apiSecret: undefined,
    widgetDomain: "tradingview.com",
    defaultExchange: "BINANCE",
  },
});

type BrandingStorage = {
  logoDataUrl?: string;
  emblemDataUrl?: string;
};

const readBrandingStorage = (): BrandingStorage => {
  try {
    const raw = window.localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BrandingStorage;
    return {
      logoDataUrl: parsed.logoDataUrl,
      emblemDataUrl: parsed.emblemDataUrl,
    };
  } catch {
    return {};
  }
};

const writeBrandingStorage = (branding: BrandingStorage) => {
  window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding));
};

const mergeMappings = (mappings: FieldMapping[]): FieldMapping[] => {
  const map = new Map(mappings.map((m) => [m.fieldKey, m]));
  return REQUIRED_FIELD_KEYS.map((fieldKey) => {
    const existing = map.get(fieldKey);
    return existing ?? {
      fieldKey,
      providerId: "",
      endpointPath: "",
      parseRule: "",
      refreshSec: 30,
      enabled: true,
    };
  });
};

const safeParse = (): AdminConfig => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as Partial<AdminConfig>;
    const parsedMinConfidence = Number(parsed.tradeIdeas?.minConfidence);
    let minConfidence = Number.isFinite(parsedMinConfidence)
      ? parsedMinConfidence
      : DEFAULT_TRADE_IDEAS_MIN_CONFIDENCE;
    if (minConfidence === 0.75 || minConfidence === 0.68) {
      const migrated = window.localStorage.getItem(TRADE_IDEAS_MIN_CONF_MIGRATION_KEY) === "1";
      if (!migrated) {
        minConfidence = DEFAULT_TRADE_IDEAS_MIN_CONFIDENCE;
        window.localStorage.setItem(TRADE_IDEAS_MIN_CONF_MIGRATION_KEY, "1");
      }
    }
    const brandingFromDedicatedStore = readBrandingStorage();
    const brandingFromMain = {
      logoDataUrl: parsed.branding?.logoDataUrl,
      emblemDataUrl: parsed.branding?.emblemDataUrl,
    };
    const mergedBranding: BrandingStorage = {
      logoDataUrl: brandingFromDedicatedStore.logoDataUrl ?? brandingFromMain.logoDataUrl,
      emblemDataUrl: brandingFromDedicatedStore.emblemDataUrl ?? brandingFromMain.emblemDataUrl,
    };
    return {
      providers: mergeProviderPresets(parsed.providers ?? []),
      mappings: mergeMappings(parsed.mappings ?? []),
      globalRefreshSec: Number(parsed.globalRefreshSec ?? 15),
      feeds: {
        prices: parsed.feeds?.prices ?? true,
        derivatives: parsed.feeds?.derivatives ?? true,
        marketCap: parsed.feeds?.marketCap ?? true,
      },
      tradeIdeas: {
        minConfidence,
        modeMinConfidence: normalizeModeMinConfidence(
          parsed.tradeIdeas?.modeMinConfidence as Partial<Record<ScoringMode | "HEDGE_FUND" | "NORMAL", number>> | undefined,
          minConfidence,
        ),
        sharedMode:
          parsed.tradeIdeas?.sharedMode === "AGGRESSIVE" ||
          parsed.tradeIdeas?.sharedMode === "BALANCED" ||
          parsed.tradeIdeas?.sharedMode === "CAPITAL_GUARD"
            ? parsed.tradeIdeas.sharedMode
            : "BALANCED",
        flowDefaults: {
          minConsensus: Number.isFinite(Number(parsed.tradeIdeas?.flowDefaults?.minConsensus))
            ? Math.max(20, Math.min(95, Number(parsed.tradeIdeas?.flowDefaults?.minConsensus)))
            : 70,
          minValidBars: Number.isFinite(Number(parsed.tradeIdeas?.flowDefaults?.minValidBars))
            ? Math.max(1, Math.min(12, Math.round(Number(parsed.tradeIdeas?.flowDefaults?.minValidBars))))
            : 4,
          requireValidTrade:
            typeof parsed.tradeIdeas?.flowDefaults?.requireValidTrade === "boolean"
              ? parsed.tradeIdeas.flowDefaults.requireValidTrade
              : true,
        },
        dashboardConsensus: {
          activeMin: Number(parsed.tradeIdeas?.dashboardConsensus?.activeMin ?? 70),
          strongMin: Number(parsed.tradeIdeas?.dashboardConsensus?.strongMin ?? 80),
          eliteMin: Number(parsed.tradeIdeas?.dashboardConsensus?.eliteMin ?? 90),
        },
        dashboardIdeaRisk: {
          entryAtrFactor: Number(parsed.tradeIdeas?.dashboardIdeaRisk?.entryAtrFactor ?? 0.35),
          stopAtrFactor: Number(parsed.tradeIdeas?.dashboardIdeaRisk?.stopAtrFactor ?? 0.75),
          targetAtrFactor: Number(parsed.tradeIdeas?.dashboardIdeaRisk?.targetAtrFactor ?? 1.15),
          target2Multiplier: Number(parsed.tradeIdeas?.dashboardIdeaRisk?.target2Multiplier ?? 1.65),
        },
      },
      branding: mergedBranding,
      tradingView: {
        enabled: parsed.tradingView?.enabled ?? false,
        apiKey: parsed.tradingView?.apiKey,
        apiSecret: parsed.tradingView?.apiSecret,
        widgetDomain: parsed.tradingView?.widgetDomain ?? "tradingview.com",
        defaultExchange: parsed.tradingView?.defaultExchange ?? "BINANCE",
      },
    };
  } catch {
    return defaultConfig();
  }
};

export const useAdminConfig = () => {
  const [config, setConfig] = useState<AdminConfig>(() => safeParse());
  const [persistError, setPersistError] = useState<string | null>(null);
  const [providersSyncReady, setProvidersSyncReady] = useState(false);
  const [providersSyncError, setProvidersSyncError] = useState<string | null>(null);
  const skipNextProviderSaveRef = useRef(false);
  const skipNextBrandingSaveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const hydrateProviders = async () => {
      try {
        const remote = await fetchAdminProvidersConfig();
        if (cancelled || !remote?.ok || !Array.isArray(remote.providers)) return;
        skipNextProviderSaveRef.current = true;
        skipNextBrandingSaveRef.current = true;
        setConfig((prev) => ({
          ...prev,
          providers: mergeProviderPresets(remote.providers),
          branding: {
            logoDataUrl: remote.branding?.logoDataUrl ?? prev.branding.logoDataUrl,
            emblemDataUrl: remote.branding?.emblemDataUrl ?? prev.branding.emblemDataUrl,
          },
        }));
        setProvidersSyncError(null);
      } catch {
        // backend may be unavailable in local-only mode
      } finally {
        if (!cancelled) setProvidersSyncReady(true);
      }
    };
    void hydrateProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!providersSyncReady) return;
    if (skipNextProviderSaveRef.current) {
      skipNextProviderSaveRef.current = false;
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        await saveAdminProvidersConfig(config.providers);
        if (!cancelled) setProvidersSyncError(null);
      } catch (error) {
        if (!cancelled) {
          setProvidersSyncError(error instanceof Error ? error.message : "provider_sync_failed");
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [config.providers, providersSyncReady]);

  useEffect(() => {
    if (!providersSyncReady) return;
    if (skipNextBrandingSaveRef.current) {
      skipNextBrandingSaveRef.current = false;
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        await saveAdminBrandingConfig({
          logoDataUrl: config.branding.logoDataUrl,
          emblemDataUrl: config.branding.emblemDataUrl,
        });
        if (!cancelled) setProvidersSyncError(null);
      } catch (error) {
        if (!cancelled) {
          setProvidersSyncError(error instanceof Error ? error.message : "branding_sync_failed");
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [config.branding.emblemDataUrl, config.branding.logoDataUrl, providersSyncReady]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      writeBrandingStorage({
        logoDataUrl: config.branding.logoDataUrl,
        emblemDataUrl: config.branding.emblemDataUrl,
      });
      window.dispatchEvent(new Event("admin-config-updated"));
      setPersistError(null);
    } catch {
      // Keep branding durable even if full config exceeds storage budget.
      try {
        writeBrandingStorage({
          logoDataUrl: config.branding.logoDataUrl,
          emblemDataUrl: config.branding.emblemDataUrl,
        });
      } catch {
        // ignore secondary storage failures
      }
      setPersistError("Branding image is too large for browser storage. Please upload a smaller image.");
    }
  }, [config]);

  const providerById = useMemo(
    () => new Map(config.providers.map((provider) => [provider.id, provider])),
    [config.providers],
  );

  const addProvider = (provider: ProviderConfig) => {
    setConfig((prev) => ({
      ...prev,
      providers: [provider, ...prev.providers],
    }));
  };

  const setProviders = (providers: ProviderConfig[]) => {
    setConfig((prev) => ({
      ...prev,
      providers,
    }));
  };

  const syncProviderPresets = () => {
    setConfig((prev) => ({
      ...prev,
      providers: mergeProviderPresets(prev.providers),
    }));
  };

  const updateProvider = (provider: ProviderConfig) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.map((item) => (item.id === provider.id ? provider : item)),
    }));
  };

  const removeProvider = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.filter((provider) => provider.id !== id),
      mappings: prev.mappings.map((mapping) => (mapping.providerId === id ? { ...mapping, providerId: "" } : mapping)),
    }));
  };

  const updateMapping = (fieldKey: string, patch: Partial<FieldMapping>) => {
    setConfig((prev) => ({
      ...prev,
      mappings: prev.mappings.map((mapping) => (mapping.fieldKey === fieldKey ? { ...mapping, ...patch } : mapping)),
    }));
  };

  const setGlobalRefreshSec = (globalRefreshSec: number) => {
    setConfig((prev) => ({
      ...prev,
      globalRefreshSec,
    }));
  };

  const setFeedToggle = (key: keyof AdminConfig["feeds"], value: boolean) => {
    setConfig((prev) => ({
      ...prev,
      feeds: {
        ...prev.feeds,
        [key]: value,
      },
    }));
  };

  const setTradeIdeasMinConfidence = (minConfidence: number) => {
    const clamped = clampMinConfidence(minConfidence, DEFAULT_TRADE_IDEAS_MIN_CONFIDENCE);
    setConfig((prev) => ({
      ...prev,
      tradeIdeas: {
        ...prev.tradeIdeas,
        minConfidence: clamped,
      },
    }));
  };

  const setTradeIdeasModeMinConfidence = (mode: ScoringMode, minConfidence: number) => {
    const fallback = prevModeMin(config, mode);
    const clamped = clampMinConfidence(minConfidence, fallback);
    setConfig((prev) => ({
      ...prev,
      tradeIdeas: {
        ...prev.tradeIdeas,
        modeMinConfidence: {
          ...prev.tradeIdeas.modeMinConfidence,
          [mode]: clamped,
        },
      },
    }));
  };

  const setTradeIdeasFlowDefaults = (
    patch: Partial<AdminConfig["tradeIdeas"]["flowDefaults"]>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      tradeIdeas: {
        ...prev.tradeIdeas,
        flowDefaults: {
          ...prev.tradeIdeas.flowDefaults,
          ...patch,
        },
      },
    }));
  };

  const setTradeIdeasSharedMode = (mode: Exclude<ScoringMode, "FLOW">) => {
    setConfig((prev) => ({
      ...prev,
      tradeIdeas: {
        ...prev.tradeIdeas,
        sharedMode: mode,
      },
    }));
  };

  function prevModeMin(current: AdminConfig, mode: ScoringMode): number {
    return current.tradeIdeas.modeMinConfidence?.[mode] ?? current.tradeIdeas.minConfidence;
  }

  const setTradeIdeasDashboardConsensus = (
    patch: Partial<AdminConfig["tradeIdeas"]["dashboardConsensus"]>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      tradeIdeas: {
        ...prev.tradeIdeas,
        dashboardConsensus: {
          ...prev.tradeIdeas.dashboardConsensus,
          ...patch,
        },
      },
    }));
  };

  const setTradeIdeasDashboardIdeaRisk = (
    patch: Partial<AdminConfig["tradeIdeas"]["dashboardIdeaRisk"]>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      tradeIdeas: {
        ...prev.tradeIdeas,
        dashboardIdeaRisk: {
          ...prev.tradeIdeas.dashboardIdeaRisk,
          ...patch,
        },
      },
    }));
  };

  const setBrandingLogo = (logoDataUrl?: string) => {
    if (logoDataUrl && logoDataUrl.length > 380_000) {
      setPersistError("Logo image is too large. Please upload a smaller image.");
      return;
    }
    setConfig((prev) => ({
      ...prev,
      branding: {
        ...prev.branding,
        logoDataUrl,
      },
    }));
  };

  const setBrandingEmblem = (emblemDataUrl?: string) => {
    if (emblemDataUrl && emblemDataUrl.length > 220_000) {
      setPersistError("Emblem image is too large. Please upload a smaller image.");
      return;
    }
    setConfig((prev) => ({
      ...prev,
      branding: {
        ...prev.branding,
        emblemDataUrl,
      },
    }));
  };

  const setTradingViewConfig = (patch: Partial<AdminConfig["tradingView"]>) => {
    setConfig((prev) => ({
      ...prev,
      tradingView: {
        ...prev.tradingView,
        ...patch,
      },
    }));
  };

  return {
    config,
    providerById,
    addProvider,
    setProviders,
    syncProviderPresets,
    updateProvider,
    removeProvider,
    updateMapping,
    setGlobalRefreshSec,
    setFeedToggle,
    setTradeIdeasMinConfidence,
    setTradeIdeasModeMinConfidence,
    setTradeIdeasSharedMode,
    setTradeIdeasFlowDefaults,
    setTradeIdeasDashboardConsensus,
    setTradeIdeasDashboardIdeaRisk,
    setBrandingLogo,
    setBrandingEmblem,
    setTradingViewConfig,
    persistError,
    providersSyncError,
  };
};

export const readAdminConfigFromStorage = (): AdminConfig => safeParse();
export const ADMIN_CONFIG_STORAGE_KEY = STORAGE_KEY;
