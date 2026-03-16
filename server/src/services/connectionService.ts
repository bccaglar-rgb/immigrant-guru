import { pool } from "../db/pool.ts";
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

/* ── Row mappers ──────────────────────────────────────────── */

const rowToConnection = (r: Record<string, unknown>): ConnectionRecord => ({
  id: String(r.id),
  userId: String(r.user_id),
  exchange: String(r.exchange) as ExchangeName,
  accountMode: String(r.account_mode) as "Spot" | "Futures" | "Both",
  apiKeyMasked: String(r.api_key_masked),
  encryptedSecret: r.encrypted_secret as ConnectionRecord["encryptedSecret"],
  encryptedPassphrase: (r.encrypted_passphrase as ConnectionRecord["encryptedPassphrase"]) ?? undefined,
  enabled: Boolean(r.enabled),
  testnet: Boolean(r.testnet),
  createdAt: String(r.created_at),
});

const rowToExchangeConnection = (r: Record<string, unknown>): ExchangeConnectionRecord => ({
  id: String(r.id),
  userId: String(r.user_id),
  exchangeId: String(r.exchange_id),
  exchangeDisplayName: String(r.exchange_display_name),
  accountName: r.account_name ? String(r.account_name) : undefined,
  enabled: Boolean(r.enabled),
  environment: String(r.environment) as "mainnet" | "testnet",
  credentialsEncrypted: r.credentials_encrypted as ExchangeConnectionRecord["credentialsEncrypted"],
  status: String(r.status) as ExchangeConnectionStatus,
  statusReport: r.status_report,
  discoveryCache: (r.discovery_cache ?? { marketTypes: [], symbolsIndex: {}, sampleSymbols: [], preferredSymbols: [], checkedAt: "" }) as ExchangeConnectionRecord["discoveryCache"],
  updatedAt: String(r.updated_at),
  createdAt: String(r.created_at),
});

/* ── Service ──────────────────────────────────────────────── */

export class ConnectionService {
  /* ---------- ConnectionRecord (legacy) ---------- */

  async listByUser(userId: string): Promise<ConnectionRecord[]> {
    const { rows } = await pool.query(
      `SELECT * FROM connection_records WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(rowToConnection);
  }

  async save(record: ConnectionRecord): Promise<void> {
    await pool.query(
      `INSERT INTO connection_records
         (id, user_id, exchange, account_mode, api_key_masked, encrypted_secret, encrypted_passphrase, enabled, testnet, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         exchange = EXCLUDED.exchange,
         account_mode = EXCLUDED.account_mode,
         api_key_masked = EXCLUDED.api_key_masked,
         encrypted_secret = EXCLUDED.encrypted_secret,
         encrypted_passphrase = EXCLUDED.encrypted_passphrase,
         enabled = EXCLUDED.enabled,
         testnet = EXCLUDED.testnet`,
      [
        record.id,
        record.userId,
        record.exchange,
        record.accountMode,
        record.apiKeyMasked,
        JSON.stringify(record.encryptedSecret),
        record.encryptedPassphrase ? JSON.stringify(record.encryptedPassphrase) : null,
        record.enabled,
        record.testnet,
        record.createdAt,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM connection_records WHERE id = $1`, [id]);
  }

  async get(id: string): Promise<ConnectionRecord | undefined> {
    const { rows } = await pool.query(`SELECT * FROM connection_records WHERE id = $1`, [id]);
    return rows[0] ? rowToConnection(rows[0]) : undefined;
  }

  /* ---------- ExchangeConnectionRecord ---------- */

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
    const accountName = input.accountName?.trim() || "Main";
    const now = new Date().toISOString();
    const id = `${input.exchangeId}-${Math.random().toString(36).slice(2, 8)}`;

    await pool.query(
      `INSERT INTO exchange_connection_records
         (id, user_id, exchange_id, exchange_display_name, account_name,
          enabled, environment, credentials_encrypted, status, status_report,
          discovery_cache, updated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (user_id, exchange_id, account_name) DO UPDATE SET
         exchange_display_name = EXCLUDED.exchange_display_name,
         enabled = EXCLUDED.enabled,
         environment = EXCLUDED.environment,
         credentials_encrypted = EXCLUDED.credentials_encrypted,
         status = EXCLUDED.status,
         status_report = EXCLUDED.status_report,
         discovery_cache = EXCLUDED.discovery_cache,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        input.userId,
        input.exchangeId,
        input.exchangeDisplayName,
        accountName,
        input.enabled,
        input.environment,
        JSON.stringify(input.credentialsEncrypted),
        input.status,
        input.statusReport ? JSON.stringify(input.statusReport) : null,
        JSON.stringify(input.discoveryCache),
        now,
        now,
      ],
    );
  }

  async listExchangeConnections(userId: string) {
    const { rows } = await pool.query(
      `SELECT * FROM exchange_connection_records WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(rowToExchangeConnection);
  }

  async getExchangeConnection(userId: string, exchangeId: string, accountName?: string) {
    if (accountName?.trim()) {
      const { rows } = await pool.query(
        `SELECT * FROM exchange_connection_records
         WHERE user_id = $1 AND exchange_id = $2 AND account_name = $3`,
        [userId, exchangeId, accountName.trim()],
      );
      if (rows[0]) return rowToExchangeConnection(rows[0]);
    }
    // Fallback: most recently updated for this user+exchange
    const { rows } = await pool.query(
      `SELECT * FROM exchange_connection_records
       WHERE user_id = $1 AND exchange_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [userId, exchangeId],
    );
    return rows[0] ? rowToExchangeConnection(rows[0]) : undefined;
  }

  async deleteExchangeConnection(userId: string, exchangeId: string, accountName?: string) {
    const name = accountName?.trim() || "Main";
    await pool.query(
      `DELETE FROM exchange_connection_records
       WHERE user_id = $1 AND exchange_id = $2 AND account_name = $3`,
      [userId, exchangeId, name],
    );
  }
}
