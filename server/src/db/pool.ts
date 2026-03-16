import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "bitrium_db",
  user: process.env.DB_USER ?? "bitrium_app",
  password: process.env.DB_PASSWORD ?? "",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/** Run a quick connectivity check (called once at boot). */
export async function ensureDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("[db] PostgreSQL connected");
  } finally {
    client.release();
  }
}
