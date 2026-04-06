import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY
  ? Buffer.from(process.env.ENCRYPTION_MASTER_KEY, "hex")
  : randomBytes(32); // fallback for dev — in prod MUST be set

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  try {
    const [ivHex, tagHex, encHex] = ciphertext.split(":");
    if (!ivHex || !tagHex || !encHex) return ciphertext; // not encrypted, return as-is (migration compat)
    const decipher = createDecipheriv("aes-256-gcm", MASTER_KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8");
  } catch {
    return ciphertext; // fallback: treat as plaintext (backward compat during migration)
  }
}

export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}
