import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExchangeName } from "./types";

export interface ConnectionRecord {
  id: string;
  userId: string;
  exchange: ExchangeName;
  accountMode: "Spot" | "Futures" | "Both";
  apiKeyMasked: string;
  encryptedSecret: { iv: string; tag: string; payload: string };
  encryptedPassphrase?: { iv: string; tag: string; payload: string };
  enabled: boolean;
  testnet: boolean;
  createdAt: string;
}

type ExchangeConnectionStatus = "READY" | "PARTIAL" | "FAILED";

export interface ExchangeConnectionRecord {
  id: string;
  userId: string;
  exchangeId: string;
  exchangeDisplayName: string;
  accountName?: string;
  enabled: boolean;
  environment: "mainnet" | "testnet";
  credentialsEncrypted: {
    apiKey: { iv: string; tag: string; payload: string };
    apiSecret: { iv: string; tag: string; payload: string };
    passphrase?: { iv: string; tag: string; payload: string };
  };
  status: ExchangeConnectionStatus;
  statusReport: unknown;
  discoveryCache: {
    marketTypes: string[];
    symbolsIndex: Record<string, unknown>;
    sampleSymbols: string[];
    preferredSymbols: string[];
    checkedAt: string;
  };
  updatedAt: string;
  createdAt: string;
}

interface ConnectionStorageModel {
  rows: ConnectionRecord[];
  exchangeRows: ExchangeConnectionRecord[];
}

const defaultStorage = (): ConnectionStorageModel => ({
  rows: [],
  exchangeRows: [],
});

const normalizeAccountKey = (accountName?: string) =>
  (accountName?.trim().toLowerCase() || "__main__").replace(/[^a-z0-9_-]+/g, "_");

export class ConnectionService {
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly rows = new Map<string, ConnectionRecord>();
  private readonly exchangeRows = new Map<string, ExchangeConnectionRecord>();
  private readonly filePath: string;

  constructor(filePath = path.join(process.cwd(), "server", "data", "exchange_connections.json")) {
    this.filePath = filePath;
  }

  private mapExchangeKey(userId: string, exchangeId: string, accountName?: string) {
    return `${userId}:${exchangeId}:${normalizeAccountKey(accountName)}`;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as ConnectionStorageModel;
      if (Array.isArray(parsed?.rows)) {
        parsed.rows.forEach((row) => {
          if (!row || typeof row !== "object") return;
          if (!row.id || !row.userId) return;
          this.rows.set(row.id, row);
        });
      }
      if (Array.isArray(parsed?.exchangeRows)) {
        parsed.exchangeRows.forEach((row) => {
          if (!row || typeof row !== "object") return;
          if (!row.userId || !row.exchangeId) return;
          const key = this.mapExchangeKey(row.userId, row.exchangeId, row.accountName);
          this.exchangeRows.set(key, row);
        });
      }
    } catch {
      await this.flush();
    } finally {
      this.loaded = true;
    }
  }

  private async flush() {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const payload = JSON.stringify(
      {
        rows: [...this.rows.values()],
        exchangeRows: [...this.exchangeRows.values()],
      } satisfies ConnectionStorageModel,
      null,
      2,
    );
    this.writeChain = this.writeChain
      .catch(() => {
        // Recover write chain after transient fs errors.
      })
      .then(async () => {
        await writeFile(this.filePath, payload, "utf8");
      });
    await this.writeChain;
  }

  async listByUser(userId: string): Promise<ConnectionRecord[]> {
    await this.ensureLoaded();
    return [...this.rows.values()].filter((v) => v.userId === userId);
  }

  async save(record: ConnectionRecord): Promise<void> {
    await this.ensureLoaded();
    this.rows.set(record.id, record);
    await this.flush();
  }

  async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    this.rows.delete(id);
    await this.flush();
  }

  async get(id: string): Promise<ConnectionRecord | undefined> {
    await this.ensureLoaded();
    return this.rows.get(id);
  }

  async upsertExchangeConnection(input: {
    userId: string;
    exchangeId: string;
    exchangeDisplayName: string;
    accountName?: string;
    enabled: boolean;
    environment: "mainnet" | "testnet";
    credentialsEncrypted: {
      apiKey: { iv: string; tag: string; payload: string };
      apiSecret: { iv: string; tag: string; payload: string };
      passphrase?: { iv: string; tag: string; payload: string };
    };
    status: ExchangeConnectionStatus;
    statusReport: unknown;
    discoveryCache: {
      marketTypes: string[];
      symbolsIndex: Record<string, unknown>;
      sampleSymbols: string[];
      preferredSymbols: string[];
      checkedAt: string;
    };
  }): Promise<void> {
    await this.ensureLoaded();
    const key = this.mapExchangeKey(input.userId, input.exchangeId, input.accountName);
    const prev = this.exchangeRows.get(key);
    const now = new Date().toISOString();
    this.exchangeRows.set(key, {
      id: prev?.id ?? `${input.exchangeId}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      exchangeId: input.exchangeId,
      exchangeDisplayName: input.exchangeDisplayName,
      accountName: input.accountName?.trim() || "Main",
      enabled: input.enabled,
      environment: input.environment,
      credentialsEncrypted: input.credentialsEncrypted,
      status: input.status,
      statusReport: input.statusReport,
      discoveryCache: input.discoveryCache,
      updatedAt: now,
      createdAt: prev?.createdAt ?? now,
    });
    await this.flush();
  }

  async listExchangeConnections(userId: string) {
    await this.ensureLoaded();
    return [...this.exchangeRows.values()].filter((v) => v.userId === userId);
  }

  async getExchangeConnection(userId: string, exchangeId: string, accountName?: string) {
    await this.ensureLoaded();
    if (accountName?.trim()) {
      const exact = this.exchangeRows.get(this.mapExchangeKey(userId, exchangeId, accountName));
      if (exact) return exact;
    }
    const candidates = [...this.exchangeRows.values()]
      .filter((row) => row.userId === userId && row.exchangeId === exchangeId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return candidates[0];
  }

  async deleteExchangeConnection(userId: string, exchangeId: string, accountName?: string) {
    await this.ensureLoaded();
    this.exchangeRows.delete(this.mapExchangeKey(userId, exchangeId, accountName));
    await this.flush();
  }
}
