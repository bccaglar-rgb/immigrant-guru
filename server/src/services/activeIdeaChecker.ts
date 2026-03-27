/**
 * Active Idea Checker — periodically checks ACTIVE trade ideas against live prices
 * to determine if TP or SL has been hit.
 * Runs every 30 seconds, processes all ACTIVE ideas (scanner + hub).
 */

import { reconcileSingleIdea } from "./tradeIdeaReconciler.ts";
import type { TradeIdeaStore } from "./tradeIdeaStore.ts";

const PREFIX = "[ActiveIdeaChecker]";
const CHECK_INTERVAL_MS = 30_000; // 30 seconds

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function checkActiveIdeas(store: TradeIdeaStore): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Fetch all ACTIVE and PENDING ideas (both scanner and hub)
    const [scannerIdeas, hubIdeas] = await Promise.all([
      store.listIdeas({ userId: "system-scanner", limit: 500 }),
      store.listIdeas({ userId: "hub-%", limit: 500 }),
    ]);
    const allIdeas = [...scannerIdeas, ...hubIdeas];
    const active = allIdeas.filter((i) => i.status === "ACTIVE" || i.status === "PENDING");

    if (active.length === 0) {
      running = false;
      return;
    }

    let resolved = 0;
    // Process in batches of 5 to avoid rate limits
    for (let i = 0; i < active.length; i += 5) {
      const batch = active.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((idea) => reconcileSingleIdea(idea, store)),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value && r.value.oldResult !== r.value.newResult) {
          resolved++;
          console.log(`${PREFIX} ${r.value.symbol}: ${r.value.oldResult} → ${r.value.newResult} (${r.value.hitType}${r.value.hitIndex ?? ""} @ ${r.value.hitPrice})`);
        }
      }
      // Small delay between batches
      if (i + 5 < active.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (resolved > 0) {
      console.log(`${PREFIX} Resolved ${resolved}/${active.length} active ideas`);
    }
  } catch (err: any) {
    console.error(`${PREFIX} Error:`, err?.message);
  } finally {
    running = false;
  }
}

export function startActiveIdeaChecker(store: TradeIdeaStore): void {
  if (timer) return;
  console.log(`${PREFIX} Starting (every ${CHECK_INTERVAL_MS / 1000}s)`);
  // Initial check after 60s to let hubs warm up
  setTimeout(() => {
    void checkActiveIdeas(store);
    timer = setInterval(() => void checkActiveIdeas(store), CHECK_INTERVAL_MS);
  }, 60_000);
}

export function stopActiveIdeaChecker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
