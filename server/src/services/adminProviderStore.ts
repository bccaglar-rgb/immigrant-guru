import { pool } from "../db/pool.ts";
import type { ExchangeName } from "./types.ts";

type ProviderType = "REST" | "WS" | "BOTH";
type ProviderGroup = "OUTSOURCE" | "EXCHANGE";

export interface AdminProviderRecord {
  id: string;
  name: string;
  presetKey?: string;
  providerGroup?: ProviderGroup;
  exchangeName?: string;
  type: ProviderType;
  baseUrl: string;
  wsUrl?: string;
  discoveryEndpoint?: string;
  fallbackPriority?: number;
  defaultPrimary?: boolean;
  extraPaths?: string[];
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  enabled: boolean;
  notes?: string;
  lastTestStatus?: "OK" | "FAIL" | "UNKNOWN";
  lastTestAt?: string;
}

/* ── Normalization helpers (unchanged from original) ────── */

const sanitizeDataUrl = (value: unknown, maxLen: number): string | undefined => {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (!text.startsWith("data:image/")) return undefined;
  if (text.length > maxLen) return undefined;
  return text;
};

const asExchangeName = (raw?: string | null): ExchangeName | null => {
  const value = String(raw ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("binance")) return "Binance";
  if (value.includes("bybit")) return "Bybit";
  if (value.includes("okx")) return "OKX";
  if (value.includes("gate")) return "Gate.io";
  return null;
};

const normalizeProvider = (raw: unknown): AdminProviderRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  const baseUrl = String(row.baseUrl ?? "").trim();
  const typeRaw = String(row.type ?? "REST").toUpperCase();
  const type: ProviderType = typeRaw === "WS" || typeRaw === "BOTH" ? typeRaw : "REST";
  if (!id || !name || !baseUrl) return null;
  const providerGroupRaw = String(row.providerGroup ?? "").toUpperCase();
  const providerGroup: ProviderGroup | undefined =
    providerGroupRaw === "EXCHANGE" || providerGroupRaw === "OUTSOURCE"
      ? (providerGroupRaw as ProviderGroup)
      : undefined;
  const fallbackPriority = Number(row.fallbackPriority);
  const lastTestStatusRaw = String(row.lastTestStatus ?? "").toUpperCase();
  const lastTestStatus =
    lastTestStatusRaw === "OK" || lastTestStatusRaw === "FAIL" || lastTestStatusRaw === "UNKNOWN"
      ? (lastTestStatusRaw as "OK" | "FAIL" | "UNKNOWN")
      : undefined;
  const extraPaths = Array.isArray(row.extraPaths)
    ? row.extraPaths.map((item) => String(item ?? "").trim()).filter(Boolean)
    : undefined;

  return {
    id,
    name,
    presetKey: String(row.presetKey ?? "").trim() || undefined,
    providerGroup,
    exchangeName: String(row.exchangeName ?? "").trim() || undefined,
    type,
    baseUrl,
    wsUrl: String(row.wsUrl ?? "").trim() || undefined,
    discoveryEndpoint: String(row.discoveryEndpoint ?? "").trim() || undefined,
    fallbackPriority: Number.isFinite(fallbackPriority) ? Math.max(0, Math.floor(fallbackPriority)) : undefined,
    defaultPrimary: row.defaultPrimary === true,
    extraPaths,
    apiKey: String(row.apiKey ?? "").trim() || undefined,
    apiSecret: String(row.apiSecret ?? "").trim() || undefined,
    passphrase: String(row.passphrase ?? "").trim() || undefined,
    enabled: row.enabled !== false,
    notes: String(row.notes ?? "").trim() || undefined,
    lastTestStatus,
    lastTestAt: String(row.lastTestAt ?? "").trim() || undefined,
  };
};

/* ── Row mapper ───────────────────────────────────────────── */

const rowToProvider = (r: Record<string, unknown>): AdminProviderRecord | null => {
  const config = r.config as Record<string, unknown> | null;
  if (!config) return null;
  // Merge id + enabled from columns, rest from config JSONB
  return normalizeProvider({ ...config, id: String(r.id), enabled: Boolean(r.enabled) });
};

/* ── Store ────────────────────────────────────────────────── */

export class AdminProviderStore {
  async getAll(): Promise<AdminProviderRecord[]> {
    const { rows } = await pool.query(`SELECT * FROM admin_providers ORDER BY id`);
    return rows.map(rowToProvider).filter((r): r is AdminProviderRecord => Boolean(r));
  }

  async replaceAll(input: unknown): Promise<AdminProviderRecord[]> {
    const items = Array.isArray(input) ? input : [];
    const normalized = items
      .map((row) => normalizeProvider(row))
      .filter((row): row is AdminProviderRecord => Boolean(row));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM admin_providers");
      for (const p of normalized) {
        // Store entire record as config JSONB, id and enabled as columns
        const { id, enabled, ...rest } = p;
        await client.query(
          `INSERT INTO admin_providers (id, config, enabled, updated_at)
           VALUES ($1, $2, $3, now())`,
          [id, JSON.stringify({ ...rest, id, enabled }), enabled],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return normalized;
  }

  async getBranding(): Promise<{ logoDataUrl?: string; emblemDataUrl?: string }> {
    const { rows } = await pool.query(`SELECT * FROM admin_branding WHERE id = 1`);
    if (!rows[0]) return {};
    return {
      logoDataUrl: rows[0].logo_data_url ? String(rows[0].logo_data_url) : undefined,
      emblemDataUrl: rows[0].emblem_data_url ? String(rows[0].emblem_data_url) : undefined,
    };
  }

  async setBranding(input: unknown): Promise<{ logoDataUrl?: string; emblemDataUrl?: string }> {
    const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const logoDataUrl = sanitizeDataUrl(obj.logoDataUrl, 450_000);
    const emblemDataUrl = sanitizeDataUrl(obj.emblemDataUrl, 280_000);

    await pool.query(
      `INSERT INTO admin_branding (id, logo_data_url, emblem_data_url, updated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET
         logo_data_url = EXCLUDED.logo_data_url,
         emblem_data_url = EXCLUDED.emblem_data_url,
         updated_at = now()`,
      [logoDataUrl ?? null, emblemDataUrl ?? null],
    );
    return { logoDataUrl, emblemDataUrl };
  }

  async getFallbackPolicy(): Promise<{ defaultExchange: ExchangeName | null; order: ExchangeName[] }> {
    const providers = await this.getAll();
    const candidates = providers
      .filter((row) => row.enabled)
      .filter((row) => row.providerGroup === "EXCHANGE")
      .map((row) => ({
        row,
        exchange: asExchangeName(row.exchangeName ?? row.name ?? row.id),
      }))
      .filter((item): item is { row: AdminProviderRecord; exchange: ExchangeName } => Boolean(item.exchange));

    const sorted = candidates
      .slice()
      .sort((a, b) => {
        const ap = Number.isFinite(Number(a.row.fallbackPriority)) ? Number(a.row.fallbackPriority) : Number.MAX_SAFE_INTEGER;
        const bp = Number.isFinite(Number(b.row.fallbackPriority)) ? Number(b.row.fallbackPriority) : Number.MAX_SAFE_INTEGER;
        if (ap !== bp) return ap - bp;
        return a.row.name.localeCompare(b.row.name);
      });

    const order = [...new Set(sorted.map((item) => item.exchange))];
    const defaultCandidate = candidates.find((item) => item.row.defaultPrimary)?.exchange ?? null;
    const defaultExchange = order[0] ?? defaultCandidate ?? null;
    return { defaultExchange, order };
  }
}
