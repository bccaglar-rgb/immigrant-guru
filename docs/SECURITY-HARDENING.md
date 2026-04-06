# Bitrium Security Hardening

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: CRITICAL -- financial platform with real money at stake

---

## Table of Contents

1. [Threat Model](#threat-model)
2. [Vulnerability Assessment (Ranked by Severity)](#vulnerability-assessment)
3. [Critical #1: Plaintext API Keys](#critical-1-plaintext-api-keys)
4. [Secrets Management](#secrets-management)
5. [Authentication and Session Redesign](#authentication-and-session-redesign)
6. [Authorization and RBAC](#authorization-and-rbac)
7. [Web Application Security](#web-application-security)
8. [Rate Limiting Improvements](#rate-limiting-improvements)
9. [Webhook Hardening](#webhook-hardening)
10. [Secure Logging](#secure-logging)
11. [Admin Hardening](#admin-hardening)
12. [Audit Trail](#audit-trail)
13. [Key Rotation](#key-rotation)
14. [Incident Response Checklist](#incident-response-checklist)

---

## 1. Threat Model

### Assets to Protect

| Asset | Classification | Impact if Compromised |
|-------|---------------|----------------------|
| User exchange API keys | CRITICAL | Direct financial loss, unauthorized trades |
| User credentials (passwords) | CRITICAL | Account takeover |
| Payment wallet private keys | CRITICAL | Theft of payment funds |
| JWT signing secret | HIGH | Mass session hijacking |
| Database credentials | HIGH | Full data breach |
| User PII (email, IP) | HIGH | Privacy violation, regulatory |
| AI provider API keys | MEDIUM | Service disruption, cost abuse |
| Market data | LOW | Competitive intelligence |

### Threat Actors

| Actor | Motivation | Capability | Primary Vectors |
|-------|-----------|------------|-----------------|
| External attacker | Financial gain | Medium-High | API exploitation, injection, credential stuffing |
| Insider (compromised dev) | Financial gain | High | Direct DB access, secret exfiltration |
| Automated bot | Credential stuffing | Medium | Brute force, API abuse |
| Competitor | Intelligence | Low-Medium | Scraping, OSINT |

### Attack Surface

```
Internet -> Nginx -> Express API (3 workers) -> PostgreSQL
                  -> WS Gateway               -> Redis
                  -> Static assets (Vite build)
                  -> GitHub Actions (CI/CD)
                  -> DigitalOcean API
```

---

## 2. Vulnerability Assessment (Ranked by Severity)

| # | Vulnerability | Severity | CVSS Est. | Status | Fix Effort |
|---|--------------|----------|-----------|--------|------------|
| 1 | Plaintext API keys in JSONB | CRITICAL | 9.8 | Known | 1 week |
| 2 | No refresh token rotation | HIGH | 8.5 | Known | 3 days |
| 3 | JWT secret in .env file | HIGH | 8.0 | Known | 2 days |
| 4 | No session revocation mechanism | HIGH | 7.5 | Known | 3 days |
| 5 | No device/IP anomaly detection | HIGH | 7.0 | Missing | 1 week |
| 6 | Secrets in environment variables (not vault) | MEDIUM | 6.5 | Known | 1 week |
| 7 | No CSRF protection on state-changing endpoints | MEDIUM | 6.0 | Unknown | 2 days |
| 8 | No rate limit on auth endpoints | MEDIUM | 6.0 | Unknown | 1 day |
| 9 | Admin endpoints use same auth as user | MEDIUM | 5.5 | Known | 3 days |
| 10 | No audit trail for sensitive operations | MEDIUM | 5.0 | Missing | 1 week |
| 11 | Logs may contain sensitive data | MEDIUM | 5.0 | Unknown | 2 days |
| 12 | No webhook signature verification | MEDIUM | 5.0 | Unknown | 1 day |
| 13 | No Content-Security-Policy header | LOW | 4.0 | Missing | 1 day |
| 14 | No Subresource Integrity for CDN assets | LOW | 3.0 | Missing | 1 day |

---

## 3. Critical #1: Plaintext API Keys

### Current State

API keys are stored as plaintext in a JSONB column:

```sql
-- CURRENT (INSECURE)
SELECT api_keys FROM user_exchange_configs WHERE user_id = 123;
-- Returns: {"binance": {"apiKey": "abc123", "secret": "xyz789"}, ...}
```

If the database is compromised (SQL injection, backup leak, insider access), all user exchange API keys are immediately usable by the attacker.

### Solution: AES-256-GCM Encryption with Key Hierarchy

```
Master Key (KEK) -- stored in Vault/DO Secrets, never in DB
    |
    +-- User DEK (per-user, encrypted with KEK, stored in DB)
            |
            +-- Encrypted API keys (encrypted with DEK, stored in JSONB)
```

### Implementation

```javascript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

class ApiKeyEncryption {
  constructor(masterKey) {
    // masterKey loaded from Vault/DO Secrets at startup
    this.masterKey = Buffer.from(masterKey, 'hex'); // 32 bytes
  }

  /**
   * Encrypt a plaintext API key.
   * Returns: base64 string of (salt + iv + authTag + ciphertext)
   */
  encrypt(plaintext) {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = scryptSync(this.masterKey, salt, 32);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack: salt(32) + iv(16) + authTag(16) + ciphertext
    const packed = Buffer.concat([salt, iv, authTag, encrypted]);
    return packed.toString('base64');
  }

  /**
   * Decrypt an encrypted API key.
   */
  decrypt(encryptedBase64) {
    const packed = Buffer.from(encryptedBase64, 'base64');

    const salt = packed.subarray(0, SALT_LENGTH);
    const iv = packed.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = packed.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const derivedKey = scryptSync(this.masterKey, salt, 32);
    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }
}
```

### Migration Plan

```sql
-- 1. Add encrypted column
ALTER TABLE user_exchange_configs ADD COLUMN api_keys_encrypted TEXT;

-- 2. Run migration script (application-level, not SQL)
--    For each row: encrypt api_keys JSONB -> store in api_keys_encrypted

-- 3. Update application code to read from api_keys_encrypted

-- 4. Verify all reads work correctly (shadow read for 1 week)

-- 5. Wipe plaintext column
UPDATE user_exchange_configs SET api_keys = '{}'::jsonb;

-- 6. Drop plaintext column in next release
ALTER TABLE user_exchange_configs DROP COLUMN api_keys;
```

### Key Storage Decision

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Environment variable | Simple, no dependencies | Visible in process list, .env files | Phase 1 (temporary) |
| DigitalOcean Secrets | Managed, API access | DO-specific lock-in | Phase 2 (recommended) |
| HashiCorp Vault | Industry standard, rotation, audit | Operational overhead | Phase 3 (if needed) |

---

## 4. Secrets Management

### Current Secrets Inventory

| Secret | Current Location | Target Location |
|--------|-----------------|-----------------|
| DATABASE_URL | .env file | DO Secrets |
| REDIS_URL | .env file | DO Secrets |
| JWT_SECRET | .env file | DO Secrets |
| API_KEY_MASTER_KEY | N/A (new) | DO Secrets |
| OPENAI_API_KEY | .env file | DO Secrets |
| ANTHROPIC_API_KEY | .env file | DO Secrets |
| TRON_WALLET_PRIVATE_KEY | .env file | DO Secrets (critical) |
| GITHUB_TOKEN | GitHub Actions | GitHub Secrets (already) |

### Secret Rotation Schedule

| Secret | Rotation Frequency | Automated? |
|--------|-------------------|------------|
| JWT_SECRET | Every 90 days | Yes (dual-key validation during rotation) |
| DATABASE_URL (password) | Every 90 days | Yes (managed PG) |
| API_KEY_MASTER_KEY | Every 180 days | Semi (re-encrypt all keys) |
| AI provider keys | Every 180 days | Manual |
| TRON wallet key | Never rotate (address changes) | N/A |

---

## 5. Authentication and Session Redesign

### Current Issues

- Single long-lived JWT (no refresh token)
- No session revocation (JWT valid until expiry)
- No device tracking
- TOTP 2FA exists but not enforced for sensitive operations

### Target: Access + Refresh Token Architecture

```
Login Flow:
1. POST /auth/login { email, password }
2. Verify password (pbkdf2)
3. If 2FA enabled: return { requires2FA: true, tempToken }
4. POST /auth/2fa/verify { tempToken, totpCode }
5. Issue tokens:
   - Access token: 15 min expiry, stored in memory
   - Refresh token: 7 day expiry, HttpOnly secure cookie
   - Session record in Redis: { userId, deviceId, ip, ua, createdAt, lastUsedAt }

Token Refresh:
1. POST /auth/refresh (cookie sends refresh token)
2. Validate refresh token against Redis session
3. Check for anomalies (IP change, device change)
4. Issue new access token
5. Rotate refresh token (one-time use)

Session Revocation:
- DELETE /auth/sessions/:sessionId (user-initiated)
- DELETE /auth/sessions (revoke all -- password change, account compromise)
- Admin: DELETE /admin/users/:userId/sessions
```

### Refresh Token Storage

```sql
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    token_hash      TEXT NOT NULL,       -- SHA-256 hash of token
    device_id       TEXT,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    replaced_by     UUID REFERENCES refresh_tokens(id)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);
```

### Device and IP Anomaly Detection

```javascript
async function checkLoginAnomaly(userId, currentIp, currentDevice) {
  const recentSessions = await db.query(`
    SELECT ip_address, device_id, created_at
    FROM refresh_tokens
    WHERE user_id = $1 AND revoked_at IS NULL
    ORDER BY created_at DESC LIMIT 10
  `, [userId]);

  const knownIPs = new Set(recentSessions.rows.map(r => r.ip_address));
  const knownDevices = new Set(recentSessions.rows.map(r => r.device_id));

  const anomalies = [];

  if (!knownIPs.has(currentIp)) {
    anomalies.push({ type: 'new_ip', ip: currentIp });
  }

  if (!knownDevices.has(currentDevice)) {
    anomalies.push({ type: 'new_device', device: currentDevice });
  }

  // Check for impossible travel (IP geolocation)
  const lastSession = recentSessions.rows[0];
  if (lastSession) {
    const timeDiff = Date.now() - new Date(lastSession.created_at).getTime();
    const distance = geoDistance(lastSession.ip_address, currentIp);
    if (distance > 500 && timeDiff < 3600000) { // 500km in < 1hr
      anomalies.push({ type: 'impossible_travel', distance, timeDiff });
    }
  }

  return anomalies;
}
```

**On anomaly detection:**
- Low risk (new IP, same country): Allow login, send email notification
- Medium risk (new device + new IP): Require 2FA even if not enabled
- High risk (impossible travel): Block login, send email with unlock link

---

## 6. Authorization and RBAC

### Role Definitions

```javascript
const ROLES = {
  user: {
    permissions: ['read:own_profile', 'write:own_profile', 'read:market_data',
                  'write:api_keys', 'read:own_invoices', 'write:own_invoices',
                  'read:ai_analysis', 'write:alerts']
  },
  admin: {
    inherits: 'user',
    permissions: ['read:all_users', 'write:user_status', 'read:all_invoices',
                  'read:system_metrics', 'write:system_config', 'read:audit_logs',
                  'write:announcements']
  },
  super_admin: {
    inherits: 'admin',
    permissions: ['delete:users', 'write:roles', 'read:secrets_audit',
                  'write:feature_flags', 'execute:maintenance']
  }
};
```

### Middleware Implementation

```javascript
function requirePermission(...permissions) {
  return (req, res, next) => {
    const userPermissions = resolvePermissions(req.user.role);
    const hasAll = permissions.every(p => userPermissions.has(p));
    if (!hasAll) {
      auditLog('authorization_denied', {
        userId: req.user.id, required: permissions, had: req.user.role
      });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Usage
app.get('/admin/users', requirePermission('read:all_users'), adminController.listUsers);
app.delete('/admin/users/:id', requirePermission('delete:users'), adminController.deleteUser);
```

---

## 7. Web Application Security

### SSRF Prevention

```javascript
// Validate URLs before making server-side requests
function validateUrl(url) {
  const parsed = new URL(url);

  // Block internal/private IPs
  const blockedPatterns = [
    /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^127\./, /^0\./, /^169\.254\./, /^::1$/, /^fc00:/
  ];

  const resolved = dns.resolve(parsed.hostname);
  if (blockedPatterns.some(p => p.test(resolved))) {
    throw new Error('SSRF: Internal address blocked');
  }

  // Allowlist for external API calls
  const allowedHosts = ['api.binance.com', 'api.bybit.com', 'api.okx.com',
                         'api.gateio.ws', 'api.openai.com', 'api.anthropic.com'];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error('SSRF: Host not in allowlist');
  }
}
```

### CSRF Protection

```javascript
// For API endpoints (SPA with JWT): verify Origin header
function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.get('Origin') || req.get('Referer');
    const allowed = [process.env.FRONTEND_URL];
    if (!origin || !allowed.some(a => origin.startsWith(a))) {
      return res.status(403).json({ error: 'CSRF validation failed' });
    }
  }
  next();
}
```

### XSS Prevention

```javascript
// Content-Security-Policy header
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",  // Required for Tailwind
    "img-src 'self' data: https:",
    "connect-src 'self' wss://*.bitrium.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  next();
});

// Additional security headers
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' }
}));
```

### SQL Injection Prevention

- All queries use parameterized statements (already in place with pg library)
- Audit all raw SQL for string concatenation:
  ```bash
  grep -r "query(\`" src/ --include="*.js" --include="*.ts"
  grep -r '+ .*query' src/ --include="*.js" --include="*.ts"
  ```
- Add eslint rule to flag template literals in query calls

---

## 8. Rate Limiting Improvements

### Tiered Rate Limits

| Endpoint Group | Explorer | Trader | Titan | Unauthenticated |
|---------------|----------|--------|-------|-----------------|
| Auth (login/register) | -- | -- | -- | 5/min per IP |
| Auth (2FA verify) | -- | -- | -- | 3/min per IP |
| Auth (password reset) | -- | -- | -- | 2/min per IP |
| API general | 60/min | 120/min | 300/min | 20/min per IP |
| AI analysis | 10/hr | 30/hr | 100/hr | -- |
| Payment creation | 5/hr | 10/hr | 20/hr | -- |
| Admin endpoints | -- | -- | -- | 30/min per admin |

### Implementation with Redis Sliding Window

```javascript
async function slidingWindowRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, Math.ceil(windowMs / 1000));

  const results = await pipeline.exec();
  const count = results[2][1];

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetAt: windowStart + windowMs
  };
}
```

---

## 9. Webhook Hardening

### Outgoing Webhooks (to users)

```javascript
function signWebhook(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');

  return {
    'X-Bitrium-Signature': `t=${timestamp},v1=${signature}`,
    'X-Bitrium-Timestamp': timestamp.toString()
  };
}
```

### Incoming Webhooks (from payment providers)

- Verify signature on every incoming webhook
- Reject webhooks older than 5 minutes (replay protection)
- Idempotency key to prevent duplicate processing
- Queue webhooks for async processing (don't block the HTTP response)

---

## 10. Secure Logging

### What to Log

```javascript
// Structured log with sensitive data redacted
const log = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.apiKey',
      'req.body.secret',
      'req.body.totpCode',
      '*.api_keys',
      '*.api_keys_encrypted'
    ],
    censor: '[REDACTED]'
  }
});
```

### What Never to Log

- Passwords (even hashed)
- API keys (plaintext or encrypted)
- JWT tokens (log session ID instead)
- TOTP codes
- Payment wallet private keys
- Full credit card numbers
- Personal identification numbers

---

## 11. Admin Hardening

### Admin Access Requirements

1. Separate admin authentication flow (not just role check)
2. Admin sessions require 2FA always (no opt-out)
3. Admin actions require re-authentication for sensitive operations
4. Admin IP allowlist (optional, configurable)
5. Admin session timeout: 30 minutes (vs 24 hours for users)

### Admin Endpoint Isolation

```javascript
// Separate Express router with additional middleware stack
const adminRouter = express.Router();

adminRouter.use(requireAuth);                    // JWT validation
adminRouter.use(requireRole('admin'));            // Role check
adminRouter.use(require2FA);                     // 2FA verified in last 30 min
adminRouter.use(adminRateLimit);                 // Stricter rate limits
adminRouter.use(auditMiddleware('admin'));        // Log all admin actions

app.use('/admin', adminRouter);
```

---

## 12. Audit Trail

### Events to Audit

| Category | Events |
|----------|--------|
| Authentication | login, logout, failed_login, 2fa_setup, 2fa_verify, password_change |
| Authorization | permission_denied, role_change |
| API Keys | key_added, key_updated, key_deleted, key_accessed |
| Payments | invoice_created, payment_received, payment_confirmed, refund_initiated |
| Admin | user_suspended, user_deleted, config_changed, system_maintenance |
| Security | rate_limited, ip_banned, session_revoked, anomaly_detected |

### Audit Log Schema

```sql
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id    INTEGER,                    -- user who performed action (NULL for system)
    actor_ip    INET,
    actor_ua    TEXT,
    event_type  TEXT NOT NULL,
    resource    TEXT NOT NULL,               -- e.g., 'user:123', 'invoice:abc'
    action      TEXT NOT NULL,               -- e.g., 'create', 'update', 'delete'
    details     JSONB,                       -- event-specific data (redacted)
    severity    TEXT DEFAULT 'info'          -- info, warning, critical
);

CREATE INDEX idx_audit_actor ON audit_logs (actor_id, timestamp DESC);
CREATE INDEX idx_audit_event ON audit_logs (event_type, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_logs (resource, timestamp DESC);
CREATE INDEX idx_audit_severity ON audit_logs (severity, timestamp DESC)
    WHERE severity IN ('warning', 'critical');
```

### Audit Log Rules

- Audit logs are append-only (no UPDATE or DELETE)
- Separate database user with INSERT-only permission on audit_logs table
- Retention: 7 years (financial compliance)
- Tamper detection: daily checksum of audit log entries

---

## 13. Key Rotation

### JWT Secret Rotation (Zero Downtime)

```javascript
// Support dual-key validation during rotation window
const JWT_KEYS = {
  current: process.env.JWT_SECRET_CURRENT,
  previous: process.env.JWT_SECRET_PREVIOUS  // valid for 24 hours after rotation
};

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_KEYS.current);
  } catch (e) {
    if (JWT_KEYS.previous) {
      return jwt.verify(token, JWT_KEYS.previous);
    }
    throw e;
  }
}

// Always sign with current key
function signToken(payload) {
  return jwt.sign(payload, JWT_KEYS.current, { expiresIn: '15m' });
}
```

### API Key Master Key Rotation

1. Generate new master key
2. Re-encrypt all user API keys with new master key (background job)
3. Store both old and new key during migration
4. Verify all decryptions work with new key
5. Remove old key

---

## 14. Incident Response Checklist

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|---------|
| P1 - Critical | Active breach, data exfiltration | Immediate | DB dump leaked, API keys compromised |
| P2 - High | Vulnerability being exploited | < 1 hour | Brute force attack, injection attempt |
| P3 - Medium | Vulnerability discovered, not exploited | < 24 hours | New CVE in dependency |
| P4 - Low | Security improvement needed | < 1 week | Missing header, log improvement |

### P1 Incident Response

```
IMMEDIATE (0-15 minutes):
[ ] Confirm the incident (not a false positive)
[ ] Activate incident commander
[ ] Preserve evidence (snapshot DB, save logs)
[ ] Assess scope (which data? which users?)

CONTAIN (15-60 minutes):
[ ] Revoke compromised credentials
[ ] Block attacker IP/access
[ ] Rotate affected secrets
[ ] If API keys compromised: notify affected users to rotate exchange keys
[ ] If DB compromised: force password reset for all users

ERADICATE (1-24 hours):
[ ] Identify attack vector
[ ] Patch vulnerability
[ ] Verify no backdoors installed
[ ] Review all recent changes

RECOVER (24-72 hours):
[ ] Restore from clean backup if needed
[ ] Re-enable services with monitoring
[ ] Verify system integrity

POST-INCIDENT (1-2 weeks):
[ ] Write post-mortem
[ ] Update security controls
[ ] Notify affected users (GDPR: within 72 hours)
[ ] Review and update this checklist
```

### Emergency Contacts

```
Incident Commander: [TBD]
DigitalOcean Support: support ticket + phone
Domain Registrar: [TBD]
Legal Counsel: [TBD]
```

---

## Appendix: Security Headers Checklist

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: [see section 7]
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-XSS-Protection: 0  (CSP supersedes this; 0 avoids edge cases)
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```
