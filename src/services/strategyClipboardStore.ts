export interface PendingStrategyCopy {
  name: string;
  traderName: string;
  model: string;
  venue: string;
  style?: "SCALPING" | "INTRADAY" | "SWING" | "POSITION";
}

const KEY = "bitrium_pending_strategy_copy_v1";
const LEGACY_KEY = "bitrium_pending_strategy_copy_v1";

export const setPendingStrategyCopy = (payload: PendingStrategyCopy) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(payload));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // no-op
  }
};

export const consumePendingStrategyCopy = (): PendingStrategyCopy | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(LEGACY_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingStrategyCopy>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.name !== "string" || typeof parsed.traderName !== "string") return null;
    return {
      name: parsed.name,
      traderName: parsed.traderName,
      model: typeof parsed.model === "string" ? parsed.model : "QWEN",
      venue: typeof parsed.venue === "string" ? parsed.venue : "BINANCE",
      style: parsed.style,
    };
  } catch {
    return null;
  }
};
