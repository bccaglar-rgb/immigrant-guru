import { pool } from "../db/pool.ts";

export type AiProviderId = "CHATGPT" | "QWEN" | "QWEN2" | "CLAUDE";

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

const defaultProviders = (): AiProviderRecord[] => [
  {
    id: "CHATGPT",
    enabled: true,
    baseUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: "gpt-4o-mini",
    intervalSec: 180,
    timeoutMs: 15000,
    temperature: 0.2,
    maxTokens: 1200,
  },
  {
    id: "QWEN",
    enabled: true,
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: process.env.QWEN_API_KEY ?? "",
    model: "qwen/qwen-2.5-72b-instruct",
    intervalSec: 180,
    timeoutMs: 15000,
    temperature: 0.1,
    maxTokens: 1200,
  },
  {
    id: "QWEN2",
    enabled: true,
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: process.env.QWEN_API_KEY_2 ?? "",
    model: "qwen/qwen-2.5-72b-instruct",
    intervalSec: 180,
    timeoutMs: 15000,
    temperature: 0.1,
    maxTokens: 1200,
  },
  {
    id: "CLAUDE",
    enabled: true,
    baseUrl: "https://api.anthropic.com/v1/messages",
    apiKey: process.env.CLAUDE_API_KEY ?? "",
    model: "claude-sonnet-4-6",
    intervalSec: 180,
    timeoutMs: 30000,
    temperature: 0.1,
    maxTokens: 2000,
  },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const normalizeProvider = (raw: unknown): AiProviderRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const idRaw = String(row.id ?? "").toUpperCase();
  if (idRaw !== "CHATGPT" && idRaw !== "QWEN" && idRaw !== "QWEN2" && idRaw !== "CLAUDE") return null;
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

/* ── Row mapper ───────────────────────────────────────────── */

const rowToAiProvider = (r: Record<string, unknown>): AiProviderRecord | null => {
  const config = r.config as Record<string, unknown> | null;
  if (!config) return null;
  return normalizeProvider({ ...config, id: String(r.id) });
};

/* ── Store ────────────────────────────────────────────────── */

export class AiProviderStore {
  async getAll(): Promise<AiProviderRecord[]> {
    const { rows } = await pool.query(`SELECT * FROM ai_providers ORDER BY id`);
    const fromDb = rows.map(rowToAiProvider).filter((r): r is AiProviderRecord => Boolean(r));
    // Merge defaults: if a provider is missing from DB, use the default
    return defaultProviders().map((def) => fromDb.find((n) => n.id === def.id) ?? def);
  }

  /** Ensure all providers exist in DB (visible in admin panel) and auto-enable if they have API keys */
  async ensureChatGptEnabled(): Promise<void> {
    try {
      // 1. Ensure both providers have DB rows so they're visible/editable in admin panel
      const defaults = defaultProviders();
      for (const def of defaults) {
        await pool.query(
          `INSERT INTO ai_providers (id, config, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (id) DO NOTHING`,
          [def.id, JSON.stringify(def)],
        );
      }

      // 2. Sync env API keys to DB when DB rows are missing their keys
      const envKeys: Record<string, string> = {
        CHATGPT: (process.env.OPENAI_API_KEY ?? "").trim(),
        QWEN: (process.env.QWEN_API_KEY ?? "").trim(),
        QWEN2: (process.env.QWEN_API_KEY_2 ?? "").trim(),
        CLAUDE: (process.env.CLAUDE_API_KEY ?? "").trim(),
      };
      for (const [providerId, envKey] of Object.entries(envKeys)) {
        if (envKey) {
          await pool.query(
            `UPDATE ai_providers
             SET config = jsonb_set(
               jsonb_set(config, '{apiKey}', $1::jsonb),
               '{enabled}', 'true'
             ),
             updated_at = now()
             WHERE id = $2
               AND (config->>'apiKey' IS NULL OR config->>'apiKey' = '')`,
            [JSON.stringify(envKey), providerId],
          );
        }
      }

      // 3. Auto-enable providers that have an API key in DB but are currently disabled
      const providers = await this.getAll();
      for (const p of providers) {
        if (p.apiKey && !p.enabled) {
          await pool.query(
            `UPDATE ai_providers SET config = jsonb_set(config, '{enabled}', 'true'), updated_at = now() WHERE id = $1`,
            [p.id],
          );
        }
      }
    } catch {
      // Non-critical — scan loop will retry with DB values
    }
  }

  async replaceAll(input: unknown): Promise<AiProviderRecord[]> {
    const items = Array.isArray(input) ? input : [];
    const normalized = items
      .map((row) => normalizeProvider(row))
      .filter((row): row is AiProviderRecord => Boolean(row));
    // Merge with defaults so CHATGPT, QWEN, QWEN2 always exist
    const merged = defaultProviders().map((def) => normalized.find((n) => n.id === def.id) ?? def);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of merged) {
        await client.query(
          `INSERT INTO ai_providers (id, config, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (id) DO UPDATE SET
             config = EXCLUDED.config,
             updated_at = now()`,
          [p.id, JSON.stringify(p)],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return merged;
  }
}
