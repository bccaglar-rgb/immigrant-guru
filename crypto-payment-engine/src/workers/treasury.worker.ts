/**
 * Treasury Worker — Moves USDT from hot wallet to cold wallet.
 *
 * Runs every 5 minutes. Transfers when hot wallet balance exceeds threshold.
 * Cold wallet transfers require HOT_WALLET_PRIVATE_KEY and COLD_WALLET env vars.
 */
import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.ts";
import { ENGINE_CONFIG } from "../config.ts";
import { sweepUsdt, getUsdtBalance } from "../services/tronSigner.ts";

const makeId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const TREASURY_INTERVAL_MS = 5 * 60_000; // 5 minutes

export class TreasuryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private hotWalletKey: string = "";

  constructor() {
    this.hotWalletKey = process.env.HOT_WALLET_PRIVATE_KEY ?? "";
  }

  start() {
    if (this.timer) return;
    if (!this.hotWalletKey || !ENGINE_CONFIG.masterHotWallet || !ENGINE_CONFIG.coldWallet) {
      console.warn("[TreasuryWorker] Not configured (need HOT_WALLET_PRIVATE_KEY + MASTER_HOT_WALLET + COLD_WALLET)");
      return;
    }
    this.timer = setInterval(() => void this.tick(), TREASURY_INTERVAL_MS);
    console.log(`[TreasuryWorker] Started (${TREASURY_INTERVAL_MS / 60000}min interval)`);
    console.log(`[TreasuryWorker] Hot: ${ENGINE_CONFIG.masterHotWallet} → Cold: ${ENGINE_CONFIG.coldWallet}`);
    console.log(`[TreasuryWorker] Threshold: ${ENGINE_CONFIG.hotWalletThresholdUsdt} USDT`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const hotBalance = await getUsdtBalance(ENGINE_CONFIG.masterHotWallet);
      const threshold = ENGINE_CONFIG.hotWalletThresholdUsdt;

      if (hotBalance <= threshold) {
        return; // Below threshold, no transfer needed
      }

      // Transfer amount = balance - keep_minimum (keep 10% of threshold as buffer)
      const keepMinimum = threshold * 0.1;
      const transferAmount = Math.floor((hotBalance - keepMinimum) * 100) / 100;

      if (transferAmount < 10) {
        return; // Don't transfer less than 10 USDT
      }

      console.log(`[TreasuryWorker] Hot wallet: ${hotBalance} USDT (threshold: ${threshold}), transferring ${transferAmount} USDT to cold`);

      const result = await sweepUsdt(this.hotWalletKey, ENGINE_CONFIG.coldWallet, transferAmount);
      if (!result.success) {
        console.error(`[TreasuryWorker] Transfer failed: ${result.error}`);
        await pool.query(
          `INSERT INTO engine_sweeps (id, source_address, destination_address, asset, amount, status, error_message, created_at)
           VALUES ($1, $2, $3, 'USDT', $4, 'failed', $5, NOW())`,
          [makeId("trs"), ENGINE_CONFIG.masterHotWallet, ENGINE_CONFIG.coldWallet, transferAmount, result.error],
        ).catch(() => {});
        return;
      }

      // Record successful treasury transfer
      await pool.query(
        `INSERT INTO engine_sweeps (id, source_address, destination_address, asset, amount, tx_hash, status, completed_at, created_at)
         VALUES ($1, $2, $3, 'USDT', $4, $5, 'confirmed', NOW(), NOW())`,
        [makeId("trs"), ENGINE_CONFIG.masterHotWallet, ENGINE_CONFIG.coldWallet, transferAmount, result.txHash],
      );

      console.log(`[TreasuryWorker] Transferred ${transferAmount} USDT to cold wallet: tx=${result.txHash}`);
    } catch (err: any) {
      console.error("[TreasuryWorker] Tick failed:", err?.message);
    } finally {
      this.running = false;
    }
  }

  getStatus() {
    return {
      running: Boolean(this.timer),
      hotWallet: ENGINE_CONFIG.masterHotWallet || "not_configured",
      coldWallet: ENGINE_CONFIG.coldWallet || "not_configured",
      threshold: ENGINE_CONFIG.hotWalletThresholdUsdt,
    };
  }
}
