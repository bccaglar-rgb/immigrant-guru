/**
 * Bitrium Market Data Hub — Standalone service
 *
 * Responsibilities:
 *   1. Binance Futures aggregate WS (2600+ symbols)
 *   2. ExchangeMarketHub (Binance + Gate.io adapters with health routing)
 *   3. HubEventBridge publisher (events → Redis pub/sub + hash snapshots)
 *   4. Bulk snapshot flush (553 symbols → Redis every 10s)
 *   5. Market list dirty-patch bridge (500ms flush → Redis hub:market_list)
 *   6. hub:commands subscriber (monolith → ensureSymbol)
 *   7. Express /health endpoint
 */
try { process.loadEnvFile(); } catch { /* .env optional */ }

import express from "express";
import { ensureRedisConnection } from "./redis.ts";
import { BinanceFuturesHub } from "./services/binanceFuturesHub.ts";
import type { BinanceFuturesHubEvent } from "./services/binanceFuturesHub.ts";
import { ExchangeMarketHub } from "./services/marketHub/ExchangeMarketHub.ts";
import { HubEventBridge } from "./services/marketHub/HubEventBridge.ts";

const app = express();
app.use(express.json());

const binanceFuturesHub = new BinanceFuturesHub();
const exchangeMarketHub = new ExchangeMarketHub();
const hubEventBridge = new HubEventBridge();

// ═══════════════════════════════════════════════════════════════════
// Market List Dirty-Patch Bridge
// Replicated from gateway.ts Pipeline 6 (Worker 0 primary logic).
// Tracks dirty fields from BinanceFuturesHub, flushes patches to Redis.
// ═══════════════════════════════════════════════════════════════════
type MarketListField = "price" | "change24hPct" | "volume24hUsd" | "markPrice" | "fundingRate" | "nextFundingTime" | "topBid" | "topAsk" | "spreadBps" | "depthUsd" | "imbalance";

const mlDirtyFields = new Map<string, Set<MarketListField>>();
const mlLatestValues = new Map<string, Record<string, number | null>>();

const markDirty = (symbol: string, fields: MarketListField[], values: Record<string, number | null>) => {
  let set = mlDirtyFields.get(symbol);
  if (!set) { set = new Set(); mlDirtyFields.set(symbol, set); }
  for (const f of fields) set.add(f);
  let existing = mlLatestValues.get(symbol);
  if (!existing) { existing = {}; mlLatestValues.set(symbol, existing); }
  Object.assign(existing, values);
};

function startMarketListPatchBridge() {
  const MARKET_LIST_FLUSH_MS = 500;

  // Listen to BinanceFuturesHub for ticker/mark/book events
  binanceFuturesHub.onEvent((event: BinanceFuturesHubEvent) => {
    if (event.type === "futures_ticker_batch") {
      for (const row of event.rows) {
        markDirty(row.symbol, ["price", "change24hPct", "volume24hUsd"], {
          price: row.price, change24hPct: row.change24hPct, volume24hUsd: row.volume24hUsd,
        });
      }
    } else if (event.type === "futures_mark_batch") {
      for (const row of event.rows) {
        markDirty(row.symbol, ["markPrice", "fundingRate", "nextFundingTime"], {
          markPrice: row.markPrice, fundingRate: row.fundingRate, nextFundingTime: row.nextFundingTime,
        });
      }
    } else if (event.type === "futures_book") {
      markDirty(event.symbol, ["topBid", "topAsk", "spreadBps", "depthUsd", "imbalance"], {
        topBid: event.bid, topAsk: event.ask, spreadBps: event.spreadBps,
        depthUsd: event.depthUsd, imbalance: event.imbalance,
      });
    }
  });

  // 500ms flush timer: collect dirty fields → market_patch → Redis pub/sub
  setInterval(() => {
    if (!mlDirtyFields.size) return;

    const patch: Record<string, Record<string, number | null>> = {};
    for (const [symbol, fields] of mlDirtyFields.entries()) {
      const vals = mlLatestValues.get(symbol);
      if (!vals || !fields.size) continue;
      const symbolPatch: Record<string, number | null> = {};
      for (const field of fields) {
        if (field in vals) symbolPatch[field] = vals[field] ?? null;
      }
      if (Object.keys(symbolPatch).length) patch[symbol] = symbolPatch;
    }
    mlDirtyFields.clear();

    if (!Object.keys(patch).length) return;

    const body = JSON.stringify({ type: "market_patch", patch, ts: Date.now() });
    try {
      hubEventBridge.publishMarketListPatch(body);
    } catch {
      // best-effort
    }
  }, MARKET_LIST_FLUSH_MS);

  // Store full universe snapshot + futures universe in Redis every 5s
  setInterval(() => {
    try {
      const rows = binanceFuturesHub.getUniverseRows();
      if (rows.length > 0) {
        hubEventBridge.storeMarketListSnapshot(
          JSON.stringify({ type: "market_snapshot", rows, ts: Date.now() }),
        );
        hubEventBridge.storeFuturesUniverse(JSON.stringify({
          ok: true, rows, count: rows.length,
        }));
      }
    } catch {
      // best-effort
    }
  }, 5_000);

  console.log("[market-hub] Market list patch bridge started (500ms flush)");
}

// ═══════════════════════════════════════════════════════════════════
// Health API
// ═══════════════════════════════════════════════════════════════════
app.get("/health", (_req, res) => {
  const binanceStatus = binanceFuturesHub.getStatus();
  const hubStatus = exchangeMarketHub.getStatus();
  res.json({
    ok: true,
    service: "bitrium-market-hub",
    binance: binanceStatus,
    exchangeHub: hubStatus,
    universeCount: binanceFuturesHub.getUniverseRows().length,
    uptime: Math.floor(process.uptime()),
  });
});

app.get("/health/exchanges", (_req, res) => {
  res.json({
    ok: true,
    exchanges: exchangeMarketHub.getHealthByExchange(),
  });
});

// ═══════════════════════════════════════════════════════════════════
// Main bootstrap
// ═══════════════════════════════════════════════════════════════════
async function main() {
  await ensureRedisConnection();

  // 1. Start Binance Futures aggregate WS (2600+ symbols)
  binanceFuturesHub.start();
  console.log("[market-hub] BinanceFuturesHub started");

  // 2. Start ExchangeMarketHub (Binance + Gate.io adapters with health routing)
  exchangeMarketHub.start();
  console.log("[market-hub] ExchangeMarketHub started");

  // 3. Bridge hub events → Redis pub/sub + hash snapshots
  hubEventBridge.startPublisher(exchangeMarketHub);
  console.log("[market-hub] HubEventBridge publisher started");

  // 4. Bulk-write ALL Binance symbol prices to Redis every 10s
  hubEventBridge.startBulkSnapshotFlush(
    () => binanceFuturesHub.getUniverseRows(),
    10_000,
  );

  // 5. Market list dirty-patch bridge (replicates gateway.ts Pipeline 6)
  startMarketListPatchBridge();

  // 6. Listen for commands from monolith (ensureSymbol, etc.)
  hubEventBridge.startCommandSubscriber(exchangeMarketHub, binanceFuturesHub);

  // 7. Start HTTP server
  const port = Number(process.env.HUB_PORT ?? 8091);
  const host = process.env.HUB_HOST ?? "127.0.0.1";
  app.listen(port, host, () => {
    console.log(`[market-hub] Health API on http://${host}:${port}`);
    console.log("[market-hub] ✅ Market Data Hub running");
  });
}

main().catch((err) => {
  console.error("[market-hub] FATAL:", err);
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
  console.log("[market-hub] Shutting down...");
  binanceFuturesHub.stop();
  exchangeMarketHub.stop();
  hubEventBridge.stop();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
