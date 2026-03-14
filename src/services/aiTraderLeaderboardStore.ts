export interface LeaderboardTrader {
  id: string;
  strategyId: string;
  name: string;
  model: string;
  venue: string;
  equity: number;
  pnlPct: number;
  pnlAbs: number;
  openPositions: number;
  live: boolean;
  approvedAt: string;
}

const STORAGE_KEY = "bitrium_ai_trader_leaderboard_v1";
const LEGACY_STORAGE_KEY = "bitrium_ai_trader_leaderboard_v1";

const safeRound = (value: number, digits = 2) => Number(value.toFixed(digits));

const readRaw = (): LeaderboardTrader[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LeaderboardTrader => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<LeaderboardTrader>;
      return typeof row.id === "string" && typeof row.strategyId === "string" && typeof row.name === "string";
    });
  } catch {
    return [];
  }
};

const writeRaw = (rows: LeaderboardTrader[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // no-op
  }
};

export const loadLeaderboardTraders = () =>
  readRaw().sort((a, b) => {
    if (b.pnlPct !== a.pnlPct) return b.pnlPct - a.pnlPct;
    return b.pnlAbs - a.pnlAbs;
  });

export const publishStrategyTrader = (input: {
  strategyId: string;
  strategyName: string;
  model?: string;
  venue?: string;
}) => {
  const rows = readRaw();
  const now = new Date().toISOString();
  const index = rows.findIndex((row) => row.strategyId === input.strategyId);
  if (index >= 0) {
    rows[index] = {
      ...rows[index],
      name: input.strategyName,
      model: input.model ?? rows[index].model,
      venue: input.venue ?? rows[index].venue,
      live: true,
      approvedAt: now,
    };
    writeRaw(rows);
    return rows[index];
  }

  const next: LeaderboardTrader = {
    id: `trader-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    strategyId: input.strategyId,
    name: input.strategyName,
    model: input.model ?? "QWEN",
    venue: input.venue ?? "BINANCE",
    equity: 1000,
    pnlPct: 0,
    pnlAbs: 0,
    openPositions: 0,
    live: true,
    approvedAt: now,
  };
  rows.push(next);
  writeRaw(rows);
  return next;
};

export const tickLeaderboardPnl = () => {
  const rows = readRaw();
  if (!rows.length) return rows;

  const updated = rows.map((row) => {
    if (!row.live) return row;
    const driftPct = (Math.random() - 0.45) * 0.7;
    const nextPct = safeRound(row.pnlPct + driftPct, 2);
    const nextAbs = safeRound((row.equity * nextPct) / 100, 2);
    const openPositions = Math.max(0, Math.min(3, row.openPositions + (Math.random() > 0.75 ? 1 : Math.random() < 0.2 ? -1 : 0)));
    return {
      ...row,
      pnlPct: nextPct,
      pnlAbs: nextAbs,
      openPositions,
    };
  });

  writeRaw(updated);
  return updated;
};
