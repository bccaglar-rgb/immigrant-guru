import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

interface AdminProviderStorageModel {
  providers: AdminProviderRecord[];
  branding?: {
    logoDataUrl?: string;
    emblemDataUrl?: string;
  };
  updated_at: string;
}

const defaultStorage = (): AdminProviderStorageModel => ({
  providers: [],
  branding: {},
  updated_at: new Date().toISOString(),
});

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

export class AdminProviderStore {
  private loaded = false;

  private state: AdminProviderStorageModel = defaultStorage();

  private writeChain: Promise<void> = Promise.resolve();

  private readonly filePath: string;

  constructor(filePath = path.join(process.cwd(), "server", "data", "admin_providers.json")) {
    this.filePath = filePath;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AdminProviderStorageModel>;
      const providers = Array.isArray(parsed.providers)
        ? parsed.providers.map((row) => normalizeProvider(row)).filter((row): row is AdminProviderRecord => Boolean(row))
        : [];
      this.state = {
        providers,
        branding: {
          logoDataUrl: sanitizeDataUrl((parsed as { branding?: { logoDataUrl?: unknown } }).branding?.logoDataUrl, 450_000),
          emblemDataUrl: sanitizeDataUrl((parsed as { branding?: { emblemDataUrl?: unknown } }).branding?.emblemDataUrl, 280_000),
        },
        updated_at: Number.isFinite(Date.parse(String(parsed.updated_at ?? "")))
          ? String(parsed.updated_at)
          : new Date().toISOString(),
      };
    } catch {
      this.state = defaultStorage();
      await this.flush();
    } finally {
      this.loaded = true;
    }
  }

  private async flush() {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    this.writeChain = this.writeChain
      .catch(() => {
        // recover from prior write errors
      })
      .then(async () => {
        const payload = JSON.stringify(this.state, null, 2);
        await writeFile(this.filePath, payload, "utf8");
      });
    await this.writeChain;
  }

  async getAll(): Promise<AdminProviderRecord[]> {
    await this.ensureLoaded();
    return this.state.providers.slice();
  }

  async replaceAll(input: unknown): Promise<AdminProviderRecord[]> {
    await this.ensureLoaded();
    const rows = Array.isArray(input) ? input : [];
    const normalized = rows
      .map((row) => normalizeProvider(row))
      .filter((row): row is AdminProviderRecord => Boolean(row));
    this.state.providers = normalized;
    this.state.updated_at = new Date().toISOString();
    await this.flush();
    return this.state.providers.slice();
  }

  async getBranding(): Promise<{ logoDataUrl?: string; emblemDataUrl?: string }> {
    await this.ensureLoaded();
    return {
      logoDataUrl: this.state.branding?.logoDataUrl,
      emblemDataUrl: this.state.branding?.emblemDataUrl,
    };
  }

  async setBranding(input: unknown): Promise<{ logoDataUrl?: string; emblemDataUrl?: string }> {
    await this.ensureLoaded();
    const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const logoDataUrl = sanitizeDataUrl(obj.logoDataUrl, 450_000);
    const emblemDataUrl = sanitizeDataUrl(obj.emblemDataUrl, 280_000);
    this.state.branding = { logoDataUrl, emblemDataUrl };
    this.state.updated_at = new Date().toISOString();
    await this.flush();
    return { ...this.state.branding };
  }

  async getFallbackPolicy(): Promise<{ defaultExchange: ExchangeName | null; order: ExchangeName[] }> {
    await this.ensureLoaded();
    const candidates = this.state.providers
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
    return {
      defaultExchange,
      order,
    };
  }
}
