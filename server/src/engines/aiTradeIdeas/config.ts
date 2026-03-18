import type { AiEngineConfig } from "./types.ts";

export function loadConfig(): AiEngineConfig {
  return {
    enabled: process.env.AI_TRADE_IDEA_ENGINE_V2_ENABLED === "true",
    intervalMs: Number(process.env.AI_ENGINE_V2_INTERVAL_MS || 300_000),
    maxCandidatesForAi: Number(process.env.AI_ENGINE_V2_MAX_CANDIDATES || 6),
    aiProvider: (process.env.AI_ENGINE_V2_PROVIDER ?? "CHATGPT") as AiEngineConfig["aiProvider"],
    aiModel: process.env.AI_ENGINE_V2_MODEL ?? "gpt-4o-mini",
    aiTimeoutMs: Number(process.env.AI_ENGINE_V2_TIMEOUT_MS || 20_000),
    aiTemperature: Number(process.env.AI_ENGINE_V2_TEMPERATURE || 0.15),
    aiMaxTokens: Number(process.env.AI_ENGINE_V2_MAX_TOKENS || 2000),
    minQuantScore: Number(process.env.AI_ENGINE_V2_MIN_QUANT_SCORE || 42),
    minRR: Number(process.env.AI_ENGINE_V2_MIN_RR || 1.3),
    softDowngradeThreshold: Number(process.env.AI_ENGINE_V2_SOFT_THRESHOLD || 3),
    staleCacheMaxAgeMs: Number(process.env.AI_ENGINE_V2_STALE_CACHE_MS || 90_000),
    userId: process.env.AI_ENGINE_V2_USER_ID ?? "ai-engine-v2",
    dryRun: process.env.AI_ENGINE_V2_DRY_RUN === "true",
  };
}
