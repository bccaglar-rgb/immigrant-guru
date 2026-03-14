import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TraderRecord, TraderRunStatus } from "./types.ts";

interface TraderHubStorageModel {
  traders: TraderRecord[];
  updatedAt: string;
}

const nowIso = () => new Date().toISOString();

const toStatus = (value: unknown): TraderRunStatus => {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "RUNNING") return "RUNNING";
  if (raw === "ERROR") return "ERROR";
  return "STOPPED";
};

const normalizeSymbol = (raw: unknown): string => {
  const text = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!text) return "BTCUSDT";
  return text.endsWith("USDT") ? text : `${text}USDT`;
};

const normalizeRow = (raw: unknown): TraderRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const userId = String(row.userId ?? "demo-user").trim() || "demo-user";
  if (!id) return null;
  const createdAt = String(row.createdAt ?? "");
  const updatedAt = String(row.updatedAt ?? "");
  const nextRunAt = String(row.nextRunAt ?? "");
  const lastRunAt = String(row.lastRunAt ?? "");
  const safeIso = (value: string) => (Number.isFinite(Date.parse(value)) ? value : nowIso());
  return {
    id,
    userId,
    name: String(row.name ?? "Trader").trim() || "Trader",
    aiModule: String(row.aiModule ?? "").toUpperCase() === "QWEN" ? "QWEN" : "CHATGPT",
    exchange:
      String(row.exchange ?? "").toUpperCase() === "BINANCE"
        ? "BINANCE"
        : String(row.exchange ?? "").toUpperCase() === "GATEIO"
          ? "GATEIO"
          : "AUTO",
    exchangeAccountId: String(row.exchangeAccountId ?? "").trim(),
    exchangeAccountName: String(row.exchangeAccountName ?? "Auto").trim() || "Auto",
    strategyId: String(row.strategyId ?? "strategy-default").trim() || "strategy-default",
    strategyName: String(row.strategyName ?? "Default Strategy").trim() || "Default Strategy",
    symbol: normalizeSymbol(row.symbol),
    timeframe:
      String(row.timeframe ?? "15m") === "1m"
        ? "1m"
        : String(row.timeframe ?? "15m") === "5m"
          ? "5m"
          : String(row.timeframe ?? "15m") === "30m"
            ? "30m"
            : String(row.timeframe ?? "15m") === "1h"
              ? "1h"
              : "15m",
    scanIntervalSec: Math.max(30, Math.min(600, Number(row.scanIntervalSec ?? 180) || 180)),
    status: toStatus(row.status),
    createdAt: safeIso(createdAt),
    updatedAt: safeIso(updatedAt),
    nextRunAt: safeIso(nextRunAt),
    lastRunAt: Number.isFinite(Date.parse(lastRunAt)) ? lastRunAt : "",
    lastError: String(row.lastError ?? ""),
    failStreak: Math.max(0, Math.floor(Number(row.failStreak ?? 0) || 0)),
    stats:
      row.stats && typeof row.stats === "object"
        ? {
            runs: Math.max(0, Math.floor(Number((row.stats as Record<string, unknown>).runs ?? 0) || 0)),
            tradeCount: Math.max(0, Math.floor(Number((row.stats as Record<string, unknown>).tradeCount ?? 0) || 0)),
            watchCount: Math.max(0, Math.floor(Number((row.stats as Record<string, unknown>).watchCount ?? 0) || 0)),
            noTradeCount: Math.max(0, Math.floor(Number((row.stats as Record<string, unknown>).noTradeCount ?? 0) || 0)),
            pnlPct: Number((row.stats as Record<string, unknown>).pnlPct ?? 0) || 0,
          }
        : { runs: 0, tradeCount: 0, watchCount: 0, noTradeCount: 0, pnlPct: 0 },
    lastResult:
      row.lastResult && typeof row.lastResult === "object"
        ? (row.lastResult as TraderRecord["lastResult"])
        : null,
  };
};

export class TraderHubStore {
  private loaded = false;
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();
  private state: TraderHubStorageModel = { traders: [], updatedAt: nowIso() };

  constructor(filePath = path.join(process.cwd(), "server", "data", "trader_hub.json")) {
    this.filePath = filePath;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<TraderHubStorageModel>;
      const rows = Array.isArray(parsed.traders) ? parsed.traders.map((row) => normalizeRow(row)).filter(Boolean) : [];
      this.state = {
        traders: rows as TraderRecord[],
        updatedAt: Number.isFinite(Date.parse(String(parsed.updatedAt ?? ""))) ? String(parsed.updatedAt) : nowIso(),
      };
    } catch {
      this.state = { traders: [], updatedAt: nowIso() };
      await this.flush();
    } finally {
      this.loaded = true;
    }
  }

  private async flush() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    this.writeChain = this.writeChain
      .catch(() => {
        // recover chain after write errors
      })
      .then(async () => {
        this.state.updatedAt = nowIso();
        await writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
      });
    await this.writeChain;
  }

  async listAll(): Promise<TraderRecord[]> {
    await this.ensureLoaded();
    return this.state.traders.slice();
  }

  async listByUser(userId: string): Promise<TraderRecord[]> {
    await this.ensureLoaded();
    return this.state.traders.filter((row) => row.userId === userId);
  }

  async upsert(row: TraderRecord): Promise<TraderRecord> {
    await this.ensureLoaded();
    const index = this.state.traders.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      this.state.traders[index] = row;
    } else {
      this.state.traders.unshift(row);
    }
    await this.flush();
    return row;
  }

  async patch(id: string, patch: Partial<TraderRecord>): Promise<TraderRecord | null> {
    await this.ensureLoaded();
    const index = this.state.traders.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const next = { ...this.state.traders[index], ...patch, updatedAt: nowIso() };
    this.state.traders[index] = next;
    await this.flush();
    return next;
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const before = this.state.traders.length;
    this.state.traders = this.state.traders.filter((row) => row.id !== id);
    if (this.state.traders.length === before) return false;
    await this.flush();
    return true;
  }
}
