# Test report

Date: 2026-09-13 · Commit: `1138e8e` · Production backend: `1138e8e` (Render) ·
APK/AAB built from `1138e8e` (clean build).

## Automated results

| Suite | Command | Result | Evidence | Notes |
|---|---|---|---|---|
| Backend | `cd backend && npm test` | **125 / 125 pass** | node:test output | Also 122/122 under `TZ=UTC`, `America/New_York`, `Pacific/Kiritimati` (before the last 3 tests were added) |
| Database (RLS, grants, migrations) | `cd supabase/tests && npm test` | **34 / 34 pass** | PGlite (PostgreSQL 18) | Includes a production-like partial schema and a baseline proving the old holes |
| Frontend unit | `cd frontend && npm test` | **6 / 6 pass** | node:test | Date/chart logic; Android allowlist parity |
| Frontend lint | `npm run lint` | **clean** | eslint | |
| Frontend build | `npm run build` | **pass** | vite 7.3.6 | One chunk > 500 kB warning (performance, not an error) |
| Android unit | `./gradlew testDebugUnitTest` | **48 / 48 pass** | JUnit XML | Parser 32, privacy/dedupe/queue 15, example 1 |
| Android build | `./gradlew clean assembleDebug bundleRelease` | **pass** | R8 + lintVitalRelease | AAB **unsigned** (no keystore) |
| API inventory | `backend/tests/apiInventory.test.js` | **pass** | 29 frontend paths all routed | |
| npm audit | backend / frontend | **0** / 3 moderate | npm audit | Frontend moderates are build-time `@capacitor/cli` (iOS `xcode`/`uuid`) |

## Security regression tests (backend + database)

| Test | Result | Where |
|---|---|---|
| Normal user cannot become admin | ✅ | security.test.js, rls.test.mjs |
| Normal user cannot become Pro (API and direct DB) | ✅ | security.test.js, rls.test.mjs |
| User cannot change another user's premium status | ✅ | both |
| Expired Pro does not grant Pro features | ✅ | security.test.js |
| User cannot access another user's expenses (list/edit/delete/export) | ✅ | security.test.js, rls.test.mjs |
| User cannot access another user's AI history | ✅ | both |
| Unauthorized group access fails (read, expense, settle, code rotation) | ✅ | security.test.js, productRoutes.test.js, rls.test.mjs |
| Outsider cannot join a group without the code / cannot read invite code | ✅ | productRoutes.test.js, rls.test.mjs |
| Group member emails not exposed | ✅ | security.test.js, productRoutes.test.js |
| WhatsApp / messaging / shopping notifications ignored | ✅ | NotificationPrivacyTest, supportedPaymentApps.test.js |
| Duplicate payment notification not duplicated | ✅ | NotificationPrivacyTest |
| Invalid expense returns 4xx (never 500) | ✅ | security.test.js |
| AI daily quota enforced (429), parallel requests cannot overshoot | ✅ | security.test.js |
| AI request length limited; rejected question costs no quota | ✅ | security.test.js |
| AI burst rate limit per user with standard headers | ✅ | security.test.js |
| AI replies with invented numbers rejected | ✅ | productLogic.test.js, productRoutes.test.js |
| Different client IPs get separate buckets; edge header trusted only on Render | ✅ | rateLimit.test.js + **production diag** |
| Account deletion removes login + data; old token rejected | ✅ | security.test.js, rls.test.mjs |
| Invite-code guessing rate limited | ✅ | productRoutes.test.js |

## Feature test matrix

Legend: ✅ automated pass · 🟡 partially verified · ⬜ manual device/account test required

| Area | Case | Result | Evidence / notes |
|---|---|---|---|
| Auth | Signup / login / logout | ⬜ | Supabase Auth; requires real account |
| Auth | Google login + callback | ⬜ | PKCE deep link; needs Supabase redirect URLs + device |
| Auth | Forgot password (valid, invalid, expired, used, success, login) | ⬜ | Screens and error mapping built; needs email + device |
| Auth | App launches to branded sign-in | ✅ | Pixel 7 emulator, current APK, no crashes |
| Expenses | Add / edit / delete | ✅ | security.test.js, productRoutes.test.js |
| Expenses | Search / filter / sort | ✅ | productRoutes.test.js; prod routes 401 |
| Expenses | CSV export | ✅ API · ⬜ Android share sheet | |
| Expenses | PDF import validation + duplicate prevention | ✅ | financialLogic.test.js (Pro-only; not purchasable) |
| Group Pool | Create, join, expense with payer/participants, balances, settle, history, leave | ✅ | productRoutes.test.js · ⬜ production needs v1_3 |
| Wealth | Load, history, calculations, empty/error states | ✅ API · 🟡 UI built, lint/build pass | ⬜ visual check signed in |
| Wealth | Cold start | 🟡 | GET retries with timeouts implemented; not measured against a sleeping Render instance |
| AI | History, spending analysis, budget, savings, affordability, goals, education | ✅ | productLogic.test.js, productRoutes.test.js |
| AI | Quota, rate limit, invalid request | ✅ | security.test.js |
| AI | Gemini model availability in production | ⬜ | `GEMINI_MODEL` default `gemini-3.5-flash`; confirm key/model on Render |
| Subscriptions | Detect, active/lapsed, cancel once, undo, charged-after-cancel, annual cost | ✅ | productLogic.test.js, productRoutes.test.js · ⬜ prod needs v1_3 |
| UPI | Supported app parsed; WhatsApp ignored; duplicate ignored; refund; failed payment | ✅ | Android unit tests |
| UPI | Background detection on a real phone | ⬜ | Native queue implemented; not verified on device |
| Pro | Entitlement, unauthorized premium access, expired state | ✅ | security.test.js |
| Pro | Purchase state | ✅ (none offered) | Billing not implemented; 501 by design |

## Production checks performed

- Render health `version` = `1138e8e`; all app endpoints 401 without a token; removed routes 404.
- `?diag=proxy`: client IP resolved from `cf-connecting-ip` = requester's public IP; internal `req.ip` varied between requests.
- CORS exposes `X-Row-Count`, `RateLimit`, `Retry-After`.
- Supabase (read-only): v1_1 applied; **v1_2 and v1_3 not applied** (see LAUNCH_TODO manual actions).
