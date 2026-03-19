/**
 * Script: Generate TRON address pool
 * Usage: node --import tsx/esm server/scripts/generate-address-pool.ts [count]
 */
try { process.loadEnvFile(); } catch { /* .env optional */ }

import { createHash } from "node:crypto";
import { AddressPoolService } from "../src/payments/addressPoolService.ts";

const count = Number(process.argv[2] ?? 500);

// Get encryption key (same logic as index.ts)
const envKey = process.env.ENCRYPTION_KEY;
const encryptionKey = envKey
  ? Buffer.from(envKey, "hex")
  : createHash("sha256").update(process.env.DB_PASSWORD ?? "dev-key").digest();

const poolService = new AddressPoolService(encryptionKey);

(async () => {
  const before = await poolService.getAvailableCount();
  console.log(`Current available addresses: ${before}`);

  if (before >= count) {
    console.log(`Pool already has ${before} addresses (requested ${count}). Skipping.`);
    process.exit(0);
  }

  const toGenerate = count - before;
  console.log(`Generating ${toGenerate} new addresses...`);

  const result = await poolService.generatePool(toGenerate);
  console.log(`Done: ${result.generated} generated, ${result.errors} errors`);

  const status = await poolService.getPoolStatus();
  console.log("Pool status:", status);

  process.exit(0);
})();
