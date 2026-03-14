import type { Express } from "express";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import type { ConnectionService } from "../services/connectionService";

function encryptJson(payload: unknown, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("base64"), tag: tag.toString("base64"), data: enc.toString("base64") };
}

function decryptJson(blob: { iv: string; tag: string; data: string }, key: Buffer) {
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const data = Buffer.from(blob.data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

export function registerConnectionRoutes(app: Express, connections: ConnectionService, encryptionKey: Buffer) {
  app.get("/api/connections/health", (_req, res) => {
    res.json({ ok: true, route: "connections" });
  });

  app.get("/api/connections", async (_req, res) => {
    try {
      const list = await (connections as any).list?.();
      res.json({ ok: true, connections: list ?? [] });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message ?? "connections_list_failed" });
    }
  });

  app.post("/api/connections/exchange", async (req, res) => {
    try {
      const { exchange, credentials } = req.body ?? {};
      if (!exchange || !credentials) {
        return res.status(400).json({ ok: false, error: "missing_exchange_or_credentials" });
      }
      const encrypted = encryptJson(credentials, encryptionKey);
      const saved = await (connections as any).saveExchange?.(exchange, encrypted);
      res.json({ ok: true, saved: saved ?? true });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message ?? "save_exchange_failed" });
    }
  });

  app.get("/api/connections/exchange/:exchange", async (req, res) => {
    try {
      const exchange = req.params.exchange;
      const record = await (connections as any).getExchange?.(exchange);
      if (!record) return res.status(404).json({ ok: false, error: "not_found" });

      const decrypted =
        record?.iv && record?.tag && record?.data
          ? decryptJson(record, encryptionKey)
          : record;

      res.json({ ok: true, exchange, credentials: decrypted });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message ?? "get_exchange_failed" });
    }
  });
}
