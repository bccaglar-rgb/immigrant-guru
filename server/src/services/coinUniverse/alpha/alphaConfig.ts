export interface AlphaModuleConfig {
  enabled: boolean;
  weight: number;  // 0-1 multiplier on bonus/penalty contribution
}

export interface AlphaConfig {
  globalEnabled: boolean;
  maxAlphaBonus: number;
  maxAlphaPenalty: number;
  modules: {
    fundingIntelligence: AlphaModuleConfig;
    oiShockDetection: AlphaModuleConfig;
    advancedVolatility: AlphaModuleConfig;
    deltaImbalance: AlphaModuleConfig;
    multiTimeframe: AlphaModuleConfig;
    liquidationCascade: AlphaModuleConfig;
    tradeTiming: AlphaModuleConfig;
  };
}

export function loadAlphaConfig(): AlphaConfig {
  const envBool = (key: string, def: boolean) => {
    const v = process.env[key];
    return v === "false" ? false : v === "true" ? true : def;
  };
  return {
    globalEnabled: envBool("ALPHA_SIGNALS_ENABLED", true),
    maxAlphaBonus: 15,
    maxAlphaPenalty: 10,
    modules: {
      fundingIntelligence:   { enabled: envBool("ALPHA_FUNDING_ENABLED", true),      weight: 1.0 },
      oiShockDetection:      { enabled: envBool("ALPHA_OI_SHOCK_ENABLED", true),     weight: 1.0 },
      advancedVolatility:    { enabled: envBool("ALPHA_VOLATILITY_ENABLED", true),   weight: 1.0 },
      deltaImbalance:        { enabled: envBool("ALPHA_DELTA_ENABLED", true),        weight: 1.0 },
      multiTimeframe:        { enabled: envBool("ALPHA_MTF_ENABLED", true),          weight: 1.0 },
      liquidationCascade:    { enabled: envBool("ALPHA_CASCADE_ENABLED", true),      weight: 1.0 },
      tradeTiming:           { enabled: envBool("ALPHA_TIMING_ENABLED", true),       weight: 1.0 },
    },
  };
}
