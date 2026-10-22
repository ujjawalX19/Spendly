# Security audit (22 Oct 2026)

Scope: release candidate `release/vc31` @ `7354f13` and the live system (read-only checks only; no destructive tests, no real accounts used, no payments made).

## Live checks (production, non-destructive)

| Check | Result |
|---|---|
| Public (anon) Supabase key reading profiles, expenses, ai_chat_history, groups, group_expenses, recurring_bills, play_purchases, app_events, admin_user_stats, money_xp_ledger | all **denied (401)** |
| API without a token: `/api/expenses`, `/api/money-streak`, `/api/admin/users`, `/api/pro/status`, `/api/groups` | all **401** |
| CORS preflight from a foreign origin | no `Access-Control-Allow-Origin` (refused); `https://vittova.in` allowed |
| API headers | Helmet CSP, HSTS (1 year, subdomains), nosniff |
| Website headers | HSTS (2 years), nosniff, X-Frame-Options DENY; **no CSP** (P3) |
| Source maps (`/assets/*.js.map`) | 403 |
| `/.env` on the website | serves the normal page (SPA fallback), no file |
| Secrets in web/Android bundles | only the public anon key (role `anon`); no service key, Gemini key or private key (bundle scan test + AAB inspection) |

## Code and test evidence

- Object-level authorization: expenses edit/delete filtered by owner; groups require server-side membership on every route, payer/participants must be members, settlements must involve the caller (route tests incl. cross-user).
- Row Level Security: 97 PGlite tests attack every table as anon/authenticated users (reads own rows only, no client writes, server-owned profile columns not writable); `verify_production.sql` checks the same on the real database.
- Pro: decided only by `hasActivePro` on the server; Play tokens verified with Google, bound to the account (obfuscated id), acknowledged only when entitled; RTDN requires Google's signed token; client can't send Pro fields (23 tests).
- Rate limits and quotas: per-IP, per-user and auth-failure limiters; CAS quota counters fail closed for paid features.
- Uploads: receipt images type/size checked, not stored; PDF import Pro-only and size-limited.
- Logging: error codes only on the reviewed paths; streak routes fixed 16 Oct.
- Account switching: phone-captured payments bound to the account; cleared for another account.

## Dependency scan (`npm audit --omit=dev`, 22 Oct)

Backend 0. Frontend 0 after `7354f13` (Vite 7.3.7, follow-redirects 1.16.1 — neither ships in the app). Dev-only: 3 moderate in `@capacitor/cli`.
**Production backend (`8c8731e`) still has `proxy-addr` 2.0.7 (critical) and `multer` 2.3 until the release branch is deployed.**

## Findings

| # | Sev | Finding | Remediation |
|---|---|---|---|
| S1 | P1 | Live backend dependencies (above) | Deploy `release/vc31` (approval needed) |
| S2 | P3 | No CSP on the website | Add a CSP in `vercel.json` (test Google sign-in and fonts first) |
| S3 | P3 | Many wrong-password attempts from one device were allowed (Supabase limits only) | Optional app-side back-off and a Google hint |
| S4 | Info | Service-account private key file sits in the project folder (git-excluded) | Move it out of the project folder |

Not done: penetration test against production, authenticated cross-account tests on production (done only against the local app with test users), payment sandbox.
