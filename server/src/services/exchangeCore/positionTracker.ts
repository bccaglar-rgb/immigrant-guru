/**
 * PositionTracker — Redis-cached position state.
 * Fed by private user streams and periodic REST queries.
 */
import { redis } from "../../db/redis.ts";
import { pool } from "../../db/pool.ts";

export interface TrackedPosition {
  userId: string;
  exchangeAccountId: string;
  venue: string;
  symbol: string;
  side: string; // LONG | SHORT
  size: number;
  entryPrice: number;
  markPrice: number | null;
  unrealizedPnl: number | null;
  leverage: number | null;
  updatedAt: string;
}

const posKey = (userId: string, exchangeAccountId: string, symbol: string) =>
  `pos:${userId}:${exchangeAccountId}:${symbol}`;

const userPosPattern = (userId: string) => `pos:${userId}:*`;

export class PositionTracker {
  async getPosition(
    userId: string,
    exchangeAccountId: string,
    symbol: string,
  ): Promise<TrackedPosition | null> {
    const key = posKey(userId, exchangeAccountId, symbol);
    const data = await redis.get(key);
    if (!data) return null;
    try { return JSON.parse(data) as TrackedPosition; } catch { return null; }
  }

  async getAllPositions(userId: string): Promise<TrackedPosition[]> {
    const pattern = userPosPattern(userId);
    const keys = await redis.keys(pattern);
    if (!keys.length) return [];

    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.get(key);
    const results = await pipeline.exec();

    const positions: TrackedPosition[] = [];
    for (const [err, val] of results ?? []) {
      if (err || !val) continue;
      try { positions.push(JSON.parse(val as string) as TrackedPosition); } catch { /* skip */ }
    }
    return positions;
  }

  async updatePosition(position: TrackedPosition): Promise<void> {
    const key = posKey(position.userId, position.exchangeAccountId, position.symbol);

    if (position.size === 0) {
      // Position closed — remove from cache
      await redis.del(key);
    } else {
      // TTL 10 minutes — will be refreshed by streams or polling
      await redis.set(key, JSON.stringify(position), "EX", 600);
    }

    // Also persist to DB for policy queries
    try {
      await pool.query(
        `INSERT INTO position_snapshots
           (user_id, exchange_account_id, venue, symbol, side, size, entry_price,
            mark_price, unrealized_pnl, leverage, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (user_id, exchange_account_id, symbol) DO UPDATE SET
           side = EXCLUDED.side, size = EXCLUDED.size,
           entry_price = EXCLUDED.entry_price,
           mark_price = EXCLUDED.mark_price,
           unrealized_pnl = EXCLUDED.unrealized_pnl,
           leverage = EXCLUDED.leverage,
           updated_at = NOW()`,
        [
          position.userId, position.exchangeAccountId, position.venue,
          position.symbol, position.side, position.size,
          position.entryPrice, position.markPrice, position.unrealizedPnl,
          position.leverage,
        ],
      );
    } catch { /* best effort */ }
  }

  async removePosition(
    userId: string,
    exchangeAccountId: string,
    symbol: string,
  ): Promise<void> {
    const key = posKey(userId, exchangeAccountId, symbol);
    await redis.del(key);

    try {
      await pool.query(
        `DELETE FROM position_snapshots WHERE user_id = $1 AND exchange_account_id = $2 AND symbol = $3`,
        [userId, exchangeAccountId, symbol],
      );
    } catch { /* best effort */ }
  }
}
