# Vittova — pre-launch production audit and live-system verification (22 Oct 2026)

**Decision: NO-GO** — one authentication blocker: Google sign-in fails on Android copies in circulation (evidence below). It becomes **CONDITIONAL GO** as soon as a Play-installed copy signs in with Google (and the backend deploy is decided). Everything else checked is either healthy or minor.

Previous report (19 Oct, vc32 build audit) is superseded by this one; its findings are carried forward below. Companion reports: SECURITY_AUDIT.md, DATA_INTEGRITY_AUDIT.md, BUILD_REPORT.md, REGRESSION_TEST_REPORT.md, RELEASE_CHECKLIST.md, ROLLBACK_PLAN.md.

## 1. Baseline

| Item | Observed |
|---|---|
| Repository | `D:\paisa-buddy` on `feat/website-dark-first` = `main` = `origin/main` @ `e024cad`; untracked user files only (not touched) |
| Release candidate | branch `release/vc31` (local, not pushed) @ `7354f13`; app artifact **vc32 / 1.1.2** built from `6a8e9ff` (later commits: docs, and a lockfile patch proven not to change the app bundle) |
| Android identity | `com.vittova.app`, versionCode 32, versionName 1.1.2, release variant, upload-key SHA-1 `3B:AE:EA:F4:…:8D:46`; Play app-signing SHA-1 `E7:90:69:CA:…:2A:B0` |
| Website (live) | https://vittova.in serves `main`: the live bundle contains the Play Store link added in `e024cad` |
| Backend (live) | Render, `/api/health` → commit **`8c8731e`** (backend code identical to `main`; dependencies older than the release branch) |
| Database | Supabase project `fqzqfwjjiruntrulmdnd`; migrations v1_3 … v1_13 applied; v1_14 (rewards, unreleased) not applied — correct for this release |
| Auth | Supabase Auth: email/password (+ typed codes), Google (web OAuth; Android native ID token) |
| Payments | Google Play Billing only (server-verified, RTDN). **No web payment provider** — the website says Pro is sold only on Google Play |
| AI | Gemini, server-side only |
| Telemetry | own `app_events` / `app_installs` / `ops_events` tables; no third-party analytics or crash SDK |

Mismatches flagged: (a) live backend ≠ release branch (security patches + two fixes undeployed); (b) the Android version in testers' hands is 1.1.1 (vc31), not the candidate vc32.

## 2. Findings

| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| A1 | **P0 (launch blocker)** | **Google sign-in fails on Android** with `native_oauth_client_mismatch` | Production events (anonymised): 9 failures on 1.1.1/1.1.0 since 19 Oct, latest 21 Oct 11:08 IST, 3 in a row on one device; only 2 successful Android sign-ins in 7 days vs 21 on the web. 46 of 68 accounts use Google | **Open — needs a Google Cloud check (below).** Not fixable in code: the app correctly reports Google's refusal |
| A2 | P1 | Production backend runs older dependencies (`proxy-addr` critical, `multer` DoS) and lacks the bill and date fixes | `/api/health` = `8c8731e`; audit of that tree | Fixed on `release/vc31`; **deploy needs approval** |
| A3 | P2 | Safe-to-Spend counted an already-paid, logged bill twice until its due day | Unit + reconciliation tests | Fixed (backend; live after deploy) |
| A4 | P2 | Editing an expense to an impossible date (31 Feb) saved another day | Reproduced by test | Fixed (backend; live after deploy) |
| A5 | P2 | Capacitor critical advisory in installed vc29–vc31 | npm audit | Fixed in vc32 |
| A6 | P3 | New advisories (Vite dev server, follow-redirects) | npm audit 22 Oct | Patched `7354f13`; app bundle byte-identical, no rebuild needed |
| A7 | P3 | Owner Console "GOALS" column counts "has a monthly investment target", not savings goals | `admin_user_stats` definition | Open (label) |
| A8 | P3 | Owner Console "never" active for 12 accounts that did sign in before activity tracking existed | Auth admin aggregates | Open (label/explanation) |
| A9 | P3 | Repeated wrong-password attempts (one device: ~45 in 20 min) — Supabase limits apply, no app-level hint for Google-created accounts | Production events | Open — consider "Signed up with Google? Use Continue with Google" after 2 failures |
| A10 | P3 | Website sends no Content-Security-Policy (API does) | Live headers | Open |
| A11 | Info | 13 accounts hold **manual** Pro grants (expiring Nov 2026–Nov 2027, one never) | Read-only aggregates | Confirm intended |
| — | P3 | Carried from 19 Oct: large JS chunks, 26 Android lint warnings, Group Pool payer/settlement rules, inline website links, emulator post-install black screen (not reproduced) | — | Open |

### A1 — what to do (you, in Google Cloud / Play Console)

The failing copies are 1.1.1 (vc31), which was not uploaded to Play, so they are almost certainly the **APK installed directly** — signed with the **upload key `3B:AE:EA:F4:06:E1:17:8C:2A:8B:81:C5:8B:75:39:8A:39:7F:8D:46`**. On 18 Oct Google refused to register that pair because it was "already in use"; that uniqueness is global across Google Cloud projects, so it may be registered in **another project** rather than in "Spendly", where the Web client `721097065853-laes…` lives.

1. In project Spendly → Google Auth Platform → Clients, open Android client 1, 2 and 3 and note each SHA-1.
2. If none is `3B:AE:…:8D:46`: find the project that holds it (any old Firebase/Google Cloud project for this app), delete that Android client there, then create it in Spendly.
3. Also add Android clients in Spendly for Play's hybrid certificates `B0:18:FC:18:2E:A6:FA:73:F0:9E:8F:C3:B5:ED:2E:E0:73:3D:99:BD` and `D8:E7:82:0F:5F:96:E3:10:12:4D:9D:EF:62:33:55:B4:4A:02:D4:83` (newer Android versions may present these).
4. Verify: install from a Play testing track (Play-signed) and tap **Continue with Google**; then a directly installed APK.

## 3. Final launch answers

1. **Verified live (read-only):** API health and version; anonymous key denied on 10 tables; unauthenticated API calls → 401; CORS refuses foreign origins; no source maps or env files exposed; website pages 200 with HSTS/nosniff/frame DENY; website serves `main`; migration state; Owner Console counts equal direct database counts; no duplicate/orphan/future/negative expenses; auth/profile consistency; sign-in failure telemetry.
2. **Verified locally only:** all test suites (465 backend, 97 database, 163 frontend, 107 Android), builds, signing, bundle contents, emulator launch, financial calculations.
3. **Fixed and retested:** A3, A4 (19 Oct), A5 (vc32), A6 (today).
4. **Unresolved:** A1 (blocker), A2 (awaiting deploy approval), A7–A10, carried P3s.
5. **Needs a phone or a person:** Google sign-in (A1); Play licence-tester purchase/cancel/restore on vc32; SMS and notification capture; reminders; Play Console declarations; Supabase SMTP.
6. **Website and backend vs release:** website = `main` ✔. Backend = `main` code with older dependencies; the release branch adds patches and two fixes ✘ until deployed.
7. **Android artifact:** `release-final/vc32/Vittova-1.1.2-vc32.aab` — correct package, version 32, upload-key signed, checksums verified today ✔.
8. **Remaining actions, in order:** (1) fix A1 in Google Cloud and verify on a Play-installed copy; (2) approve backend deploy of `release/vc31`; (3) licence-tester purchase on vc32; (4) phone checks in RELEASE_CHECKLIST.md; (5) upload vc32 with a staged rollout.
