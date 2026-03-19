import pg from "pg";
import { ENGINE_CONFIG } from "../config.ts";

export const pool = new pg.Pool({
  host: ENGINE_CONFIG.db.host,
  port: ENGINE_CONFIG.db.port,
  database: ENGINE_CONFIG.db.name,
  user: ENGINE_CONFIG.db.user,
  password: ENGINE_CONFIG.db.password,
  max: 10,
});

export async function ensureConnection(): Promise<void> {
  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();
  console.log(`[PaymentEngine DB] Connected to ${ENGINE_CONFIG.db.host}:${ENGINE_CONFIG.db.port}/${ENGINE_CONFIG.db.name}`);
}
