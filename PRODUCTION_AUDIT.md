# Vittova — production audit before going live (19 Oct 2026)

**Status: READY WITH OUTSTANDING MANUAL CHECKS**

Audited source: branch `release/vc31` (local, not pushed), final commit `6a8e9ff` = `main` @ `e024cad` + security/stability fixes (`adae4c3`) + this audit's fixes (`2404d40`) + versionCode 32 (`6a8e9ff`). Release candidate: **vc32 / 1.1.2** (`release-final/vc32/`). Nothing was deployed, uploaded, merged or pushed.

Production observed (read-only, 19 Oct): API `https://spendly-t8s6.onrender.com` reports backend commit **`8c8731e`** (identical backend code to `main`); `/api/app-config` minimum supported versionCode 0; vittova.in pages, legal pages, robots and sitemap return 200 with HSTS, nosniff and frame DENY. Which app version is live on Play was not confirmed.

## Scope

In the release: everything on `main` (redesign, website, auth, expenses, Safe-to-Spend, Afford-It (v1), Month Shape, SIP test, AI coach, Group Pool, payment tracking (SMS + notifications), subscription audit and debit reminders, Save-to-Earn, Money Streak, Play Billing, Owner Console).

**Not in this release (nothing to ship or audit here):** v1.14 rewards (missions, Points, savings goals, weekly recap, 7 levels; on branch `feat/rewards`, not deployed), Can I Afford This v2, Month Calendar, Money Wrapped, Money-Saved total, Split from Receipt, the Android widget (plan only, `feat/financial-intelligence`), website checkout (no web payment provider; the site says Pro is sold only through Google Play).

## Findings

| # | Sev | Area | Evidence | Root cause | Fix / status | Test | Result |
|---|---|---|---|---|---|---|---|
| 1 | **P1** | Production backend | `/api/health` → `8c8731e`; `npm audit` on that dependency tree: `proxy-addr` 2.0.7 (critical, trust-proxy IP spoofing, the app sets `trust proxy`), `multer` 2.3 (DoS) | Backend not redeployed since 3 Oct | Patched on this branch (`proxy-addr` 2.0.8 etc.). **Unresolved in production until the backend is deployed** (needs your authorization) | `npm audit --omit=dev` 0 | Fixed in source, not live |
| 2 | P2 | Safe-to-Spend (Home, Afford-It, Month Shape, Wealth, AI, Money Streak) | A bill paid and logged before its due day was subtracted twice (spent + still due) until the due day passed | `upcomingBillsFor` only looked at the due day | `billsPaidThisMonth`: a clear matching payment this month (shared name/category word, amount ±10%, on or after due day − 5; one payment per bill) marks the bill paid. Backend change: **live only after deploy** | `tests/billsPaid.test.js` (4 tests incl. cross-screen reconciliation); all 465 backend tests | Fixed |
| 3 | P2 | Expense edit (`PATCH /api/expenses/:id`) | Reproduced: `occurred_at: "2026-02-31"` returned 200 and saved 3 March | JS date maths normalises impossible dates | Date-only values must round-trip to the same IST day, else 400. Backend: live after deploy | New test in `productRoutes.test.js` (failed before, passes after) | Fixed |
| 4 | P2 | Android app (vc29/vc30) | `@capacitor/android` 8.4.2: critical advisory (remote content at app origin) | Old dependency | 8.4.3 in vc31/vc32. Reaches users with the vc32 update | Android build, 107 JUnit, emulator launch | Fixed in vc32 |
| 5 | P3 | Money Streak sheet | Harness: Close button 32×32 px, "How XP works" 16 px tall | Small hit areas | 44 px targets | Screenshot harness, frontend tests | Fixed |
| 6 | P3 | Privacy page | "← Vittova" back link 62×17 px | Text-only link | 44 px target | Harness | Fixed |
| 7 | P3 | Website inline links | "Terms of Service", "support@…", "FAQ" (27×40) under 40 px | Links inside sentences/footer | Not changed: inline links are exempt from target-size rules; FAQ meets 24 px minimum | — | Open (accepted) |
| 8 | P3 | Performance | Vite warns: main app chunk ~684 kB, Owner Console 924 kB | Single large entry chunk | Not changed (code-splitting is a larger change; app loads from the phone, not the network) | — | Open |
| 9 | P3 | Group Pool design | You cannot delete an expense you logged with someone else as payer; "I paid X" settlements need no confirmation from X | Product rules | Not changed (behaviour change; needs a product decision) | Code review | Open |
| 10 | P3 | Android lint | 26 warnings (ApplySharedPref ×11, UnusedResources ×6, version notices, icon notices), 0 errors | — | Not changed | `lintRelease` | Open |
| 11 | P3 | Emulator start-up | On two of several cold launches started while Android was still finishing an install/boot, the screen stayed black; the same build was fine on every other launch, after forced recreation, theme switch and font-size change | Not reproduced; consistent with emulator WebView memory limits during post-install work | Not changed | Emulator tests | Needs a phone check |
| 12 | Info | Dev tooling | 3 moderate advisories in `@capacitor/cli` (iOS `xcode`/`uuid`), not shipped | Upstream | Not changed | `npm audit` | Open |

Verified without findings (code review + tests): expense ownership on edit/delete; Group Pool membership checks on add/settle/leave, paise splits summing exactly; account switching (phone-captured payments are bound to the signed-in account and cleared for another); account deletion cascade; Pro entitlement server-side only; Play purchase verification (23 tests: ack, cancel, expiry, grace, hold, refund/revoke, RTDN token, restore, account binding); RLS and client write denial (97 DB tests); no secrets in web or Android bundles; receipt scan size/type validation and no image storage; date filters use India time.

## Must be checked by a person (not verifiable here)

- Phone: Google sign-in on the Play copy (Android OAuth client for the Play app-signing key was added 18 Oct); email sign-up, password reset code, sign-out/switch account; SMS and payment-notification capture; debit reminders; first launch straight after updating; status/navigation bars.
- Play: a licence-tester purchase, cancel and restore on vc32; production `PLAY_BILLING_ENABLED` state; Data safety, Financial features, App access and SMS permission declarations; which version is live.
- Supabase: custom SMTP and `{{ .Token }}` email templates.

## Decision

No P0. The one P1 is the production backend running old dependencies; it does not block the app upload, but deploying the backend from this branch is strongly recommended (it also delivers fixes 2 and 3). vc32 is ready for upload once the manual checks above pass. Google Play approval is decided by Google.
