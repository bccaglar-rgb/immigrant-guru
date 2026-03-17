import type { IExchangeMarketAdapter } from "./adapter.ts";
import type { AdapterHealthSnapshot, MarketExchangeId } from "./types.ts";

interface RouteState {
  activeExchange: MarketExchangeId;
  degradedSince: number | null;
  preferredHealthySince: number | null;
  lastSwitchAt: number;
  cooldownUntil: number;
}

export interface RouterConfig {
  order: MarketExchangeId[];
  degradeHoldMs: number;
  switchCooldownMs: number;
  switchInMinScore: number;
  stayMinScore: number;
  minAdvantageScore: number;
  switchBackStableMs: number;
}

const DEFAULT_CONFIG: RouterConfig = {
  order: ["BINANCE", "GATEIO"],
  degradeHoldMs: 6_000,
  switchCooldownMs: 25_000,
  switchInMinScore: 60,
  stayMinScore: 55,
  minAdvantageScore: 8,
  switchBackStableMs: 15_000,
};

export class HealthScoreRouter {
  private readonly stateBySymbol = new Map<string, RouteState>();
  private readonly config: RouterConfig;
  private readonly adapters: Map<MarketExchangeId, IExchangeMarketAdapter>;

  constructor(adapters: Map<MarketExchangeId, IExchangeMarketAdapter>, config?: Partial<RouterConfig>) {
    this.adapters = adapters;
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  }

  getActiveExchange(symbol: string, preferredExchange?: MarketExchangeId): MarketExchangeId {
    const normalizedSymbol = String(symbol ?? "").toUpperCase().replace(/[-_/]/g, "");
    const preferred = this.resolvePreferred(preferredExchange);
    const now = Date.now();
    const state = this.stateBySymbol.get(normalizedSymbol) ?? {
      activeExchange: preferred,
      degradedSince: null,
      preferredHealthySince: null,
      lastSwitchAt: 0,
      cooldownUntil: 0,
    };
    const next = this.evaluateRoute(state, preferred, now);
    this.stateBySymbol.set(normalizedSymbol, next);
    return next.activeExchange;
  }

  getState(symbol: string): RouteState | null {
    const normalizedSymbol = String(symbol ?? "").toUpperCase().replace(/[-_/]/g, "");
    return this.stateBySymbol.get(normalizedSymbol) ?? null;
  }

  private evaluateRoute(state: RouteState, preferred: MarketExchangeId, now: number): RouteState {
    const activeHealth = this.healthOf(state.activeExchange);
    const preferredHealth = this.healthOf(preferred);

    let degradedSince = state.degradedSince;
    let preferredHealthySince = state.preferredHealthySince;
    let activeExchange = state.activeExchange;
    let lastSwitchAt = state.lastSwitchAt;
    let cooldownUntil = state.cooldownUntil;

    const activeLooksBad =
      activeHealth.state === "down" ||
      activeHealth.score < this.config.stayMinScore ||
      activeHealth.lastMessageAgeMs > this.config.degradeHoldMs;

    if (activeLooksBad) {
      degradedSince = degradedSince ?? now;
    } else {
      degradedSince = null;
    }

    const preferredLooksStrong =
      preferredHealth.state !== "down" &&
      preferredHealth.score >= this.config.switchInMinScore;
    if (preferredLooksStrong) {
      preferredHealthySince = preferredHealthySince ?? now;
    } else {
      preferredHealthySince = null;
    }

    if (
      activeExchange !== preferred &&
      preferredHealthySince !== null &&
      now - preferredHealthySince >= this.config.switchBackStableMs &&
      now >= cooldownUntil &&
      preferredHealth.score >= activeHealth.score + this.config.minAdvantageScore
    ) {
      activeExchange = preferred;
      lastSwitchAt = now;
      cooldownUntil = now + this.config.switchCooldownMs;
      degradedSince = null;
      return {
        activeExchange,
        degradedSince,
        preferredHealthySince,
        lastSwitchAt,
        cooldownUntil,
      };
    }

    if (
      degradedSince !== null &&
      now - degradedSince >= this.config.degradeHoldMs &&
      now >= cooldownUntil &&
      now - lastSwitchAt >= Math.min(this.config.degradeHoldMs, 2_500)
    ) {
      const candidate = this.pickBestCandidate(activeExchange);
      if (candidate && this.canSwitch(activeHealth, candidate.health)) {
        activeExchange = candidate.exchange;
        lastSwitchAt = now;
        cooldownUntil = now + this.config.switchCooldownMs;
        degradedSince = null;
      }
    }

    return {
      activeExchange,
      degradedSince,
      preferredHealthySince,
      lastSwitchAt,
      cooldownUntil,
    };
  }

  private canSwitch(current: AdapterHealthSnapshot, candidate: AdapterHealthSnapshot): boolean {
    if (candidate.state === "down") return false;
    if (candidate.score < this.config.switchInMinScore) return false;
    if (current.state === "down") return true;
    return candidate.score >= current.score + this.config.minAdvantageScore;
  }

  private pickBestCandidate(activeExchange: MarketExchangeId): { exchange: MarketExchangeId; health: AdapterHealthSnapshot } | null {
    const candidates = [...this.adapters.entries()]
      .filter(([exchange]) => exchange !== activeExchange)
      .map(([exchange, adapter]) => ({ exchange, health: adapter.getHealth() }))
      .filter(({ health }) => health.state !== "down")
      .sort((a, b) => b.health.score - a.health.score);
    return candidates[0] ?? null;
  }

  private healthOf(exchange: MarketExchangeId): AdapterHealthSnapshot {
    const adapter = this.adapters.get(exchange);
    if (!adapter) {
      return {
        exchange,
        score: 0,
        state: "down",
        connected: false,
        latencyMs: null,
        lastMessageAt: null,
        lastMessageAgeMs: 99_999_999,
        reconnects: 0,
        resyncs: 0,
        gapCount: 0,
        reasons: ["adapter_missing"],
      };
    }
    return adapter.getHealth();
  }

  private resolvePreferred(preferred?: MarketExchangeId): MarketExchangeId {
    if (preferred && this.adapters.has(preferred)) return preferred;
    const first = this.config.order.find((exchange) => this.adapters.has(exchange));
    if (first) return first;
    const any = this.adapters.keys().next().value as MarketExchangeId | undefined;
    return any ?? "BINANCE";
  }
}
