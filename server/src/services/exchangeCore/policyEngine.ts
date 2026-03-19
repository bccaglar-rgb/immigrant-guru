/**
 * PolicyEngine — Resolves conflicts between AI and manual trade intents.
 *
 * Policies:
 * - MANUAL_PRIORITY: Manual always wins; AI paused on same symbol after manual trade
 * - AI_PRIORITY: AI always wins; manual intents rejected if AI has active position
 * - FIRST_WINS: First source to hold a position keeps it; other source blocked
 * - REJECT_CONFLICT: Both sources rejected if conflicting on same symbol
 *
 * Per-user configurable. Per-symbol overrides supported.
 */
import { pool } from "../../db/pool.ts";
import { redis } from "../../db/redis.ts";
import type { CoreIntentRecord } from "./types.ts";
import { PositionTracker, type TrackedPosition } from "./positionTracker.ts";

export type ConflictPolicy = "MANUAL_PRIORITY" | "AI_PRIORITY" | "FIRST_WINS" | "REJECT_CONFLICT";

export interface PolicyConfig {
  defaultPolicy: ConflictPolicy;
  symbolOverrides: Record<string, ConflictPolicy>;
  aiCooldownAfterManualMs: number;
  manualOverridesAiPosition: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  blockedBy?: string;
  warnings: string[];
}

const DEFAULT_CONFIG: PolicyConfig = {
  defaultPolicy: "MANUAL_PRIORITY",
  symbolOverrides: {},
  aiCooldownAfterManualMs: 300_000, // 5 minutes
  manualOverridesAiPosition: true,
};

const manualTradeKey = (userId: string, symbol: string) =>
  `policy:manual_trade:${userId}:${symbol}`;

export class PolicyEngine {
  private readonly positionTracker: PositionTracker;

  constructor(positionTracker: PositionTracker) {
    this.positionTracker = positionTracker;
  }

  async evaluate(intent: CoreIntentRecord): Promise<PolicyDecision> {
    const warnings: string[] = [];
    const config = await this.getUserPolicy(intent.userId);
    const policy = config.symbolOverrides[intent.symbolInternal] ?? config.defaultPolicy;

    // Manual trades always record their timestamp for cooldown tracking
    if (intent.source === "MANUAL") {
      const key = manualTradeKey(intent.userId, intent.symbolInternal);
      await redis.set(key, String(Date.now()), "PX", config.aiCooldownAfterManualMs);
    }

    // AI cooldown after manual trade
    if (intent.source === "AI") {
      const key = manualTradeKey(intent.userId, intent.symbolInternal);
      const lastManualAt = await redis.get(key);
      if (lastManualAt) {
        const elapsed = Date.now() - Number(lastManualAt);
        if (elapsed < config.aiCooldownAfterManualMs) {
          return {
            allowed: false,
            reason: `AI cooldown active for ${intent.symbolInternal}: manual trade was ${Math.round(elapsed / 1000)}s ago (cooldown ${config.aiCooldownAfterManualMs / 1000}s)`,
            warnings,
          };
        }
      }
    }

    // Check for conflicting intents (same user, same symbol, different source)
    const conflicting = await this.findConflictingIntents(
      intent.userId,
      intent.symbolInternal,
      intent.id,
      intent.source === "MANUAL" ? "AI" : "MANUAL",
    );

    if (conflicting.length === 0) {
      return { allowed: true, reason: "No conflict", warnings };
    }

    // Apply policy
    switch (policy) {
      case "MANUAL_PRIORITY":
        if (intent.source === "MANUAL") {
          return { allowed: true, reason: "Manual priority — manual intent allowed", warnings };
        }
        return {
          allowed: false,
          reason: `Manual priority — AI intent blocked on ${intent.symbolInternal} (${conflicting.length} conflicting manual intents)`,
          blockedBy: conflicting[0]?.id,
          warnings,
        };

      case "AI_PRIORITY":
        if (intent.source === "AI") {
          return { allowed: true, reason: "AI priority — AI intent allowed", warnings };
        }
        if (config.manualOverridesAiPosition) {
          warnings.push("Manual override of AI position — AI strategy may be disrupted");
          return { allowed: true, reason: "Manual override allowed by policy", warnings };
        }
        return {
          allowed: false,
          reason: `AI priority — manual intent blocked on ${intent.symbolInternal}`,
          blockedBy: conflicting[0]?.id,
          warnings,
        };

      case "FIRST_WINS":
        // Check who has the position
        const positions = await this.positionTracker.getAllPositions(intent.userId);
        const existingPos = positions.find((p) => p.symbol === intent.symbolInternal && p.size > 0);
        if (!existingPos) {
          return { allowed: true, reason: "No existing position — first wins", warnings };
        }
        // Check if position was opened by same source
        const positionSource = await this.getPositionSource(intent.userId, intent.symbolInternal);
        if (positionSource === intent.source) {
          return { allowed: true, reason: "Same source — allowed to manage own position", warnings };
        }
        return {
          allowed: false,
          reason: `First-wins policy — ${positionSource ?? "other"} source holds the position`,
          warnings,
        };

      case "REJECT_CONFLICT":
        return {
          allowed: false,
          reason: `Conflict rejected — both AI and manual intents blocked on ${intent.symbolInternal}`,
          blockedBy: conflicting[0]?.id,
          warnings,
        };

      default:
        return { allowed: true, reason: "Unknown policy — defaulting to allow", warnings };
    }
  }

  async getUserPolicy(userId: string): Promise<PolicyConfig> {
    try {
      const { rows } = await pool.query(
        `SELECT default_policy, symbol_overrides, ai_cooldown_after_manual_ms, manual_overrides_ai_position
         FROM user_trade_policies WHERE user_id = $1`,
        [userId],
      );
      if (!rows[0]) return DEFAULT_CONFIG;
      const r = rows[0];
      return {
        defaultPolicy: (String(r.default_policy) as ConflictPolicy) || DEFAULT_CONFIG.defaultPolicy,
        symbolOverrides: (r.symbol_overrides as Record<string, ConflictPolicy>) ?? {},
        aiCooldownAfterManualMs: Number(r.ai_cooldown_after_manual_ms ?? DEFAULT_CONFIG.aiCooldownAfterManualMs),
        manualOverridesAiPosition: r.manual_overrides_ai_position ?? DEFAULT_CONFIG.manualOverridesAiPosition,
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async setUserPolicy(userId: string, config: Partial<PolicyConfig>): Promise<void> {
    const current = await this.getUserPolicy(userId);
    const merged = { ...current, ...config };
    await pool.query(
      `INSERT INTO user_trade_policies
         (user_id, default_policy, symbol_overrides, ai_cooldown_after_manual_ms, manual_overrides_ai_position, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         default_policy = EXCLUDED.default_policy,
         symbol_overrides = EXCLUDED.symbol_overrides,
         ai_cooldown_after_manual_ms = EXCLUDED.ai_cooldown_after_manual_ms,
         manual_overrides_ai_position = EXCLUDED.manual_overrides_ai_position,
         updated_at = NOW()`,
      [userId, merged.defaultPolicy, JSON.stringify(merged.symbolOverrides),
       merged.aiCooldownAfterManualMs, merged.manualOverridesAiPosition],
    );
  }

  private async findConflictingIntents(
    userId: string,
    symbol: string,
    excludeId: string,
    oppositeSource: string,
  ): Promise<Array<{ id: string; source: string }>> {
    try {
      const { rows } = await pool.query(
        `SELECT id, source FROM order_intents
         WHERE user_id = $1 AND symbol_internal = $2 AND id != $3
           AND source = $4 AND state IN ('ACCEPTED', 'QUEUED', 'SENT')
         LIMIT 5`,
        [userId, symbol, excludeId, oppositeSource],
      );
      return rows.map((r) => ({ id: String(r.id), source: String(r.source) }));
    } catch {
      return [];
    }
  }

  private async getPositionSource(userId: string, symbol: string): Promise<string | null> {
    try {
      // Find the most recent completed intent for this symbol
      const { rows } = await pool.query(
        `SELECT source FROM order_intents
         WHERE user_id = $1 AND symbol_internal = $2 AND state = 'DONE'
         ORDER BY updated_at DESC LIMIT 1`,
        [userId, symbol],
      );
      return rows[0]?.source ? String(rows[0].source) : null;
    } catch {
      return null;
    }
  }
}
