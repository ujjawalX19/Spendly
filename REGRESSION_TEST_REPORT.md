# Regression test report (22 Oct 2026)

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
