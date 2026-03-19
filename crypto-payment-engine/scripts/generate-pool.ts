/**
 * Generate TRON address pool for the payment engine.
 * Usage: ENGINE_DB_HOST=... node --import tsx/esm scripts/generate-pool.ts [count]
 */
try { process.loadEnvFile(); } catch {}

import { createHash, randomBytes, createCipheriv, createECDH } from "node:crypto";
import createKeccakHash from "keccak";
import pg from "pg";

const DB_HOST = process.env.ENGINE_DB_HOST ?? process.env.DB_HOST ?? "127.0.0.1";
const DB_PORT = Number(process.env.ENGINE_DB_PORT ?? process.env.DB_PORT ?? 5432);
const DB_NAME = process.env.ENGINE_DB_NAME ?? "bitrium_payments";
const DB_USER = process.env.ENGINE_DB_USER ?? process.env.DB_USER ?? "bitrium";
const DB_PASS = process.env.ENGINE_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "";

const envKey = process.env.ENCRYPTION_KEY;
const encryptionKey = envKey
  ? Buffer.from(envKey, "hex")
  : createHash("sha256").update(DB_PASS || "dev-key").digest();

const count = Number(process.argv[2] ?? 500);

// ── TRON address generation ──
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58encode(data: Buffer): string {
  let num = BigInt("0x" + data.toString("hex"));
  let r = "";
  while (num > 0n) { r = BASE58[Number(num % 58n)] + r; num /= 58n; }
  for (const b of data) { if (b !== 0) break; r = "1" + r; }
  return r;
}
function b58check(payload: Buffer): string {
  const cs = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest().subarray(0, 4);
  return b58encode(Buffer.concat([payload, cs]));
}
function genAddr() {
  const pk = randomBytes(32);
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(pk);
  const pub = ecdh.getPublicKey().subarray(1);
  const hash = createKeccakHash("keccak256").update(pub).digest();
  const addr = b58check(Buffer.concat([Buffer.from([0x41]), hash.subarray(hash.length - 20)]));
  return { address: addr, privateKeyHex: pk.toString("hex") };
}
function encrypt(pkHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(pkHex, "utf8"), cipher.final()]);
  return JSON.stringify({ iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), payload: enc.toString("hex") });
}

// ── Main ──
const pool = new pg.Pool({ host: DB_HOST, port: DB_PORT, database: DB_NAME, user: DB_USER, password: DB_PASS });

(async () => {
  const { rows: [{ cnt }] } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM engine_wallet_addresses WHERE status = 'available'`);
  console.log(`Available: ${cnt}`);
  if (cnt >= count) { console.log("Pool sufficient, skipping"); process.exit(0); }

  const toGen = count - cnt;
  console.log(`Generating ${toGen} addresses...`);
  let ok = 0;
  for (let i = 0; i < toGen; i++) {
    const w = genAddr();
    await pool.query(
      `INSERT INTO engine_wallet_addresses (address, private_key_enc, status) VALUES ($1, $2, 'available') ON CONFLICT (address) DO NOTHING`,
      [w.address, encrypt(w.privateKeyHex)],
    );
    ok++;
    if (ok % 100 === 0) console.log(`  ${ok}/${toGen}`);
  }
  console.log(`Done: ${ok} generated`);
  const { rows: [{ cnt: after }] } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM engine_wallet_addresses WHERE status = 'available'`);
  console.log(`Total available: ${after}`);
  process.exit(0);
})();
