# Regression test report

## vc33 / 1.1.3 (23 Oct 2026): Play rejection fix

Source: branch `fix/play-review-vc33` (from `main` @ `72763d1`), clean `npm ci` from the lockfiles.

| Suite | Command | Total | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Backend | `cd backend && npm test` | 465 | 465 | 0 | 0 |
| Database (PGlite: RLS, constraints, migrations) | `cd supabase/tests && npm test` | 97 | 97 | 0 | 0 |
| Frontend (after `npm run build:web`, so the bundle secret scan runs) | `cd frontend && npm test` | 164 | 164 | 0 | 0 |
| Android JUnit (release) | `gradlew testReleaseUnitTest` | 112 | 112 | 0 | 0 |
| ESLint | `npx eslint .` | — | 0 errors | | |
| Android lint (release) | `gradlew lintRelease` | — | no new issues | | |
| npm audit (production) | frontend and backend | — | 0 vulnerabilities | | |

New tests:

- `SmsSamplePreviewTest` (5 tests): the sample preview's outcomes come from the real rules:
  - the HDFC debit becomes ₹250 to SWIGGY (HDFC Bank);
  - the SBI UPI debit becomes ₹120 to TEA STALL;
  - the OTP is skipped;
  - the phone-number sender is never read.
- `paymentTracking.test.js` (1 test): the sample labels.

Notes on how the tests were run:

- Run without the website build, the frontend secret-scan test is skipped (dist missing), or fails if `dist/` is the Android build (no `vittova-ops`). Run `npm run build:web` first, as here.
- My first lint run failed only on my machine's copied `local.properties` (an unescaped path, not in Git). After fixing the copy, lint passes.

Emulator (Pixel 7, API 36), signed release APK:

- installs over the previous build;
- launches to the sign-in screen with no Vittova crash (the only crash in the log came from the emulator's own Chrome);
- SMS is **not** granted or requested at launch.

**Not run (blocked):**

- Anything after sign-in. I can't sign in to production myself, and no reviewer account exists yet.
- Granting and revoking SMS on a device.
- A live debit SMS.
- Valid and invalid logins with the reviewer account.

These must be done by the owner (see PLAY_RESUBMISSION_CHECKLIST.md). The sample-preview screen has not been seen on a device yet; it's covered by unit tests and the build contents only.

## Previous: vc32 (22 Oct 2026)

Source: `release/vc31` @ `7354f13`, clean install from lockfiles (Node 24.13.1).

| Suite | Command | Total | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Backend (real Express app, in-memory DB) | `cd backend && npm test` | 465 | 465 | 0 | 0 |
| Database (PGlite Postgres: RLS, constraints, migrations) | `cd supabase/tests && npm test` | 97 | 97 | 0 | 0 |
| Frontend (`node --test`; needs `npm run build:web` first) | `cd frontend && npm test` | 163 | 163 | 0 | 0 |
| Android JUnit (19 Oct build of `6a8e9ff`) | `gradlew testDebugUnitTest` | 107 | 107 | 0 | 0 |
| Lint | `cd frontend && npm run lint` | — | 0 problems | — | — |
| Android lint (19 Oct) | `gradlew lintRelease` | — | 0 errors | 26 warnings | — |
| Dependency audit | `npm audit --omit=dev` | — | backend 0, frontend 0 | — | — |

Regression tests added during the 19 Oct audit and re-run today: `backend/tests/billsPaid.test.js` (4 tests), impossible-date test in `productRoutes.test.js`.

Live smoke tests (non-destructive, 22 Oct): health/version, app-config, unauthenticated 401s, anon RLS denial, CORS, headers, website pages and asset check — all as expected (details in SECURITY_AUDIT.md).

Not available / not run: TypeScript type check (JavaScript project), Android instrumentation tests (none exist), end-to-end browser tests against production with real accounts, payment sandbox, physical-device tests.
