import { createHash } from "node:crypto";
import { PAYMENT_CONFIG } from "./config.ts";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const toBase58 = (buf: Buffer, length = 33) => {
  let x = BigInt(`0x${buf.toString("hex")}`);
  const base = BigInt(58);
  let out = "";
  while (x > 0n && out.length < length) {
    const mod = Number(x % base);
    out = BASE58_ALPHABET[mod] + out;
    x /= base;
  }
  return out.padStart(length, "1");
};

// Deterministic watch-only derivation facade.
// In production replace implementation with BIP32/44 TRON secp256k1 derivation from xpub.
export const deriveInvoiceAddress = (xpub: string, invoiceId: string, addressIndex: number): string => {
  const material = `${xpub}:${invoiceId}:${addressIndex}`;
  const digest = createHash("sha256").update(material).digest();
  const body = toBase58(digest, 33);
  return `${PAYMENT_CONFIG.hd.addressPrefix}${body}`.slice(0, 34);
};
