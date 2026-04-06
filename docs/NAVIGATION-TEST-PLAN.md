# Bitrium Navigation & Route Integrity Test Plan

> **Version:** 1.0
> **Router:** React Router v6
> **Guards:** RequireAuth, RequirePlan, RequireTier, RequireAdmin
> **Last Updated:** 2026-04-04

---

## 1. Route Integrity Checklist

Every defined route with its guard chain and expected behavior.

| Route Path | Guards | Lazy Loaded | Sidebar Visible | Page Title |
|---|---|---|---|---|
| `/` | None | No | No | "Bitrium - Crypto Intelligence" |
| `/login` | RedirectIfAuth | No | No | "Login - Bitrium" |
| `/register` | RedirectIfAuth | No | No | "Register - Bitrium" |
| `/pricing` | None | Yes | Conditional | "Pricing - Bitrium" |
| `/dashboard` | RequireAuth | Yes | Yes | "Dashboard - Bitrium" |
| `/sniper` | RequireAuth, RequirePlan | Yes | Yes | "Sniper - Bitrium" |
| `/coin-insight` | RequireAuth, RequirePlan | Yes | Yes | "Coin Insight - Bitrium" |
| `/coin-insight/:coinId` | RequireAuth, RequirePlan | Yes | Yes | "{Coin Name} - Bitrium" |
| `/super-charts` | RequireAuth, RequirePlan | Yes | Yes | "Super Charts - Bitrium" |
| `/coin-universe` | RequireAuth, RequirePlan | Yes | Yes | "Coin Universe - Bitrium" |
| `/crypto-market` | RequireAuth, RequirePlan | Yes | Yes | "Crypto Market - Bitrium" |
| `/exchange-terminal` | RequireAuth, RequirePlan | Yes | Yes | "Exchange Terminal - Bitrium" |
| `/bots` | RequireAuth, RequirePlan, RequireTier(trader) | Yes | Yes | "Bots - Bitrium" |
| `/portfolio` | RequireAuth, RequirePlan | Yes | Yes | "Portfolio - Bitrium" |
| `/institutional` | RequireAuth, RequireTier(titan) | Yes | Yes | "Institutional - Bitrium" |
| `/master` | RequireAuth, RequireTier(titan) | Yes | Yes | "Master - Bitrium" |
| `/war-room` | RequireAuth, RequireTier(titan) | Yes | Yes | "War Room - Bitrium" |
| `/settings` | RequireAuth | Yes | Yes | "Settings - Bitrium" |
| `/settings/2fa` | RequireAuth | Yes | Yes | "Two-Factor Auth - Bitrium" |
| `/admin` | RequireAuth, RequireAdmin | Yes | Yes | "Admin - Bitrium" |
| `/admin/users` | RequireAuth, RequireAdmin | Yes | Yes | "User Management - Bitrium" |
| `/admin/payments` | RequireAuth, RequireAdmin | Yes | Yes | "Payments - Bitrium" |
| `*` (catch-all) | None | No | Conditional | "404 - Bitrium" |

---

## 2. Redirect Matrix

When a user accesses a route they lack permission for, the system redirects them. This matrix documents every redirect scenario.

### Guest (Not Authenticated)

| Attempted Route | Redirect To | Query Param |
|---|---|---|
| `/dashboard` | `/login` | `?returnTo=/dashboard` |
| `/sniper` | `/login` | `?returnTo=/sniper` |
| `/coin-insight` | `/login` | `?returnTo=/coin-insight` |
| `/war-room` | `/login` | `?returnTo=/war-room` |
| `/admin` | `/login` | `?returnTo=/admin` |
| `/settings` | `/login` | `?returnTo=/settings` |
| `/bots` | `/login` | `?returnTo=/bots` |
| Any protected route | `/login` | `?returnTo={path}` |

### Authenticated, No Active Plan

| Attempted Route | Redirect To | Flash Message |
|---|---|---|
| `/sniper` | `/pricing` | "Subscribe to access Sniper" |
| `/coin-insight` | `/pricing` | "Subscribe to access Coin Insight" |
| `/exchange-terminal` | `/pricing` | "Subscribe to access Exchange Terminal" |
| `/bots` | `/pricing` | "Subscribe to access Bots" |
| `/dashboard` | `/dashboard` | Renders (always accessible) |
| `/settings` | `/settings` | Renders (always accessible) |

### Explorer Tier (No Titan Access)

| Attempted Route | Redirect To | Flash Message |
|---|---|---|
| `/institutional` | `/pricing` | "Upgrade to Titan for Institutional" |
| `/master` | `/pricing` | "Upgrade to Titan for Master" |
| `/war-room` | `/pricing` | "Upgrade to Titan for War Room" |
| `/admin` | `/dashboard` | None (silent redirect) |

### Trader Tier (No Titan Access)

| Attempted Route | Redirect To | Flash Message |
|---|---|---|
| `/institutional` | `/pricing` | "Upgrade to Titan for Institutional" |
| `/master` | `/pricing` | "Upgrade to Titan for Master" |
| `/war-room` | `/pricing` | "Upgrade to Titan for War Room" |
| `/bots` | `/bots` | Renders (Trader has bot access) |
| `/admin` | `/dashboard` | None (silent redirect) |

### Non-Admin (Any Tier)

| Attempted Route | Redirect To |
|---|---|
| `/admin` | `/dashboard` |
| `/admin/users` | `/dashboard` |
| `/admin/payments` | `/dashboard` |

---

## 3. Direct URL Access Tests

Test each route by typing the URL directly in the browser address bar.

| # | Test | URL | Auth State | Expected |
|---|---|---|---|---|
| 1 | Guest direct to dashboard | `/dashboard` | None | Redirect `/login?returnTo=/dashboard` |
| 2 | Guest direct to admin | `/admin` | None | Redirect `/login?returnTo=/admin` |
| 3 | Explorer direct to war-room | `/war-room` | Explorer JWT | Redirect `/pricing` |
| 4 | Titan direct to war-room | `/war-room` | Titan JWT | Page renders |
| 5 | Admin direct to admin | `/admin` | Admin JWT | Page renders |
| 6 | Explorer direct to bots | `/bots` | Explorer JWT | Redirect `/pricing` |
| 7 | Trader direct to bots | `/bots` | Trader JWT | Page renders |
| 8 | Any user direct to 404 path | `/nonexistent/path` | Any | 404 page |
| 9 | Guest direct to settings/2fa | `/settings/2fa` | None | Redirect `/login` |
| 10 | Expired JWT direct to dashboard | `/dashboard` | Expired JWT | Redirect `/login` |
| 11 | Valid JWT direct to login | `/login` | Valid JWT | Redirect `/dashboard` |
| 12 | Deep link: coin insight detail | `/coin-insight/BTC` | Valid JWT | Coin page loads for BTC |

---

## 4. Browser Refresh on Protected Pages

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Refresh dashboard | Login, navigate to dashboard, press F5 | Dashboard reloads, user stays authenticated |
| 2 | Refresh war-room as Titan | Navigate to war-room, press F5 | Page reloads, WS reconnects |
| 3 | Refresh after token expiry | Stay on page until token expires, press F5 | Redirect to login |
| 4 | Refresh admin page | Login as admin, go to admin, press F5 | Admin page reloads |
| 5 | Refresh coin-insight with param | Go to `/coin-insight/ETH`, press F5 | ETH insight page reloads |
| 6 | Refresh exchange-terminal mid-order | Fill order form, press F5 | Form resets, no duplicate order |
| 7 | Refresh settings after unsaved changes | Change a field, press F5 | Browser "unsaved changes" prompt |
| 8 | Hard refresh (Ctrl+Shift+R) | On any authenticated page | Full reload, token read from storage |

---

## 5. Back/Forward Button Behavior After Logout

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Back after logout | Login -> Dashboard -> Sniper -> Logout -> Press Back | Redirect to `/login`, NOT Sniper |
| 2 | Forward after re-login | Logout -> Login -> Press Forward | Safe page or dashboard |
| 3 | Back into Titan page post-downgrade | As Titan: War Room -> Downgrade to Explorer -> Press Back | Redirect to `/pricing`, NOT War Room |
| 4 | Back to login after login | Login (redirects to dashboard) -> Press Back | Stay on dashboard, NOT login form |
| 5 | Multiple backs after logout | Dashboard -> Sniper -> Coin Insight -> Logout -> Back x3 | All redirect to `/login` |
| 6 | Forward from login to protected | Guest: Attempts `/dashboard` -> redirected to login -> Login -> Forward | Should go to dashboard (returnTo) |

---

## 6. Login Redirect (Return-To Flow)

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Guest visits `/sniper`, logs in | After login, redirected to `/sniper` (not `/dashboard`) |
| 2 | Guest visits `/war-room`, logs in as Explorer | After login, redirected to `/pricing` (lack tier) |
| 3 | Guest visits `/war-room`, logs in as Titan | After login, redirected to `/war-room` |
| 4 | Guest visits `/admin`, logs in as non-admin | After login, redirected to `/dashboard` (lack admin) |
| 5 | Guest visits `/admin`, logs in as admin | After login, redirected to `/admin` |
| 6 | `returnTo` contains XSS: `/login?returnTo=javascript:alert(1)` | Ignored, redirect to `/dashboard` |
| 7 | `returnTo` contains external URL: `/login?returnTo=https://evil.com` | Ignored, redirect to `/dashboard` |
| 8 | `returnTo` contains path traversal: `/login?returnTo=/../etc/passwd` | Ignored, redirect to `/dashboard` |
| 9 | No `returnTo` param | After login, redirect to `/dashboard` |
| 10 | Empty `returnTo`: `/login?returnTo=` | After login, redirect to `/dashboard` |

---

## 7. Plan Upgrade Redirect Flow

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Explorer upgrades to Titan | Complete payment -> Plan active | Sidebar shows Titan links, can navigate to `/war-room` |
| 2 | No-plan user subscribes to Explorer | Complete payment | Can access `/sniper`, `/coin-insight`, etc. |
| 3 | Trader upgrades to Titan mid-session | Upgrade without logout | New pages accessible immediately (Zustand update) |
| 4 | Plan upgrade via different tab | Upgrade in Tab B, Tab A still open | Tab A reflects new plan on next navigation or API call |
| 5 | Upgrade but payment pending | TRON payment sent, awaiting confirmation | Pages still blocked until webhook confirms |
| 6 | Downgrade from Titan to Explorer | Downgrade takes effect | Titan pages redirect to `/pricing` |

---

## 8. Dead Link Audit

Verify every sidebar link resolves to a defined route.

| Sidebar Section | Link Label | Expected Route | Link Works |
|---|---|---|---|
| Main | Dashboard | `/dashboard` | [ ] |
| Main | Sniper | `/sniper` | [ ] |
| Main | Coin Insight | `/coin-insight` | [ ] |
| Main | Super Charts | `/super-charts` | [ ] |
| Main | Coin Universe | `/coin-universe` | [ ] |
| Main | Crypto Market | `/crypto-market` | [ ] |
| Trading | Exchange Terminal | `/exchange-terminal` | [ ] |
| Trading | Bots | `/bots` | [ ] |
| Trading | Portfolio | `/portfolio` | [ ] |
| Titan | Institutional | `/institutional` | [ ] |
| Titan | Master | `/master` | [ ] |
| Titan | War Room | `/war-room` | [ ] |
| System | Settings | `/settings` | [ ] |
| System | Pricing | `/pricing` | [ ] |
| Admin | Admin Panel | `/admin` | [ ] |
| Admin | Users | `/admin/users` | [ ] |
| Admin | Payments | `/admin/payments` | [ ] |

Additional dead link checks:
- [ ] All CTA buttons on pricing page link to correct payment flows
- [ ] "Upgrade" banners on restricted pages link to `/pricing`
- [ ] Footer links (if any) resolve correctly
- [ ] Logo click returns to `/dashboard` (authenticated) or `/` (guest)
- [ ] Notification links navigate to correct detail pages

---

## 9. 404 Handling

| # | Test | Expected |
|---|---|---|
| 1 | Navigate to `/foobar` | 404 page with "Back to Dashboard" link |
| 2 | Navigate to `/admin/foobar` as admin | 404 page (not admin sub-page error) |
| 3 | Navigate to `/coin-insight/INVALIDCOIN` | Coin page with "Coin not found" (not generic 404) |
| 4 | Navigate to nested invalid: `/a/b/c/d` | 404 page |
| 5 | 404 page has correct document.title | "404 - Bitrium" |
| 6 | 404 page does not show sidebar for guests | No sidebar, just 404 message |
| 7 | 404 page shows sidebar for authenticated users | Sidebar visible for navigation |
| 8 | API returns 404 for resource | Page shows "Not found" message, not white screen |

---

## 10. Lazy Load Failure Handling

| # | Scenario | Expected |
|---|---|---|
| 1 | Network offline during chunk load | Error boundary with "Retry" button |
| 2 | CDN returns 500 for chunk | Error boundary with "Retry" button |
| 3 | Chunk hash mismatch (deploy during session) | Error boundary suggesting page refresh |
| 4 | Slow network: chunk takes 10s | Loading spinner visible, no timeout crash |
| 5 | Multiple rapid route changes during load | Only final route's chunk matters; no race condition |
| 6 | Retry button after chunk failure | Re-attempts lazy import, loads page |
| 7 | React.lazy fallback renders | `<Suspense fallback={...}>` shows skeleton |

---

## 11. Route Guard Penetration Tests (20 Cases)

| # | Test | Method | Expected |
|---|---|---|---|
| 1 | Forge JWT with admin role | Craft token, set in localStorage | Backend rejects (invalid signature) |
| 2 | Modify Zustand store via DevTools | Set `user.role = 'admin'` | Frontend may show link, backend blocks all API calls |
| 3 | Replay expired token | Use previously valid token | 401 from backend, guard redirects |
| 4 | Remove RequireAuth from DOM | React DevTools manipulation | Component tree re-renders, guard re-evaluates |
| 5 | Access API endpoint without guard | Call `/api/admin/users` as explorer | 403 Forbidden from backend |
| 6 | Null plan in JWT | Token with `plan: null` | RequirePlan blocks, redirect pricing |
| 7 | Empty string plan | Token with `plan: ""` | RequirePlan blocks |
| 8 | Case manipulation: `plan: "TITAN"` | Uppercase plan value | Guard comparison must be case-insensitive or normalized |
| 9 | Future expiry token | Token with exp 10 years from now | Accepted (valid signature) |
| 10 | Token with extra claims | Add `isAdmin: true` to payload | Guard reads from correct claim, ignores extras |
| 11 | XSS in returnTo param | `?returnTo=<script>` | Sanitized, no execution |
| 12 | Path traversal in returnTo | `?returnTo=//evil.com` | Rejected, defaults to dashboard |
| 13 | Unicode in route | `/dashboard%00/admin` | 404 or sanitized |
| 14 | Double-encoded route | `/dashboard%252Fadmin` | 404 |
| 15 | Race: logout + navigate simultaneously | Click logout, immediately click sidebar link | Logout wins, redirected to login |
| 16 | Service worker cached protected page | Cache page, revoke auth, reload | Service worker serves stale page but API calls fail |
| 17 | Concurrent guard evaluation | Navigate rapidly between guarded routes | No guard bypass during transition |
| 18 | Hash fragment bypass | `/dashboard#/admin` | Hash ignored by router, dashboard renders |
| 19 | Query param confusion | `/dashboard?page=/admin` | Query param does not affect routing |
| 20 | iframe embed of protected route | `<iframe src="/admin">` | X-Frame-Options blocks, or guard evaluates in iframe context |

---

## 12. Navigation Telemetry Points

Track these events for analytics and debugging.

| Event | Payload | Purpose |
|---|---|---|
| `route.change` | `{from, to, userId, plan, timestamp}` | Page view tracking |
| `route.guard.block` | `{route, guard, userId, plan, redirectTo}` | Detect unauthorized access attempts |
| `route.guard.bypass_attempt` | `{route, method, userId}` | Security monitoring |
| `route.404` | `{attemptedPath, userId, referrer}` | Dead link detection |
| `route.lazy.fail` | `{route, chunkName, error}` | Deploy/CDN issue detection |
| `route.lazy.slow` | `{route, chunkName, loadTimeMs}` | Performance monitoring |
| `route.returnTo.used` | `{returnTo, userId}` | UX flow tracking |
| `route.returnTo.sanitized` | `{original, sanitized}` | Security event |
| `route.back.after_logout` | `{attemptedPath}` | History attack detection |

---

## 13. Automated Route Crawler Strategy

### Approach
Build a Playwright script that:

1. **Collects all routes** from `src/router.tsx` (or equivalent) via static analysis
2. **For each role** (guest, explorer, trader, titan, admin):
   a. Set authentication state (JWT in localStorage)
   b. Visit every route
   c. Assert: correct page renders OR correct redirect happens
   d. Assert: no console errors
   e. Assert: no uncaught exceptions
   f. Screenshot each page for visual regression

### Implementation Skeleton

```typescript
// route-crawler.spec.ts
const ROLES = ['guest', 'explorer', 'trader', 'titan', 'admin'];
const ROUTES = [
  { path: '/dashboard', minRole: 'explorer' },
  { path: '/sniper', minRole: 'explorer' },
  { path: '/war-room', minRole: 'titan' },
  { path: '/admin', minRole: 'admin' },
  // ... all routes
];

for (const role of ROLES) {
  test.describe(`Route access as ${role}`, () => {
    test.beforeEach(async ({ page }) => {
      await setAuthState(page, role);
    });

    for (const route of ROUTES) {
      test(`${role} visits ${route.path}`, async ({ page }) => {
        await page.goto(route.path);
        if (canAccess(role, route)) {
          await expect(page).not.toHaveURL('/login');
          await expect(page).not.toHaveURL('/pricing');
        } else {
          await expect(page).toHaveURL(/\/(login|pricing|dashboard)/);
        }
        const errors = [];
        page.on('pageerror', e => errors.push(e));
        expect(errors).toHaveLength(0);
      });
    }
  });
}
```

### Execution Schedule
- **PR gate:** Run against staging on every PR that touches `src/router`, `src/guards`, or `src/pages`
- **Nightly:** Full crawl against staging with all roles
- **Post-deploy:** Quick crawl (guest + admin) against production

### Visual Regression
- Capture screenshots per route per role
- Compare against baseline using `playwright-expect toHaveScreenshot()`
- Threshold: 0.1% pixel difference triggers review
- Store baselines in `tests/screenshots/` committed to repo
