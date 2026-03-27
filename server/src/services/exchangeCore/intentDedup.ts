/**
 * IntentDeduplicator — Redis-based idempotency check.
 * Prevents duplicate intents from being submitted within a 5-minute window.
 *
 * Key pattern: intent:dedup:{userId}:{clientOrderId}
 * Value: intentId
 * TTL: 300s (5 minutes)
 */
import { redisControl } from "../../db/redis.ts";

const DEDUP_TTL_S = 300;

const dedupKey = (userId: string, clientOrderId: string): string =>
  `intent:dedup:${userId}:${clientOrderId}`;

export class IntentDeduplicator {
  /**
   * Check if a clientOrderId is already in-flight for this user.
   * If not, marks it as in-flight atomically (SET NX EX).
   */
  async checkAndMark(
    userId: string,
    clientOrderId: string,
    intentId: string,
  ): Promise<{ isDuplicate: boolean; existingIntentId?: string }> {
    const key = dedupKey(userId, clientOrderId);

    // SET NX returns "OK" if set, null if key already exists
    const result = await redisControl.set(key, intentId, "EX", DEDUP_TTL_S, "NX");
    if (result === "OK") {
      return { isDuplicate: false };
    }

    // Key exists — retrieve the existing intentId
    const existing = await redisControl.get(key);
    return { isDuplicate: true, existingIntentId: existing ?? undefined };
  }

  /**
   * Release a dedup lock (e.g., if intent was rejected before persisting).
   */
  async release(userId: string, clientOrderId: string): Promise<void> {
    const key = dedupKey(userId, clientOrderId);
    await redisControl.del(key);
  }
}
