/**
 * Parquet Exporter — Daily cold-storage export to MinIO (S3-compatible).
 *
 * Exports the previous day's candles_1m data as Parquet files to MinIO.
 * Path convention: bitrium-candles/{exchange}/{symbol}/{YYYY-MM-DD}.parquet
 *
 * Called by scanner process nightly at 00:30 UTC.
 */
import { pool } from "../../db/pool.ts";

// Lazy-loaded dependencies (heavy, only needed when exporting)
let _s3Client: any = null;
let _parquet: any = null;

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://127.0.0.1:9000";
const MINIO_REGION = process.env.MINIO_REGION ?? "us-east-1";
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY ?? "minioadmin";
const MINIO_BUCKET = process.env.MINIO_BUCKET ?? "bitrium-candles";

async function getS3Client() {
  if (_s3Client) return _s3Client;
  try {
    const { S3Client } = await import("@aws-sdk/client-s3");
    _s3Client = new S3Client({
      endpoint: MINIO_ENDPOINT,
      region: MINIO_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
    return _s3Client;
  } catch (err: any) {
    console.error("[parquetExporter] Failed to load @aws-sdk/client-s3:", err?.message);
    return null;
  }
}

async function getParquet() {
  if (_parquet) return _parquet;
  try {
    _parquet = await import("@dsnp/parquetjs");
    return _parquet;
  } catch (err: any) {
    console.error("[parquetExporter] Failed to load @dsnp/parquetjs:", err?.message);
    return null;
  }
}

interface CandleRow {
  time: Date;
  exchange: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Export a full day's candles_1m data as Parquet files to MinIO.
 * Groups by (exchange, symbol) and creates one Parquet file per group.
 */
export async function exportDay(date: Date): Promise<{ exported: number; errors: number }> {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const dayStart = new Date(dateStr + "T00:00:00Z");
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  console.log(`[parquetExporter] Exporting candles for ${dateStr}...`);

  let exported = 0;
  let errors = 0;

  // Fetch all 1m candles for the day
  let rows: CandleRow[];
  try {
    const result = await pool.query(
      `SELECT time, exchange, symbol,
              open::float8 AS open, high::float8 AS high,
              low::float8 AS low, close::float8 AS close,
              volume::float8 AS volume
       FROM candles_1m
       WHERE time >= $1 AND time < $2
       ORDER BY exchange, symbol, time`,
      [dayStart, dayEnd],
    );
    rows = result.rows;
  } catch (err: any) {
    if (err?.code === "42P01") {
      console.warn("[parquetExporter] candles_1m table not found — skipping export");
      return { exported: 0, errors: 0 };
    }
    throw err;
  }

  if (!rows.length) {
    console.log(`[parquetExporter] No candles found for ${dateStr}`);
    return { exported: 0, errors: 0 };
  }

  // Group by (exchange, symbol)
  const groups = new Map<string, CandleRow[]>();
  for (const row of rows) {
    const key = `${row.exchange}/${row.symbol}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(row);
  }

  console.log(`[parquetExporter] ${rows.length} candles across ${groups.size} groups`);

  const parquet = await getParquet();
  const s3 = await getS3Client();

  if (!parquet || !s3) {
    console.error("[parquetExporter] Missing dependencies (parquetjs or s3 client) — skipping export");
    return { exported: 0, errors: groups.size };
  }

  // Ensure bucket exists
  try {
    const { HeadBucketCommand, CreateBucketCommand } = await import("@aws-sdk/client-s3");
    try {
      await s3.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
      console.log(`[parquetExporter] Created bucket: ${MINIO_BUCKET}`);
    }
  } catch (err: any) {
    console.error("[parquetExporter] Bucket check/create failed:", err?.message);
  }

  // Parquet schema for candle data
  const schema = new parquet.ParquetSchema({
    time: { type: "INT64" }, // unix ms
    open: { type: "DOUBLE" },
    high: { type: "DOUBLE" },
    low: { type: "DOUBLE" },
    close: { type: "DOUBLE" },
    volume: { type: "DOUBLE" },
  });

  for (const [key, groupRows] of groups) {
    const [exchange, symbol] = key.split("/");
    const objectKey = `${exchange}/${symbol}/${dateStr}.parquet`;

    try {
      // Write Parquet to in-memory buffer
      const writer = await parquet.ParquetWriter.openBuffer(schema);
      for (const row of groupRows) {
        await writer.appendRow({
          time: BigInt(new Date(row.time).getTime()),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
        });
      }
      await writer.close();
      const buffer = writer.toBuffer();

      // Upload to MinIO
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await s3.send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: objectKey,
          Body: buffer,
          ContentType: "application/octet-stream",
          Metadata: {
            exchange: exchange!,
            symbol: symbol!,
            date: dateStr,
            rows: String(groupRows.length),
          },
        }),
      );

      exported++;
    } catch (err: any) {
      console.error(`[parquetExporter] Failed to export ${objectKey}:`, err?.message ?? err);
      errors++;
    }
  }

  console.log(`[parquetExporter] Done: ${exported} exported, ${errors} errors for ${dateStr}`);
  return { exported, errors };
}

/**
 * Export yesterday's candles (convenience wrapper).
 */
export async function exportYesterday(): Promise<{ exported: number; errors: number }> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  return exportDay(yesterday);
}
