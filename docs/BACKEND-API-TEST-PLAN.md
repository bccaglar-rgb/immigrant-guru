# Bitrium Backend API Test Plan

> **Version:** 1.0
> **Stack:** Node.js 22 + Express + PM2 (3 workers + market-hub), PostgreSQL + Redis
> **Last Updated:** 2026-04-04

---

## 1. Request Validation Tests

| # | Category | Test | Endpoint Example | Expected |
|---|---|---|---|---|
| 1 | Missing field | No `email` in login body | POST `/api/auth/login` | 400 `{error: "Email required"}` |
| 2 | Missing field | No `password` in login body | POST `/api/auth/login` | 400 `{error: "Password required"}` |
| 3 | Malformed JSON | `{broken` as body | Any POST | 400 `{error: "Invalid request body"}` |
| 4 | Wrong Content-Type | `text/plain` body | Any POST | 400 `{error: "Content-Type must be application/json"}` |
| 5 | Invalid enum | `side: "sideways"` in order | POST `/api/exchange/order` | 400 `{error: "side must be buy or sell"}` |
| 6 | Negative number | `quantity: -5` | POST `/api/exchange/order` | 400 `{error: "Quantity must be positive"}` |
| 7 | Zero value | `quantity: 0` | POST `/api/exchange/order` | 400 `{error: "Quantity must be > 0"}` |
| 8 | Overflow number | `quantity: 99999999999999` | POST `/api/exchange/order` | 400 `{error: "Quantity exceeds maximum"}` |
| 9 | String instead of number | `quantity: "five"` | POST `/api/exchange/order` | 400 `{error: "Quantity must be a number"}` |
| 10 | Extra fields | `{email, password, isAdmin: true}` | POST `/api/auth/register` | Extra fields stripped, registration proceeds normally |
| 11 | Array instead of object | `[{email: "..."}]` | POST `/api/auth/login` | 400 `{error: "Invalid request body"}` |
| 12 | Empty body | `{}` | POST `/api/auth/login` | 400 with all required field errors |
| 13 | SQL in string field | `name: "'; DROP TABLE users;--"` | POST `/api/bots` | Sanitized, no SQL execution |
| 14 | XSS in string field | `name: "<script>alert(1)</script>"` | POST `/api/bots` | Sanitized, stored safely |
| 15 | Very long string | 1MB string in `name` field | POST `/api/bots` | 400 `{error: "Name too long"}` or body size limit |
| 16 | Invalid coin ID | `coinId: "DOESNOTEXIST"` | GET `/api/coins/DOESNOTEXIST` | 404 `{error: "Coin not found"}` |
| 17 | Invalid UUID format | `userId: "not-a-uuid"` | GET `/api/admin/users/not-a-uuid` | 400 `{error: "Invalid user ID format"}` |
| 18 | Boundary: page 0 | `?page=0` | GET `/api/coins` | 400 or treated as page 1 |
| 19 | Boundary: page -1 | `?page=-1` | GET `/api/coins` | 400 `{error: "Page must be positive"}` |
| 20 | Boundary: limit 10000 | `?limit=10000` | GET `/api/coins` | Capped to max (e.g., 100) |

---

## 2. Duplicate Request Handling

| # | Scenario | Expected |
|---|---|---|
| 1 | Double-click payment: two TRON payment initiations | Only one payment record created (idempotency key) |
| 2 | Double signup: same email, simultaneous requests | One succeeds, one gets 409 "Email already registered" |
| 3 | Double order submission | Without idempotency key: two orders. With key: one order |
| 4 | Double bot start | Second request: 409 "Bot already running" |
| 5 | Double plan subscription | Second request: "Already subscribed" or idempotent success |
| 6 | Concurrent profile updates | Last write wins, no data corruption |
| 7 | Double password change with same token | First succeeds, second fails (token invalidated) |

---

## 3. Idempotency Tests

| # | Scenario | Expected |
|---|---|---|
| 1 | TRON webhook replayed | Same `txHash` ignored on second delivery |
| 2 | Payment confirmation webhook, duplicate | Subscription not extended twice |
| 3 | Exchange order webhook, duplicate fill | Position not doubled |
| 4 | Bot action replayed | Action executed once, duplicates rejected |
| 5 | Idempotency key header (`X-Idempotency-Key`) | Same key within window returns cached response |
| 6 | Idempotency key with different body | Returns error (key reuse with different payload) |
| 7 | Idempotency key expiry | After 24h, same key treated as new request |

---

## 4. Timeout Scenarios

| # | Service | Scenario | Expected |
|---|---|---|---|
| 1 | OpenAI API | 30s timeout on AI insight request | Return 504 `{error: "AI service timeout"}` |
| 2 | Claude API | Timeout during War Room analysis | Return 504 with fallback message |
| 3 | Qwen API | Timeout during coin analysis | Return 504, frontend shows "AI unavailable" |
| 4 | Binance API | 10s timeout on order placement | Return 504 `{error: "Exchange timeout"}` |
| 5 | Gate.io API | Timeout on market data fetch | Return cached data if available, 504 otherwise |
| 6 | Bybit API | Timeout on balance check | Return 504, frontend shows stale balance |
| 7 | OKX API | Timeout on order book fetch | Return 504, order book shows stale data |
| 8 | PostgreSQL | Query timeout (30s) | Return 500 `{error: "Database timeout"}` |
| 9 | Redis | Connection timeout | Fallback to DB for session check, degrade gracefully |
| 10 | TRON network | Payment verification timeout | Retry with exponential backoff, notify user |

---

## 5. Redis Unavailable Behavior

| # | Dependent Feature | Expected Behavior When Redis Down |
|---|---|---|
| 1 | Rate limiting | Fallback to in-memory rate limiting per PM2 worker |
| 2 | Token blacklist | Fallback to short JWT TTL, log warning |
| 3 | Session cache | Read from PostgreSQL (slower but functional) |
| 4 | WebSocket pub/sub | Market-hub cannot broadcast to workers, WS degraded |
| 5 | Price cache | Direct exchange API calls (increased latency) |
| 6 | Queue (if used) | Requests fail, return 503 "Service temporarily unavailable" |
| 7 | Reconnection | Auto-reconnect with exponential backoff |
| 8 | Health check | `/api/health` reports Redis as unhealthy |

---

## 6. PostgreSQL Connection Pool Exhaustion

| # | Scenario | Expected |
|---|---|---|
| 1 | All pool connections in use | New requests queue, timeout after 10s |
| 2 | Pool timeout | Return 503 `{error: "Service temporarily unavailable"}` |
| 3 | Long-running query blocks pool | Query killed after timeout, connection returned to pool |
| 4 | Connection leak (unreleased connection) | Pool monitor alerts, connection reclaimed after idle timeout |
| 5 | DB restart | Pool detects broken connections, reconnects |
| 6 | Pool size under load test | 100 concurrent requests with pool size 20: queuing works |
| 7 | Health check during exhaustion | `/api/health` reports DB as degraded |

---

## 7. PM2 Worker Restart During Request

| # | Scenario | Expected |
|---|---|---|
| 1 | Worker crashes mid-request | Client gets connection reset, retries on another worker |
| 2 | Graceful restart (PM2 reload) | In-flight requests complete, new requests go to new worker |
| 3 | All workers restart simultaneously | Brief downtime, requests return 503 |
| 4 | Worker OOM kill | PM2 restarts worker, other workers handle traffic |
| 5 | Market-hub restart | WS connections drop, clients reconnect, data resync |
| 6 | Worker restart during WS connection | Client detects disconnect, reconnects to any available worker |
| 7 | Sticky sessions (if used) | After worker restart, client re-routed to new worker |

---

## 8. Unhandled Promise Rejections

- [ ] Global `unhandledRejection` handler logs error with stack trace
- [ ] Process does NOT crash on unhandled rejection (Node 22 default: warning)
- [ ] PM2 restarts worker if it does crash
- [ ] Every `async` Express route handler wrapped in try/catch or async error middleware
- [ ] Every `Promise` chain has `.catch()` or is `await`ed in try/catch
- [ ] Database queries wrapped in error handlers
- [ ] Exchange API calls wrapped in error handlers
- [ ] AI API calls wrapped in error handlers
- [ ] WebSocket message handlers wrapped in try/catch
- [ ] Cron jobs / scheduled tasks have error handling

---

## 9. Wrong HTTP Status Codes

| Scenario | Common Bug | Correct Status |
|---|---|---|
| Validation error | Returns 500 instead of 400 | 400 Bad Request |
| Resource not found | Returns 200 with empty body | 404 Not Found |
| Unauthorized | Returns 403 instead of 401 | 401 Unauthorized (no/invalid token) |
| Forbidden | Returns 401 instead of 403 | 403 Forbidden (valid token, insufficient permission) |
| Rate limited | Returns 500 instead of 429 | 429 Too Many Requests |
| Server error | Returns 200 with error in body | 500 Internal Server Error |
| Created resource | Returns 200 instead of 201 | 201 Created |
| Deleted resource | Returns 200 instead of 204 | 204 No Content |
| Method not allowed | Returns 404 instead of 405 | 405 Method Not Allowed |
| Conflict (duplicate) | Returns 400 instead of 409 | 409 Conflict |

---

## 10. Error Response Consistency

Every error response MUST follow this schema:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "requestId": "uuid-v4",
  "timestamp": "2026-04-04T12:00:00Z"
}
```

Checklist:
- [ ] Every endpoint returns JSON on error (never HTML, never plain text)
- [ ] Every error has `error` field with human-readable message
- [ ] Every error has `code` field with machine-readable code
- [ ] Every response has `requestId` for correlation
- [ ] No stack traces in production responses
- [ ] No database column names in error messages
- [ ] No internal service names in error messages
- [ ] 500 errors return generic message, details only in logs
- [ ] Content-Type is always `application/json` for errors
- [ ] CORS headers present on error responses (not just success)

---

## 11. Silent Failures (200 OK But Nothing Happened)

| # | Scenario | How to Detect |
|---|---|---|
| 1 | Order placed but not sent to exchange | Verify order exists in exchange via API |
| 2 | Payment confirmed but plan not activated | Check user's plan status after webhook |
| 3 | Bot started but no trades executing | Monitor bot activity logs |
| 4 | Password changed but old password still works | Attempt login with old password |
| 5 | 2FA enabled but login doesn't require code | Attempt login without 2FA step |
| 6 | User deleted but data remains | Check DB for orphaned records |
| 7 | Exchange API key saved but not validated | Test connection immediately after save |
| 8 | Notification sent but not delivered | Check notification delivery status |
| 9 | AI analysis requested but cached result returned | Verify freshness of AI response |
| 10 | Settings updated but not persisted | Refresh page, verify values |

---

## 12. Concurrency Bugs

| # | Scenario | Risk | Mitigation |
|---|---|---|---|
| 1 | Two payment webhooks for same tx, simultaneous | Plan activated twice, double credit | DB unique constraint on txHash + row lock |
| 2 | User subscribes while plan expiry cron runs | Race between activation and deactivation | Transaction isolation, check timestamps |
| 3 | Two orders placed simultaneously, insufficient balance | Both pass balance check, both execute | SELECT FOR UPDATE on balance row |
| 4 | Bot start + bot stop at same time | Inconsistent state | State machine with optimistic locking |
| 5 | Profile update from two tabs | Last write wins, may lose data | Version field (optimistic concurrency control) |
| 6 | Password change + login at same time | Login with old password succeeds | Transaction: change password + invalidate sessions atomically |
| 7 | Token refresh from multiple tabs | Multiple new tokens, old one still valid | Refresh token rotation with jitter |
| 8 | Market-hub processes same tick twice | Duplicate signals sent | Dedup by timestamp + symbol in Redis |

---

## 13. API Contract Checklist

### Auth Endpoints

| Method | Path | Auth | Request Body | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | None | `{email, password, name}` | 201 `{user, token}` | 400, 409 |
| POST | `/api/auth/login` | None | `{email, password}` | 200 `{user, token, requires2FA?}` | 400, 401, 403, 429 |
| POST | `/api/auth/login/2fa` | Partial | `{code, loginToken}` | 200 `{user, token}` | 400, 401, 429 |
| POST | `/api/auth/refresh` | Refresh | `{refreshToken}` | 200 `{token, refreshToken}` | 401 |
| POST | `/api/auth/logout` | JWT | None | 204 | 401 |

### User Endpoints

| Method | Path | Auth | Request Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/user/profile` | JWT | None | 200 `{user}` | 401 |
| PATCH | `/api/user/profile` | JWT | `{name?, email?}` | 200 `{user}` | 400, 401, 409 |
| POST | `/api/user/password` | JWT | `{currentPassword, newPassword}` | 200 | 400, 401 |
| POST | `/api/user/2fa/enable` | JWT | `{code}` | 200 `{backupCodes}` | 400, 401 |
| POST | `/api/user/2fa/disable` | JWT | `{password}` | 200 | 400, 401 |

### Exchange Endpoints

| Method | Path | Auth | Request Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/exchange/balances` | JWT+Plan | None | 200 `{balances[]}` | 401, 403, 502 |
| POST | `/api/exchange/order` | JWT+Plan | `{exchange, symbol, side, type, quantity, price?}` | 201 `{order}` | 400, 401, 403, 502 |
| GET | `/api/exchange/orders` | JWT+Plan | None | 200 `{orders[]}` | 401, 403 |
| DELETE | `/api/exchange/order/:id` | JWT+Plan | None | 204 | 401, 403, 404 |
| POST | `/api/exchange/keys` | JWT+Plan | `{exchange, apiKey, secret, passphrase?}` | 201 | 400, 401, 403 |

### Payment Endpoints

| Method | Path | Auth | Request Body | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/payment/subscribe` | JWT | `{plan, method}` | 200 `{paymentAddress, amount, expiresAt}` | 400, 401 |
| POST | `/api/payment/webhook/tron` | Webhook | `{txHash, amount, from, to}` | 200 | 400, 401 |
| GET | `/api/payment/status/:id` | JWT | None | 200 `{status, plan, expiresAt}` | 401, 404 |

### AI Endpoints

| Method | Path | Auth | Request Body | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/ai/insight` | JWT+Plan | `{coinId, provider?}` | 200 `{analysis, provider}` | 400, 401, 403, 504 |
| POST | `/api/ai/chat` | JWT+Titan | `{message, context?}` | 200 `{response}` | 400, 401, 403, 504 |

### Admin Endpoints

| Method | Path | Auth | Request Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/admin/users` | Admin | None | 200 `{users[], total, page}` | 401, 403 |
| PATCH | `/api/admin/users/:id` | Admin | `{role?, plan?, disabled?}` | 200 `{user}` | 400, 401, 403, 404 |
| GET | `/api/admin/payments` | Admin | None | 200 `{payments[], total}` | 401, 403 |
| GET | `/api/admin/stats` | Admin | None | 200 `{userCount, revenue, ...}` | 401, 403 |

---

## 14. Correlation ID Design

Every request must carry a `requestId` for tracing.

### Flow
1. Client sends request (optionally with `X-Request-ID` header)
2. Server generates UUID v4 if no header present
3. `requestId` attached to every log line during request lifecycle
4. `requestId` returned in response headers (`X-Request-ID`)
5. `requestId` included in error response bodies
6. `requestId` propagated to downstream services (exchange APIs, AI providers)

### Log Format
```json
{
  "timestamp": "2026-04-04T12:00:00.000Z",
  "level": "info",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-uuid",
  "method": "POST",
  "path": "/api/exchange/order",
  "statusCode": 201,
  "duration": 245,
  "exchange": "binance",
  "message": "Order placed successfully"
}
```

### Downstream Propagation
| Downstream Service | Header | Purpose |
|---|---|---|
| Binance API | `X-MBX-REQUEST-ID` (custom) | Trace exchange calls |
| Gate.io API | Custom header | Trace exchange calls |
| OpenAI API | Logged locally | Correlate AI latency |
| TRON RPC | Logged locally | Correlate payment verification |
| Redis | Logged locally | Correlate cache operations |
| PostgreSQL | `/* requestId: uuid */` comment | Query tracing in slow query log |

---

## 15. Error Taxonomy

| Code | Category | Description | HTTP Status |
|---|---|---|---|
| `AUTH_REQUIRED` | auth_error | No authentication token provided | 401 |
| `AUTH_INVALID_TOKEN` | auth_error | Token malformed or signature invalid | 401 |
| `AUTH_TOKEN_EXPIRED` | auth_error | Token past expiration | 401 |
| `AUTH_TOKEN_REVOKED` | auth_error | Token in blacklist (post-logout) | 401 |
| `AUTH_INVALID_CREDENTIALS` | auth_error | Wrong email/password | 401 |
| `AUTH_2FA_REQUIRED` | auth_error | 2FA code needed to complete login | 401 |
| `AUTH_2FA_INVALID` | auth_error | Wrong 2FA code | 401 |
| `AUTH_FORBIDDEN` | auth_error | Valid auth but insufficient role/plan/tier | 403 |
| `VALIDATION_REQUIRED_FIELD` | validation_error | Missing required field | 400 |
| `VALIDATION_INVALID_FORMAT` | validation_error | Field format incorrect | 400 |
| `VALIDATION_OUT_OF_RANGE` | validation_error | Numeric value out of bounds | 400 |
| `VALIDATION_INVALID_ENUM` | validation_error | Value not in allowed set | 400 |
| `EXCHANGE_TIMEOUT` | exchange_error | Exchange API did not respond | 504 |
| `EXCHANGE_RATE_LIMIT` | exchange_error | Exchange rate limit hit | 429 |
| `EXCHANGE_INSUFFICIENT_BALANCE` | exchange_error | Not enough funds | 400 |
| `EXCHANGE_INVALID_ORDER` | exchange_error | Order rejected by exchange | 400 |
| `EXCHANGE_CONNECTION_FAILED` | exchange_error | Cannot reach exchange | 502 |
| `PAYMENT_EXPIRED` | payment_error | Payment window expired | 400 |
| `PAYMENT_INSUFFICIENT` | payment_error | Sent amount less than required | 400 |
| `PAYMENT_DUPLICATE` | payment_error | Transaction already processed | 409 |
| `PAYMENT_VERIFICATION_FAILED` | payment_error | Cannot verify on TRON network | 502 |
| `AI_TIMEOUT` | ai_error | AI provider did not respond | 504 |
| `AI_RATE_LIMIT` | ai_error | AI provider rate limited | 429 |
| `AI_PROVIDER_ERROR` | ai_error | AI provider returned error | 502 |
| `AI_CONTENT_FILTERED` | ai_error | AI response filtered by safety | 422 |
| `INTERNAL_ERROR` | internal_error | Unhandled server error | 500 |
| `INTERNAL_DB_ERROR` | internal_error | Database operation failed | 500 |
| `INTERNAL_REDIS_ERROR` | internal_error | Redis operation failed | 500 |
| `RATE_LIMIT_EXCEEDED` | rate_limit | Too many requests | 429 |
| `RESOURCE_NOT_FOUND` | not_found | Requested resource does not exist | 404 |
| `RESOURCE_CONFLICT` | conflict | Duplicate or conflicting resource | 409 |

---

## 16. Top 20 Likely Backend Bugs

| # | Bug | Where | Impact | Detection |
|---|---|---|---|---|
| 1 | Unhandled exchange API error crashes worker | Exchange service | PM2 restart, dropped requests | Error monitoring + PM2 restart count |
| 2 | Token blacklist not checked on every request | Auth middleware | Logged-out users can still call APIs | Security audit |
| 3 | Plan expiry check only at login, not per-request | Plan middleware | Expired users retain access until re-login | Access after expiry test |
| 4 | TRON webhook processes same tx twice | Payment handler | Double subscription credit | Duplicate tx test |
| 5 | SQL injection in admin user search | Admin API | Full database access | Penetration test |
| 6 | Race condition in balance deduction | Order placement | Negative balance | Concurrent order test |
| 7 | AI provider timeout not handled, request hangs | AI endpoints | Client timeout, no response | Timeout injection test |
| 8 | Redis reconnect not working after outage | Redis client | Features dependent on Redis broken | Redis kill test |
| 9 | PM2 cluster mode: sessions not shared | Auth | User gets 401 on different worker | Multi-request test |
| 10 | Error response leaks stack trace | Error middleware | Information disclosure | Error format audit |
| 11 | CORS misconfiguration allows any origin | Express config | CSRF attacks possible | CORS header test |
| 12 | Missing rate limit on AI endpoints | Rate limiter | AI cost explosion | Load test on AI endpoints |
| 13 | Order placed on exchange but not recorded in DB | Order handler | Ghost orders, balance mismatch | Order reconciliation |
| 14 | WebSocket message not validated | WS handler | Malformed messages crash handler | Fuzz WS messages |
| 15 | Password stored without salt | Auth service | Rainbow table attacks | DB inspection |
| 16 | 2FA secret stored in plaintext | User table | Secret exposed in DB breach | DB schema audit |
| 17 | Admin can delete own account | Admin API | No admin left in system | Admin self-delete test |
| 18 | Exchange API keys stored in plaintext | Exchange service | API key exposure in DB breach | Encryption audit |
| 19 | market-hub single point of failure | WS architecture | All real-time data lost | market-hub kill test |
| 20 | No request body size limit | Express config | DoS via large payloads | Send 100MB body test |

---

## 17. k6 Load Test Scenarios (20)

| # | Scenario | VUs | Duration | Target Endpoint | Threshold |
|---|---|---|---|---|---|
| 1 | Login spike | 100 | 60s | POST `/api/auth/login` | p95 < 500ms, error < 1% |
| 2 | Dashboard load | 200 | 120s | GET `/api/dashboard/summary` | p95 < 1s |
| 3 | Coin insight concurrent reads | 300 | 120s | GET `/api/coins/:id` | p95 < 800ms |
| 4 | Order placement burst | 50 | 60s | POST `/api/exchange/order` | p95 < 2s, error < 0.5% |
| 5 | AI insight concurrent | 20 | 120s | POST `/api/ai/insight` | p95 < 15s (AI provider latency) |
| 6 | Portfolio sync | 100 | 60s | GET `/api/portfolio/sync` | p95 < 3s |
| 7 | Admin user list pagination | 10 | 60s | GET `/api/admin/users?page=N` | p95 < 500ms |
| 8 | Market data polling | 500 | 300s | GET `/api/market/tickers` | p95 < 200ms (cached) |
| 9 | Sniper signals fetch | 200 | 120s | GET `/api/sniper/signals` | p95 < 1s |
| 10 | Bot status polling | 100 | 120s | GET `/api/bots/status` | p95 < 500ms |
| 11 | Token refresh under load | 200 | 60s | POST `/api/auth/refresh` | p95 < 300ms |
| 12 | Exchange balance check | 100 | 60s | GET `/api/exchange/balances` | p95 < 2s (exchange latency) |
| 13 | Ramp-up test | 0->500 | 300s | Mixed endpoints | No errors during ramp |
| 14 | Soak test | 50 | 3600s | Mixed endpoints | No memory leak, stable p95 |
| 15 | Spike test | 10->200->10 | 120s | POST `/api/auth/login` | Recovers within 10s of spike end |
| 16 | WS connection storm | 1000 | 60s | WebSocket connect | All connections established < 5s |
| 17 | Concurrent plan subscriptions | 20 | 60s | POST `/api/payment/subscribe` | No duplicate payments |
| 18 | DB pool exhaustion | 500 | 60s | GET `/api/coins` (DB-heavy) | Graceful 503, not crash |
| 19 | Redis cache miss storm | 200 | 60s | GET `/api/market/tickers` (cold cache) | Cache populated, subsequent < 50ms |
| 20 | Mixed realistic traffic | 100 | 600s | All endpoints, weighted by usage | p95 < 1s, error < 0.5% |

---

## 18. Postman Collection Structure

```
Bitrium API/
  Auth/
    Register
    Login
    Login with 2FA
    Refresh Token
    Logout
    Change Password
    Enable 2FA
    Disable 2FA
  User/
    Get Profile
    Update Profile
  Exchange/
    Save API Keys
    Get Balances
    Place Order (Limit Buy)
    Place Order (Market Sell)
    Get Open Orders
    Cancel Order
  Bots/
    Create Bot
    Start Bot
    Stop Bot
    Get Bot Status
    Delete Bot
  Portfolio/
    Get Holdings
    Add Manual Holding
    Sync Exchange
  Payment/
    Subscribe (TRON)
    Check Payment Status
  AI/
    Coin Insight
    War Room Chat
  Admin/
    Get Users
    Update User
    Get Payments
    Get Stats
  Market/
    Get Tickers
    Get OHLCV
    Get Order Book
  Health/
    Health Check
```

### Environment Variables
| Variable | Dev | Staging | Production |
|---|---|---|---|
| `baseUrl` | `http://localhost:3000` | `https://staging-api.bitrium.com` | `https://api.bitrium.com` |
| `explorerToken` | Auto-set by login script | Auto-set | Auto-set |
| `traderToken` | Auto-set by login script | Auto-set | Auto-set |
| `titanToken` | Auto-set by login script | Auto-set | Auto-set |
| `adminToken` | Auto-set by login script | Auto-set | Auto-set |

### Pre-request Script (Login)
```javascript
// Auto-login and set token before each request
if (!pm.environment.get("explorerToken")) {
  pm.sendRequest({
    url: pm.environment.get("baseUrl") + "/api/auth/login",
    method: "POST",
    header: { "Content-Type": "application/json" },
    body: { mode: "raw", raw: JSON.stringify({
      email: pm.environment.get("explorerEmail"),
      password: pm.environment.get("explorerPassword")
    })}
  }, (err, res) => {
    pm.environment.set("explorerToken", res.json().token);
  });
}
```

---

## 19. Structured Logging Schema

Every log line must be JSON with these base fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `timestamp` | ISO 8601 | Yes | When the event occurred |
| `level` | enum | Yes | `debug`, `info`, `warn`, `error`, `fatal` |
| `requestId` | UUID | Yes (for HTTP) | Correlation ID |
| `userId` | UUID | If authenticated | Who triggered the action |
| `service` | string | Yes | `api-worker-1`, `api-worker-2`, `market-hub` |
| `method` | string | For HTTP | `GET`, `POST`, etc. |
| `path` | string | For HTTP | Request path |
| `statusCode` | number | For HTTP response | HTTP status code |
| `duration` | number | For HTTP response | Request duration in ms |
| `error` | object | If error | `{message, code, stack}` (stack only in non-prod) |
| `exchange` | string | If exchange op | `binance`, `gateio`, `bybit`, `okx` |
| `aiProvider` | string | If AI op | `openai`, `claude`, `qwen` |
| `ip` | string | For auth events | Client IP (for security audit) |

### Log Examples

```json
{"timestamp":"2026-04-04T12:00:00.000Z","level":"info","requestId":"uuid","userId":"user-uuid","service":"api-worker-1","method":"POST","path":"/api/exchange/order","statusCode":201,"duration":245,"exchange":"binance","message":"Order placed"}
```

```json
{"timestamp":"2026-04-04T12:00:01.000Z","level":"error","requestId":"uuid","userId":"user-uuid","service":"api-worker-2","method":"POST","path":"/api/ai/insight","statusCode":504,"duration":30000,"aiProvider":"openai","error":{"message":"Request timeout","code":"AI_TIMEOUT"},"message":"AI provider timeout"}
```

---

## 20. WebSocket Test Plan

### 20.1 Connection Auth Failures

| # | Test | Expected |
|---|---|---|
| 1 | Connect without token | Connection rejected with 4001 code |
| 2 | Connect with invalid token | Connection rejected with 4001 code |
| 3 | Connect with expired token | Connection rejected with 4002 code |
| 4 | Connect with blacklisted token | Connection rejected with 4003 code |
| 5 | Connect with valid token | Connection accepted, `connected` event received |

### 20.2 Token Expiry During Connection

| # | Scenario | Expected |
|---|---|---|
| 1 | Token expires while connected | Server sends `token_expiring` event 60s before expiry |
| 2 | Client sends refreshed token | Server accepts, connection continues |
| 3 | Client fails to refresh | Server sends `auth_expired`, closes with 4002 |
| 4 | Client sends invalid refresh | Server sends `auth_invalid`, closes with 4001 |

### 20.3 Reconnect Behavior

| # | Scenario | Expected |
|---|---|---|
| 1 | Server closes connection | Client reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s) |
| 2 | Network interruption | Client detects via missed heartbeat, reconnects |
| 3 | Client reconnects after 5 min offline | Reconnection succeeds, missed data resync |
| 4 | Reconnect with expired token | Client refreshes token first, then reconnects |
| 5 | Max reconnect attempts (10) | Client shows "Connection lost" banner, manual retry button |

### 20.4 Duplicate Subscriptions

| # | Test | Expected |
|---|---|---|
| 1 | Subscribe to same channel twice | Server deduplicates, one subscription active |
| 2 | Subscribe after reconnect | Previous subscriptions restored automatically |
| 3 | Unsubscribe from non-subscribed channel | No error, no-op |
| 4 | Subscribe with invalid channel | Error message: "Unknown channel" |

### 20.5 Dropped/Delayed Messages

| # | Scenario | Expected |
|---|---|---|
| 1 | Server sends 1000 messages/second | Client processes without blocking UI |
| 2 | Client buffer overflow | Oldest messages dropped, warning logged |
| 3 | Network latency spike (5s) | Messages queue, delivered in order after recovery |
| 4 | Out-of-order messages | Client reorders by sequence number or timestamp |

### 20.6 Worker Restart Effects

| # | Scenario | Expected |
|---|---|---|
| 1 | API worker restarts | WS connections to that worker drop, clients reconnect to other worker |
| 2 | All API workers restart | Brief WS outage, all clients reconnect after restart |
| 3 | Reconnection after worker restart | Subscriptions re-established, data resync |

### 20.7 Market-Hub Restart Effects

| # | Scenario | Expected |
|---|---|---|
| 1 | Market-hub crashes | No market data pushed to clients, stale data shown |
| 2 | Market-hub restarts | Data flow resumes, clients see fresh prices |
| 3 | Market-hub restart during high volatility | Brief data gap, no client crash |
| 4 | Market-hub restart: exchange reconnection | All 4 exchange WS connections re-established |
| 5 | Partial market-hub restart | Binance WS reconnects, others maintained |

### 20.8 Heartbeat / Ping-Pong Tests

| # | Test | Expected |
|---|---|---|
| 1 | Server sends ping every 30s | Client responds with pong |
| 2 | Client misses 3 pings | Server closes connection (dead client) |
| 3 | Server misses pong for 90s | Client triggers reconnect |
| 4 | Ping during heavy message traffic | Pong still sent within 5s |

### 20.9 Client Resync After Reconnect

| # | Scenario | Expected |
|---|---|---|
| 1 | Reconnect after 10s offline | Server sends snapshot of current state (prices, signals) |
| 2 | Reconnect after 5 min offline | Full resync: all subscribed channel snapshots |
| 3 | Resync during high load | Resync message prioritized over incremental updates |
| 4 | Resync data consistency | Snapshot is atomic (no partial state) |

### 20.10 WebSocket Failure Test Cases (15)

| # | Test | Method | Expected |
|---|---|---|---|
| 1 | Send binary message when text expected | Raw binary frame | Server rejects, sends error event |
| 2 | Send message > 1MB | Large payload | Server rejects, closes connection |
| 3 | Send invalid JSON | `{broken` | Server sends `parse_error` event |
| 4 | Send message without `type` field | `{data: "..."}` | Server sends `invalid_message` event |
| 5 | Subscribe to 100 channels | Mass subscribe | Rate limited or capped at max (e.g., 20) |
| 6 | Send message during reconnect | Write to closing socket | Message queued, sent after reconnect |
| 7 | Open 50 connections from same user | Multiple WS connections | Older connections closed, max 3 per user |
| 8 | Send after server-side close | Write to closed connection | Client detects closed, triggers reconnect |
| 9 | Rapid connect/disconnect cycle | 100 connects in 10s | Rate limited, 429 equivalent |
| 10 | Half-open connection (client thinks open, server closed) | Network issue | Heartbeat detects, client reconnects |
| 11 | Malformed subscription message | Missing required fields | Server sends `validation_error` event |
| 12 | Subscribe to admin-only channel as user | `{type: "subscribe", channel: "admin.stats"}` | Subscription rejected, `forbidden` event |
| 13 | Subscribe to Titan channel as Explorer | `{type: "subscribe", channel: "warroom"}` | Subscription rejected, `tier_required` event |
| 14 | Message flood from client (1000 msg/s) | Rapid fire messages | Server throttles, drops excess |
| 15 | Connection from blocked IP | Banned IP connects | Connection rejected at TCP level or immediately after handshake |
