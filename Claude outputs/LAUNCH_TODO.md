> **SUPERSEDED (2026-09-13).** This document predates the P0 security and product work and contains claims that are no longer accurate. Use `LAUNCH_TODO.md`, `TEST_REPORT.md` and `RELEASE.md` instead.

# Spendly Launch TODO

Last updated: 2026-09-12.

Status reflects what was actually verified in this repository. Anything that
needs a dashboard, a physical device, or credentials is marked **BLOCKED** and
says exactly what is required — it is not counted as done.

**Verification that was run:** 33 backend unit tests under four server
timezones, 32 Android parser unit tests compiled and executed on JDK 21,
`eslint` clean across the frontend, and a successful production `vite build`.
No Gradle or Android build was run — see the blockers.

---

## P0 — Critical

| # | Problem | Impact | Fix | Status |
|---|---|---|---|---|
| 1 | `GET /api/groups/:id/expenses` had no membership check. | Any authenticated user could read any group's expenses, including member names and **email addresses**, by supplying a group id. The backend uses the Supabase service-role key and bypasses RLS, so the database did not catch it. | Explicit membership gate; email dropped from the join. | **FIXED** (`4d6c477`) |
| 2 | `POST /api/groups/:id/settle` had no membership check and did not validate the payee. | Settlements could be fabricated against arbitrary groups and users, each awarding the caller +5 karma — repeatable indefinitely. | Both payer and payee must be members. | **FIXED** (`4d6c477`) |
| 3 | `POST /api/groups/:id/expenses` trusted client-supplied `splitAmong` ids. | Splits could be created against users outside the group. | Intersected with real membership. | **FIXED** (`4d6c477`) |
| 4 | Every month/day boundary used the server clock (UTC on Render) while users are in IST. | Expenses logged 00:00–05:30 IST on the 1st fell into the previous month. From 18:30 IST onward — peak spending hours — the server believed it was still yesterday, so streaks missed, "days remaining" was off by one, and daily quotas reset at 05:30 IST. | `backend/lib/appTime.js`, applied across safe-to-spend, burn rate, paisa score, subscriptions, AI context, streaks and Pro quotas. 13 regression tests. | **FIXED** (`4d6c477`) |
| 5 | UPI listener recorded any rupee amount from any matching notification as an expense. | Money *received*, failed payments, payment requests, marketing offers and account-balance updates all became phantom spending. Android notification reposts double- and triple-counted single payments. | `PaymentNotificationParser` with EXPENSE/INCOME/REFUND/FAILED/UNKNOWN classification, balance-aware amount selection, and fingerprint dedup. 32 tests. | **FIXED** (`44f6b68`) |
| 6 | Google sign-in navigated the Capacitor WebView to `accounts.google.com`. | The app visibly turned into a website — the reported "app redirects to the Spendly website" symptom. Google also rejects OAuth in embedded WebViews. | `skipBrowserRedirect` + Chrome Custom Tab; hardened deep-link callback. | **FIXED** (`89e5913`) |
| 7 | `android:allowBackup="true"`. | A logged-in Supabase session lives in WebView local storage and could be extracted with `adb backup` or carried to another phone by device transfer — an account takeover. | `allowBackup=false` plus backup and data-extraction rules. | **FIXED** (`e595bfd`) |
| 8 | Play Billing / RevenueCat server-side verification is not configured. | A paid entitlement cannot be granted safely. | `/api/pro/activate` and `/api/pro/add-freezes` already return 503 rather than faking a subscription. Architecture is ready; verification is not. | **BLOCKED — needs Play Console + billing provider credentials** |
| 9 | Production Supabase RLS, column grants and the OAuth redirect allow-list cannot be verified from source. | Data isolation and the Android login callback cannot be *proven* from this repository alone. | Run `supabase/v1_1_launch_hardening.sql`, then the verification queries at the end of that file. Add `spendly://login-callback` to Authentication → URL Configuration → Redirect URLs. | **BLOCKED — needs Supabase dashboard access** |
| 10 | No release signing key. | No Play-uploadable AAB can be produced. | `signingConfig` wired to a git-ignored `keystore.properties`; see `RELEASE.md`. | **BLOCKED — needs an upload keystore** |

### Deployment ordering — read before shipping

`supabase/v1_1_launch_hardening.sql` **must run before** the updated backend is
deployed. The backend now queries `expenses.occurred_at`, which that migration
creates. Deploying the code first will make every reporting endpoint return an
error until the migration runs.

---

## P1 — High

| # | Problem | Impact | Fix | Status |
|---|---|---|---|---|
| 11 | Monthly receipt-scan quota only reset if a request happened to land on the 1st. | A user who did not open the app that day kept last month's usage forever. | Counter keyed on the month it belongs to; self-correcting. | **FIXED** |
| 12 | `/api/pro/status` returned `Infinity` for Pro limits. | `JSON.stringify` turns that into `null`, so the client rendered "null scans left". | Explicit `null` meaning unlimited, read from the same constants `proGate` enforces. | **FIXED** |
| 13 | Streak logic existed in three divergent copies. | The check-in route and the expense route could disagree about the same streak. | Extracted to `backend/lib/streak.js` as pure functions; 11 tests. | **FIXED** |
| 14 | Expenses had no transaction date. | Reports keyed off row insert time; expenses could not be backdated or edited, and PDF import overwrote `created_at` as a workaround. | `occurred_at` column with backfill; all aggregations moved to it. | **FIXED** |
| 15 | No way to edit an expense. | A typo was permanent — the user could only delete and re-add, losing the round-up. | `PATCH /api/expenses/:id`. | **FIXED (API)** / UI pending — see #22 |
| 16 | `DELETE /api/expenses/:id` reported success for ids belonging to other users. | Misleading, and masked bugs. | Returns 404 when nothing was deleted. | **FIXED** |
| 17 | `Settings` opened privacy/terms with `window.open(_blank)`. | On Android this hands the URL to the system browser — the app leaves itself. | In-app router navigation. | **FIXED** |
| 18 | Dead `ProtectedRoute.jsx` read a `token` value the auth context never provided. | Anything importing it would redirect every user to `/login`. | Deleted; `App.jsx` has the real one. | **FIXED** |
| 19 | API base URL copy-pasted with its own production fallback into eleven files. | Changing the backend host meant finding all eleven. | `frontend/src/lib/apiConfig.js`. | **FIXED** |
| 20 | `org.gradle.java.home` pinned to an absolute Windows JDK path in tracked `gradle.properties`. | The Android build failed on any other machine and on CI. | Removed. | **FIXED** |
| 21 | Raw `AxiosError` / `Request failed with status code 500` shown to users. | In a money app an unexplained failure reads as data loss. | `frontend/src/lib/errors.js`, including a distinct offline message. | **FIXED (helper + expenses)** / not yet applied to every page — see #23 |

---

## P2 — Medium — open

| # | Problem | Impact | Proposed fix | Status |
|---|---|---|---|---|
| 22 | No transaction list UI with search, filter and edit. | The API supports all of it (`?q=`, `category`, `from`/`to`, `minAmount`/`maxAmount`, `sort`, pagination) but there is no screen that uses it. | A dedicated `/transactions` route consuming the existing endpoints. | **OPEN** |
| 23 | `friendlyError` is wired into the expenses hook only. | Other pages still surface raw errors. | Apply across `Chatbot`, `Wealth`, `HostelPool`, `PdfImport`, `Settings`, `AdminDashboard`. | **OPEN** |
| 24 | No first-run onboarding. | A new user lands on an empty dashboard with no explanation of the notification permission. | Three screens: track, understand, improve — then the notification-access ask in context. | **OPEN** |
| 25 | `/admin` is reachable by any signed-in user. | Not a security hole (the API enforces `role = 'admin'`), but the page loads and then fails with 403s. | Gate the route on `user.role`. | **OPEN** |
| 26 | JS bundle is 1.14 MB (340 KB gzipped) in a single chunk. | Slow cold start on the mid-range Android phones this app targets. | Route-level `React.lazy`, and split `recharts`/`framer-motion` out of the login path. | **OPEN** |
| 27 | `proGate` fails open on error and increments quota before the handler runs. | A failed request still burns the user's daily allowance; a DB blip grants unlimited access. | Decide deliberately per feature; refund the counter on handler failure. | **OPEN** |
| 28 | Income and refunds detected from notifications are acknowledged but not stored. | Spendly can tell the user money arrived but cannot show it anywhere. | An income ledger, or a `direction` column on `expenses`. | **OPEN** |
| 29 | No crash monitoring or product analytics. | Production failures are invisible. | See `ROADMAP.md`; must exclude amounts, payees, tokens. | **OPEN** |
| 30 | App icons are Capacitor defaults. | Unprofessional store listing. | Generate from `frontend/public/spendly-logo.svg`. | **OPEN — needs design assets** |

---

## P3 — Future

Tracked in `ROADMAP.md`: family accounts, bank integrations, recurring-payment
intelligence, credit-score awareness, personalised savings plans.

---

## Blockers summary

| Blocker | Required action | Who |
|---|---|---|
| Supabase RLS + grants unverified | Run `supabase/v1_1_launch_hardening.sql`, then its verification queries | You (dashboard) |
| Android OAuth callback | Add `spendly://login-callback` to Supabase Redirect URLs | You (dashboard) |
| Release AAB | Create an upload keystore, fill `android/keystore.properties` | You |
| Play Billing | Play Console + billing provider configuration | You |
| On-device behaviour | Work through `DEVICE_TEST_CHECKLIST.md` | You (physical Android device) |
| Three Android Java files | This session could not read `frontend/android/app/src/main/java/com/spendly/app/*.java` on the local disk (path nesting limit). New versions are in this repo and were **not** written over your local copies. | Review and copy manually |
