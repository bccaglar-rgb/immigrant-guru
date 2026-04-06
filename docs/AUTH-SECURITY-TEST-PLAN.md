# Bitrium Auth & Security Test Plan

> **Version:** 1.0
> **Auth Stack:** JWT + pbkdf2 + TOTP 2FA, Redis token blacklist
> **Last Updated:** 2026-04-04

---

## 1. Login Valid/Invalid Tests

| # | Scenario | Input | Expected Result |
|---|---|---|---|
| 1 | Valid credentials | Correct email + password | 200, JWT returned, redirect to dashboard |
| 2 | Wrong password | Correct email, wrong password | 401 "Invalid credentials" |
| 3 | Non-existent email | Unknown email | 401 "Invalid credentials" (same message as wrong password) |
| 4 | Email case sensitivity | `User@Example.COM` | Should match `user@example.com` (case-insensitive lookup) |
| 5 | SQL injection in email | `' OR 1=1 --` | 401 or 400, no SQL error exposed |
| 6 | XSS in email field | `<script>alert(1)</script>@test.com` | Input sanitized, 400 invalid email format |
| 7 | Empty email | `""` | 400 "Email required" |
| 8 | Empty password | `""` | 400 "Password required" |
| 9 | Very long password (10,000 chars) | 10KB string | 400 or handled gracefully (no DoS via pbkdf2) |
| 10 | Unicode in password | `p@$$w0rd` | Works if originally set with Unicode |
| 11 | Leading/trailing whitespace in email | `" user@test.com "` | Trimmed before lookup |
| 12 | Null byte in email | `user%00@test.com` | Rejected, 400 |
| 13 | Password with null byte | `pass\x00word` | Rejected or handled without truncation |
| 14 | Concurrent logins, same account | Two simultaneous requests | Both succeed, both get valid JWTs |
| 15 | Login with disabled account | Account flagged as disabled | 403 "Account disabled" |

---

## 2. Brute Force Protection

| # | Test | Expected |
|---|---|---|
| 1 | 5 failed logins in 1 minute, same IP | Rate limited: 429 "Too many attempts" |
| 2 | 10 failed logins, same email, different IPs | Account-level lockout or CAPTCHA required |
| 3 | Rate limit reset after waiting | After cooldown period, login attempts allowed again |
| 4 | Successful login resets failure counter | After 4 failures + 1 success, counter resets to 0 |
| 5 | Credential stuffing (100 emails, 1 password) | IP-level rate limit triggers |
| 6 | Distributed attack (100 IPs, same email) | Account-level protection triggers |
| 7 | Rate limit bypass via X-Forwarded-For | Server ignores spoofed headers behind trusted proxy only |
| 8 | Rate limit on 2FA code attempts | Max 5 TOTP attempts before temporary lockout |
| 9 | Login rate limit response leaks info | 429 response does not reveal if email exists |
| 10 | Rate limit headers present | `Retry-After` header in 429 response |

---

## 3. JWT Expiry Handling

| # | Scenario | Expected |
|---|---|---|
| 1 | Token expires during idle session | Next API call returns 401, frontend redirects to login |
| 2 | Token expires mid-API-call | Response is 401, frontend handles gracefully (no crash) |
| 3 | Token expires during WebSocket session | Server sends `auth_expired` event, client reconnects with refresh |
| 4 | Access token expired, refresh token valid | Silent refresh: new access token issued, request retried |
| 5 | Both tokens expired | Redirect to login, clear all stored tokens |
| 6 | Token expiry during file upload | Upload fails with 401, user prompted to re-login |
| 7 | Token expiry during TRON payment polling | Payment polling stops, user re-authenticates, polling resumes |
| 8 | Clock skew: client clock 5 min ahead | Server-side validation uses server time, not client time |
| 9 | Token with `exp: 0` | Rejected as expired |
| 10 | Token with no `exp` claim | Rejected (expiry required) |

---

## 4. Refresh Token Rotation Tests

| # | Test | Expected |
|---|---|---|
| 1 | Normal refresh | New access + refresh token pair issued, old refresh invalidated |
| 2 | Replay old refresh token | Rejected (rotation detection), all sessions revoked |
| 3 | Concurrent refresh requests | Only first succeeds, second gets 401 (race handling) |
| 4 | Refresh from different IP | Allowed (users switch networks) but logged |
| 5 | Refresh token stored in httpOnly cookie | Not accessible via JavaScript |
| 6 | Refresh after password change | All existing refresh tokens invalidated |
| 7 | Refresh token expiry (7-day) | After 7 days of inactivity, full re-login required |
| 8 | Refresh during active WebSocket | WS continues with new access token |

---

## 5. Logout Invalidation

| # | Test | Expected |
|---|---|---|
| 1 | API call with token after logout | 401 (token blacklisted in Redis) |
| 2 | WebSocket with token after logout | Connection terminated |
| 3 | Logout clears localStorage | `token`, `refreshToken`, `user` keys removed |
| 4 | Logout clears Zustand store | User state reset to null/default |
| 5 | Logout from multiple tabs | All tabs redirect to login (storage event listener) |
| 6 | Logout API endpoint fails | Frontend still clears local state (defensive logout) |
| 7 | Token blacklist survives Redis restart | Blacklist persisted or tokens have short enough TTL |
| 8 | Refresh token also invalidated on logout | Refresh token cannot be used post-logout |

---

## 6. Multi-Device Session Behavior

| # | Scenario | Expected |
|---|---|---|
| 1 | Login on Device A, then Device B | Both sessions active simultaneously |
| 2 | Logout on Device A | Device A session ended, Device B unaffected |
| 3 | Change password on Device A | All other device sessions invalidated |
| 4 | Enable 2FA on Device A | Other devices remain logged in until token expires |
| 5 | Admin disables user account | All active sessions terminated within token check cycle |
| 6 | Plan upgrade on Device A | Device B sees new plan on next API call or navigation |
| 7 | Maximum concurrent sessions | Configurable limit (e.g., 5 devices); oldest session revoked |

---

## 7. Two-Factor Authentication (2FA) Flow

| # | Test | Expected |
|---|---|---|
| 1 | Enable 2FA: correct TOTP code | 2FA enabled, backup codes shown |
| 2 | Enable 2FA: incorrect code | "Invalid code" error, 2FA not enabled |
| 3 | Login with 2FA: correct code | Login succeeds |
| 4 | Login with 2FA: wrong code | "Invalid 2FA code" error |
| 5 | Login with 2FA: expired code (previous window) | Rejected (strict window) or accepted (1-window tolerance) |
| 6 | Login with 2FA: replayed code | Same code used twice in same window: rejected |
| 7 | Disable 2FA: requires current password | Password verified before disabling |
| 8 | Backup code usage | Valid backup code works, gets consumed (one-time use) |
| 9 | All backup codes used | User prompted to generate new codes |
| 10 | 2FA bypass via API | Direct API login without 2FA step: blocked by backend |
| 11 | 2FA code brute force | Rate limited after 5 attempts |
| 12 | 2FA setup QR code contains correct secret | Scan QR, verify TOTP matches |
| 13 | 2FA with clock drift > 30s | Code may be rejected; document tolerance window |
| 14 | TOTP secret stored encrypted | Database stores encrypted secret, not plaintext |

---

## 8. RequirePlan Bypass Attempts (10 Cases)

| # | Attack | Method | Expected |
|---|---|---|---|
| 1 | Set `plan: "explorer"` in localStorage | DevTools | Backend verifies plan from JWT/DB, not localStorage |
| 2 | Modify Zustand `user.plan` | React DevTools | Frontend guard may pass, API returns 403 |
| 3 | Call plan-required API without plan | Direct `curl` call | 403 "Active plan required" |
| 4 | Expired plan, cached JWT | JWT still has old plan | Backend checks plan expiry in DB |
| 5 | Downgraded plan, stale frontend | Plan downgraded server-side | Next API call returns 403, frontend refreshes state |
| 6 | Plan with future start date | Plan not yet active | Backend checks `startDate <= now` |
| 7 | Cancelled plan, grace period | Plan cancelled but grace period active | Access allowed during grace period only |
| 8 | Modify JWT `plan` claim | Re-encode JWT payload | Signature invalid, 401 |
| 9 | Null plan claim in JWT | Token issued without plan | RequirePlan blocks |
| 10 | Plan type not in enum | `plan: "superplan"` | Backend rejects unknown plan type |

---

## 9. RequireTier Bypass Attempts (10 Cases)

| # | Attack | Method | Expected |
|---|---|---|---|
| 1 | Explorer accessing `/war-room` API endpoints | Direct API call | 403 "Titan tier required" |
| 2 | Trader accessing `/institutional` API | Direct API call | 403 "Titan tier required" |
| 3 | Forge JWT with `tier: "titan"` | Modified token | Signature invalid, 401 |
| 4 | Set `tier: "titan"` in Zustand | React DevTools | Frontend shows page, all API calls return 403 |
| 5 | Explorer accesses Titan WS channels | Subscribe to Titan-only WS topic | Subscription rejected by server |
| 6 | Downgraded mid-WS-session | Was Titan, now Explorer, WS still connected | Server terminates Titan subscriptions |
| 7 | Tier check only on route entry | Navigate to Titan page, then tier downgraded | Periodic re-check or API enforcement |
| 8 | Tier boundary: Trader bot limits | Trader tries to create more bots than allowed | Backend enforces tier-specific limits |
| 9 | Titan trial expired | Trial period ended | Reverts to previous tier, Titan pages blocked |
| 10 | Multiple tier claims in JWT | `tiers: ["explorer", "titan"]` | Backend uses highest valid tier from subscription DB |

---

## 10. RequireAdmin Bypass Attempts (10 Cases)

| # | Attack | Method | Expected |
|---|---|---|---|
| 1 | Non-admin calls `/api/admin/*` | Direct API call | 403 "Admin access required" |
| 2 | Set `role: "admin"` in localStorage | DevTools | Backend reads role from JWT/DB |
| 3 | Modify Zustand `user.role` | React DevTools | API calls fail with 403 |
| 4 | Forge JWT with `role: "admin"` | Modified token | Signature invalid, 401 |
| 5 | Self-promote via user update API | PATCH `/api/users/self` with `role: "admin"` | Endpoint ignores role field for self-update |
| 6 | Admin endpoint without auth header | No `Authorization` header | 401 Unauthorized |
| 7 | Old admin token after role revocation | Admin demoted, old JWT | Backend checks role in DB on admin endpoints |
| 8 | SQL injection in admin search | `' OR 1=1 --` in user search | Parameterized query, no injection |
| 9 | Admin API returns user passwords | GET `/api/admin/users` | Passwords never included in response |
| 10 | Admin bulk operations without confirmation | Mass delete/modify | Require confirmation token for destructive ops |

---

## 11. Role Confusion Bugs

| # | Scenario | Expected |
|---|---|---|
| 1 | User changes `role` in localStorage to "admin" | Backend ignores, all admin API calls fail |
| 2 | JWT has `role: "admin"` but DB has `role: "user"` | Backend uses DB as source of truth for admin endpoints |
| 3 | Frontend shows admin sidebar for manipulated role | Acceptable (cosmetic), but no data loads |
| 4 | User object in Zustand desynchronized from JWT | Next token refresh syncs state |
| 5 | Role change during active session | Admin revokes role, user still has valid token | Role check on sensitive endpoints queries DB |

---

## 12. Stale Subscription Tests

| # | Scenario | Expected |
|---|---|---|
| 1 | Plan expires at midnight, user active at 11:59 PM | At midnight, next API call returns 403, frontend shows "Plan expired" |
| 2 | Plan expired, JWT still has `plan: "explorer"` | Backend checks subscription table, not just JWT |
| 3 | Payment failed, plan should be suspended | Grace period (e.g., 3 days), then suspension |
| 4 | User on Titan, payment fails, accesses War Room | During grace period: allowed. After: blocked |
| 5 | Subscription reactivated | Immediate access restoration without re-login |
| 6 | Backdated subscription | `startDate` in past, `endDate` in future | Access granted |
| 7 | Subscription with zero-length duration | `startDate == endDate` | Treated as expired |

---

## 13. Direct API Access Without Auth Header

| # | Endpoint Category | Expected |
|---|---|---|
| 1 | Public endpoints (`/api/auth/login`, `/api/auth/register`) | 200 (these don't require auth) |
| 2 | User endpoints (`/api/user/profile`) | 401 Unauthorized |
| 3 | Trading endpoints (`/api/exchange/*`) | 401 Unauthorized |
| 4 | Admin endpoints (`/api/admin/*`) | 401 Unauthorized |
| 5 | WebSocket connection without token | Connection rejected |
| 6 | AI endpoints (`/api/ai/*`) | 401 Unauthorized |
| 7 | Payment endpoints (`/api/payment/*`) | 401 Unauthorized |
| 8 | Malformed `Authorization` header (`Bearer `) | 401, empty token rejected |
| 9 | `Authorization: Basic base64creds` | 401, wrong scheme |
| 10 | `Authorization: Bearer null` | 401, "null" is not a valid JWT |

---

## 14. Frontend-Only vs Backend Enforcement Gaps

| Check | Frontend | Backend | Gap Risk |
|---|---|---|---|
| Route access by plan | RequirePlan guard | Middleware checks subscription | If backend missing, data leaks |
| Route access by tier | RequireTier guard | Middleware checks tier | If backend missing, Titan data leaks |
| Admin access | RequireAdmin guard | Admin middleware | If backend missing, full admin access |
| Bot creation limits | UI disables button | API enforces limit | If backend missing, unlimited bots |
| Order validation | Form validation | API validates all fields | If backend missing, invalid orders |
| Rate limiting | No frontend limit | Express rate limiter | If backend missing, abuse possible |
| Input sanitization | React escapes by default | Server sanitizes inputs | Both layers needed |
| CSRF protection | SameSite cookies | CSRF token validation | If backend missing, CSRF attacks |

**Rule:** Every frontend restriction MUST have a corresponding backend enforcement. Frontend is UX; backend is security.

---

## 15. Expired Token in WebSocket

| # | Scenario | Expected |
|---|---|---|
| 1 | Token expires during active WS connection | Server sends `token_expired` event |
| 2 | Client receives `token_expired` | Client attempts silent refresh |
| 3 | Silent refresh succeeds | Client sends new token via WS, connection continues |
| 4 | Silent refresh fails (refresh token expired) | Client disconnects WS, redirects to login |
| 5 | Server validates token on every WS message | Yes, or periodic re-validation (every 60s) |
| 6 | Client sends message with expired token | Message rejected, `auth_required` event sent |

---

## 16. Session Desync Between Tabs

| # | Scenario | Expected |
|---|---|---|
| 1 | Login in Tab A, Tab B still on login page | Tab B detects auth via `storage` event, redirects to dashboard |
| 2 | Logout in Tab A, Tab B on dashboard | Tab B detects logout via `storage` event, redirects to login |
| 3 | Plan upgrade in Tab A | Tab B picks up new plan on next navigation or via `storage` event |
| 4 | Token refresh in Tab A | Tab B uses new token (shared via localStorage) |
| 5 | Two tabs refresh token simultaneously | Token rotation race: one tab gets 401, retries with new token |
| 6 | Tab A on Titan page, Tab B downgrades | Tab A blocks on next navigation or API call |

---

## 17. Race Conditions: Login/Logout

| # | Scenario | Expected |
|---|---|---|
| 1 | Click login, then immediately click logout | Whichever completes last wins; state consistent |
| 2 | Double-click login button | Only one request sent (button disabled on first click) |
| 3 | Refresh token while logout in progress | Logout takes priority, refresh cancelled |
| 4 | Navigate to protected page during login request | Wait for login to complete, then evaluate guard |
| 5 | WS reconnect during logout | WS reconnect cancelled, connection closed |

---

## 18. Admin Privilege Escalation Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | User modifies own role via profile update | `role` field excluded from user self-update endpoint |
| 2 | IDOR: admin edits user by guessing ID | Admin endpoints validate caller is admin, not just valid user |
| 3 | Mass assignment: extra fields in request body | Whitelist accepted fields per endpoint |
| 4 | Admin creates user with admin role | Allowed (intended), but logged as security event |
| 5 | Admin deletes own account | Prevented (at least one admin must exist) |
| 6 | Horizontal escalation: admin accesses another admin's data | Same-tier access rules apply |
| 7 | Admin API key leaks | Admin endpoints require fresh re-authentication for destructive ops |

---

## 19. Auth Event Logging Requirements

Every auth event must be logged with these fields:

| Event | Fields | Severity |
|---|---|---|
| `auth.login.success` | userId, email, ip, userAgent, timestamp | INFO |
| `auth.login.failure` | email, ip, userAgent, reason, timestamp | WARN |
| `auth.login.brute_force` | ip, email, attemptCount, timestamp | ALERT |
| `auth.logout` | userId, ip, timestamp | INFO |
| `auth.token.refresh` | userId, ip, timestamp | DEBUG |
| `auth.token.expired` | userId, tokenId, timestamp | INFO |
| `auth.token.blacklisted` | userId, tokenId, reason, timestamp | INFO |
| `auth.2fa.enabled` | userId, timestamp | INFO |
| `auth.2fa.disabled` | userId, ip, timestamp | WARN |
| `auth.2fa.failure` | userId, ip, attemptCount, timestamp | WARN |
| `auth.password.changed` | userId, ip, timestamp | WARN |
| `auth.role.changed` | targetUserId, oldRole, newRole, changedBy, timestamp | ALERT |
| `auth.plan.changed` | userId, oldPlan, newPlan, timestamp | INFO |
| `auth.session.revoked` | userId, revokedBy, reason, timestamp | WARN |
| `auth.admin.action` | adminUserId, action, targetId, timestamp | ALERT |

---

## 20. Suspicious Behavior Detection Rules

| Rule | Trigger | Action |
|---|---|---|
| Brute force | > 5 failed logins in 60s from same IP | Block IP for 15 min, alert admin |
| Credential stuffing | > 20 failed logins in 60s, different emails | Block IP, alert admin |
| Token replay | Blacklisted token reused | Log alert, may indicate token theft |
| Impossible travel | Login from 2 geolocations > 500km apart within 1 hour | Flag for review, optional 2FA challenge |
| Admin abuse | > 10 admin actions in 1 minute | Rate limit admin, alert |
| Plan manipulation | Multiple plan change requests in short window | Flag for review |
| WS flood | > 100 WS messages/second from single client | Throttle, then disconnect |
| Scraping | > 500 API requests/minute from single user | Rate limit, flag for review |
| Session hijack | Token used from different IP than issued | Optional: require re-auth |
| Role escalation attempt | Non-admin calls admin endpoint | Log attempt, count frequency |

---

## 21. Negative Test Cases (30)

| # | Category | Test | Input | Expected Status | Expected Body |
|---|---|---|---|---|---|
| 1 | Login | Missing email | `{password: "x"}` | 400 | `{error: "Email required"}` |
| 2 | Login | Missing password | `{email: "a@b.com"}` | 400 | `{error: "Password required"}` |
| 3 | Login | Invalid JSON | `{broken` | 400 | `{error: "Invalid request body"}` |
| 4 | Login | Wrong password | `{email: "user@b.com", password: "wrong"}` | 401 | `{error: "Invalid credentials"}` |
| 5 | Login | SQL injection | `{email: "' OR 1=1 --", password: "x"}` | 401 | `{error: "Invalid credentials"}` |
| 6 | Login | Disabled account | Valid creds, disabled flag | 403 | `{error: "Account disabled"}` |
| 7 | 2FA | Wrong TOTP | `{code: "000000"}` | 401 | `{error: "Invalid 2FA code"}` |
| 8 | 2FA | Expired TOTP | Previous time window | 401 | `{error: "Invalid 2FA code"}` |
| 9 | 2FA | Replayed TOTP | Same code, second use | 401 | `{error: "Code already used"}` |
| 10 | 2FA | Non-numeric code | `{code: "abcdef"}` | 400 | `{error: "Code must be 6 digits"}` |
| 11 | Register | Duplicate email | Existing email | 409 | `{error: "Email already registered"}` |
| 12 | Register | Weak password | `{password: "123"}` | 400 | `{error: "Password too weak"}` |
| 13 | Register | Invalid email format | `{email: "notanemail"}` | 400 | `{error: "Invalid email format"}` |
| 14 | Auth | No auth header | Protected endpoint, no header | 401 | `{error: "Authentication required"}` |
| 15 | Auth | Malformed token | `Authorization: Bearer garbage` | 401 | `{error: "Invalid token"}` |
| 16 | Auth | Expired token | Expired JWT | 401 | `{error: "Token expired"}` |
| 17 | Auth | Blacklisted token | Post-logout JWT | 401 | `{error: "Token revoked"}` |
| 18 | Plan | No plan, access plan-required | Valid JWT, no plan | 403 | `{error: "Active plan required"}` |
| 19 | Tier | Explorer on Titan endpoint | Explorer JWT | 403 | `{error: "Titan tier required"}` |
| 20 | Tier | Trader on Titan endpoint | Trader JWT | 403 | `{error: "Titan tier required"}` |
| 21 | Admin | Non-admin on admin endpoint | User JWT | 403 | `{error: "Admin access required"}` |
| 22 | Admin | Admin on user endpoint (IDOR) | Admin accessing other user's private data | 403 | `{error: "Access denied"}` |
| 23 | Password | Change with wrong current | Wrong current password | 401 | `{error: "Current password incorrect"}` |
| 24 | Password | New password same as old | Same password | 400 | `{error: "New password must differ"}` |
| 25 | Refresh | Expired refresh token | Old refresh token | 401 | `{error: "Refresh token expired"}` |
| 26 | Refresh | Invalid refresh token | Random string | 401 | `{error: "Invalid refresh token"}` |
| 27 | Refresh | Replayed refresh token | Used refresh token (rotation) | 401 | All sessions revoked |
| 28 | Rate | Exceeded login rate limit | 6th attempt in 60s | 429 | `{error: "Too many attempts", retryAfter: 900}` |
| 29 | Rate | Exceeded 2FA rate limit | 6th code attempt | 429 | `{error: "Too many attempts"}` |
| 30 | CSRF | Missing CSRF token on state-changing request | POST without token | 403 | `{error: "Invalid CSRF token"}` |
