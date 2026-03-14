import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeScoringMode, type ScoringMode } from "./scoringMode.ts";

export interface UserSettingsRecord {
  user_id: string;
  scoring_mode: ScoringMode;
  flow_mode?: UserFlowModeSettings;
  created_at: string;
  updated_at: string;
}

export interface UserFlowModeSettings {
  minConsensus: number;
  minValidBars: number;
  requireValidTrade: boolean;
  dataFilters: Record<string, boolean>;
  signalInputs: Record<string, boolean>;
  signalInputWeights: Record<string, number>;
  riskChecks: Record<string, boolean>;
}

interface UserSettingsStorageModel {
  users: UserSettingsRecord[];
}

const DEFAULT_SCORING_MODE: ScoringMode = "FLOW";

const normalizeBooleanMap = (raw: unknown): Record<string, boolean> => {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "boolean") next[key] = value;
  }
  return next;
};

const normalizeNumberMap = (raw: unknown): Record<string, number> => {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) next[key] = Math.max(1, Math.min(100, Math.round(numeric)));
  }
  return next;
};

const normalizeFlowModeSettings = (raw: unknown): UserFlowModeSettings | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as Partial<UserFlowModeSettings>;
  const minConsensus = Number(item.minConsensus);
  const minValidBars = Number(item.minValidBars);
  return {
    minConsensus: Number.isFinite(minConsensus) ? Math.max(20, Math.min(95, minConsensus)) : 70,
    minValidBars: Number.isFinite(minValidBars) ? Math.max(1, Math.min(12, Math.round(minValidBars))) : 4,
    requireValidTrade: typeof item.requireValidTrade === "boolean" ? item.requireValidTrade : true,
    dataFilters: normalizeBooleanMap(item.dataFilters),
    signalInputs: normalizeBooleanMap(item.signalInputs),
    signalInputWeights: normalizeNumberMap(item.signalInputWeights),
    riskChecks: normalizeBooleanMap(item.riskChecks),
  };
};

const defaultStorage = (): UserSettingsStorageModel => ({
  users: [],
});

export class UserSettingsStore {
  private loaded = false;

  private state: UserSettingsStorageModel = defaultStorage();

  private writeChain: Promise<void> = Promise.resolve();

  private readonly filePath: string;

  constructor(filePath = path.join(process.cwd(), "server", "data", "user_settings.json")) {
    this.filePath = filePath;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as UserSettingsStorageModel;
      this.state = {
        users: Array.isArray(parsed?.users)
          ? parsed.users
            .map((row) => {
              if (!row || typeof row !== "object") return null;
              const userId = String((row as { user_id?: unknown }).user_id ?? "").trim();
              if (!userId) return null;
              const createdAtRaw = String((row as { created_at?: unknown }).created_at ?? "");
              const updatedAtRaw = String((row as { updated_at?: unknown }).updated_at ?? "");
              const nowIso = new Date().toISOString();
              return {
                user_id: userId,
                scoring_mode: normalizeScoringMode((row as { scoring_mode?: unknown }).scoring_mode),
                flow_mode: normalizeFlowModeSettings((row as { flow_mode?: unknown }).flow_mode),
                created_at: Number.isFinite(Date.parse(createdAtRaw)) ? createdAtRaw : nowIso,
                updated_at: Number.isFinite(Date.parse(updatedAtRaw)) ? updatedAtRaw : nowIso,
              };
            })
            .filter((row): row is UserSettingsRecord => Boolean(row))
          : [],
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
    const payload = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await writeFile(this.filePath, payload, "utf8");
    });
    await this.writeChain;
  }

  async get(userId: string): Promise<UserSettingsRecord> {
    await this.ensureLoaded();
    const normalized = userId.trim() || "demo-user";
    const existing = this.state.users.find((row) => row.user_id === normalized);
    if (existing) return existing;

    const nowIso = new Date().toISOString();
    const created: UserSettingsRecord = {
      user_id: normalized,
      scoring_mode: DEFAULT_SCORING_MODE,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.state.users.push(created);
    await this.flush();
    return created;
  }

  async update(userId: string, patch: Partial<Pick<UserSettingsRecord, "scoring_mode" | "flow_mode">>): Promise<UserSettingsRecord> {
    await this.ensureLoaded();
    const normalized = userId.trim() || "demo-user";
    const current = await this.get(normalized);
    const next: UserSettingsRecord = {
      ...current,
      scoring_mode: patch.scoring_mode ? normalizeScoringMode(patch.scoring_mode) : current.scoring_mode,
      flow_mode: patch.flow_mode ? normalizeFlowModeSettings(patch.flow_mode) : current.flow_mode,
      updated_at: new Date().toISOString(),
    };
    const idx = this.state.users.findIndex((row) => row.user_id === normalized);
    if (idx >= 0) this.state.users[idx] = next;
    else this.state.users.push(next);
    await this.flush();
    return next;
  }
}
