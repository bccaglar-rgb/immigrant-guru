# Bitrium Frontend Test Plan

> **Version:** 1.0
> **Stack:** React 18 + Vite + TailwindCSS + Zustand + React Router v6
> **Last Updated:** 2026-04-04

---

## 1. Broken Routes Checklist

Every route tested per role. Mark Pass/Fail for each cell.

| Route | Guest | Explorer | Trader | Titan | Admin |
|---|---|---|---|---|---|
| `/` (Landing) | renders | redirect dashboard | redirect dashboard | redirect dashboard | redirect dashboard |
| `/login` | renders | redirect dashboard | redirect dashboard | redirect dashboard | redirect dashboard |
| `/register` | renders | redirect dashboard | redirect dashboard | redirect dashboard | redirect dashboard |
| `/pricing` | renders | renders | renders | renders | renders |
| `/dashboard` | redirect login | renders | renders | renders | renders |
| `/sniper` | redirect login | renders | renders | renders | renders |
| `/coin-insight` | redirect login | renders | renders | renders | renders |
| `/coin-insight/:id` | redirect login | renders | renders | renders | renders |
| `/super-charts` | redirect login | renders | renders | renders | renders |
| `/coin-universe` | redirect login | renders | renders | renders | renders |
| `/crypto-market` | redirect login | renders | renders | renders | renders |
| `/exchange-terminal` | redirect login | renders | renders | renders | renders |
| `/bots` | redirect login | redirect pricing | renders | renders | renders |
| `/portfolio` | redirect login | renders | renders | renders | renders |
| `/institutional` | redirect login | redirect pricing | redirect pricing | renders | renders |
| `/master` | redirect login | redirect pricing | redirect pricing | renders | renders |
| `/war-room` | redirect login | redirect pricing | redirect pricing | renders | renders |
| `/settings` | redirect login | renders | renders | renders | renders |
| `/settings/2fa` | redirect login | renders | renders | renders | renders |
| `/admin` | redirect login | redirect home | redirect home | redirect home | renders |
| `/admin/users` | redirect login | redirect home | redirect home | redirect home | renders |
| `/admin/payments` | redirect login | redirect home | redirect home | redirect home | renders |
| `/nonexistent` | 404 page | 404 page | 404 page | 404 page | 404 page |

---

## 2. Route Guard Bypass Attempts

| # | Attack Vector | Steps | Expected Result |
|---|---|---|---|
| 1 | Direct URL to `/admin` as Explorer | Type URL, press Enter | Redirect to `/dashboard` |
| 2 | Set `role=admin` in localStorage | Modify via DevTools, refresh | Backend rejects API calls, guard uses JWT claim |
| 3 | Expired JWT, access `/dashboard` | Wait for token expiry, navigate | Redirect to `/login` |
| 4 | Delete JWT, keep Zustand state | Remove token from storage, navigate | RequireAuth catches missing token |
| 5 | Modify JWT payload (plan=titan) | Edit base64 payload | Signature invalid, backend rejects |
| 6 | Replay old JWT after logout | Copy token, logout, paste back | Token blacklisted, redirect to login |
| 7 | Access `/war-room` as Trader via history | Login as Titan, downgrade, press Back | RequireTier blocks access |
| 8 | Intercept route change via React DevTools | Manually trigger navigate() | Guard still evaluates on render |
| 9 | Disable JavaScript, access protected page | Browser settings | SSR not used; blank page, no data exposed |
| 10 | Concurrent tabs: logout in one, use other | Logout tab A, act in tab B | Tab B detects invalid token on next API call |

---

## 3. Loading / Empty / Error States Per Page

| Page | Loading State | Empty State | Error State | Notes |
|---|---|---|---|---|
| Dashboard | Skeleton cards | "No portfolio data" | API error banner | Check all 4 widget sections |
| Sniper | Spinner + "Scanning..." | "No signals found" | Exchange error toast | Verify WS reconnect indicator |
| Coin Insight | Chart placeholder shimmer | "Select a coin" | "Failed to load coin data" | Test with invalid coin ID in URL |
| Institutional | Full-page loader | "No institutional data" | Error boundary | Titan-only; verify guard fires first |
| Master | Skeleton table | "No master signals" | Retry button | Test retry actually retries |
| War Room | Chat skeleton | "No messages yet" | WS disconnect banner | Check reconnect countdown |
| Super Charts | Canvas placeholder | "Select a pair" | "Chart data unavailable" | Test TradingView widget fallback |
| Coin Universe | Grid shimmer | "No coins match filter" | API error message | Test with broken filter params |
| Crypto Market | Table skeleton rows | "Market data loading" | "Exchange unreachable" | Test with all exchanges down |
| Exchange Terminal | Order book skeleton | "Connect exchange first" | Exchange API error | Test with invalid API keys |
| Bots | Card grid shimmer | "No bots created" | "Bot service unavailable" | Test Trader vs Titan bot limits |
| Portfolio | Holdings skeleton | "No holdings tracked" | Sync error banner | Test with disconnected exchange |
| Settings | Form skeleton | Pre-filled form | Save error toast | Test 2FA section separately |
| Admin | Stats skeleton | "No data for period" | Admin API error | Test each admin sub-page |
| Pricing | Card shimmer | Always has content | Payment API error | Test TRON payment failure |

---

## 4. Chart Rendering Failures

- [ ] Empty OHLCV data returns graceful "No data" message, not blank canvas
- [ ] Rapid coin switching (click 10 coins in 2 seconds) does not crash or show wrong data
- [ ] Unmounting chart component during data fetch cancels the request (no setState on unmounted)
- [ ] TradingView widget cleans up on route change (check for orphaned iframes)
- [ ] Canvas memory: switch between 20 charts, check heap snapshot for canvas leak
- [ ] Zero-volume candles render without division-by-zero errors
- [ ] Extremely large price values (>$100k) render without overflow
- [ ] Sub-cent prices (8+ decimals) render with proper precision
- [ ] Chart with 10,000+ candles does not freeze the UI thread
- [ ] Timezone edge: chart timestamps match user locale, not UTC

---

## 5. Zustand Stale State Issues

| Scenario | What to Check | Bug Pattern |
|---|---|---|
| Login -> Logout -> Login as different user | Dashboard shows previous user's data | Store not reset on logout |
| Explorer upgrades to Titan | Sidebar shows new Titan pages | `plan` in store updated, sidebar re-renders |
| Admin demoted to Trader | Admin routes still accessible | Role state cached in closure |
| Token refresh | Old token used in in-flight request | Token getter reads stale closure |
| WS reconnect after plan change | WS subscription topics match new plan | Subscription list not re-evaluated |
| Multiple tabs open | Logout in one tab | Other tabs still show authenticated state |
| Plan expires mid-session | Titan pages still render | No periodic plan check or WS push |
| Rapid navigation | Previous page's fetch overwrites current page | Race condition in shared state slice |

---

## 6. Memory Leak Detection Checklist

- [ ] WebSocket listeners removed on component unmount (Sniper, War Room, Exchange Terminal)
- [ ] `setInterval` for price tickers cleared on page leave
- [ ] TradingView chart widget `.remove()` called on unmount
- [ ] Canvas 2D contexts released (coin-insight, super-charts)
- [ ] Event listeners on `window` (resize, scroll) removed on unmount
- [ ] AbortController used for fetch calls; aborted on unmount
- [ ] Zustand subscriptions unsubscribed in `useEffect` cleanup
- [ ] No growing arrays in store (e.g., WS messages appended forever)
- [ ] React DevTools Profiler shows no re-render cascades on idle pages
- [ ] Chrome DevTools heap snapshot after 30 min usage shows stable memory

---

## 7. Form Validation Tests

| Form | Test Case | Expected |
|---|---|---|
| Login | Empty email + empty password | Both fields show error |
| Login | Double-click submit | Only one request fires (button disabled) |
| Login | XSS in email: `<script>alert(1)</script>` | Sanitized, no execution |
| Register | Password < 8 chars | "Minimum 8 characters" error |
| Register | Mismatched password confirm | "Passwords do not match" |
| Register | Already-registered email | Server error displayed, not 500 |
| Settings | Change password with wrong current | "Current password incorrect" |
| Settings | 2FA code with letters | "Numeric code only" |
| Exchange Terminal | Order with 0 quantity | "Quantity must be > 0" |
| Exchange Terminal | Order exceeding balance | "Insufficient balance" |
| Bots | Bot name with 500 chars | Truncated or rejected |
| Bots | Negative stop-loss % | "Must be positive value" |
| Admin | User search with SQL injection | Sanitized, returns empty |
| Pricing | Double-click "Subscribe" | Single payment initiated |
| Portfolio | Manual add with negative amount | "Amount must be positive" |

---

## 8. Mobile / Responsive Breakage

| Page | 375px (mobile) | 768px (tablet) | 1280px (desktop) | Known Risks |
|---|---|---|---|---|
| Dashboard | Cards stack vertically | 2-column grid | 4-column grid | Widget overflow on small screens |
| Sniper | Horizontal scroll on table | Fits | Fits | Table columns truncation |
| Super Charts | Chart too narrow | Usable | Full | TradingView min-width issue |
| Exchange Terminal | Order book unreadable | Cramped but usable | Full | Order form overlaps book |
| Coin Universe | 1-col grid | 2-col grid | 4-col grid | Filter bar wraps awkwardly |
| War Room | Chat fills screen | Chat + sidebar | Full layout | Keyboard pushes chat up on iOS |
| Admin | Tables need horizontal scroll | Mostly fits | Full | Action buttons cut off on mobile |
| Settings | Single column | Single column | Two columns | 2FA QR code too small on mobile |
| Sidebar | Hamburger menu | Collapsed | Full sidebar | Menu z-index over page content |

---

## 9. Critical Component Test Checklist (20 Components)

| # | Component | Tests Required |
|---|---|---|
| 1 | `<RequireAuth>` | Renders children when authed; redirects when not; handles expired token |
| 2 | `<RequirePlan>` | Blocks no-plan users; passes with any active plan |
| 3 | `<RequireTier tier="titan">` | Blocks Explorer/Trader; allows Titan/Admin |
| 4 | `<RequireAdmin>` | Blocks all non-admin; allows admin |
| 5 | `<Sidebar>` | Shows correct links per role; highlights active route; collapses on mobile |
| 6 | `<PriceChart>` | Renders with data; shows empty state; cleans up canvas |
| 7 | `<OrderBook>` | Renders bids/asks; handles empty book; updates via WS |
| 8 | `<TradeForm>` | Validates inputs; disables on submit; shows confirmation |
| 9 | `<CoinCard>` | Renders coin data; handles missing fields; links to insight page |
| 10 | `<BotCard>` | Shows status badge; start/stop actions; shows P&L |
| 11 | `<PortfolioSummary>` | Aggregates holdings; handles zero state; currency formatting |
| 12 | `<SubscriptionCard>` | Shows plan details; upgrade/downgrade CTA; current plan highlight |
| 13 | `<TronPayment>` | Shows QR code; countdown timer; payment confirmation polling |
| 14 | `<TwoFactorSetup>` | QR code render; code input validation; success/failure feedback |
| 15 | `<AIInsightPanel>` | Loading shimmer; markdown rendering; error fallback |
| 16 | `<NotificationBell>` | Badge count; dropdown list; mark-as-read |
| 17 | `<ExchangeSelector>` | Lists connected exchanges; shows status; switch handler |
| 18 | `<SniperSignalRow>` | Signal data display; action buttons; urgency indicator |
| 19 | `<AdminUserTable>` | Pagination; search/filter; role change dropdown |
| 20 | `<WarRoomChat>` | Message list; input validation; WS connection indicator |

---

## 10. Page-by-Page Test Checklist

For each page, verify:

- [ ] Page loads without console errors
- [ ] All API calls return expected data
- [ ] Loading skeleton appears before data
- [ ] Empty state renders when no data
- [ ] Error state renders on API failure
- [ ] Page title updates (document.title)
- [ ] Breadcrumb/navigation context correct
- [ ] No layout shift after data loads (CLS < 0.1)
- [ ] Works after browser refresh
- [ ] Works when navigated via sidebar link AND direct URL

**Pages:** Dashboard, Sniper, Coin Insight, Coin Insight Detail, Institutional, Master, War Room, Super Charts, Coin Universe, Crypto Market, Exchange Terminal, Bots, Portfolio, Pricing, Settings, Settings/2FA, Admin, Admin/Users, Admin/Payments, 404

---

## 11. Playwright E2E Test Cases (30)

| # | Test Name | Steps | Assertion |
|---|---|---|---|
| 1 | `login-success` | Enter valid creds, submit | Redirected to `/dashboard` |
| 2 | `login-invalid-password` | Enter wrong password | Error message shown |
| 3 | `login-2fa-required` | Login with 2FA-enabled account | 2FA input appears |
| 4 | `login-2fa-wrong-code` | Enter incorrect TOTP code | "Invalid code" error |
| 5 | `logout-clears-session` | Click logout | Redirected to `/login`, localStorage cleared |
| 6 | `register-new-user` | Fill form, submit | Account created, redirected to dashboard |
| 7 | `register-duplicate-email` | Use existing email | "Email already registered" error |
| 8 | `guest-blocked-from-dashboard` | Navigate to `/dashboard` unauthenticated | Redirected to `/login` |
| 9 | `explorer-blocked-from-war-room` | Login as Explorer, go to `/war-room` | Redirected to `/pricing` |
| 10 | `titan-accesses-war-room` | Login as Titan, go to `/war-room` | Page renders |
| 11 | `pricing-page-shows-plans` | Navigate to `/pricing` | 3 plan cards visible |
| 12 | `tron-payment-flow` | Click subscribe, select TRON | QR code + address shown |
| 13 | `dashboard-widgets-load` | Login, wait for dashboard | All 4 widget sections populated |
| 14 | `sniper-signals-stream` | Navigate to Sniper | Signal rows appear via WS |
| 15 | `coin-insight-search` | Type coin name in search | Results filter correctly |
| 16 | `coin-insight-chart` | Click a coin | Chart renders with candles |
| 17 | `exchange-terminal-order` | Place a limit buy order | Order appears in open orders |
| 18 | `bot-create-and-start` | Create bot, click Start | Bot status changes to "Running" |
| 19 | `portfolio-add-holding` | Add manual holding | Holding appears in list |
| 20 | `settings-change-password` | Enter current + new password | "Password updated" toast |
| 21 | `settings-enable-2fa` | Click enable, scan QR, enter code | 2FA enabled confirmation |
| 22 | `admin-view-users` | Login as admin, go to `/admin/users` | User table renders |
| 23 | `admin-change-user-role` | Change user role via dropdown | Role updated, toast shown |
| 24 | `admin-view-payments` | Go to `/admin/payments` | Payment table with filters |
| 25 | `super-charts-load` | Navigate to Super Charts, select pair | TradingView chart renders |
| 26 | `coin-universe-filter` | Apply market cap filter | Grid updates with filtered coins |
| 27 | `crypto-market-sort` | Click column header | Table re-sorts |
| 28 | `mobile-sidebar-toggle` | Set viewport 375px, click hamburger | Sidebar opens/closes |
| 29 | `session-expiry-redirect` | Invalidate token via API, trigger action | Redirect to `/login` |
| 30 | `deep-link-after-login` | Visit `/war-room` as guest, login as Titan | Redirected to `/war-room` post-login |

---

## 12. React Testing Library Cases (20)

| # | Test Name | Component | Assertion |
|---|---|---|---|
| 1 | `requireauth-redirects-unauthenticated` | RequireAuth | Navigates to `/login` when no token |
| 2 | `requireauth-renders-children` | RequireAuth | Renders children when token valid |
| 3 | `requireplan-blocks-no-plan` | RequirePlan | Navigates to `/pricing` |
| 4 | `requiretier-blocks-explorer` | RequireTier | Navigates to `/pricing` for explorer on titan route |
| 5 | `requireadmin-blocks-non-admin` | RequireAdmin | Navigates to `/dashboard` |
| 6 | `sidebar-shows-titan-links` | Sidebar | Titan links visible for titan user |
| 7 | `sidebar-hides-titan-links` | Sidebar | Titan links hidden for explorer |
| 8 | `sidebar-highlights-active` | Sidebar | Active class on current route link |
| 9 | `pricechart-renders-candles` | PriceChart | Canvas element present, no errors |
| 10 | `pricechart-empty-data` | PriceChart | "No data" message shown |
| 11 | `tradeform-validates-quantity` | TradeForm | Error for zero/negative quantity |
| 12 | `tradeform-disables-on-submit` | TradeForm | Button disabled during submission |
| 13 | `coincard-renders-data` | CoinCard | Name, price, change% visible |
| 14 | `coincard-handles-missing-price` | CoinCard | Dash or "N/A" instead of crash |
| 15 | `botcard-start-stop` | BotCard | Clicking Start calls handler, shows Running |
| 16 | `tronpayment-shows-qr` | TronPayment | QR code image rendered |
| 17 | `tronpayment-countdown` | TronPayment | Timer decrements, expired state shown |
| 18 | `adminusertable-pagination` | AdminUserTable | Page buttons work, data updates |
| 19 | `notificationbell-badge` | NotificationBell | Badge shows count, hides at 0 |
| 20 | `ai-insight-markdown` | AIInsightPanel | Markdown content rendered as HTML |

---

## 13. Frontend Observability Plan

### Sentry Integration
- Capture unhandled exceptions with source maps (Vite plugin)
- Tag errors with: `user.id`, `user.plan`, `user.role`, `route`, `exchange`
- Breadcrumbs: route changes, API calls, WS events, user clicks
- Performance transactions: page load, chart render, API round-trip
- Release tracking tied to Git SHA

### Console Error Monitoring
- CI check: zero `console.error` calls in production build
- Sentry captures `window.onerror` and `unhandledrejection`
- Custom error boundary logs component stack to Sentry

### Performance Budgets
| Metric | Target | Tool |
|---|---|---|
| LCP | < 2.5s | Lighthouse CI |
| FID | < 100ms | Web Vitals |
| CLS | < 0.1 | Web Vitals |
| Bundle size (gzip) | < 500KB | Vite build stats |
| Chart render | < 300ms | Custom perf mark |
| WS connect | < 1s | Custom timing |

---

## 14. Frontend Bug Report Template

```
**Bug ID:** FE-XXX
**Page:** [e.g., Exchange Terminal]
**Route:** [e.g., /exchange-terminal]
**Role/Plan:** [e.g., Trader]
**Browser:** [e.g., Chrome 124]
**Viewport:** [e.g., 1440x900]

**Steps to Reproduce:**
1. ...
2. ...

**Expected:** ...
**Actual:** ...

**Console Errors:** [paste any]
**Network Errors:** [paste any failed requests]
**Screenshot:** [attach]
**Sentry Event ID:** [if applicable]
**Severity:** Critical / High / Medium / Low
```
