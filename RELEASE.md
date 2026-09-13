# Releasing Spendly

## 0. Database migrations first — not optional

Run in the Supabase SQL Editor, **in this order**, before deploying the backend:

1. `supabase/v1_1_launch_hardening.sql` — adds `expenses.occurred_at` (the backend queries it).
2. `supabase/v1_2_security_p0.sql` — removes all client write privileges, fixes
   group RLS, adds `upi_auto`/`pdf_import` expense sources (the backend writes them).
3. `supabase/tests/verify_production.sql` — read-only; **every row must be PASS**.
   Review the "is_pro = true" and "Admin accounts" rows manually.

Both migrations are idempotent and change no user data. Deploying the backend
first makes reporting endpoints and UPI/statement inserts fail until they run.

The migrations are tested locally against real Postgres:

```bash
cd supabase/tests && npm ci && npm test   # 28 tests
```

## 1. Supabase dashboard (manual)

See `AUTH_DEEP_LINKS.md` → *MANUAL BLOCKERS*. At minimum, Redirect URLs:

```
spendly://login-callback
spendly://reset-password
https://<site>/auth/callback
https://<site>/reset-password
```

## 2. Create the upload keystore (once, ever)

```bash
cd frontend/android
keytool -genkeypair -v \
  -keystore spendly-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias spendly-upload
cp keystore.properties.example keystore.properties
# edit keystore.properties with the real passwords
git check-ignore -v keystore.properties spendly-upload.jks
```

**Back up `spendly-upload.jks` and its passwords.** Enrol in Play App Signing so
upload-key loss is recoverable.

## 3. Build

```bash
cd frontend
npm ci
npm run lint
npm test
npm run build            # needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npx cap sync android

cd android
./gradlew testDebugUnitTest   # 48 tests: parser, privacy allowlist, dedupe, queue
./gradlew bundleRelease
jarsigner -verify -verbose -certs app/build/outputs/bundle/release/app-release.aab
```

Without `keystore.properties` the build succeeds but the bundle is **unsigned**
and Play rejects it.

## 4. Backend (Render)

```bash
cd backend
npm ci
npm test                 # 94 tests incl. security regression and rate limits
```

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. Server only. |
| `GEMINI_API_KEY` | Use a paid-tier key; set a Google Cloud budget alert. |
| `GEMINI_MODEL` | Optional. Default `gemini-3.5-flash`. `gemini-2.0-flash` was shut down 2026-06-01; confirm the model is supported. |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list |
| `TRUST_PROXY` | Optional. Default `1` in production (Render). Must equal the number of proxies in front of the app, or rate limiting breaks. Never `true`. |
| `APP_TIMEZONE` | Optional; default `Asia/Kolkata` |
| `ENABLE_BURN_RATE_JOB` | Optional; default off (the job only logs) |

After deploying, confirm per-client rate limiting: two different networks must
not share a rate-limit bucket (check `RateLimit` headers).

## 5. Versioning

Bump `versionCode` in `frontend/android/app/build.gradle` for every Play upload.

## 6. Before you submit

Work through `LAUNCH_TODO.md` (manual blockers), `PLAY_STORE_CHECKLIST.md` and
`DEVICE_TEST_CHECKLIST.md` on the **release** build.
