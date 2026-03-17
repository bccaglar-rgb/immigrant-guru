/**
 * ML Routes — Training data & feature snapshot endpoints.
 *
 * GET /api/ml/training-data — Candle + feature data for ML model training
 * GET /api/ml/features      — Raw feature snapshots for a symbol
 */
import type { Express } from "express";
import { loadMLData, loadFeatures } from "../services/ml/dataLoader.ts";

export const registerMLRoutes = (app: Express) => {
  /**
   * GET /api/ml/training-data
   *
   * Query params:
   *   symbols  - comma-separated (e.g., "BTCUSDT,ETHUSDT")
   *   start    - ISO date string or unix ms
   *   end      - ISO date string or unix ms
   *   interval - candle interval (1m, 5m, 15m, 1h, 4h, 1d) — default: 15m
   *   exchange - exchange name (default: BINANCE)
   *   limit    - max rows (default: 10000, max: 50000)
   */
  app.get("/api/ml/training-data", async (req, res) => {
    try {
      const symbolsRaw = String(req.query.symbols ?? "");
      if (!symbolsRaw) {
        res.status(400).json({ ok: false, error: "symbols required (comma-separated)" });
        return;
      }
      const symbols = symbolsRaw
        .split(",")
        .map((s) => s.trim().toUpperCase().replace(/[-_]/g, ""))
        .filter(Boolean);

      if (!symbols.length || symbols.length > 20) {
        res.status(400).json({ ok: false, error: "1-20 symbols allowed" });
        return;
      }

      const startRaw = req.query.start;
      const endRaw = req.query.end;
      if (!startRaw || !endRaw) {
        res.status(400).json({ ok: false, error: "start and end required (ISO date or unix ms)" });
        return;
      }

      const startTime = new Date(isNaN(Number(startRaw)) ? String(startRaw) : Number(startRaw));
      const endTime = new Date(isNaN(Number(endRaw)) ? String(endRaw) : Number(endRaw));

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        res.status(400).json({ ok: false, error: "invalid start/end date" });
        return;
      }

      // Max 30 days range
      const rangeMs = endTime.getTime() - startTime.getTime();
      if (rangeMs < 0 || rangeMs > 30 * 86_400_000) {
        res.status(400).json({ ok: false, error: "max 30 day range, end must be after start" });
        return;
      }

      const interval = String(req.query.interval ?? "15m") as any;
      const exchange = req.query.exchange ? String(req.query.exchange).toUpperCase() : undefined;
      const limit = Math.min(Number(req.query.limit ?? 10_000), 50_000);

      const data = await loadMLData({
        symbols,
        startTime,
        endTime,
        candleInterval: interval,
        exchange,
        limit,
      });

      res.json({
        ok: true,
        symbols,
        interval,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        count: data.length,
        data,
      });
    } catch (err: any) {
      console.error("[/api/ml/training-data] Error:", err?.message ?? err);
      res.status(500).json({ ok: false, error: "internal error" });
    }
  });

  /**
   * GET /api/ml/features
   *
   * Query params:
   *   symbol - single symbol (e.g., "BTCUSDT")
   *   hours  - lookback hours (default: 24, max: 720 = 30 days)
   *   limit  - max rows (default: 5000, max: 50000)
   */
  app.get("/api/ml/features", async (req, res) => {
    try {
      const symbol = String(req.query.symbol ?? "").toUpperCase().replace(/[-_]/g, "").trim();
      if (!symbol) {
        res.status(400).json({ ok: false, error: "symbol required" });
        return;
      }

      const hours = Math.min(Math.max(Number(req.query.hours ?? 24), 1), 720);
      const limit = Math.min(Number(req.query.limit ?? 5000), 50_000);

      const data = await loadFeatures(symbol, hours, limit);

      res.json({
        ok: true,
        symbol,
        hours,
        count: data.length,
        data,
      });
    } catch (err: any) {
      console.error("[/api/ml/features] Error:", err?.message ?? err);
      res.status(500).json({ ok: false, error: "internal error" });
    }
  });
};
