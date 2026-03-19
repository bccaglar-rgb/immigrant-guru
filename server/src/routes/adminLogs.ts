import type { Express, Request, Response } from "express";
import { pool } from "../db/pool.ts";
import { AuthService } from "../payments/authService.ts";

const bearer = (h: string | undefined) => { if (!h) return ""; const [s, t] = h.split(" "); return s?.toLowerCase() === "bearer" ? (t ?? "") : ""; };

const requireAdmin = async (auth: AuthService, req: Request, res: Response) => {
  const ctx = await auth.getUserFromToken(bearer(req.headers.authorization));
  if (!ctx) { res.status(401).json({ ok: false, error: "unauthorized" }); return null; }
  if (ctx.user.role !== "ADMIN") { res.status(403).json({ ok: false, error: "forbidden" }); return null; }
  return ctx;
};

export const registerAdminLogsRoutes = (app: Express, auth: AuthService) => {
  // Log stats (24h summary)
  app.get("/api/admin/logs/stats", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE level = 'error') AS errors,
          COUNT(*) FILTER (WHERE level = 'warning' OR level = 'warn') AS warnings,
          COUNT(*) FILTER (WHERE level = 'critical') AS critical,
          COUNT(*) FILTER (WHERE module = 'payments') AS payment_errors,
          COUNT(*) FILTER (WHERE bug_report_id IS NOT NULL) AS linked_to_bugs,
          COUNT(*) AS total
        FROM system_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
      `);
      const r = rows[0] ?? {};
      res.json({ ok: true, stats: { errors: Number(r.errors), warnings: Number(r.warnings), critical: Number(r.critical), paymentErrors: Number(r.payment_errors), linkedToBugs: Number(r.linked_to_bugs), total: Number(r.total) } });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Log list with filters
  app.get("/api/admin/logs", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const limit = Math.min(200, Number(req.query.limit ?? 50));
      const offset = Number(req.query.offset ?? 0);
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (req.query.level) { conditions.push(`level = $${idx++}`); params.push(String(req.query.level)); }
      if (req.query.module) { conditions.push(`module = $${idx++}`); params.push(String(req.query.module)); }
      if (req.query.userId) { conditions.push(`user_id = $${idx++}`); params.push(String(req.query.userId)); }
      if (req.query.invoiceId) { conditions.push(`invoice_id = $${idx++}`); params.push(String(req.query.invoiceId)); }
      if (req.query.txHash) { conditions.push(`tx_hash = $${idx++}`); params.push(String(req.query.txHash)); }
      if (req.query.search) { conditions.push(`message ILIKE $${idx++}`); params.push(`%${String(req.query.search)}%`); }
      if (req.query.dateFrom) { conditions.push(`timestamp >= $${idx++}`); params.push(String(req.query.dateFrom)); }
      if (req.query.dateTo) { conditions.push(`timestamp <= $${idx++}`); params.push(String(req.query.dateTo)); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit, offset);

      const { rows } = await pool.query(
        `SELECT * FROM system_logs ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx}`,
        params,
      );
      res.json({ ok: true, logs: rows });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Write log (internal use)
  app.post("/api/admin/logs", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { level, module, eventType, message, userId, metadata } = req.body;
      await pool.query(
        `INSERT INTO system_logs (level, module, event_type, message, service_source, user_id, metadata) VALUES ($1,$2,$3,$4,'admin',$5,$6)`,
        [level ?? "info", module ?? "admin", eventType ?? "manual", message ?? "", userId ?? ctx.user.id, metadata ? JSON.stringify(metadata) : null],
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
};
