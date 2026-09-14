# Vittova launch TODO

Updated 2026-09-13 · source, GitHub `main`, Render and the built APK are all at
commit **`1138e8e`** (Render health reports `version: 1138e8e`).
See `TEST_REPORT.md` for evidence and `API_INVENTORY.md` for endpoints.

## Status by feature

| Feature | Source | Backend (prod) | APK | Tested | Status |
|---|---|---|---|---|---|
| Sign-in (email, Google PKCE, reset password) | ✅ | Supabase | ✅ | ⬜ device | Needs Supabase redirect URLs + device test |
| Expenses add/edit/delete/search/filter/CSV | ✅ | ✅ live | ✅ | ✅ API | Ready |
| UPI notification detection | ✅ | ✅ (needs v1_2 enum for `upi_auto`) | ✅ | ✅ unit · ⬜ device | Run migration; device test |
| Safe-to-Spend / burn rate | ✅ | ✅ live | ✅ | ✅ | Ready |
| Paisa Score (explained, /100) | ✅ | ✅ live | ✅ | ✅ | Ready |
| Vittova AI (grounded coach) | ✅ | ✅ live (history needs v1_3 table) | ✅ | ✅ | Run migration; confirm Gemini key/model |
| Wealth | ✅ | ✅ live | ✅ | ✅ API | Ready (visual check signed in) |
| Group Pool | ✅ | ⚠️ needs v1_3 (invite codes) | ✅ | ✅ API | **Blocked on migration** |
| Recurring charges + cancellation | ✅ | ⚠️ mark-cancelled needs v1_3 | ✅ | ✅ API | **Blocked on migration** |
| PDF import | ✅ | needs v1_2 enum; Pro-only | ✅ | ✅ | Not purchasable (no billing) |
| Pro | Entitlement ✅ · purchase ❌ | 501 by design | "Coming soon" | ✅ | Needs Play Billing + server verification |
| Branding / login screen | ✅ official logo | — | ✅ | ✅ emulator | Ready |

## MANUAL ACTIONS REQUIRED (in order)

**Run now (2026-09-14):**
- `supabase/v1_5_backfill_profiles.sql` in the Supabase SQL Editor: 8 of 18 accounts have no profile row and cannot load the app on older APKs (the new app/backend repairs an account on sign-in, but the SQL fixes everyone at once).
- Owner Console access: `update public.profiles set role = 'admin' where email = '<the address in ADMIN_EMAIL on Render>';` (production currently has 0 admin accounts). v1_4 is already applied.

**Rebrand (2026-09-14):** DNS for vittova.in, Vercel/Render domains, Supabase Site URL + redirects + email templates, Google OAuth consent branding — exact steps in [REBRAND_VITTOVA.md](REBRAND_VITTOVA.md#manual-owner-actions).

1. **Run database migrations now** (production is currently missing them;
   group creation/joining, UPI and PDF expense inserts, marking subscriptions
   cancelled and AI chat history fail until this is done):
   Supabase Dashboard → SQL Editor →
   1. `supabase/v1_2_security_p0.sql`
   2. `supabase/v1_3_product_core.sql`
   3. `supabase/tests/verify_production.sql` — every row must be **PASS**
2. **Supabase → Authentication → URL Configuration → Redirect URLs:** add
   `spendly://login-callback`, `spendly://reset-password`,
   `https://<site>/auth/callback`, `https://<site>/reset-password`
   (details: `AUTH_DEEP_LINKS.md`). Set minimum password length 8.
3. **Render environment:** confirm `GEMINI_API_KEY` (paid tier recommended),
   optionally `GEMINI_MODEL` (default `gemini-3.5-flash`), `ALLOWED_ORIGINS`,
   `NODE_ENV=production`. Set a Google Cloud budget alert.
4. **Device test** the current APK (`release-artifacts/Vittova-debug.apk`) with
   `DEVICE_TEST_CHECKLIST.md`: Google login, reset-password email, UPI detection
   while the app is closed, CSV share, Group Pool with two accounts.
5. **Release signing:** create an upload keystore + `keystore.properties`, enrol
   in Play App Signing, rebuild `bundleRelease` (current AAB is unsigned).
6. **Google Play Console:** listing, Data safety (`PRIVACY_DATA_INVENTORY.md`),
   notification-access declaration with prominent disclosure video, financial
   features declaration, content rating, target audience 18+.
7. **Host legal pages:** confirm `/privacy`, `/terms`, `/delete-account` on the
   production website; set `VITE_SUPPORT_EMAIL` to a monitored mailbox and rebuild.
8. **Legal / professional review** of `FINANCIAL_CONTENT_REVIEW.md` items
   (coach scope, disclaimers, compounding illustration, DPDP obligations).
9. **Billing (only when selling Pro):** implement `BILLING_ARCHITECTURE.md`.
10. **Android App Links (recommended):** verified https auth callbacks once the
    Play signing fingerprint and domain are available.
11. **Peer-session work:** decide on `deferred-work/peer-sessions-2026-09-13.patch`
    (₹299 one-time Pro pricing, projections). Its useful cancellation guides were
    adopted; the fake purchase flow and named-fund recommendations were not.
12. **Verify package names** in the UPI allowlist on real devices; add others
    only after confirming their Play Store package ids.

## Remaining engineering items (not blockers)

| Priority | Item |
|---|---|
| P2 | Main JS chunk 634 kB: split `recharts`/`framer-motion` further |
| P2 | Income is not tracked; AI and Wealth state this limitation |
| P2 | Crash/error monitoring (PII-scrubbed) |
| P2 | Frontend component tests (currently unit + build + lint only) |
| P3 | Savings goals with progress (only a monthly target exists today) |
| P3 | Income/refund ledger for detected INCOME/REFUND notifications |
