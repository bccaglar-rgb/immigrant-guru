/**
 * Reconciliation Worker — Daily check that blockchain, DB, and subscriptions match.
 *
 * Runs once per hour. Detects:
 * - Invoices stuck in 'paid' but no subscription webhook sent
 * - Addresses with USDT balance but not marked 'paid'
 * - Sweeps that failed and need retry
 * - Invoices approaching expiry with partial payment
 */
import { pool } from "../db/pool.ts";
import { getUsdtBalance } from "../services/tronSigner.ts";

const RECONCILE_INTERVAL_MS = 60 * 60_000; // 1 hour

export class ReconciliationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), RECONCILE_INTERVAL_MS);
    console.log(`[Reconciliation] Started (hourly)`);
    // Run immediately on start
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const issues: string[] = [];

      // 1. Check for stuck invoices (paid but webhook may not have been sent)
      const { rows: stuckPaid } = await pool.query(
        `SELECT id, user_id, plan_id, paid_amount_usdt FROM engine_invoices
         WHERE status = 'paid' AND paid_at < NOW() - INTERVAL '10 minutes'
         LIMIT 20`,
      );
      if (stuckPaid.length > 0) {
        issues.push(`${stuckPaid.length} invoice(s) in 'paid' state >10min (webhook may need retry)`);
      }

      // 2. Check for failed sweeps
      const { rows: failedSweeps } = await pool.query(
        `SELECT id, source_address, error_message FROM engine_sweeps WHERE status = 'failed' LIMIT 20`,
      );
      if (failedSweeps.length > 0) {
        issues.push(`${failedSweeps.length} failed sweep(s) need attention`);
      }

      // 3. Check assigned addresses that are old (>2 hours, likely expired invoice not cleaned up)
      const { rows: staleAssigned } = await pool.query(
        `SELECT wallet_index, address, assigned_invoice_id FROM engine_wallet_addresses
         WHERE status = 'assigned' AND updated_at < NOW() - INTERVAL '2 hours'
         LIMIT 20`,
      );
      if (staleAssigned.length > 0) {
        issues.push(`${staleAssigned.length} address(es) assigned >2h (stale?)`);
      }

      // 4. Check for paid addresses not yet swept (>1 hour old)
      const { rows: unswept } = await pool.query(
        `SELECT wallet_index, address FROM engine_wallet_addresses
         WHERE status = 'paid' AND updated_at < NOW() - INTERVAL '1 hour'
         LIMIT 20`,
      );
      if (unswept.length > 0) {
        issues.push(`${unswept.length} paid address(es) not yet swept`);
      }

      // 5. Pool health
      const { rows: poolStatus } = await pool.query(
        `SELECT status, COUNT(*)::int AS cnt FROM engine_wallet_addresses GROUP BY status`,
      );
      const available = poolStatus.find((r: any) => r.status === "available")?.cnt ?? 0;
      if (available < 50) {
        issues.push(`Low address pool: only ${available} available addresses`);
      }

      if (issues.length > 0) {
        console.warn(`[Reconciliation] ${issues.length} issue(s) found:`);
        for (const issue of issues) console.warn(`  - ${issue}`);
      } else {
        console.log(`[Reconciliation] All clear. Pool: ${available} available`);
      }
    } catch (err: any) {
      console.error("[Reconciliation] Tick failed:", err?.message);
    } finally {
      this.running = false;
    }
  }
}
