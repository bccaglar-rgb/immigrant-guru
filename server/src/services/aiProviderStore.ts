import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AiProviderId = "CHATGPT" | "QWEN";

export interface AiProviderRecord {
  id: AiProviderId;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  intervalSec: number;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
}

interface AiProviderStorageModel {
  providers: AiProviderRecord[];
  updatedAt: string;
}

const defaultProviders = (): AiProviderRecord[] => [
  {
    id: "CHATGPT",
    enabled: false,
    baseUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    model: "gpt-4o-mini",
    intervalSec: 180,
    timeoutMs: 15000,
    temperature: 0.2,
    maxTokens: 1200,
  },
  {
    id: "QWEN",
    enabled: false,
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKey: "",
    model: "qwen-plus",
    intervalSec: 180,
    timeoutMs: 15000,
    temperature: 0.2,
    maxTokens: 1200,
  },
];

const defaultStorage = (): AiProviderStorageModel => ({
  providers: defaultProviders(),
  updatedAt: new Date().toISOString(),
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const normalizeProvider = (raw: unknown): AiProviderRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const idRaw = String(row.id ?? "").toUpperCase();
  if (idRaw !== "CHATGPT" && idRaw !== "QWEN") return null;
  const id = idRaw as AiProviderId;
  const intervalSec = clamp(Number(row.intervalSec ?? 180) || 180, 60, 900);
  const timeoutMs = clamp(Number(row.timeoutMs ?? 15000) || 15000, 5000, 60000);
  const temperature = clamp(Number(row.temperature ?? 0.2) || 0.2, 0, 1);
  const maxTokens = clamp(Math.round(Number(row.maxTokens ?? 1200) || 1200), 256, 4096);
  const baseDefaults = defaultProviders().find((p) => p.id === id)!;
  return {
    id,
    enabled: row.enabled === true,
    baseUrl: String(row.baseUrl ?? baseDefaults.baseUrl).trim() || baseDefaults.baseUrl,
    apiKey: String(row.apiKey ?? "").trim(),
    model: String(row.model ?? baseDefaults.model).trim() || baseDefaults.model,
    intervalSec,
    timeoutMs,
    temperature,
    maxTokens,
  };
};

export class AiProviderStore {
  private loaded = false;
  private state: AiProviderStorageModel = defaultStorage();
  private writeChain: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor(filePath = path.join(process.cwd(), "server", "data", "ai_providers.json")) {
    this.filePath = filePath;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AiProviderStorageModel>;
      const incoming = Array.isArray(parsed.providers) ? parsed.providers : [];
      const normalized = incoming
        .map((row) => normalizeProvider(row))
        .filter((row): row is AiProviderRecord => Boolean(row));
      const merged = defaultProviders().map((def) => normalized.find((n) => n.id === def.id) ?? def);
      this.state = {
        providers: merged,
        updatedAt: Number.isFinite(Date.parse(String(parsed.updatedAt ?? "")))
          ? String(parsed.updatedAt)
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
        // recover chain
      })
      .then(async () => {
        await writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
      });
    await this.writeChain;
  }

  async getAll(): Promise<AiProviderRecord[]> {
    await this.ensureLoaded();
    return this.state.providers.slice();
  }

  async replaceAll(input: unknown): Promise<AiProviderRecord[]> {
    await this.ensureLoaded();
    const rows = Array.isArray(input) ? input : [];
    const normalized = rows
      .map((row) => normalizeProvider(row))
      .filter((row): row is AiProviderRecord => Boolean(row));
    const merged = defaultProviders().map((def) => normalized.find((n) => n.id === def.id) ?? def);
    this.state.providers = merged;
    this.state.updatedAt = new Date().toISOString();
    await this.flush();
    return this.state.providers.slice();
  }
}

