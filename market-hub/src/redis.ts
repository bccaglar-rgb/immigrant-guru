import Redis from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) return null;
    return Math.min(times * 200, 3000);
  },
  lazyConnect: false,
});

export async function ensureRedisConnection(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== "PONG") throw new Error(`Redis ping failed: ${pong}`);
  console.log("[market-hub] Redis connected");
}
