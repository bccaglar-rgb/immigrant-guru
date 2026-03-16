import { pool } from "../db/pool.ts";
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

/* ── Row mapper ───────────────────────────────────────────── */

const rowToSettings = (r: Record<string, unknown>): UserSettingsRecord => ({
  user_id: String(r.user_id),
  scoring_mode: normalizeScoringMode(r.scoring_mode),
  flow_mode: normalizeFlowModeSettings(r.flow_mode),
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

/* ── Store ────────────────────────────────────────────────── */

export class UserSettingsStore {
  async get(userId: string): Promise<UserSettingsRecord> {
    const normalized = userId.trim() || "demo-user";
    const { rows } = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [normalized],
    );
    if (rows[0]) return rowToSettings(rows[0]);

    // Auto-create default settings
    const nowIso = new Date().toISOString();
    await pool.query(
      `INSERT INTO user_settings (user_id, scoring_mode, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO NOTHING`,
      [normalized, DEFAULT_SCORING_MODE, nowIso, nowIso],
    );
    // Re-read (ON CONFLICT DO NOTHING means we return whatever exists)
    const { rows: rows2 } = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [normalized],
    );
    if (rows2[0]) return rowToSettings(rows2[0]);

    // Shouldn't happen, but satisfy TS
    return {
      user_id: normalized,
      scoring_mode: DEFAULT_SCORING_MODE,
      created_at: nowIso,
      updated_at: nowIso,
    };
  }

  async update(userId: string, patch: Partial<Pick<UserSettingsRecord, "scoring_mode" | "flow_mode">>): Promise<UserSettingsRecord> {
    const normalized = userId.trim() || "demo-user";
    // Ensure row exists first
    const current = await this.get(normalized);
    const nextMode = patch.scoring_mode ? normalizeScoringMode(patch.scoring_mode) : current.scoring_mode;
    const nextFlow = patch.flow_mode ? normalizeFlowModeSettings(patch.flow_mode) : current.flow_mode;
    const nowIso = new Date().toISOString();

    await pool.query(
      `UPDATE user_settings
       SET scoring_mode = $1, flow_mode = $2, updated_at = $3
       WHERE user_id = $4`,
      [nextMode, nextFlow ? JSON.stringify(nextFlow) : null, nowIso, normalized],
    );

    return {
      user_id: normalized,
      scoring_mode: nextMode,
      flow_mode: nextFlow,
      created_at: current.created_at,
      updated_at: nowIso,
    };
  }
}
