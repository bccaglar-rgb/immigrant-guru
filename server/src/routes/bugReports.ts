import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.ts";
import { AuthService } from "../payments/authService.ts";

const bearer = (h: string | undefined) => { if (!h) return ""; const [s, t] = h.split(" "); return s?.toLowerCase() === "bearer" ? (t ?? "") : ""; };
const makeId = () => `bug_${randomBytes(8).toString("hex")}`;
const noteId = () => `note_${randomBytes(6).toString("hex")}`;

const requireAuth = async (auth: AuthService, req: Request, res: Response) => {
  const ctx = await auth.getUserFromToken(bearer(req.headers.authorization));
  if (!ctx) { res.status(401).json({ ok: false, error: "unauthorized" }); return null; }
  return ctx;
};

const requireAdmin = async (auth: AuthService, req: Request, res: Response) => {
  const ctx = await requireAuth(auth, req, res);
  if (!ctx) return null;
  if (ctx.user.role !== "ADMIN") { res.status(403).json({ ok: false, error: "forbidden" }); return null; }
  return ctx;
};

export const registerBugReportRoutes = (app: Express, auth: AuthService) => {
  // Stats
  app.get("/api/admin/bug-reports/stats", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS open,
          COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved','closed')) AS critical,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
          COUNT(*) FILTER (WHERE status = 'waiting_info') AS waiting_info,
          COUNT(*) FILTER (WHERE status = 'resolved' AND updated_at > NOW() - INTERVAL '7 days') AS resolved_week,
          COUNT(*) FILTER (WHERE status = 'reopened') AS reopened,
          COUNT(*) AS total
        FROM bug_reports
      `);
      res.json({ ok: true, stats: rows[0] });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // List bugs with filters
  app.get("/api/admin/bug-reports", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const limit = Math.min(200, Number(req.query.limit ?? 50));
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (req.query.status) { conditions.push(`status = $${idx++}`); params.push(String(req.query.status)); }
      if (req.query.severity) { conditions.push(`severity = $${idx++}`); params.push(String(req.query.severity)); }
      if (req.query.module) { conditions.push(`module = $${idx++}`); params.push(String(req.query.module)); }
      if (req.query.source) { conditions.push(`source = $${idx++}`); params.push(String(req.query.source)); }
      if (req.query.search) { conditions.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`); params.push(`%${String(req.query.search)}%`); idx++; }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit);

      const { rows } = await pool.query(
        `SELECT * FROM bug_reports ${where} ORDER BY created_at DESC LIMIT $${idx}`,
        params,
      );
      res.json({ ok: true, bugs: rows });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Bug detail
  app.get("/api/admin/bug-reports/:id", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    const { rows } = await pool.query("SELECT * FROM bug_reports WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    const { rows: notes } = await pool.query("SELECT * FROM bug_report_notes WHERE bug_report_id = $1 ORDER BY created_at DESC", [req.params.id]);
    res.json({ ok: true, bug: rows[0], notes });
  });

  // Create bug report (any authenticated user)
  app.post("/api/bug-reports", async (req, res) => {
    const ctx = await requireAuth(auth, req, res);
    if (!ctx) return;
    try {
      const { title, description, module, pageUrl, browserInfo, screenSize, invoiceId, txHash, metadata } = req.body;
      if (!title || !module) return res.status(400).json({ ok: false, error: "title_and_module_required" });

      const id = makeId();
      await pool.query(
        `INSERT INTO bug_reports (id, title, description, module, source, reported_by, user_id, page_url, browser_info, screen_size, environment, invoice_id, tx_hash, metadata)
         VALUES ($1,$2,$3,$4,'user',$5,$5,$6,$7,$8,'production',$9,$10,$11)`,
        [id, title, description ?? "", module, ctx.user.id, pageUrl ?? null, browserInfo ?? null, screenSize ?? null, invoiceId ?? null, txHash ?? null, metadata ? JSON.stringify(metadata) : null],
      );
      res.json({ ok: true, bugId: id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Update bug (admin)
  app.patch("/api/admin/bug-reports/:id", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    try {
      const sets: string[] = ["updated_at = NOW()"];
      const params: any[] = [req.params.id];
      let idx = 2;
      const allowedFields = ["status", "severity", "priority", "assigned_to", "internal_notes"];
      for (const field of allowedFields) {
        const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (req.body[camel] !== undefined || req.body[field] !== undefined) {
          const val = req.body[camel] ?? req.body[field];
          sets.push(`${field} = $${idx++}`);
          params.push(String(val));
        }
      }
      await pool.query(`UPDATE bug_reports SET ${sets.join(", ")} WHERE id = $1`, params);

      // Add activity note
      if (req.body.status) {
        await pool.query(
          `INSERT INTO bug_report_notes (id, bug_report_id, author_id, note, action, new_value) VALUES ($1,$2,$3,$4,'status_change',$5)`,
          [noteId(), req.params.id, ctx.user.id, `Status changed to ${req.body.status}`, req.body.status],
        );
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Add note
  app.post("/api/admin/bug-reports/:id/notes", async (req, res) => {
    const ctx = await requireAdmin(auth, req, res);
    if (!ctx) return;
    const { note } = req.body;
    if (!note) return res.status(400).json({ ok: false, error: "note_required" });
    await pool.query(
      `INSERT INTO bug_report_notes (id, bug_report_id, author_id, note, action) VALUES ($1,$2,$3,$4,'comment')`,
      [noteId(), req.params.id, ctx.user.id, note],
    );
    res.json({ ok: true });
  });
};
