/**
 * Budget Engine — Per-endpoint request budget tracking with tier-based throttling.
 *
 * Tracks REST request budgets at 3 levels:
 *   1. Global weight budget (sliding 60s window)
 *   2. Per-endpoint request count + weight caps
 *   3. Tier-based auto-throttle (C stops first, then B)
 *
 * Uses simple Map-based sliding windows — no external dependencies.
 */

// ── Types ──

export enum RequestTier {
  CRITICAL = "A",   // execution, auth — always allowed unless banned
  IMPORTANT = "B",  // recovery snapshot, metadata — allowed if budget > 50%
  OPTIONAL = "C",   // warmup, enrichment, convenience — allowed if budget > 70%
}

export interface EndpointBudget {
  maxPerMinute: number;
  maxWeight: number;
  tier: RequestTier;
}

export interface BudgetConfig {
  global: { maxWeightPerMinute: number };
  perEndpoint: Record<string, EndpointBudget>;
}

export interface EndpointStatus {
  requestCount: number;
  weightUsed: number;
  maxPerMinute: number;
  maxWeight: number;
  tier: RequestTier;
}

export interface BudgetStatus {
  globalWeight: number;
  globalMaxWeight: number;
  globalUsagePct: number;
  isBanned: boolean;
  banExpiresAt: number | null;
  endpoints: Record<string, EndpointStatus>;
}

interface WeightEntry {
  timestamp: number;
  weight: number;
}

interface EndpointTracker {
  entries: WeightEntry[];
}

// ── Default config ──

const DEFAULT_CONFIG: BudgetConfig = {
  global: { maxWeightPerMinute: 800 },
  perEndpoint: {
    depthSnapshot: { maxPerMinute: 5, maxWeight: 50, tier: RequestTier.IMPORTANT },
    klines:        { maxPerMinute: 3, maxWeight: 30, tier: RequestTier.OPTIONAL },
    exchangeInfo:  { maxPerMinute: 1, maxWeight: 10, tier: RequestTier.OPTIONAL },
    ticker:        { maxPerMinute: 5, maxWeight: 5,  tier: RequestTier.OPTIONAL },
  },
};

// ── Endpoint classification ──

export function classifyEndpoint(url: string): string {
  if (url.includes("/depth")) return "depthSnapshot";
  if (url.includes("/klines")) return "klines";
  if (url.includes("/exchangeInfo")) return "exchangeInfo";
  if (url.includes("/ticker")) return "ticker";
  if (url.includes("/listenKey")) return "listenKey";
  if (url.includes("/time") || url.includes("/ping")) return "health";
  return "other";
}

// ── Budget Engine ──

const WINDOW_MS = 60_000;

// Global sliding window entries
const globalEntries: WeightEntry[] = [];

// Per-endpoint sliding window trackers
const endpointTrackers = new Map<string, EndpointTracker>();

// Ban state
let banned = false;
let banExpiresAt: number | null = null;

let config: BudgetConfig = DEFAULT_CONFIG;

function pruneEntries(entries: WeightEntry[], now: number): void {
  const cutoff = now - WINDOW_MS;
  while (entries.length > 0 && entries[0].timestamp < cutoff) {
    entries.shift();
  }
}

function getTracker(endpoint: string): EndpointTracker {
  let tracker = endpointTrackers.get(endpoint);
  if (!tracker) {
    tracker = { entries: [] };
    endpointTrackers.set(endpoint, tracker);
  }
  return tracker;
}

function sumWeight(entries: WeightEntry[]): number {
  let total = 0;
  for (const e of entries) total += e.weight;
  return total;
}

function countRequests(entries: WeightEntry[]): number {
  return entries.length;
}

/**
 * Check if a ban has expired and clear it.
 */
function checkBanExpiry(): void {
  if (banned && banExpiresAt !== null && Date.now() > banExpiresAt) {
    banned = false;
    banExpiresAt = null;
    console.log("[BudgetEngine] Ban expired, resuming requests");
  }
}

/**
 * Check whether a request to the given endpoint with the given weight is allowed.
 * Tier rules:
 *   - CRITICAL (A): always allowed unless banned
 *   - IMPORTANT (B): blocked if global usage > 50%
 *   - OPTIONAL (C): blocked if global usage > 30% (i.e. allowed only if budget > 70% remaining)
 */
export function canRequest(endpoint: string, weight: number): { allowed: boolean; reason?: string } {
  checkBanExpiry();

  const tier = getTier(endpoint);

  // Banned = block everything
  if (banned) {
    return { allowed: false, reason: `banned until ${banExpiresAt ? new Date(banExpiresAt).toISOString() : "unknown"}` };
  }

  const now = Date.now();

  // Prune global window
  pruneEntries(globalEntries, now);
  const globalWeight = sumWeight(globalEntries);
  const globalMax = config.global.maxWeightPerMinute;
  const usagePct = globalWeight / globalMax;

  // CRITICAL tier: only blocked by ban or hard global limit
  if (tier === RequestTier.CRITICAL) {
    if (globalWeight + weight > globalMax) {
      return { allowed: false, reason: `global weight ${globalWeight}+${weight} > ${globalMax}` };
    }
    return { allowed: true };
  }

  // Tier-based throttle: OPTIONAL stops when usage > 30% of budget used (70% remaining)
  if (tier === RequestTier.OPTIONAL && usagePct > 0.30) {
    return { allowed: false, reason: `tier_C blocked: global usage ${Math.round(usagePct * 100)}% > 30%` };
  }

  // Tier-based throttle: IMPORTANT stops when usage > 50% of budget used
  if (tier === RequestTier.IMPORTANT && usagePct > 0.50) {
    return { allowed: false, reason: `tier_B blocked: global usage ${Math.round(usagePct * 100)}% > 50%` };
  }

  // Global weight cap
  if (globalWeight + weight > globalMax) {
    return { allowed: false, reason: `global weight ${globalWeight}+${weight} > ${globalMax}` };
  }

  // Per-endpoint caps
  const epConfig = config.perEndpoint[endpoint];
  if (epConfig) {
    const tracker = getTracker(endpoint);
    pruneEntries(tracker.entries, now);
    const epReqs = countRequests(tracker.entries);
    const epWeight = sumWeight(tracker.entries);

    if (epReqs + 1 > epConfig.maxPerMinute) {
      return { allowed: false, reason: `${endpoint} req count ${epReqs}+1 > ${epConfig.maxPerMinute}/min` };
    }
    if (epWeight + weight > epConfig.maxWeight) {
      return { allowed: false, reason: `${endpoint} weight ${epWeight}+${weight} > ${epConfig.maxWeight}/min` };
    }
  }

  return { allowed: true };
}

/**
 * Record that a request was made.
 */
export function recordRequest(endpoint: string, weight: number): void {
  const now = Date.now();
  const entry: WeightEntry = { timestamp: now, weight };

  // Global
  globalEntries.push(entry);

  // Per-endpoint
  const tracker = getTracker(endpoint);
  tracker.entries.push(entry);
}

/**
 * Get the tier for an endpoint.
 */
export function getTier(endpoint: string): RequestTier {
  const epConfig = config.perEndpoint[endpoint];
  if (epConfig) return epConfig.tier;
  // Default tiers for unlisted endpoints
  if (endpoint === "listenKey" || endpoint === "health") return RequestTier.CRITICAL;
  return RequestTier.IMPORTANT;
}

/**
 * Get current budget status across all levels.
 */
export function getStatus(): BudgetStatus {
  checkBanExpiry();
  const now = Date.now();
  pruneEntries(globalEntries, now);
  const globalWeight = sumWeight(globalEntries);

  const endpoints: Record<string, EndpointStatus> = {};
  for (const [name, epConfig] of Object.entries(config.perEndpoint)) {
    const tracker = getTracker(name);
    pruneEntries(tracker.entries, now);
    endpoints[name] = {
      requestCount: countRequests(tracker.entries),
      weightUsed: sumWeight(tracker.entries),
      maxPerMinute: epConfig.maxPerMinute,
      maxWeight: epConfig.maxWeight,
      tier: epConfig.tier,
    };
  }

  return {
    globalWeight,
    globalMaxWeight: config.global.maxWeightPerMinute,
    globalUsagePct: Math.round((globalWeight / config.global.maxWeightPerMinute) * 100),
    isBanned: banned,
    banExpiresAt: banned ? banExpiresAt : null,
    endpoints,
  };
}

/**
 * Called when a ban-inducing status code is received (418, 429).
 * Freezes all budgets for a cooldown period.
 */
export function onBanDetected(statusCode: number): void {
  const cooldownMs = statusCode === 418 ? 120_000 : 30_000;
  banned = true;
  banExpiresAt = Date.now() + cooldownMs;
  console.error(`[BudgetEngine] Ban detected (HTTP ${statusCode})! All budgets frozen for ${cooldownMs / 1000}s`);
}

/**
 * Override budget config (for testing or dynamic adjustment).
 */
export function setBudgetConfig(newConfig: BudgetConfig): void {
  config = newConfig;
}

/**
 * Get the current config (for observability).
 */
export function getBudgetConfig(): BudgetConfig {
  return config;
}

/**
 * Reset all tracking state (for testing).
 */
export function resetBudget(): void {
  globalEntries.length = 0;
  endpointTrackers.clear();
  banned = false;
  banExpiresAt = null;
}
