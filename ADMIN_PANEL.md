# Vittova Owner Control Center

A private operations panel for the app owner. It is a **separate web app**
(`frontend/admin`) that talks to the existing backend's owner-only API
(`/api/admin/*`). It is not part of the Android app or the user web app.

## Security model

| Layer | Guarantee |
|---|---|
| Authorization | Every `/api/admin/*` route runs `protect` then `requireOwner` (`backend/middleware/requireOwner.js`). A request passes only if **all** hold: `ADMIN_EMAIL` is set to a single address; the Supabase-verified user's email equals it (case-insensitive) and is **confirmed**; `profiles.role = 'admin'`; `profiles.email` also equals it; the account is not suspended. Checked from Supabase Auth and the database on every request. |
| Fail closed | `ADMIN_EMAIL` missing or malformed → admin API refuses everyone. |
| No client trust | No route reads a role, owner flag or email from the request. `role` is not client-writable (`v1_2_security_p0.sql`). The admin app's `/me` check only decides what to render. |
| Concealment | Non-owners get `404 Not found`, not `403`. Refusals are audited (throttled per user). |
| IDOR | A user id in an admin path is only ever the *target* of an owner action; ids are UUID-validated. Normal user routes are unchanged and still scope every query to `req.user.id`. |
| Data minimisation | Admin responses contain profile fields and **counts**. No expense amounts, descriptions, merchants, receipt data, bank names, bill names or AI chat contents. The old cross-user expense listing/deletion endpoints were removed. |
| Audit | `admin_audit_log`: every suspend/reinstate/grant/extend/revoke (with required reason and previous state), every user-detail view, every refused access. A mutation is **refused** if its audit entry cannot be written. |
| Secrets | The admin app uses only the public Supabase URL + anon key and the API URL. The service-role and Gemini keys stay on the backend. |
| Transport/browser | `Cache-Control: no-store` on admin API responses; admin site served with CSP, `X-Frame-Options: DENY`, `noindex`, no referrer (`frontend/admin/vercel.json`). 30-minute idle sign-out. |

## One-time setup

1. **Database** — in the Supabase SQL editor, run `supabase/v1_4_admin_ops.sql`
   (after `v1_3_product_core.sql`), then `supabase/tests/verify_production.sql`
   and confirm the new checks pass.
2. **Owner account** — sign up / sign in to Vittova with the owner address and
   confirm the email. Then, in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where email = '<owner email>';
   -- There must be exactly one:
   select email from public.profiles where role = 'admin';
   ```
3. **Backend (Render)** — set environment variables and redeploy:
   - `ADMIN_EMAIL=<owner email>`
   - `ALLOWED_ORIGINS=` existing origins **plus** the admin site origin.
4. **Admin site (Vercel)** — create a *new* Vercel project from the same repo:
   - Root directory: `frontend/admin` (settings come from its `vercel.json`)
   - Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_API_URL=https://<backend>/api`
   - Optional: enable Vercel Deployment Protection for an extra gate.
5. **Supabase Auth** — add the admin site URL to *Authentication → URL
   Configuration → Redirect URLs* (needed for Google sign-in).

Local development:

```bash
cd backend && ADMIN_EMAIL=<owner email> npm run dev
cd frontend && npm run dev:admin     # http://localhost:5174 (add it to ALLOWED_ORIGINS)
```

## What the panel shows — and what it deliberately does not

All figures are real database counts or live probes. Where data does not
exist, the panel shows an explained dash, never zero or an estimate:

| Item | Status |
|---|---|
| Revenue | **"Billing not connected"** — Google Play Billing is not implemented (`BILLING_ARCHITECTURE.md`). |
| Pro source | Every entitlement is a manual grant. Grants before the audit log existed show "manual (before audit log)". |
| Active users | Last authenticated API request (`profiles.last_active_at`), written at most every 10 minutes per user. Tracking starts when v1.4 is deployed. |
| Goals | No goals table; counts users with a savings target set. |
| Income | Not tracked by Vittova. |
| UPI detections | Stay on the Android device until the user confirms; only confirmations reach the server. |
| CSV imports | Not a feature (CSV export only). |
| Deletions | Accounts are hard-deleted; counted from telemetry since v1.4. Expense deletions are not logged. |
| Login history | Only the most recent sign-in (Supabase Auth). |
| API latency / error rate | In-memory since the last server restart. Persisted errors (`ops_events`) survive restarts. |
| AI health | Never probes Gemini (cost); judged from configuration and real call outcomes. |

## Sections

- **Overview** — users, Pro, product activity, system status.
- **Users** — server-side search, plan/activity/status/date filters, sort by
  newest, last active, last activity, expenses, AI usage; per-user counts from
  the `admin_user_stats` view.
- **User detail** — account facts, usage counts, 90-day activity timeline
  (grouped per day, no financial details), admin history, suspend/reinstate,
  grant/extend/revoke Pro.
- **Pro** — free/active/expiring/expired counts, conversion, Pro users with
  activation date, expiry and source, entitlement history.
- **System health** — API, database, auth, AI, UPI, PDF import, background
  jobs; latency, error rate, recent errors (codes only).
- **Audit log** — every admin action and refused access attempt.

## Operations notes

- `ops_events` retention: delete rows older than 90 days periodically (see the
  migration). The audit log is kept.
- `admin_user_stats` uses correlated counts; fine at current scale. Replace
  with a materialized view if the user base grows into the hundreds of
  thousands.
- `last_active_at` updates bump `profiles.updated_at` (moddatetime trigger).
