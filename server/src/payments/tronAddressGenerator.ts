/**
 * TRON Address Generator — Uses keccak256 + secp256k1 (no TronWeb).
 *
 * TRON address derivation:
 * 1. Random 32-byte private key
 * 2. secp256k1 public key (uncompressed, 65 bytes)
 * 3. Drop 0x04 prefix → 64 bytes (x,y)
 * 4. Keccak256 hash → last 20 bytes = address bytes
 * 5. Prepend 0x41 (TRON mainnet prefix)
 * 6. Base58Check encode (double SHA256 checksum)
 */
import { randomBytes, createHash, createCipheriv, createDecipheriv, createECDH } from "node:crypto";
import createKeccakHash from "keccak";

// ── Base58Check ──
const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(data: Buffer): string {
  let num = BigInt("0x" + data.toString("hex"));
  let result = "";
  while (num > 0n) {
    result = BASE58_CHARS[Number(num % 58n)] + result;
    num /= 58n;
  }
  for (const byte of data) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}

function base58CheckEncode(payload: Buffer): string {
  const checksum = createHash("sha256").update(
    createHash("sha256").update(payload).digest()
  ).digest().subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

// ── AES-256-GCM encryption for private keys ──
export function encryptPrivateKey(privateKeyHex: string, encryptionKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(privateKeyHex, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString("hex"), tag: tag.toString("hex"), payload: encrypted.toString("hex") });
}

export function decryptPrivateKey(encryptedJson: string, encryptionKey: Buffer): string {
  const { iv, tag, payload } = JSON.parse(encryptedJson);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "hex")), decipher.final()]).toString("utf8");
}

// ── TRON Address Generation ──
export interface GeneratedWallet {
  address: string;
  privateKeyHex: string;
}

export function generateTronAddress(): GeneratedWallet {
  const privateKey = randomBytes(32);
  const privateKeyHex = privateKey.toString("hex");

  // Derive uncompressed public key (65 bytes: 04 + x + y)
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(privateKey);
  const publicKey = ecdh.getPublicKey();

  // Keccak256 of x,y coordinates (drop 04 prefix)
  const pubXY = publicKey.subarray(1);
  const hash = createKeccakHash("keccak256").update(pubXY).digest();

  // Last 20 bytes = address bytes
  const addressBytes = hash.subarray(hash.length - 20);

  // TRON mainnet prefix 0x41 + Base58Check
  const payload = Buffer.concat([Buffer.from([0x41]), addressBytes]);
  const address = base58CheckEncode(payload);

  return { address, privateKeyHex };
}

export function generateAddressPool(count: number): GeneratedWallet[] {
  const wallets: GeneratedWallet[] = [];
  for (let i = 0; i < count; i++) {
    wallets.push(generateTronAddress());
  }
  return wallets;
}
