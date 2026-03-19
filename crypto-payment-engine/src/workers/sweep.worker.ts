/**
 * Sweep Worker — 3-stage pipeline:
 * 1. Detect: Find deposit addresses with status='paid' (USDT received, not yet swept)
 * 2. Fund: Send TRX to deposit address for gas (if needed)
 * 3. Execute: Sweep USDT from deposit address to master hot wallet
 *
 * Runs every 60 seconds.
 */
import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.ts";
import { ENGINE_CONFIG } from "../config.ts";
import { createDecipheriv } from "node:crypto";
import { fundAddressWithTrx, sweepUsdt, getTrxBalance, getUsdtBalance } from "../services/tronSigner.ts";

function decryptPrivateKey(encryptedJson: string, encryptionKey: Buffer): string {
  const { iv, tag, payload } = JSON.parse(encryptedJson);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "hex")), decipher.final()]).toString("utf8");
}

const makeId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const SWEEP_INTERVAL_MS = 60_000; // 1 minute
const MIN_TRX_SUN = 35_000_000; // 35 TRX needed for TRC20 transfer

export class SweepWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private hotWalletKey: string = "";

  constructor() {
    this.hotWalletKey = process.env.HOT_WALLET_PRIVATE_KEY ?? "";
  }

  start() {
    if (this.timer) return;
    if (!this.hotWalletKey) {
      console.warn("[SweepWorker] HOT_WALLET_PRIVATE_KEY not set — sweep disabled");
      return;
    }
    if (!ENGINE_CONFIG.masterHotWallet) {
      console.warn("[SweepWorker] MASTER_HOT_WALLET not set — sweep disabled");
      return;
    }
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS);
    console.log(`[SweepWorker] Started (${SWEEP_INTERVAL_MS / 1000}s interval, hot wallet: ${ENGINE_CONFIG.masterHotWallet})`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Stage 1: Detect sweep candidates
      const candidates = await this.detectCandidates();
      if (!candidates.length) return;

      console.log(`[SweepWorker] Found ${candidates.length} sweep candidate(s)`);

      for (const candidate of candidates) {
        try {
          // Stage 2: Check TRX balance, fund if needed
          const funded = await this.ensureFunded(candidate);
          if (!funded) continue;

          // Stage 3: Execute sweep
          await this.executeSweep(candidate);
        } catch (err: any) {
          console.error(`[SweepWorker] Error sweeping ${candidate.address}:`, err?.message);
          await this.recordSweepError(candidate, err?.message ?? "sweep_error");
        }
      }
    } catch (err: any) {
      console.error("[SweepWorker] Tick failed:", err?.message);
    } finally {
      this.running = false;
    }
  }

  // ── Stage 1: Detect ──
  private async detectCandidates(): Promise<Array<{
    walletIndex: number;
    address: string;
    privateKeyEnc: string;
    invoiceId: string;
    usdtBalance: number;
  }>> {
    const { rows } = await pool.query(
      `SELECT wallet_index, address, private_key_enc, assigned_invoice_id
       FROM engine_wallet_addresses
       WHERE status = 'paid'
       ORDER BY wallet_index ASC
       LIMIT 10`,
    );

    const candidates = [];
    for (const r of rows) {
      const address = String(r.address);
      const usdtBalance = await getUsdtBalance(address);
      if (usdtBalance > 0) {
        candidates.push({
          walletIndex: Number(r.wallet_index),
          address,
          privateKeyEnc: String(r.private_key_enc),
          invoiceId: String(r.assigned_invoice_id ?? ""),
          usdtBalance,
        });
      }
    }
    return candidates;
  }

  // ── Stage 2: Fund ──
  private async ensureFunded(candidate: { address: string }): Promise<boolean> {
    const trxBalance = await getTrxBalance(candidate.address);
    if (trxBalance >= MIN_TRX_SUN) return true;

    console.log(`[SweepWorker] Funding ${candidate.address} with TRX (current: ${trxBalance / 1e6} TRX)`);
    const result = await fundAddressWithTrx(this.hotWalletKey, candidate.address);
    if (!result.success) {
      console.error(`[SweepWorker] TRX funding failed for ${candidate.address}: ${result.error}`);
      return false;
    }
    console.log(`[SweepWorker] TRX funded: ${result.txHash}`);

    // Wait for funding to confirm (10s)
    await new Promise((r) => setTimeout(r, 10_000));
    return true;
  }

  // ── Stage 3: Execute ──
  private async executeSweep(candidate: {
    walletIndex: number;
    address: string;
    privateKeyEnc: string;
    invoiceId: string;
    usdtBalance: number;
  }): Promise<void> {
    // Decrypt deposit address private key
    const depositKey = decryptPrivateKey(candidate.privateKeyEnc, ENGINE_CONFIG.encryptionKey);
    const hotWallet = ENGINE_CONFIG.masterHotWallet;

    console.log(`[SweepWorker] Sweeping ${candidate.usdtBalance} USDT from ${candidate.address} → ${hotWallet}`);

    const result = await sweepUsdt(depositKey, hotWallet, candidate.usdtBalance);
    if (!result.success) {
      throw new Error(`sweep_failed: ${result.error}`);
    }

    // Record sweep
    await pool.query(
      `INSERT INTO engine_sweeps (id, source_address, destination_address, asset, amount, tx_hash, status, created_at)
       VALUES ($1, $2, $3, 'USDT', $4, $5, 'confirmed', NOW())`,
      [makeId("swp"), candidate.address, hotWallet, candidate.usdtBalance, result.txHash],
    );

    // Mark address as swept
    await pool.query(
      `UPDATE engine_wallet_addresses SET status = 'swept', sweep_tx_hash = $1, swept_at = NOW(), updated_at = NOW() WHERE address = $2`,
      [result.txHash, candidate.address],
    );

    console.log(`[SweepWorker] Swept ${candidate.usdtBalance} USDT: tx=${result.txHash}`);
  }

  private async recordSweepError(candidate: { address: string }, error: string): Promise<void> {
    await pool.query(
      `INSERT INTO engine_sweeps (id, source_address, destination_address, asset, amount, status, error_message, created_at)
       VALUES ($1, $2, $3, 'USDT', 0, 'failed', $4, NOW())`,
      [makeId("swp"), candidate.address, ENGINE_CONFIG.masterHotWallet, error],
    ).catch(() => {});
  }

  getStatus() {
    return { running: Boolean(this.timer), hotWallet: ENGINE_CONFIG.masterHotWallet || "not_configured" };
  }
}
