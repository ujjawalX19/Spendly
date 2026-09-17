# Spendly → Vittova rebrand

**Brand:** VITTOVA · *Your Money's Pulse* · Personal Financial Copilot
**Domain:** https://vittova.in · **Accent:** `#A3E635` on `#0B1220`
**Branch:** `rebrand/vittova` (2026-09-14)

Vittova was previously branded Spendly. The visible product is Vittova
everywhere; a small set of technical identifiers keeps the old name on purpose.
`frontend/tests/brand.test.js` fails the build if "Spendly" reappears in client
code outside the allow-list below.

## Android package: `com.vittova.app` (changed 2026-09-17)

The application ID, namespace, Java package, Capacitor `appId`, `strings.xml`
and ProGuard rules moved from `com.spendly.app` to `com.vittova.app` before the
app was ever published, while the ID could still change (it is permanent once
on Google Play). Android treats it as a different app: test builds with the old
ID must be uninstalled, and their on-device data (session, queued payments) does
not carry over. The sign-in hand-off pages pin the intent to the new package, so
old `com.spendly.app` test builds can no longer finish Google sign-in.

## Legacy identifiers kept on purpose

| Identifier | Where | Why it stays |
|---|---|---|
| `spendly://login-callback`, `spendly://reset-password` | `AndroidManifest.xml`, `authRedirects.js`, Supabase redirect allow-list | Google sign-in, email confirmation and password reset return through these. Emails already sent and installed APKs depend on them. Not user-visible. |
| `spendly.seenPayments.v1`, `spendly.notificationPrompt.v1`, `spendly.recovery`, `spendly.onboarded.v1` | WebView local/session storage | Renaming would re-show onboarding, re-prompt for notification access and forget resolved payments for existing users. |
| `spendly_pending_payments` (SharedPreferences), `SpendlyNLS` / `SpendlyQueue` (logcat tags) | Android Java | Renaming the prefs file would drop payments queued while the app was closed. Tags are developer-only. |
| `spendly-t8s6.onrender.com` | API fallback URL in app and admin | The Render service name. Switch to `api.vittova.in` only after that DNS record and certificate are verified. |
| `spendly-iota.vercel.app` | CORS allow-list, Supabase redirects | Current live site; kept until vittova.in serves the site. |
| `spendly-app`, `spendly-backend`, `spendly-supabase-tests` | `package.json` names | Private, unpublished package names; no user impact. |
| GitHub repo `ujjawalX19/Spendly` | git remote | Not renamed: Render (and possibly Vercel) deploy from it. GitHub redirects renamed repos, but deploy hooks should be re-checked after a rename. Owner decision. |
| `paisa_scores` table, `/api/paisa-score` | DB/API | Internal names; the feature is shown as **Spend Score**. |
| Applied SQL migrations (`v1_*.sql`, `security_hardening.sql`) | header comments | Historical record of what was run in production; not edited. |
| `owner@spendly.test`, `?ref=SPENDLY`, `spendly_pro_monthly` | backend tests, `FINANCIAL_CONTENT_REVIEW.md` | Test fixtures and a historical audit quote. |
| `Claude outputs/`, `FINAL_LAUNCH_REPORT.md`, `APPLY_AND_PUSH.md`, `deferred-work/` | docs | Marked SUPERSEDED / archived; left as history. |

## Analytics

The app has no analytics SDK or named analytics events. Admin telemetry
(`ops_events`, `admin_audit_log`) uses brand-neutral event names, so no
historical data is affected.

## Future migration (deferred, not required for launch)

**Android App Links on `https://vittova.in/auth/*`** instead of `spendly://`:
publish `/.well-known/assetlinks.json` with the Play App Signing SHA-256, add an
`autoVerify` intent filter, switch `authRedirects.js` on Android, add the https
URLs to Supabase, keep `spendly://` as fallback for at least one release. Needs
the signing key and live domain first. A `vittova://` scheme is **not**
recommended: it has the same hijack profile as `spendly://` and would break
links in already-sent emails.

## Manual owner actions

### DNS (vittova.in currently returns NXDOMAIN — not configured)

At the registrar, either point nameservers to your DNS provider or add records:

| Host | Type | Value | For |
|---|---|---|---|
| `@` | A | `76.76.21.21` | Website on Vercel (confirm the value Vercel shows when you add the domain) |
| `www` | CNAME | `cname.vercel-dns.com` | Redirects to apex (`frontend/vercel.json`) |
| `admin` | CNAME | `cname.vercel-dns.com` | Owner Console, separate Vercel project with root `frontend/admin` |
| `api` | CNAME | `spendly-t8s6.onrender.com` | After adding `api.vittova.in` in Render → Settings → Custom Domains |
| mail | MX/TXT | from your mail provider | `hello@`, `support@`, `privacy@` — **none exist yet** |
| `@` | TXT (SPF), `resend._domainkey` etc. (DKIM) | from your SMTP provider | Supabase auth emails from `no-reply@vittova.in` |

Vercel and Render issue HTTPS certificates automatically once DNS resolves.

### Vercel
1. User site project → Domains → add `vittova.in` and `www.vittova.in`; set `vittova.in` primary.
2. New project for the admin console, root directory `frontend/admin`, domain `admin.vittova.in`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_API_URL`.
3. Optionally set `VITE_SUPPORT_EMAIL` once a mailbox exists (default shown: `support@vittova.in`).

### Render
- If `ALLOWED_ORIGINS` is set in the Render environment it **overrides** the code default: add `https://vittova.in,https://www.vittova.in,https://admin.vittova.in`.
- `ADMIN_EMAIL` unchanged. No secret rotation needed for a rebrand.

### Supabase
1. Auth → URL Configuration → Site URL: `https://vittova.in` (after HTTPS works).
2. Redirect URLs — add, don't remove working ones:
   `https://vittova.in/auth/callback`, `https://vittova.in/reset-password`,
   `https://admin.vittova.in/**` (admin console sign-in). Keep `spendly://login-callback`,
   `spendly://reset-password` and the `spendly-iota.vercel.app` entries. **Delete `pendly://reset-password`.**
3. Auth → Email Templates: paste `supabase/email-templates/*.html` and set subjects (in each file's header comment).
4. Auth → SMTP: sender name `Vittova`, sender `no-reply@vittova.in` (needs a verified SMTP provider).

### Google Cloud (OAuth consent screen)
App name `Vittova`, logo `store-listing/icon-512.png`, authorized domain `vittova.in`,
home/privacy/terms links on vittova.in. The OAuth client and Supabase callback URL do not change.

### Play Console
See `store-listing/PLAY_STORE_LISTING.md`.
