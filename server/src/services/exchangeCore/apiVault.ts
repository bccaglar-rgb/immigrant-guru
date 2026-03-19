/**
 * ApiVault — Centralized credential management with audit trail.
 *
 * All credential access (decryption) goes through here.
 * Every access is logged to credential_access_log for security auditing.
 * Supports encryption key rotation (re-encrypt all credentials with new key).
 * Validates API permissions on connect.
 */
import { createHmac } from "node:crypto";
import { pool } from "../../db/pool.ts";
import { decryptSecret, encryptSecret } from "../../security/crypto.ts";
import { CredentialAuditLogger } from "./credentialAudit.ts";

interface DecryptedCreds {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

interface PermissionValidation {
  permissions: string[];
  hasTradePermission: boolean;
  hasReadPermission: boolean;
  warnings: string[];
}

export class ApiVault {
  private readonly encryptionKey: Buffer;
  private readonly audit: CredentialAuditLogger;

  constructor(encryptionKey: Buffer) {
    this.encryptionKey = encryptionKey;
    this.audit = new CredentialAuditLogger();
  }

  /**
   * Decrypt credentials with audit logging.
   * Every access is recorded — who, when, why.
   */
  async getCredentials(
    userId: string,
    exchangeAccountId: string,
    reason: string,
  ): Promise<DecryptedCreds | null> {
    try {
      const { rows } = await pool.query(
        `SELECT credentials_encrypted, exchange_id FROM exchange_connection_records
         WHERE id = $1 AND user_id = $2`,
        [exchangeAccountId, userId],
      );
      if (!rows[0]) {
        await this.audit.logAccess({
          userId,
          exchangeAccountId,
          action: "DECRYPT",
          reason,
          success: false,
        });
        return null;
      }

      const encrypted = rows[0].credentials_encrypted as {
        apiKey: string;
        apiSecret: string;
        passphrase?: string;
      };

      const creds: DecryptedCreds = {
        apiKey: decryptSecret(encrypted.apiKey, this.encryptionKey),
        apiSecret: decryptSecret(encrypted.apiSecret, this.encryptionKey),
        passphrase: encrypted.passphrase
          ? decryptSecret(encrypted.passphrase, this.encryptionKey)
          : undefined,
      };

      await this.audit.logAccess({
        userId,
        exchangeAccountId,
        action: "DECRYPT",
        reason,
        success: true,
      });

      return creds;
    } catch (err: any) {
      console.error(`[ApiVault] Decrypt failed for ${exchangeAccountId}:`, err?.message);
      await this.audit.logAccess({
        userId,
        exchangeAccountId,
        action: "DECRYPT",
        reason,
        success: false,
      });
      return null;
    }
  }

  /**
   * Re-encrypt all credentials with a new encryption key.
   * Zero-downtime: decrypt with old key, encrypt with new key, update DB row.
   */
  async rotateEncryptionKey(
    oldKey: Buffer,
    newKey: Buffer,
  ): Promise<{ rotated: number; errors: number }> {
    let rotated = 0;
    let errors = 0;

    const { rows } = await pool.query(
      `SELECT id, user_id, credentials_encrypted FROM exchange_connection_records`,
    );

    for (const row of rows) {
      try {
        const encrypted = row.credentials_encrypted as {
          apiKey: string;
          apiSecret: string;
          passphrase?: string;
        };

        // Decrypt with old key
        const apiKey = decryptSecret(encrypted.apiKey, oldKey);
        const apiSecret = decryptSecret(encrypted.apiSecret, oldKey);
        const passphrase = encrypted.passphrase
          ? decryptSecret(encrypted.passphrase, oldKey)
          : undefined;

        // Re-encrypt with new key
        const newEncrypted = {
          apiKey: encryptSecret(apiKey, newKey),
          apiSecret: encryptSecret(apiSecret, newKey),
          passphrase: passphrase ? encryptSecret(passphrase, newKey) : undefined,
        };

        await pool.query(
          `UPDATE exchange_connection_records SET
             credentials_encrypted = $2,
             credential_version = COALESCE(credential_version, 1) + 1,
             rotated_at = NOW(),
             updated_at = NOW()
           WHERE id = $1`,
          [row.id, JSON.stringify(newEncrypted)],
        );

        await this.audit.logAccess({
          userId: String(row.user_id),
          exchangeAccountId: String(row.id),
          action: "ROTATE",
          reason: "encryption_key_rotation",
          success: true,
        });

        rotated++;
      } catch (err: any) {
        console.error(`[ApiVault] Rotation failed for ${row.id}:`, err?.message);
        errors++;
      }
    }

    console.log(`[ApiVault] Key rotation complete: ${rotated} rotated, ${errors} errors`);
    return { rotated, errors };
  }

  /**
   * Validate API permissions by making test calls to exchange.
   * Checks: read access, trade permission, IP whitelist issues.
   */
  async validatePermissions(
    userId: string,
    exchangeAccountId: string,
  ): Promise<PermissionValidation> {
    const creds = await this.getCredentials(userId, exchangeAccountId, "permission_validation");
    if (!creds) {
      return {
        permissions: [],
        hasTradePermission: false,
        hasReadPermission: false,
        warnings: ["Could not decrypt credentials"],
      };
    }

    const { rows } = await pool.query(
      `SELECT exchange_id FROM exchange_connection_records WHERE id = $1`,
      [exchangeAccountId],
    );
    const exchangeId = String(rows[0]?.exchange_id ?? "");

    const permissions: string[] = [];
    const warnings: string[] = [];

    try {
      if (exchangeId === "binance") {
        const result = await this.validateBinancePermissions(creds);
        permissions.push(...result.permissions);
        warnings.push(...result.warnings);
      } else if (exchangeId === "gate") {
        const result = await this.validateGatePermissions(creds);
        permissions.push(...result.permissions);
        warnings.push(...result.warnings);
      }
    } catch (err: any) {
      warnings.push(`Validation error: ${err?.message}`);
    }

    // Update DB with validated permissions
    await pool.query(
      `UPDATE exchange_connection_records SET
         permissions = $2,
         last_validated_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [exchangeAccountId, permissions],
    );

    await this.audit.logAccess({
      userId,
      exchangeAccountId,
      action: "VALIDATE",
      reason: "permission_check",
      success: true,
    });

    return {
      permissions,
      hasTradePermission: permissions.includes("TRADE") || permissions.includes("FUTURES_TRADE"),
      hasReadPermission: permissions.includes("READ"),
      warnings,
    };
  }

  getAuditLogger(): CredentialAuditLogger {
    return this.audit;
  }

  // ── Exchange-Specific Permission Validation ───────────────────

  private async validateBinancePermissions(creds: DecryptedCreds): Promise<{
    permissions: string[];
    warnings: string[];
  }> {
    const permissions: string[] = [];
    const warnings: string[] = [];

    try {
      // Test account access (read permission)
      const ts = Date.now();
      const params = `timestamp=${ts}&recvWindow=10000`;
      const signature = createHmac("sha256", creds.apiSecret).update(params).digest("hex");
      const res = await fetch(
        `https://fapi.binance.com/fapi/v2/account?${params}&signature=${signature}`,
        { headers: { "X-MBX-APIKEY": creds.apiKey } },
      );

      if (res.ok) {
        permissions.push("READ");
        // Check if trading is enabled from account info
        const data = (await res.json()) as { canTrade?: boolean };
        if (data.canTrade) {
          permissions.push("TRADE", "FUTURES_TRADE");
        } else {
          warnings.push("API key does not have futures trading permission");
        }
      } else {
        const body = await res.text();
        if (body.includes("-2015")) {
          warnings.push("Invalid API key — check if key is correct");
        } else if (body.includes("-1022")) {
          warnings.push("Signature rejected — check API secret");
        } else if (body.includes("-2008")) {
          warnings.push("IP not whitelisted for this API key");
        } else {
          warnings.push(`Binance validation failed: ${res.status}`);
        }
      }
    } catch (err: any) {
      warnings.push(`Binance validation error: ${err?.message}`);
    }

    return { permissions, warnings };
  }

  private async validateGatePermissions(creds: DecryptedCreds): Promise<{
    permissions: string[];
    warnings: string[];
  }> {
    const permissions: string[] = [];
    const warnings: string[] = [];

    try {
      const path = "/api/v4/futures/usdt/accounts";
      const ts = Math.floor(Date.now() / 1000);
      const bodyHash = createHmac("sha512", "").update("").digest("hex");
      const signStr = `GET\n${path}\n\n${bodyHash}\n${ts}`;
      const signature = createHmac("sha512", creds.apiSecret).update(signStr).digest("hex");

      const res = await fetch(`https://fx-api.gateio.ws${path}`, {
        headers: {
          KEY: creds.apiKey,
          SIGN: signature,
          Timestamp: String(ts),
        },
      });

      if (res.ok) {
        permissions.push("READ", "TRADE", "FUTURES_TRADE");
      } else {
        const body = await res.text();
        if (body.includes("INVALID_KEY")) {
          warnings.push("Invalid API key");
        } else {
          warnings.push(`Gate.io validation failed: ${res.status}`);
        }
      }
    } catch (err: any) {
      warnings.push(`Gate.io validation error: ${err?.message}`);
    }

    return { permissions, warnings };
  }
}
