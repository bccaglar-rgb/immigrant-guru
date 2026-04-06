/**
 * Tier enforcement utilities.
 *
 * Queries the user's active subscription tier from DB and enforces
 * plan-based limits on exchanges, trading, and bot creation.
 *
 * Tier hierarchy:
 *   - explorer: free tier — no trading, no exchange connections
 *   - trader:   1 exchange account max, trading allowed
 *   - titan:    unlimited exchange accounts, full access
 *
 * ADMIN role bypasses all tier checks.
 */

import type { Request, Response, NextFunction } from "express";

export type PlanTier = "explorer" | "trader" | "titan" | null;

/** Exchange account limits per tier */
const EXCHANGE_LIMITS: Record<string, number> = {
  explorer: 0,
  trader: 1,
  titan: Infinity,
};

/**
 * Resolve the active plan tier for a user.
 * ADMIN always returns "titan".
 */
export async function getUserTier(userId: string, userRole?: string): Promise<PlanTier> {
  if (userRole === "ADMIN") return "titan";

  try {
    const { pool } = await import("../db/pool.ts");

    // Check paid subscriptions
    const { rows } = await pool.query(
      `SELECT plan_id FROM subscriptions
       WHERE user_id = $1
         AND LOWER(status) = 'active'
         AND (end_at IS NULL OR end_at > NOW())
       ORDER BY end_at DESC LIMIT 1`,
      [userId],
    );
    if (rows.length > 0) {
      return (String(rows[0].plan_id ?? "").split("-")[0] || "explorer") as PlanTier;
    }

    // Check referral redemptions
    const { rows: refRows } = await pool.query(
      `SELECT plan_id FROM referral_redemptions
       WHERE user_id = $1
         AND status = 'ACTIVE'
         AND end_at > NOW()
       ORDER BY end_at DESC LIMIT 1`,
      [userId],
    );
    if (refRows.length > 0) {
      return (String(refRows[0].plan_id ?? "").split("-")[0] || "explorer") as PlanTier;
    }

    return null; // no active plan
  } catch {
    return null; // fail-closed: no plan access if DB fails
  }
}

/**
 * Get the max number of exchange accounts allowed for a tier.
 */
export function getExchangeLimit(tier: PlanTier): number {
  if (!tier) return 0;
  return EXCHANGE_LIMITS[tier] ?? 0;
}

/**
 * Middleware: require at least "trader" tier before placing trades.
 * Must be used after requireAuth (expects req.userId and req.userRole).
 */
export function requireTradingTier() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const tier = await getUserTier(userId, req.userRole);
    if (!tier) {
      return res.status(403).json({
        ok: false,
        error: "plan_required",
        message: "An active subscription is required to trade. Please subscribe to a plan.",
      });
    }
    if (tier === "explorer") {
      return res.status(403).json({
        ok: false,
        error: "tier_insufficient",
        message: "The Explorer plan does not include trading. Please upgrade to Trader or Titan.",
      });
    }

    (req as any).userTier = tier;
    next();
  };
}

/**
 * Middleware: enforce exchange account limit per tier on connect.
 * Must be used after requireAuth (expects req.userId and req.userRole).
 */
export function requireExchangeSlot() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const tier = await getUserTier(userId, req.userRole);
    if (!tier) {
      return res.status(403).json({
        ok: false,
        error: "plan_required",
        message: "An active subscription is required to connect exchanges. Please subscribe to a plan.",
      });
    }

    const limit = getExchangeLimit(tier);
    if (limit === 0) {
      return res.status(403).json({
        ok: false,
        error: "tier_insufficient",
        message: "The Explorer plan does not include exchange connections. Please upgrade to Trader or Titan.",
      });
    }

    if (limit !== Infinity) {
      try {
        const { pool } = await import("../db/pool.ts");
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM exchange_connection_records
           WHERE user_id = $1 AND enabled = true`,
          [userId],
        );
        const currentCount = rows[0]?.cnt ?? 0;
        if (currentCount >= limit) {
          return res.status(403).json({
            ok: false,
            error: "exchange_limit_reached",
            message: `Your ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan allows a maximum of ${limit} exchange account${limit === 1 ? "" : "s"}. Please upgrade to Titan for unlimited accounts.`,
          });
        }
      } catch {
        // If we can't verify, allow the request (fail-open for count check)
      }
    }

    (req as any).userTier = tier;
    next();
  };
}

/**
 * Middleware: require at least "trader" tier before creating bots.
 * Must be used after auth (expects req headers x-user-id or req.userId).
 */
export function requireBotTier() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // traderHub routes use x-user-id header pattern
    const userId = req.userId || (typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"] : undefined);
    const userRole = req.userRole || undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const tier = await getUserTier(userId, userRole);
    if (!tier) {
      return res.status(403).json({
        ok: false,
        error: "plan_required",
        message: "An active subscription is required to create bots. Please subscribe to a plan.",
      });
    }
    if (tier === "explorer") {
      return res.status(403).json({
        ok: false,
        error: "tier_insufficient",
        message: "The Explorer plan does not include bot creation. Please upgrade to Trader or Titan.",
      });
    }

    (req as any).userTier = tier;
    next();
  };
}
