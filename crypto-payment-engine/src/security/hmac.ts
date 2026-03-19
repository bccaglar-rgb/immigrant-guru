/**
 * HMAC signature for internal API authentication.
 * Both main platform and payment engine use the same shared secret.
 */
import { createHmac } from "node:crypto";
import { ENGINE_CONFIG } from "../config.ts";

export function signPayload(body: string, timestamp: number): string {
  const material = `${timestamp}:${body}`;
  return createHmac("sha256", ENGINE_CONFIG.internalApiSecret).update(material).digest("hex");
}

export function verifySignature(body: string, timestamp: number, signature: string): boolean {
  const expected = signPayload(body, timestamp);
  if (expected !== signature) return false;
  // Reject if timestamp is older than 5 minutes
  const age = Math.abs(Date.now() - timestamp);
  if (age > 5 * 60 * 1000) return false;
  return true;
}

/** Middleware for Express: verify HMAC on internal API requests */
export function requireInternalAuth(req: any, res: any, next: any) {
  const signature = String(req.headers["x-signature"] ?? "");
  const timestamp = Number(req.headers["x-timestamp"] ?? 0);
  const body = JSON.stringify(req.body ?? {});

  if (!verifySignature(body, timestamp, signature)) {
    return res.status(401).json({ ok: false, error: "invalid_signature" });
  }
  next();
}
