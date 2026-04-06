# Bitrium QA and Testing Architecture

**Version**: 1.0
**Date**: 2026-04-04
**Platform**: Bitrium Crypto Trading SaaS
**Stack**: React 18 + Vite + TailwindCSS | Node.js 22 + Express + PM2 | PostgreSQL + Redis | TRON TRC-20 Payments

---

## Table of Contents

1. [Full Test Matrix by Subsystem](#1-full-test-matrix-by-subsystem)
2. [Critical User Journeys](#2-critical-user-journeys)
3. [Edge Cases and Failure Scenarios](#3-edge-cases-and-failure-scenarios)
4. [Broken-Flow Detection Checklist](#4-broken-flow-detection-checklist)
5. [Logging Requirements](#5-logging-requirements)
6. [Bug Report Format](#6-bug-report-format)
7. [Severity Classification](#7-severity-classification)
8. [Monitoring and Alert Requirements](#8-monitoring-and-alert-requirements)
9. [Regression Test Suite Design](#9-regression-test-suite-design)
10. [Top 50 Likely Real-World Bugs](#10-top-50-likely-real-world-bugs)

---

## 1. Full Test Matrix by Subsystem

### 1.1 Auth

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| AUTH-001 | Signup with valid email and password | No existing account | Enter valid email, password (8+ chars, uppercase, number, symbol), submit | Account created, verification email sent, user redirected to verify page |
| AUTH-002 | Signup with existing email | Account exists for email | Attempt signup with same email | Error: "Email already registered", no duplicate account |
| AUTH-003 | Signup with weak password | None | Enter password shorter than 8 chars or missing complexity | Validation error shown, form not submitted |
| AUTH-004 | Login with valid credentials | Account exists, verified | Enter correct email and password | JWT access + refresh tokens issued, user redirected to dashboard |
| AUTH-005 | Login with wrong password | Account exists | Enter wrong password | Error: "Invalid credentials", no token issued |
| AUTH-006 | Login with case-insensitive email | Account created with lowercase email | Login with UPPERCASE email | Login succeeds (emails normalized to lowercase) |
| AUTH-007 | Login rate limiting | None | Attempt 10 rapid failed logins | Rate limit after 5 attempts, 429 returned, message: "Too many attempts" |
| AUTH-008 | 2FA enable | Logged in, 2FA disabled | Enable 2FA, scan QR, enter code | 2FA enabled, recovery codes displayed once |
| AUTH-009 | 2FA login | 2FA enabled | Login with email/password, then enter TOTP code | Access granted only after valid TOTP code |
| AUTH-010 | 2FA with expired code | 2FA enabled | Enter TOTP code from previous 30s window | Code rejected (allow 1 window tolerance max) |
| AUTH-011 | 2FA code reuse | 2FA enabled | Use same TOTP code twice within same window | Second use rejected (replay protection) |
| AUTH-012 | 2FA recovery code | 2FA enabled, code lost | Use recovery code to bypass 2FA | Access granted, recovery code marked as used |
| AUTH-013 | Password reset request | Account exists | Request password reset | Email sent with time-limited token (1 hour expiry) |
| AUTH-014 | Password reset execution | Valid reset token | Click link, enter new password | Password updated, all existing sessions invalidated |
| AUTH-015 | Password reset link reuse | Token already used | Click same reset link again | Error: "Token already used or expired" |
| AUTH-016 | JWT access token refresh | Access token expired, refresh token valid | API call with expired access token | Auto-refresh via refresh token, new access token issued, request retried |
| AUTH-017 | JWT refresh token expired | Both tokens expired | Any API call | 401 returned, user redirected to login |
| AUTH-018 | Session invalidation on password change | Active session | Change password from settings | All other sessions invalidated, current session gets new tokens |
| AUTH-019 | Concurrent login from 2 devices | Active session on device A | Login on device B | Both sessions active (or policy: device A session invalidated) |
| AUTH-020 | SQL injection in email field | None | Enter `' OR 1=1 --` as email | Input sanitized, error: "Invalid email format" |

### 1.2 Subscriptions

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| SUB-001 | Purchase Explorer plan | Logged in, no active plan | Select Explorer ($10), complete payment | Subscription created, Explorer features unlocked, expiry set to +30 days |
| SUB-002 | Purchase Trader plan | Logged in, no active plan | Select Trader ($20), complete payment | Subscription created, Trader features unlocked |
| SUB-003 | Purchase Titan plan | Logged in, no active plan | Select Titan ($30), complete payment | Subscription created, all features unlocked |
| SUB-004 | Plan activation after payment | Payment confirmed on-chain | Webhook processes confirmed payment | Subscription status set to ACTIVE, user notified |
| SUB-005 | Plan expiry | Active plan, expiry date reached | System cron checks expiry | Status set to EXPIRED, premium features locked, user redirected to pricing |
| SUB-006 | Upgrade Explorer to Trader | Active Explorer plan | Select Trader, pro-rata credit applied | Credit = (remaining_days / 30) * $10, user pays $20 - credit |
| SUB-007 | Upgrade Explorer to Titan | Active Explorer plan | Select Titan | Credit calculated, user pays $30 - credit |
| SUB-008 | Upgrade Trader to Titan | Active Trader plan | Select Titan | Credit calculated, user pays $30 - credit |
| SUB-009 | Downgrade Titan to Explorer | Active Titan plan | Select Explorer | Downgrade scheduled at end of current period, Titan features remain until expiry |
| SUB-010 | Plan stacking (buy while active) | Active Explorer | Purchase another Explorer | New 30 days added after current expiry (stacking) |
| SUB-011 | Plan renewal before expiry | Active plan, 3 days remaining | Purchase same plan | Expiry extended by 30 days from current expiry date |
| SUB-012 | Access check after expiry | Plan just expired | Navigate to premium page | Redirect to pricing page with message |
| SUB-013 | Referral code plan grant | Valid referral code | Apply referral code during signup | Plan tier granted per referral config, subscription record created |
| SUB-014 | Removed tier handling (strategist) | User has old "strategist" tier | User tries to access features | Graceful handling: map to closest valid tier or redirect to pricing |
| SUB-015 | Midnight UTC expiry | Plan expires at 00:00:00 UTC | System checks at 00:00:00 | Plan expired, not extended by 1 day due to off-by-one |

### 1.3 Payments (TRON USDT TRC-20)

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| PAY-001 | Invoice creation | User selects plan | Click "Pay" on pricing page | Invoice created with unique deposit address, amount, 60-min expiry |
| PAY-002 | Deposit detection | Invoice pending | User sends USDT to deposit address | Transaction detected, invoice status: CONFIRMING |
| PAY-003 | Payment confirmation | Deposit detected, confirmations building | Wait for required confirmations (e.g., 20) | Invoice status: CONFIRMED, subscription activated |
| PAY-004 | Invoice expiry | Invoice pending, 60 minutes passed | No payment received | Invoice status: EXPIRED, deposit address freed |
| PAY-005 | Exact amount payment | Invoice for $20 | Send exactly $20 USDT | Payment accepted, subscription created |
| PAY-006 | Underpayment (<95%) | Invoice for $20 | Send $9.50 (47.5%) | Payment status: UNDERPAID, user notified to send remainder or request refund |
| PAY-007 | Underpayment (95-99%) | Invoice for $20 | Send $19.00 (95%) | Payment accepted within tolerance |
| PAY-008 | Overpayment (101-110%) | Invoice for $20 | Send $22.00 (110%) | Payment accepted, excess noted in admin panel |
| PAY-009 | Overpayment (>200%) | Invoice for $20 | Send $42.00 (210%) | Payment flagged for manual review, subscription activated |
| PAY-010 | Late payment (after expiry) | Invoice expired | User sends payment to expired address | Payment detected, flagged for manual review in admin |
| PAY-011 | Duplicate payment | Invoice already CONFIRMED | Second payment to same address | Second payment detected, flagged for refund review |
| PAY-012 | Webhook processing | Payment confirmed on-chain | Webhook received from TRON monitor | Webhook authenticated, invoice updated, subscription activated |
| PAY-013 | Duplicate webhook | Same txHash | Same webhook fires twice | Idempotent processing, no duplicate subscription |
| PAY-014 | Webhook before invoice | Race condition | Webhook arrives before invoice DB write completes | Retry with backoff, or queue for processing after invoice exists |
| PAY-015 | TRON network reorg | Payment confirmed then reversed | Reorg removes transaction | Payment status reverted, subscription suspended, admin alerted |
| PAY-016 | Deposit address reuse prevention | Previous invoice used address | New invoice created | New unique address assigned, never reuse across invoices |
| PAY-017 | Invoice status real-time update | User viewing invoice page | Payment detected | UI updates via WebSocket or polling without page refresh |
| PAY-018 | 1 confirmation short | Requires 20 confirmations, has 19 | Wait | Status remains CONFIRMING until threshold met |

### 1.4 Exchange Integration

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| EXC-001 | Add Binance Futures API key | Logged in, Trader+ plan | Enter API key + secret | Key validated against Binance, permissions checked, stored encrypted |
| EXC-002 | Add invalid API key | Logged in | Enter malformed key | Error: "Invalid API key format" |
| EXC-003 | Add key with no trade permission | Valid key, read-only | Add key | Warning: "API key does not have trading permission" |
| EXC-004 | Add Gate.io API key | Logged in | Enter Gate.io credentials | Key validated, connection established |
| EXC-005 | Add Bybit API key | Logged in | Enter Bybit credentials | Key validated, connection established |
| EXC-006 | Add OKX API key | Logged in | Enter OKX credentials with passphrase | Key validated (including passphrase), connection established |
| EXC-007 | Remove API key | Key exists | Click remove, confirm | Key deleted from DB, connection closed |
| EXC-008 | Terminal connects after key add | Valid key added | Navigate to Exchange Terminal | WebSocket connection established, real-time data flowing |
| EXC-009 | Place market order | Connected, sufficient balance | Place market buy order | Order executed, fill confirmed, balance updated |
| EXC-010 | Place limit order | Connected | Place limit buy below market | Order placed, visible in open orders |
| EXC-011 | Cancel open order | Open order exists | Click cancel | Order cancelled, confirmed by exchange |
| EXC-012 | Balance sync | Connected | Navigate to portfolio | Balance fetched from exchange, displayed correctly |
| EXC-013 | Exchange returns 500 | Connected | Place order during exchange outage | User-friendly error: "Exchange temporarily unavailable", no orphan order |
| EXC-014 | Order timeout | Order sent | Exchange doesn't respond in 10s | Timeout shown to user, order status checked asynchronously |
| EXC-015 | Balance changed between preview and execution | Preview shows sufficient balance | Another trade fills between preview and submit | Insufficient balance error from exchange, user notified |
| EXC-016 | Multiple exchange accounts | 2 Binance keys added | Switch between accounts | UI correctly switches context, no cross-contamination |

### 1.5 Market Data

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| MKT-001 | WS connection established | Market-hub running | Client subscribes to BTC/USDT | WebSocket connects, depth/kline/ticker data streams |
| MKT-002 | Depth data accuracy | Connected | Compare depth with exchange directly | Depth matches within 100ms latency |
| MKT-003 | Kline data completeness | Connected | Request 1h klines for 24h | All 24 candles present, no gaps |
| MKT-004 | Ticker real-time update | Connected | Monitor ticker | Price updates within 500ms of exchange |
| MKT-005 | WS disconnect recovery | Connected | Simulate network drop for 5 minutes | Auto-reconnect, snapshot fetched, data resumes, no stale data |
| MKT-006 | All exchanges disconnect | Connected to all 4 | Simulate full outage | All reconnect independently, UI shows status per exchange |
| MKT-007 | Rate limit budget enforcement | Active connections | Approach weight limit (e.g., 600/1200) | Requests throttled, warning logged, no 418/429 from exchange |
| MKT-008 | Rate limit recovery after 418 | 418 received (should never happen) | Wait for ban period | Backoff applied, requests resume after ban lifts |
| MKT-009 | Empty depth snapshot | Connected | Exchange returns empty depth | UI shows "No data available", no crash |
| MKT-010 | Kline gap detection | Connected | Missing candles in response | Gap detected, REST fallback to fill missing candles |
| MKT-011 | Market-hub crash and restart | PM2 monitoring | Kill market-hub process | PM2 restarts within 5s, connections re-established, data gap < 30s |
| MKT-012 | Symbol switch rapid fire | Viewing BTC chart | Switch symbols 10 times in 2 seconds | Only final symbol data displayed, no race conditions |
| MKT-013 | Stale data detection | Connected | Data stops flowing for 10s | UI shows stale data indicator |
| MKT-014 | Weight sliding window | Active requests | Check weight calculation after burst | Weight decays correctly per sliding window, no residual inflation |

### 1.6 AI Engine

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| AI-001 | Trade idea generation (OpenAI) | OpenAI configured | Request trade idea for BTC | Idea generated with entry/exit/stop loss, response time < 30s |
| AI-002 | Provider fallback: OpenAI down | OpenAI returns error | Request trade idea | Falls back to Claude, then Qwen |
| AI-003 | All providers down | All AI providers error | Request trade idea | User-friendly error: "AI service temporarily unavailable" |
| AI-004 | Malformed JSON response | AI returns invalid JSON | Process response | Parse error caught, retry with different provider or return error |
| AI-005 | Response timeout (>90s) | AI provider slow | Request trade idea | Timeout after 90s, try next provider |
| AI-006 | Response caching | Same prompt sent twice | Request same idea | Second request served from cache, cache hit logged |
| AI-007 | Cache invalidation | Cached idea, market moved >5% | Request idea | Cache invalidated, fresh generation triggered |
| AI-008 | Token/cost tracking | AI request completed | Check admin panel | Tokens used, cost in USD, provider logged |
| AI-009 | Signal quality tracking | Idea generated, time passes | Compare prediction vs actual | Accuracy metrics updated in admin |
| AI-010 | Delisted coin suggestion | AI suggests buying delisted coin | Display to user | Coin cross-referenced with active listings, warning shown or filtered |

### 1.7 Frontend Routes

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| FE-001 | Unauthenticated access to /dashboard | Not logged in | Navigate to /dashboard | Redirect to /login |
| FE-002 | Unauthenticated access to /terminal | Not logged in | Navigate to /terminal | Redirect to /login |
| FE-003 | Explorer accesses /institutional | Logged in, Explorer plan | Navigate to /institutional | Redirect to /pricing with "Upgrade to Titan" message |
| FE-004 | Explorer accesses /war-room | Logged in, Explorer plan | Navigate to /war-room | Redirect to /pricing |
| FE-005 | Trader accesses /institutional | Logged in, Trader plan | Navigate to /institutional | Redirect to /pricing (requires Titan) |
| FE-006 | Titan accesses all pages | Logged in, Titan plan | Navigate to any premium page | All pages accessible |
| FE-007 | Admin route guard | Non-admin user | Navigate to /admin | Redirect to /dashboard or 403 |
| FE-008 | Admin accesses admin panel | Admin user | Navigate to /admin | Admin panel loads with all sections |
| FE-009 | Expired plan route guard | Plan just expired | Navigate to /terminal | Redirect to /pricing |
| FE-010 | Browser back after logout | Just logged out | Press browser back button | Login page shown, not cached dashboard |
| FE-011 | Deep link with auth | Not logged in | Navigate to /terminal/BTCUSDT | Redirect to login, after login redirect back to /terminal/BTCUSDT |
| FE-012 | Sidebar items per plan | Explorer plan | View sidebar | Only Explorer-tier items visible, higher tier items hidden or locked |
| FE-013 | Sidebar items per role | Admin user | View sidebar | Admin menu section visible |

### 1.8 Bots

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| BOT-001 | Create bot | Trader+ plan, API key linked | Create new bot with strategy config | Bot created, status: STOPPED |
| BOT-002 | Start bot | Bot created | Click Start | Bot status: RUNNING, strategy executing |
| BOT-003 | Stop bot | Bot running | Click Stop | Bot status: STOPPED, open positions remain |
| BOT-004 | Bot executes trade | Bot running, signal triggered | Strategy condition met | Order placed on exchange, trade logged |
| BOT-005 | Bot error handling | Bot running | Exchange returns error on order | Error logged, bot pauses or retries per config, user notified |
| BOT-006 | Bot with invalid API key | API key revoked on exchange | Bot tries to place order | Error: "API key invalid", bot paused, user notified |
| BOT-007 | Bot PnL tracking | Bot has executed trades | View bot performance | Accurate PnL with fee calculations |
| BOT-008 | Delete bot with open positions | Bot running with positions | Attempt delete | Warning: "Bot has open positions. Stop bot and close positions first." |

### 1.9 Portfolio

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| PORT-001 | Balance display | API key linked | Navigate to portfolio | Balances fetched and displayed per exchange |
| PORT-002 | PnL calculation | Open positions exist | View portfolio | Unrealized PnL calculated from current price vs entry |
| PORT-003 | Multi-exchange portfolio | Keys for Binance + Gate.io | View portfolio | Aggregated view across exchanges |
| PORT-004 | Balance sync | Trade executed externally | Refresh portfolio | New balance reflected |
| PORT-005 | Empty portfolio | No API keys linked | View portfolio | "Connect an exchange to view your portfolio" message |
| PORT-006 | Historical PnL | Past trades exist | View history tab | Realized PnL with dates, accurate calculations |

### 1.10 Admin Panel

| ID | Test Case | Precondition | Steps | Expected Behavior |
|----|-----------|-------------|-------|-------------------|
| ADM-001 | User management list | Admin logged in | Navigate to admin users | All users listed with plan, status, join date |
| ADM-002 | Change user role | Admin | Set user as admin | User role updated, audit log created |
| ADM-003 | Branding update | Admin | Upload new logo, save | Logo updated across all user-facing pages immediately |
| ADM-004 | Provider config | Admin | Update AI provider keys | Provider keys saved encrypted, validated on save |
| ADM-005 | Manual payment mark | Admin | Mark invoice as paid | Subscription activated, audit log created |
| ADM-006 | View payment logs | Admin | Navigate to payments section | All invoices listed with status, amount, timestamps |
| ADM-007 | System logs | Admin | Navigate to logs section | Application logs viewable, filterable by level |
| ADM-008 | User ban/suspend | Admin | Suspend user account | User sessions invalidated, login blocked |
| ADM-009 | Plan config change | Admin | Modify pricing tiers | Changes reflected on pricing page for new purchases |
| ADM-010 | Audit trail completeness | Admin performs any action | Check audit log | Every admin action has timestamp, actor, action, target, before/after |

---

## 2. Critical User Journeys

### Journey 1: New User Signup to First Trade

```
[Signup Page] --> Enter email + password
       |
       v
[Email Verification] --> Click link in email
       |
       v
[Login] --> Enter credentials
       |
       v
[Dashboard] --> See free features
       |
       v
[Pricing Page] --> Select Explorer ($10)
       |
       v
[Payment Page] --> Invoice created, deposit address shown
       |
       v
[User sends USDT] --> TRON network confirms (20 confirmations)
       |
       v
[Webhook processed] --> Subscription activated
       |
       v
[Dashboard updated] --> Explorer features unlocked
       |
       v
[Settings > Exchange] --> Add Binance Futures API key
       |
       v
[Exchange Terminal] --> WebSocket connects, orderbook loads
       |
       v
[Place Trade] --> Market buy BTC, order fills, balance updates
```

**Assertions at each step:**
- Signup: Account created in DB, verification email queued
- Verification: Account status set to verified
- Login: JWT tokens issued, stored in httpOnly cookie / localStorage
- Dashboard: Only free-tier features visible
- Pricing: All 3 plans rendered with correct prices
- Payment: Invoice record created, deposit address unique, countdown timer shown
- USDT sent: Transaction detected within 30s, status shown as CONFIRMING
- Webhook: Idempotent processing, subscription record created
- Dashboard update: Plan badge shown, sidebar items updated
- API key: Encrypted storage, exchange connection tested
- Terminal: Real-time depth, klines, ticker flowing
- Trade: Order acknowledged, fill price displayed, portfolio updated

### Journey 2: Existing User Login with 2FA

```
[Login Page] --> Enter email + password
       |
       v
[2FA Challenge] --> Enter TOTP code from authenticator app
       |
       v
[Dashboard] --> Full access per plan tier
       |
       v
[Exchange Terminal] --> Select BTC/USDT, view chart
       |
       v
[Place Order] --> Limit buy at $60,000
       |
       v
[Order fills] --> Notification shown
       |
       v
[Portfolio] --> PnL updated with new position
```

### Journey 3: Plan Upgrade with Pro-Rata Credit

```
[Settings or Pricing] --> User on Explorer, 15 days remaining
       |
       v
[Select Trader ($20)] --> Pro-rata credit calculated: (15/30) * $10 = $5
       |
       v
[Payment: $20 - $5 = $15] --> Invoice for $15 created
       |
       v
[User pays $15 USDT] --> Payment confirmed
       |
       v
[Subscription updated] --> Tier: Trader, new 30-day period starts
       |
       v
[Features unlocked] --> Trader-tier pages accessible immediately
```

### Journey 4: Plan Expiry and Feature Lock

```
[Active plan reaches expiry date]
       |
       v
[Cron job runs] --> Plan status: EXPIRED
       |
       v
[User navigates to premium page] --> RequirePlan guard triggers
       |
       v
[Redirect to /pricing] --> "Your plan has expired" message
       |
       v
[User can still access free features and settings]
```

### Journey 5: Admin Branding Change

```
[Admin Panel > Branding] --> Upload new logo
       |
       v
[Save] --> Logo stored in /static or S3
       |
       v
[Config updated in DB] --> Cache invalidated (Redis)
       |
       v
[All users] --> Next page load shows new logo (no forced refresh needed)
```

### Journey 6: Exchange API Key to Real-Time Data

```
[Settings > Exchange] --> Select Binance Futures
       |
       v
[Enter API key + secret] --> Validation request to Binance /v1/account
       |
       v
[Success] --> Key encrypted and stored
       |
       v
[Navigate to Terminal] --> market-hub establishes user WS stream
       |
       v
[Orderbook loads] --> Depth data renders, live ticker updates
       |
       v
[Trade widget enabled] --> User can place orders
```

### Journey 7: Market-Hub Restart Recovery

```
[Market-hub process crashes]
       |
       v
[PM2 detects exit] --> Restart within 5 seconds
       |
       v
[Market-hub initializes] --> State machine enters INIT
       |
       v
[REST snapshot fetched] --> Depth, klines populated
       |
       v
[WS connections re-established] --> Live data resumes
       |
       v
[Redis updated] --> Clients get fresh data on next poll/push
       |
       v
[Data gap < 30 seconds] --> No stale data served post-recovery
```

### Journey 8: AI Trade Idea Pipeline

```
[User navigates to Coin Insight or Signal page]
       |
       v
[Frontend requests trade idea for BTC]
       |
       v
[Backend checks cache] --> Cache miss
       |
       v
[Backend calls OpenAI] --> Generates trade idea (entry, stop, target)
       |
       v
[Response parsed and validated] --> JSON schema check
       |
       v
[Stored in DB, cached in Redis] --> TTL based on market volatility
       |
       v
[Frontend displays signal card] --> Entry: $62,500 | Target: $65,000 | Stop: $61,000
       |
       v
[Over time] --> Actual vs predicted tracked, accuracy score updated
```

### Journey 9: Unauthorized Tier Access

```
[Explorer user] --> Clicks /institutional in URL bar
       |
       v
[RequireTier guard] --> Checks user tier rank: Explorer (rank 1) < Titan (rank 3)
       |
       v
[Redirect to /pricing] --> Message: "Upgrade to Titan to access Institutional Dashboard"
       |
       v
[Sidebar] --> Institutional item shown as locked with upgrade icon
```

### Journey 10: Late Payment on Expired Invoice

```
[Invoice created at 14:00, expires at 15:00]
       |
       v
[15:01] --> Invoice status: EXPIRED
       |
       v
[15:05] --> User sends payment to deposit address
       |
       v
[Payment detected] --> Invoice already expired
       |
       v
[System action] --> Payment flagged as LATE_PAYMENT
       |
       v
[Admin notified] --> Manual review entry created
       |
       v
[Admin can] --> Manually activate subscription or process refund
       |
       v
[No automatic activation] --> Prevents abuse of expired address reuse
```

---

## 3. Edge Cases and Failure Scenarios

### 3.1 Auth Edge Cases

| ID | Scenario | Expected Handling |
|----|----------|-------------------|
| EDGE-AUTH-001 | Login with SQL injection in email field (`' OR 1=1 --`) | Input sanitized by parameterized queries, validation rejects non-email format |
| EDGE-AUTH-002 | JWT token expired mid-session (user active on page) | Interceptor catches 401, refresh token used to get new access token, request retried transparently |
| EDGE-AUTH-003 | 2FA code reuse (replay attack) | Server tracks last used TOTP timestamp, rejects same code within same 30s window |
| EDGE-AUTH-004 | Concurrent login from 2 devices | Both sessions valid (stateless JWT), or if session table exists, policy decides: allow both or invalidate first |
| EDGE-AUTH-005 | Password reset link used twice | Token marked as used after first use, second attempt shows "Token already used or expired" |
| EDGE-AUTH-006 | Login with correct email but wrong case (UPPER vs lower) | Email normalized to lowercase on both signup and login, case-insensitive match |
| EDGE-AUTH-007 | Registration with unicode email (homograph attack) | Email validation rejects non-ASCII characters or normalizes Unicode |
| EDGE-AUTH-008 | JWT signature with wrong secret (forged token) | Signature verification fails, 401 returned |
| EDGE-AUTH-009 | Refresh token stolen and used from different IP | Optional: IP binding on refresh tokens, or require re-auth for sensitive operations |
| EDGE-AUTH-010 | Account enumeration via password reset | Same response for existing and non-existing emails: "If account exists, email sent" |

### 3.2 Payment Edge Cases

| ID | Scenario | Expected Handling |
|----|----------|-------------------|
| EDGE-PAY-001 | User sends exact amount but 1 confirmation short of threshold | Status remains CONFIRMING until required confirmations met, UI shows confirmation progress |
| EDGE-PAY-002 | User sends 2 separate payments to same invoice | First payment moves to CONFIRMING, second payment logged as surplus, admin notified |
| EDGE-PAY-003 | Payment arrives 1 second after invoice expiry | Payment flagged as LATE_PAYMENT, admin reviews, no auto-activation |
| EDGE-PAY-004 | User sends 49% of required amount | Status: UNDERPAID, user shown remaining amount, 24h window to complete |
| EDGE-PAY-005 | User sends 200% of required amount | Subscription activated, overpayment flagged for refund review |
| EDGE-PAY-006 | TRON network reorg reverses confirmed payment | Confirmation count drops below threshold, subscription suspended, admin alerted immediately |
| EDGE-PAY-007 | Webhook arrives before invoice exists (race condition) | Webhook queued with retry (exponential backoff), or stored in pending table for reconciliation |
| EDGE-PAY-008 | Duplicate webhook with same txHash | Idempotent processing: check if txHash already processed, skip if yes |
| EDGE-PAY-009 | Deposit address collision across invoices | System must guarantee unique address per invoice; reuse prevention enforced at DB level |
| EDGE-PAY-010 | Payment from sanctioned address | If compliance module exists: flag transaction, do not activate subscription, alert compliance team |

### 3.3 Subscription Edge Cases

| ID | Scenario | Expected Handling |
|----|----------|-------------------|
| EDGE-SUB-001 | User has active plan, buys another plan (stacking) | New period starts after current expiry, or upgrade applied immediately with pro-rata |
| EDGE-SUB-002 | Plan expires at exactly midnight UTC (00:00:00) | Expiry check uses `>=` comparison, plan expires at the boundary, no off-by-one |
| EDGE-SUB-003 | User upgrades during last day of subscription | Pro-rata credit for 1 remaining day, new full period starts |
| EDGE-SUB-004 | Referral code grants tier that no longer exists | Referral code validation checks against current tier list, rejects invalid tiers |
| EDGE-SUB-005 | User has old "strategist" tier (removed plan) | Tier mapping handles unknown tiers gracefully: either map to closest valid tier or treat as expired |
| EDGE-SUB-006 | Two concurrent upgrade requests | DB transaction with row lock prevents double-charge, second request fails gracefully |
| EDGE-SUB-007 | Plan activated but DB write fails | Payment marked as processed in payment table, subscription creation retried, admin alerted if retry fails |

### 3.4 Market Data Edge Cases

| ID | Scenario | Expected Handling |
|----|----------|-------------------|
| EDGE-MKT-001 | Binance WS disconnects for 5 minutes | Auto-reconnect with exponential backoff, REST snapshot on reconnect, gap detection and fill |
| EDGE-MKT-002 | All 4 exchanges disconnect simultaneously | Each exchange reconnects independently, UI shows per-exchange status |
| EDGE-MKT-003 | Depth snapshot returns empty data | UI shows "No data available", chart component handles empty array without crash |
| EDGE-MKT-004 | Kline data has gap (missing candles) | Gap detected by comparing timestamps, REST request fills missing candles |
| EDGE-MKT-005 | Rate limit hit during recovery (weight > budget) | Recovery requests queued and throttled, budget engine prioritizes critical data |
| EDGE-MKT-006 | Market-hub process crashes mid-snapshot | PM2 restarts process, new instance starts fresh INIT cycle, incomplete data discarded |
| EDGE-MKT-007 | Depth snapshot + WS updates arrive simultaneously | Snapshot applied first, then WS updates buffered during snapshot applied in order |
| EDGE-MKT-008 | Symbol delisted while user is viewing chart | Error from exchange handled, user notified: "Symbol no longer available" |

### 3.5 Exchange Integration Edge Cases

| ID | Scenario | Expected Handling |
|----|----------|-------------------|
| EDGE-EXC-001 | User enters invalid API key format | Client-side validation catches format, server-side validation confirms with exchange |
| EDGE-EXC-002 | API key has no trading permission | Warning shown on key add, trading UI disabled for this key |
| EDGE-EXC-003 | Exchange returns 500 during order | Order status checked after timeout, user shown error, retry option available |
| EDGE-EXC-004 | Order placed but confirmation timeout | Background job checks order status, updates UI when confirmed/rejected |
| EDGE-EXC-005 | Balance changes between preview and execution | Insufficient balance error from exchange returned to user, no partial fill confusion |
| EDGE-EXC-006 | API key rotated on exchange but not in Bitrium | Connection fails, user prompted to update key |
| EDGE-EXC-007 | Exchange maintenance window | Maintenance status detected from exchange API, user shown maintenance message |

### 3.6 Frontend Edge Cases

| ID | Scenario | Expected Handling |
|----|----------|-------------------|
| EDGE-FE-001 | User navigates to /institutional without Titan plan | RequireTier redirect to /pricing with upgrade message |
| EDGE-FE-002 | Browser back button after logout | Session cleared, back button shows login page, not cached dashboard |
| EDGE-FE-003 | Multiple rapid clicks on "Select a plan" button | Button disabled after first click, duplicate requests prevented |
| EDGE-FE-004 | Chart component receives empty data array | Empty state rendered: "No data to display" |
| EDGE-FE-005 | WebSocket disconnects during active session | UI shows "Reconnecting..." indicator, auto-reconnect, data resumes |
| EDGE-FE-006 | Rapid coin switching in dropdown | Abort controller cancels previous requests, only latest data rendered |
| EDGE-FE-007 | Window resize during chart render | Chart resizes responsively, no overflow or distortion |
| EDGE-FE-008 | Browser tab inactive for 30 minutes, then returns | WS reconnects if dropped, data refreshed on tab focus |

### 3.7 AI Engine Edge Cases

| ID | Scenario | Expected Handling |
|----|----------|-------------------|
| EDGE-AI-001 | All AI providers down simultaneously | Cached responses served if available, otherwise "AI temporarily unavailable" |
| EDGE-AI-002 | AI returns malformed JSON | JSON parse error caught, retry with different prompt or provider |
| EDGE-AI-003 | AI response takes >90 seconds | Timeout triggered, next provider attempted, user notified of delay |
| EDGE-AI-004 | Same prompt sent 100 times | Cache hit after first, cache hit ratio near 100% for identical prompts |
| EDGE-AI-005 | AI suggests buying a delisted coin | Response validated against active symbol list, invalid suggestions filtered |
| EDGE-AI-006 | AI response contains harmful/manipulative content | Content filtering applied before display |

---

## 4. Broken-Flow Detection Checklist

Run through this checklist after every deployment and during QA cycles.

### Page Health
- [ ] Every page loads without console errors (check Sentry and browser console)
- [ ] Every page loads within 3 seconds on 4G connection
- [ ] Every page renders correctly at 1280px, 1024px, 768px, 375px widths
- [ ] No page crashes on rapid navigation between routes

### Route Guards
- [ ] Every protected route redirects to /login when unauthenticated
- [ ] Every plan-gated route redirects to /pricing when plan is expired/missing
- [ ] Every tier-gated route redirects to /pricing when user tier is insufficient
- [ ] Every admin route returns 403 or redirects for non-admin users
- [ ] Deep links work correctly (redirect to intended page after login)

### Forms and Validation
- [ ] Every form validates inputs before submission (client-side)
- [ ] Every form handles server-side validation errors gracefully
- [ ] Every submit button is disabled during submission (prevents double-submit)
- [ ] Every form preserves input on validation error (no data loss)

### Error Handling
- [ ] Every API error shows user-friendly message (not raw error)
- [ ] Every 500 error shows generic "Something went wrong" with retry option
- [ ] Every network timeout shows "Connection lost" with retry
- [ ] Every 401/403 redirects appropriately

### Loading and Empty States
- [ ] Every loading state has spinner or skeleton UI
- [ ] Every empty state has appropriate message and CTA
- [ ] Every chart handles empty, loading, and error states
- [ ] Tables show "No data" when results are empty

### Real-Time Data
- [ ] Every WebSocket disconnect shows reconnecting indicator
- [ ] Every payment status updates in real-time on invoice page
- [ ] Market data stale detection (>10s no update) shows indicator
- [ ] No stale data displayed after plan upgrade (cache busted)

### Admin and Audit
- [ ] Every admin action has audit trail entry
- [ ] Admin panel shows correct system status

### Performance and Memory
- [ ] No duplicate API calls on component mount (React StrictMode checked)
- [ ] No memory leaks from WebSocket listeners (check with DevTools)
- [ ] No growing event listener count over time

### Navigation and Layout
- [ ] Sidebar correctly shows/hides items based on role and plan
- [ ] Active route highlighted in sidebar
- [ ] Breadcrumbs (if present) reflect current location
- [ ] Browser back/forward work correctly

---

## 5. Logging Requirements

| Subsystem | What to Log | Level | Retention |
|-----------|-------------|-------|-----------|
| **Auth** | Login success with user ID and IP | INFO | 90 days |
| **Auth** | Login failure with email (not password) and IP | WARN | 90 days |
| **Auth** | Signup completed | INFO | 90 days |
| **Auth** | 2FA enable/disable, attempts, failures | WARN | 90 days |
| **Auth** | Password reset requested and completed | INFO | 90 days |
| **Auth** | JWT refresh token rotation | DEBUG | 30 days |
| **Payments** | Invoice created (ID, amount, user, address) | INFO | Permanent |
| **Payments** | Payment detected (txHash, amount, confirmations) | INFO | Permanent |
| **Payments** | Invoice status change (PENDING -> CONFIRMING -> CONFIRMED) | INFO | Permanent |
| **Payments** | Webhook received (source, txHash, status) | INFO | Permanent |
| **Payments** | Underpayment/overpayment/late payment detected | WARN | Permanent |
| **Payments** | Webhook processing failure | ERROR | Permanent |
| **Exchange** | API key added/removed (user ID, exchange, masked key) | INFO | 90 days |
| **Exchange** | Connection established/lost per exchange | INFO | 30 days |
| **Exchange** | Order placed (user, exchange, symbol, type, amount) | INFO | Permanent |
| **Exchange** | Order filled/cancelled/failed | INFO | Permanent |
| **Exchange** | Exchange API error (status code, message) | ERROR | 90 days |
| **Market-Hub** | WS connect/disconnect per exchange | INFO | 30 days |
| **Market-Hub** | State transitions (INIT -> SNAPSHOT -> LIVE) | INFO | 30 days |
| **Market-Hub** | Weight usage per exchange (current/max) | INFO | 7 days |
| **Market-Hub** | Rate limit triggered (429/418 from exchange) | ERROR | 90 days |
| **Market-Hub** | Snapshot fetch success/failure | INFO/ERROR | 30 days |
| **AI Engine** | Request sent (provider, model, prompt hash) | INFO | 90 days |
| **AI Engine** | Response received (provider, tokens, latency) | INFO | 90 days |
| **AI Engine** | Tokens used and cost in USD | INFO | Permanent |
| **AI Engine** | Provider failure and fallback event | WARN | 90 days |
| **AI Engine** | All-provider failure | ERROR | 90 days |
| **Admin** | Config changes (field, old value, new value) | WARN | Permanent |
| **Admin** | User role changes (target user, old role, new role) | WARN | Permanent |
| **Admin** | Manual payment marks (invoice ID, admin user) | WARN | Permanent |
| **Admin** | User ban/suspend/unsuspend | WARN | Permanent |
| **Frontend** | Unhandled JS errors (Sentry integration) | ERROR | 90 days |
| **Frontend** | Page load performance (LCP, FID, CLS) | INFO | 30 days |
| **Frontend** | Critical user actions (plan purchase click, trade submit) | INFO | 90 days |
| **Rate Limit** | Budget usage per exchange (weight consumed / available) | INFO | 7 days |
| **Rate Limit** | Request throttled (exchange, endpoint, current weight) | WARN | 30 days |
| **Rate Limit** | 418/429 received from exchange | ERROR | Permanent |

### Log Format (Structured JSON)

```json
{
  "timestamp": "2026-04-04T12:00:00.000Z",
  "level": "INFO",
  "subsystem": "payments",
  "event": "invoice_status_change",
  "userId": "usr_abc123",
  "invoiceId": "inv_xyz789",
  "oldStatus": "PENDING",
  "newStatus": "CONFIRMING",
  "metadata": {
    "txHash": "0x...",
    "amount": "20.00",
    "confirmations": 1
  },
  "requestId": "req_123",
  "ip": "1.2.3.4"
}
```

---

## 6. Bug Report Format

```
**Bug ID**: BIT-XXX
**Severity**: Critical / High / Medium / Low
**Subsystem**: Auth / Payment / Exchange / Market / AI / Frontend / Admin / Subscription / Bot / Portfolio
**Reporter**: [name]
**Date**: YYYY-MM-DD
**Environment**: prod / staging / dev

**Steps to Reproduce**:
1. Navigate to ...
2. Click on ...
3. Enter ...
4. Observe ...

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happens]

**Evidence**:
- Screenshot: [link]
- Console log: [paste or link]
- Video: [link]
- API response: [paste]

**User Impact**:
- Affected users: X users / Y% of traffic
- Revenue impact: $Z / none
- Data integrity: affected / not affected

**Workaround**:
[If any, describe how users can work around the issue]

**Root Cause** (filled after investigation):
[Technical explanation]

**Fix Applied** (filled after resolution):
[Commit hash, PR link, deployment info]
```

---

## 7. Severity Classification

| Severity | Code | Definition | Response Time | Resolution Target | Examples |
|----------|------|-----------|---------------|-------------------|---------|
| **Critical** | P0 | System down, data loss, security breach, payment mishandling, complete feature unavailability for all users | < 15 min acknowledge | < 2 hours | 418 IP ban from exchange; payment credited to wrong user; authentication bypass; database corruption; market-hub fully down; all WS connections lost |
| **High** | P1 | Major feature broken for many users, significant revenue impact, data inconsistency | < 1 hour acknowledge | < 8 hours | Exchange terminal not loading; plan not activating after confirmed payment; trade orders failing silently; 2FA completely broken; admin panel inaccessible |
| **Medium** | P2 | Feature partially broken, workaround exists, limited user impact | < 4 hours acknowledge | < 24 hours | Chart not rendering for specific coin; wrong price displayed for one exchange; AI trade ideas returning stale data; one exchange connection flaky; specific page slow to load |
| **Low** | P3 | Minor UI issue, cosmetic defect, edge case with no revenue impact | < 24 hours acknowledge | < 1 week | Tooltip misaligned; wrong font weight; animation glitch; console warning in production; minor responsive layout issue at uncommon breakpoint |

### Escalation Matrix

| Condition | Action |
|-----------|--------|
| P0 not acknowledged in 15 min | Alert escalated to team lead |
| P0 not resolved in 2 hours | CEO/CTO notified |
| P1 not resolved in 8 hours | Escalate to P0 protocol |
| P2 backlog > 10 items | Sprint planning review triggered |
| 3+ P0s in 30 days | Architecture review triggered |

---

## 8. Monitoring and Alert Requirements

### Critical Alerts (immediate -- wake up engineer)

| Alert | Condition | Channel | Action |
|-------|-----------|---------|--------|
| Exchange IP Ban | 418 status code from any exchange | PagerDuty + Slack #critical | Stop all requests to that exchange, investigate source |
| Exchange Rate Limit | 429 from any exchange | PagerDuty + Slack #critical | Throttle requests, check weight budget |
| Payment Webhook Failure | Webhook processing throws unhandled error | PagerDuty + Slack #critical | Manual review of payment, ensure no lost funds |
| API Error Spike | Error rate > 10% for 2+ minutes | PagerDuty + Slack #critical | Check server logs, identify failing endpoint |
| Market-Hub Down | PM2 reports market-hub process not running | PagerDuty + Slack #critical | Check crash reason, verify PM2 auto-restart |
| Database Connection Exhausted | PostgreSQL pool usage > 95% | PagerDuty + Slack #critical | Kill idle connections, check for connection leaks |
| Redis Connection Lost | Redis ping fails for 30 seconds | PagerDuty + Slack #critical | Check Redis server, restart if needed |
| Auth Service 500s | Auth endpoints returning 500 for 1+ minutes | PagerDuty + Slack #critical | Users cannot login; immediate investigation |
| Disk Usage Critical | Disk usage > 90% | PagerDuty + Slack #critical | Clean logs, extend storage |
| SSL Certificate Expiry | Certificate expires in < 7 days | PagerDuty + Slack #critical | Renew certificate immediately |

### Warning Alerts (investigate within 1 hour)

| Alert | Condition | Channel |
|-------|-----------|---------|
| Exchange Weight High | Weight usage > 600/1200 for Binance (or 50% for others) | Slack #warnings |
| API Latency High | p99 latency > 2 seconds for 5+ minutes | Slack #warnings |
| WS Connection Drop | Active WS connection count drops > 30% in 5 minutes | Slack #warnings |
| AI All-Provider Fail | All AI providers return errors for 3+ consecutive requests | Slack #warnings |
| Payment Stuck | Invoice in CONFIRMING status for > 1 hour | Slack #warnings |
| Memory Usage High | Server memory > 80% for 10+ minutes | Slack #warnings |
| DB Replication Lag | PostgreSQL replication lag > 10 seconds | Slack #warnings |
| PM2 Worker Restart | Any PM2 worker restarts more than 3 times in 10 minutes | Slack #warnings |
| Failed Login Spike | > 50 failed logins in 5 minutes (possible brute force) | Slack #warnings |
| AI Cost Spike | AI spending > 2x daily average | Slack #warnings |

### Info Alerts (daily review dashboard)

| Metric | Frequency | Dashboard |
|--------|-----------|-----------|
| New user signups | Daily summary | Grafana / Admin |
| Revenue (total payments processed) | Daily summary | Admin |
| Active subscriptions by tier (Explorer/Trader/Titan) | Daily snapshot | Admin |
| AI cost per day (by provider) | Daily summary | Admin |
| Exchange request counts (by exchange) | Hourly aggregation | Grafana |
| API request volume and latency percentiles | Hourly | Grafana |
| WS connection count (peak and current) | Hourly | Grafana |
| Error rate by endpoint | Daily | Grafana |
| Cache hit ratio (Redis) | Daily | Grafana |
| Signup-to-payment conversion rate | Weekly | Admin |

### Monitoring Stack Recommendation

```
Metrics Collection:  Prometheus (or custom stats endpoint)
Dashboards:          Grafana
Log Aggregation:     Loki / ELK / CloudWatch Logs
Error Tracking:      Sentry (frontend + backend)
Uptime Monitoring:   UptimeRobot / Pingdom (health endpoints)
Alerting:            PagerDuty (P0), Slack Webhooks (P1-P3)
APM:                 PM2 metrics + custom middleware
```

---

## 9. Regression Test Suite Design

### Smoke Tests (run on every deploy, target < 2 minutes)

| # | Test | Method | Pass Criteria |
|---|------|--------|---------------|
| 1 | Health endpoint | `GET /api/health` | Returns 200 with `{ status: "ok", db: "connected", redis: "connected" }` |
| 2 | Login endpoint | `POST /api/auth/login` with test credentials | Returns 200 with valid JWT |
| 3 | Market data freshness | Check Redis key `market:BTC:ticker` | Timestamp < 60 seconds old |
| 4 | Frontend loads | `GET /` | Returns 200, HTML contains `<div id="root">`, no 500 errors |
| 5 | WebSocket connects | Open WS to market-hub | Connection established, ping-pong works |
| 6 | Static assets served | `GET /assets/index-*.js` | Returns 200, Content-Type correct |
| 7 | Database query | Simple SELECT on users table | Returns within 100ms |

### Integration Tests (run before deploy, target < 10 minutes)

| # | Test | Scope | Setup/Teardown |
|---|------|-------|----------------|
| 1 | Full signup -> login -> dashboard | Auth + Frontend | Create test user, clean up after |
| 2 | Plan purchase -> subscription activation | Payments + Subscriptions | Mock TRON webhook, verify subscription record |
| 3 | Exchange API key CRUD | Exchange module | Add key -> list -> verify -> remove, use test API keys |
| 4 | Market data subscription -> data received | Market-Hub | Subscribe to test symbol, verify data within 10s |
| 5 | AI trade idea generation | AI Engine | Mock AI provider, verify response schema |
| 6 | Admin config save -> config load | Admin module | Save test config, verify it loads on next request |
| 7 | Pricing page renders all plans | Frontend | Navigate to /pricing, verify 3 plan cards with correct prices |
| 8 | Route guard enforcement | Frontend + Auth | Test each guard type with appropriate/inappropriate user |
| 9 | Invoice creation and status tracking | Payments | Create invoice, verify address unique, check status transitions |
| 10 | JWT refresh flow | Auth | Use expired access token, verify refresh returns new token |

### E2E Tests (run nightly, target < 30 minutes)

| # | Test | Duration | Tools |
|---|------|----------|-------|
| 1 | Complete user journey: signup -> pay -> trade -> portfolio | 5 min | Playwright/Cypress + mock exchange |
| 2 | Plan upgrade with pro-rata credit calculation | 3 min | Playwright + mock payment |
| 3 | Exchange terminal full workflow (connect, view data, place/cancel order) | 4 min | Playwright + mock exchange API |
| 4 | Bot creation -> configuration -> start -> execute -> stop | 4 min | Playwright + mock exchange |
| 5 | Admin panel full workflow (users, config, payments, logs) | 3 min | Playwright + admin test account |
| 6 | Multi-user concurrent access (5 users simultaneous) | 3 min | Playwright parallel workers |
| 7 | Rate limit behavior under load (100 requests/sec to market endpoints) | 3 min | k6 or Artillery |
| 8 | Plan expiry -> feature lock -> re-subscribe | 3 min | Playwright + time manipulation |
| 9 | WebSocket reconnection after simulated network drop | 2 min | Playwright + network throttling |
| 10 | All route guards with all tier combinations | 2 min | Playwright matrix test |

### Load Tests (run weekly or before major releases)

| Test | Target | Tool |
|------|--------|------|
| API throughput | 1000 RPS on market endpoints for 5 min | k6 |
| WebSocket connections | 500 concurrent WS connections | Artillery |
| Database under load | 100 concurrent transactions | pgbench + custom scripts |
| Market-hub data throughput | 4 exchanges, all symbols, sustained 10 min | Custom stress test |

### Test Environment Requirements

```
Staging Environment:
  - Mirrors production topology (3 workers + market-hub via PM2)
  - Separate PostgreSQL and Redis instances
  - Test exchange API keys (Binance testnet, etc.)
  - Mock TRON payment processor
  - Seeded test data (users at each tier, sample invoices, trade history)

Test Data:
  - test_explorer@bitrium.test  (Explorer plan, active)
  - test_trader@bitrium.test    (Trader plan, active)
  - test_titan@bitrium.test     (Titan plan, active)
  - test_expired@bitrium.test   (Expired plan)
  - test_admin@bitrium.test     (Admin role)
  - test_noplan@bitrium.test    (No subscription)
  - test_2fa@bitrium.test       (2FA enabled)
```

---

## 10. Top 50 Likely Real-World Bugs

### Auth (1-8)

| # | Bug | Subsystem | Likely Severity | Why It Happens |
|---|-----|-----------|-----------------|----------------|
| 1 | Login allows case-sensitive email but signup lowercases it, so user can't login with original mixed-case email | Auth | P1 | Email normalization inconsistent between signup and login endpoints |
| 2 | JWT token not invalidated on password change, old sessions persist indefinitely | Auth | P1 | Stateless JWT has no server-side revocation list; password change doesn't bump token version |
| 3 | 2FA bypass possible if `twoFactorEnabled` flag can be set to `false` via user profile update API | Auth | P0 | API endpoint for profile update doesn't exclude security-sensitive fields |
| 4 | Rate limiter on login resets on any successful request, enabling brute force with alternating valid/invalid credentials | Auth | P1 | Rate limit keyed on IP, resets on 200 instead of tracking per-email |
| 5 | Password reset token has no expiry or no single-use enforcement | Auth | P1 | Token stored without `expiresAt` or `usedAt` column in DB |
| 6 | Google OAuth callback doesn't verify email domain or email verification status | Auth | P2 | OAuth implementation trusts all Google accounts without checking `email_verified` claim |
| 7 | Session persists in localStorage after logout, browser back button shows dashboard | Auth | P2 | Logout clears cookie but not localStorage/sessionStorage; no cache-control headers |
| 8 | Admin role check only on frontend (sidebar/route guard), not enforced on all backend API endpoints | Auth | P0 | Backend middleware for admin check missing on some routes; added to new routes but not all legacy ones |

### Payments (9-16)

| # | Bug | Subsystem | Likely Severity | Why It Happens |
|---|-----|-----------|-----------------|----------------|
| 9 | Invoice amount tolerance set too wide (plus or minus 1%) allows gaming: paying $0.50 for a $50 plan by sending 1% | Payments | P0 | Tolerance percentage applied to wrong base amount, or percentage too generous |
| 10 | Deposit address reused across invoices, causing wrong invoice to be credited | Payments | P0 | Address pool management doesn't properly mark addresses as in-use; freed too early |
| 11 | Late payment on expired invoice leaves money in limbo with no subscription created and no automatic refund | Payments | P1 | No reconciliation job for payments to expired invoices; edge case not handled |
| 12 | Webhook processed successfully but subscription creation fails (DB error), resulting in payment recorded but no plan | Payments | P0 | Non-atomic operation: webhook marks payment as processed before subscription INSERT succeeds |
| 13 | Duplicate webhook with different `logIndex` but same `txHash` creates double subscription | Payments | P1 | Idempotency check uses `txHash + logIndex` composite instead of `txHash` alone |
| 14 | Invoice created but user never pays, deposit address never freed for reuse | Payments | P2 | No cleanup job to reclaim addresses from EXPIRED invoices |
| 15 | Pro-rata upgrade calculation uses wrong number of remaining days (off-by-one or uses calendar days vs billing days) | Payments | P2 | `daysRemaining` calculated with `Math.floor` instead of `Math.ceil`, or timezone mismatch |
| 16 | Referral code grants feature access but no subscription record created, causing inconsistent state | Payments | P2 | Referral handler sets user flags but skips subscription table insert |

### Exchange (17-24)

| # | Bug | Subsystem | Likely Severity | Why It Happens |
|---|-----|-----------|-----------------|----------------|
| 17 | API key validation only checks format (length/regex), doesn't actually authenticate against exchange | Exchange | P2 | Validation endpoint skips live check to avoid rate limits, but user sees "connected" for invalid key |
| 18 | Multiple exchange accounts added but UI only shows the first one in the header dropdown | Exchange | P2 | Frontend query `getUserKeys` returns array but dropdown binds to `keys[0]` only |
| 19 | Order execution times out but order was actually filled on exchange, leading to duplicate order risk on retry | Exchange | P0 | No idempotent order ID (clientOrderId) sent, so retry creates a new order |
| 20 | Balance displayed from Redis cache doesn't match actual exchange balance (stale for minutes) | Exchange | P2 | Balance cache TTL too long, or cache not invalidated after order fill |
| 21 | Exchange disconnection not shown to user, trades executed against stale data | Exchange | P1 | WebSocket disconnect event doesn't propagate to frontend trade widget |
| 22 | Gate.io API key connected successfully but exchange not shown in terminal header dropdown | Exchange | P2 | Header dropdown hardcoded to show only Binance/Bybit/OKX; Gate.io added later but not to UI list |
| 23 | API key encrypted in transit (HTTPS) but stored as plaintext in PostgreSQL | Exchange | P0 | Encryption-at-rest not implemented for `api_secret` column; only `api_key` encrypted or neither |
| 24 | Exchange API rate limit from user-initiated actions not tracked separately from market-hub system requests | Exchange | P1 | Single weight counter for all requests; user REST calls push market-hub over budget |

### Market Data (25-32)

| # | Bug | Subsystem | Likely Severity | Why It Happens |
|---|-----|-----------|-----------------|----------------|
| 25 | Depth snapshot taken during WS recovery but WS already resumed, mixing stale snapshot with live deltas | Market Data | P1 | Race condition: WS reconnects before REST snapshot response arrives; snapshot overwrites newer data |
| 26 | Kline chart shows wrong timeframe after rapid switching between 1m/5m/15m/1h | Market Data | P2 | Previous timeframe subscription not cancelled before new one starts; old data arrives after new |
| 27 | Market-hub restart causes 30-second data gap visible as flat line on charts | Market Data | P2 | PM2 restart takes 5s + INIT/SNAPSHOT cycle takes 25s; no historical backfill for gap |
| 28 | Symbol not in active subscription list but user searches for it, gets empty page with no error message | Market Data | P3 | Search returns symbol metadata but data endpoints return empty; no "not available" message |
| 29 | BTC mini chart on Institutional page shows stale price after user switches primary coin to ETH | Market Data | P2 | Mini chart component doesn't re-subscribe when main coin context changes; shows last cached BTC data |
| 30 | Live Tape (trade feed) component accumulates DOM entries infinitely, causing memory leak and page slowdown | Market Data | P1 | No virtualization or entry limit on trade tape; appends to DOM on every trade event |
| 31 | Mock/placeholder data still displayed in signal panels because real data source not connected | Market Data | P2 | Development mock data left in component; conditional check for `NODE_ENV` missing or wrong |
| 32 | Weight metric shows inflated value due to sliding window residual from previous request burst | Market Data | P3 | Sliding window calculation doesn't properly expire old entries; shows accumulated weight |

### Frontend (33-42)

| # | Bug | Subsystem | Likely Severity | Why It Happens |
|---|-----|-----------|-----------------|----------------|
| 33 | Rapid coin dropdown switching causes multiple concurrent `useLiveMarketData` hooks running simultaneously | Frontend | P2 | useEffect cleanup doesn't abort previous subscription; multiple WS subscriptions active |
| 34 | Chart component doesn't unmount cleanly, leaving orphaned canvas elements and event listeners | Frontend | P2 | TradingView widget or custom chart library cleanup function not called in useEffect return |
| 35 | Pricing page shows old prices from browser cache after admin updates pricing | Frontend | P3 | Aggressive cache headers on API response; no cache-busting mechanism |
| 36 | Mobile layout completely broken because no responsive CSS applied below 768px | Frontend | P2 | TailwindCSS responsive classes only added for desktop; mobile viewport not tested |
| 37 | Dark mode is the only mode with no light mode option, limiting accessibility | Frontend | P3 | Design system built for dark only; not a bug per se, but limits user preference |
| 38 | Error boundary doesn't exist at route level, so a single component crash kills the entire page | Frontend | P1 | React error boundary not implemented; unhandled error in child component causes white screen |
| 39 | Admin-only sidebar menu items briefly visible after logout and re-login as normal user (until next render) | Frontend | P3 | User context updates asynchronously; sidebar renders with stale role for one frame |
| 40 | "Select a plan" button on pricing card is clickable even when no billing period is selected | Frontend | P2 | Button enabled state not tied to billing period selection; click sends null period to API |
| 41 | Loading skeleton shows indefinitely if API returns empty array (200 with `[]`) because code only checks for `data !== null` | Frontend | P2 | Loading state condition: `if (!data)` is false for empty array; should check `data === undefined` or `isLoading` flag |
| 42 | Browser console shows React key warnings and prop type errors in production build | Frontend | P3 | Missing `key` props in `.map()` calls; PropTypes warnings not stripped in build |

### AI Engine (43-46)

| # | Bug | Subsystem | Likely Severity | Why It Happens |
|---|-----|-----------|-----------------|----------------|
| 43 | AI response cached but market moved significantly since cache, serving stale trade signals | AI Engine | P1 | Cache TTL too long (hours); no price-change-based invalidation |
| 44 | AI provider timeout (90s) blocks the Express request handler, preventing concurrent AI requests | AI Engine | P1 | Synchronous await on AI call without request-level timeout; no background job queue |
| 45 | CLAUDE provider entry missing from module status endpoint, causing frontend error when rendering provider list | AI Engine | P2 | New provider added to backend but not registered in status/health check module |
| 46 | AI cost not tracked per request or per day, no visibility into AI spending | AI Engine | P2 | Token count and pricing not extracted from API response; only logged but not aggregated |

### Subscription / Access Control (47-50)

| # | Bug | Subsystem | Likely Severity | Why It Happens |
|---|-----|-----------|-----------------|----------------|
| 47 | User with expired "strategist" tier (plan removed from pricing) gets undefined behavior in tier rank comparison | Subscription | P1 | Tier rank map doesn't include "strategist"; `tierRanks["strategist"]` returns `undefined`, comparison fails |
| 48 | RequireTier component has hardcoded ranks where strategist=2, but tier was removed. Old subscribers with strategist get wrong access level | Subscription | P1 | Rank mapping not updated when tier removed; old data in subscriptions table still references it |
| 49 | Titan user downgrades to Explorer but retains access to Institutional page until they refresh the browser | Subscription | P2 | User context (React state) not re-fetched after plan change; stale tier in memory |
| 50 | Free trial or referral user has `hasActivePlan=true` but no `planTier` set, so RequirePlan passes but RequireTier crashes on null tier | Subscription | P1 | Referral/trial code sets active flag but doesn't assign tier; downstream code assumes tier exists when plan is active |

---

## Appendix A: Test Tooling Recommendations

| Category | Tool | Purpose |
|----------|------|---------|
| Unit Tests | Vitest (frontend), Jest (backend) | Component and function-level testing |
| Integration Tests | Supertest + Jest | API endpoint testing |
| E2E Tests | Playwright | Full browser automation |
| Load Tests | k6 / Artillery | Performance and stress testing |
| API Testing | Postman / Insomnia | Manual API exploration and collection |
| Error Tracking | Sentry | Runtime error capture (frontend + backend) |
| Monitoring | Prometheus + Grafana | Metrics collection and dashboards |
| Log Aggregation | Loki / ELK | Centralized log search and analysis |
| CI/CD | GitHub Actions | Automated test execution on PR and deploy |

## Appendix B: Test Coverage Targets

| Layer | Target Coverage | Rationale |
|-------|----------------|-----------|
| Auth module | 90%+ | Security-critical, must be thoroughly tested |
| Payment module | 90%+ | Financial operations, zero tolerance for bugs |
| Exchange integration | 80%+ | Complex external dependencies, mock-heavy |
| Market data | 75%+ | Real-time systems hard to unit test; focus on integration |
| AI engine | 70%+ | External API dependent; focus on error handling paths |
| Frontend components | 70%+ | UI-heavy; combine unit tests with E2E |
| Admin panel | 60%+ | Lower traffic but high impact; focus on critical paths |
| Route guards | 100% | Every guard must have a test for allowed and denied access |

## Appendix C: QA Process Workflow

```
Feature Development:
  1. Developer writes code + unit tests
  2. PR created -> CI runs smoke + integration tests
  3. Code review (peer + security review for auth/payment changes)
  4. Merge to staging -> full integration + E2E suite runs
  5. QA manual testing on staging (critical journeys + edge cases)
  6. Sign-off -> merge to production
  7. Post-deploy smoke tests run automatically
  8. Monitor alerts for 30 minutes post-deploy

Hotfix Process:
  1. P0/P1 bug identified
  2. Hotfix branch created from production
  3. Fix implemented with regression test
  4. Expedited review (1 reviewer minimum)
  5. Deploy to staging -> smoke tests
  6. Deploy to production -> monitor
  7. Post-mortem within 48 hours
```

---

*Document maintained by the Bitrium Engineering Team. Review quarterly or after major architecture changes.*
