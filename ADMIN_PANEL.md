# Vittova Owner Console

A private operations console for the app owner at **https://vittova.in/admin**.
It is a separate bundle (`frontend/admin`) built into the existing Vercel
project's output under `/admin/`, talking to the backend's owner-only API
(`/api/admin/*`). It is not part of the Android app: the APK is built with
`npm run build`, which never includes the console.

## Security model

| Layer | Guarantee |
|---|---|
| Authorization | Every `/api/admin/*` route runs `protect` then `requireOwner` (`backend/middleware/requireOwner.js`). A request passes only if **all** hold: `ADMIN_EMAIL` is set to a single address; the Supabase-verified user's email equals it (case-insensitive) and is **confirmed**; `profiles.role = 'admin'`; `profiles.email` also equals it; the account is not suspended. Checked from Supabase Auth and the database on every request. |
| Fail closed | `ADMIN_EMAIL` missing or malformed → admin API refuses everyone. |
| No client trust | `ADMIN_EMAIL` is read only by the backend (`process.env` in `requireOwner.js`); it is never in a `VITE_*` variable, the web bundle or the Android app. No route reads a role, owner flag or email from the request. `role` is not client-writable (`v1_2_security_p0.sql`, tested in `supabase/tests/rls.test.mjs`). The console's `/me` check only decides what to render. |
| Refusals | No or invalid token → `401`. A verified user who is not the owner → `403 Forbidden` (the response never says which check failed or who the owner is). Refusals are audited as `admin_access_denied` (throttled per user). |
| IDOR | A user id in an admin path is only ever the *target* of an owner action; ids are UUID-validated. |
| Data minimisation | Profile fields, counts, event names, outcome categories and error codes. No expense amounts, descriptions, merchants, receipt data, bank names, bill names, AI questions or answers. |
| Audit | `admin_audit_log`: console sign-in (`admin_login`, once per 30 min), every user-detail view, suspend/reinstate, Pro grant/extend/revoke, error resolve/re-open, every refused access. Mutations are **refused** if their audit entry cannot be written. **Append-only at the database** (trigger in `v1_6`). |
| Rate limits | Per-user API limit via `protect`; admin writes limited separately (`adminWriteLimiter`, 60 / 15 min). Telemetry ingestion limited per IP. |
| Secrets | The console uses only the public Supabase URL + anon key and the API URL. The service-role and Gemini keys stay on the backend. `frontend/tests/bundleSecrets.test.js` scans source and built bundles. |
| Browser | Same origin as the user app, so the console session is stored under its own key in **sessionStorage** (this tab only), with a 30-minute idle sign-out. `/admin` is served with a strict CSP, `X-Frame-Options: DENY`, `noindex`, no referrer, `no-store` (`frontend/vercel.json`). |

## Sections

| Page | What it shows | Sources |
|---|---|---|
| **Dashboard** | All-time totals, installs (with "Play Store downloads: unavailable"), API traffic, users, Pro, usage, system status | tables, `app_installs`, `app_events`, in-memory request metrics |
| **Users** | Search, plan/activity/status/date filters, sort, pagination; expenses, AI, scans, imports, pools, app platform/version | `admin_user_stats`, `app_installs` |
| **User detail** | Account facts, usage counts, devices, 30-day event counts, timeline, admin history, suspend/Pro actions | tables, `app_installs`, `app_events`, audit log |
| **Activity** | Installs & version distribution (newest/outdated), DAU/WAU/MAU, returning users, 1+/5+ expenses, signup→first expense / first AI question, 7- and 30-day retention (lower bound), event breakdown, daily/weekly trends, failure rates, recent events, "not tracked" list | `app_installs`, `admin_user_stats`, `app_events` |
| **AI Mentor** | GREEN/YELLOW/RED/UNKNOWN health, requests, Gemini vs fallback vs failed, response times, question types, free-quota pressure, Gemini errors by code, timeouts, HTTP errors, recent errors | `ai_chat_history`, `app_events`, `ops_events`, profile quota counters, in-memory Gemini stats |
| **Errors** | Grouped issues (type · endpoint · code · status) with count, first/last seen, open/resolved/regressed; filters for status, severity, category, type, endpoint, date; resolve / re-open (audited) | `ops_events`, `ops_issue_states` |
| **System Health** | Live probes: API, database, auth, AI, UPI, PDF import, background job; latency, error rate | probes, `ops_events` |
| **Pro** | Free/Pro, source, expiries, entitlement history, quota usage by feature, users near limits, purchase attempts; **Billing: Not enabled**, no revenue | `profiles`, audit log, `app_events` |
| **Audit Logs** | Every admin action and refused attempt | `admin_audit_log` |
| **Settings** | Read-only: owner configured (masked), environment, billing/Gemini/Play Console status, free limits, migration status, retention | configuration probes |

## Telemetry (v1.6)

- **Server events** (trusted) are recorded from the outcome of API requests
  (`backend/lib/appEvents.js → ROUTE_EVENTS`): expense created/edited/deleted,
  receipt scan, PDF import, CSV export, AI answer outcome (Gemini / fallback /
  calculated) + latency, group create/join/settle, profile update, account
  deletion (no user id), Pro purchase attempt. Route handlers are unchanged.
- **App events** (self-reported) via `POST /api/telemetry/events`: first launch,
  app open, sign-up/sign-in outcome + reason category, sign-out, Google sign-in
  start, auth callback/deep-link failure, password reset, AI Mentor opened,
  crash (error class). Allow-listed names and properties only.
- **Installs** are first launches with a random installation id. They are *not*
  Play Store downloads; web visits are counted separately as platform `web`.
  Android installs are counted only from APKs built after this change.
- Play Console reporting is not connected. The installs API returns a
  `playStore` block so a Play Console source can be added without changing the
  console.

## Setup / deployment

1. **Database** — Supabase SQL editor: run `supabase/v1_6_owner_console.sql`
   (after v1_4/v1_5), then `supabase/tests/verify_production.sql`; every row must
   be `PASS`. Until v1_6 is applied the console shows "Not available — telemetry
   not configured" for installs, events, AI outcomes and issue resolution.
2. **Owner account** — exactly one `profiles.role = 'admin'` whose email equals
   `ADMIN_EMAIL` and is confirmed:
   ```sql
   update public.profiles set role = 'admin' where email = '<owner email>';
   select email from public.profiles where role = 'admin';
   ```
3. **Backend (Render)** — `ADMIN_EMAIL=<owner email>`; `ALLOWED_ORIGINS` must
   include `https://vittova.in` (already required by the web app). Deploys from
   `main`.
4. **Frontend (Vercel)** — the existing project (root `frontend`) builds
   `npm run build:web` (`frontend/vercel.json`), producing the user app in
   `dist/` and the console in `dist/admin/`. No new project or env vars.
5. **Supabase Auth** (Google sign-in to the console only) — allow
   `https://vittova.in/admin/` under *Authentication → URL Configuration →
   Redirect URLs*. Email/password sign-in needs nothing extra.

Local development:

```bash
cd backend && ADMIN_EMAIL=<owner email> npm run dev
cd frontend && npm run dev:admin     # http://localhost:5174/admin/ (add the origin to ALLOWED_ORIGINS)
```

## Not available (stated in the console, never estimated)

| Item | Why |
|---|---|
| Play Store downloads, uninstalls | Play Console reporting not integrated |
| Revenue, subscriptions, renewals | Google Play Billing not implemented (`BILLING_ARCHITECTURE.md`) |
| UPI detections | Stay on the device until the user confirms |
| CSV imports | Not a feature (CSV export is tracked) |
| Gemini billing quota | Not exposed by the Gemini API; see Google AI Studio |
| Historical DAU before telemetry | `last_active_at` only holds the latest request; daily history starts with `app_events` |
| Crash reports with stack traces | Only the error class from the in-app error screen is recorded |

## Operations notes

- Retention: `delete from public.ops_events where created_at < now() - interval '90 days';`
  and `delete from public.app_events where created_at < now() - interval '400 days';`
  The audit log is kept and cannot be edited.
- `admin_user_stats` uses correlated counts; replace with a materialized view if
  the user base grows into the hundreds of thousands. Analytics scans are capped
  at 50,000 rows per request and flagged `truncated` beyond that.
- API latency / error rate and Gemini call stats are in-memory since the last
  restart; persisted errors (`ops_events`) and events (`app_events`) survive.
