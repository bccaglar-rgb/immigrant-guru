import Redis from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null; // stop retrying
    return Math.min(times * 200, 3000);
  },
  lazyConnect: false,
});

redis.on("error", (err) => {
  console.error("[redis] Connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[redis] Connected");
});

/** Quick connectivity check — called once at boot. */
export async function ensureRedisConnection(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== "PONG") throw new Error(`Redis ping failed: ${pong}`);
  console.log("[redis] Redis connected — PONG");
}
