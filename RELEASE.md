# Releasing Spendly

## 0. Migration first — not optional

```sql
-- Supabase SQL Editor
\i supabase/v1_1_launch_hardening.sql
```

The backend queries `expenses.occurred_at`, which this migration creates. If
you deploy the backend first, every reporting endpoint returns an error until
the migration runs. Then run the two verification queries at the bottom of that
file and confirm:

- every table in `public` reports `rowsecurity = true`
- `authenticated` holds `UPDATE` on exactly `full_name`, `investment_target`,
  `monthly_budget` — **nothing else**, and in particular not `is_pro` or `role`

## 1. Supabase dashboard

Authentication → URL Configuration → Redirect URLs must include:

```
spendly://login-callback
https://spendly-iota.vercel.app/dash
http://localhost:5173/dash
```

Without the custom-scheme entry, Supabase ignores the Android `redirectTo` and
falls back to the Site URL — which is why Google sign-in used to dump users on
the website instead of returning to the app.

## 2. Create the upload keystore (once, ever)

```bash
cd frontend/android
keytool -genkeypair -v \
  -keystore spendly-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias spendly-upload
```

```bash
cp keystore.properties.example keystore.properties
# edit keystore.properties with the real passwords
```

Both files are git-ignored. Verify:

```bash
git check-ignore -v frontend/android/keystore.properties frontend/android/spendly-upload.jks
```

**Back up `spendly-upload.jks` and its passwords somewhere you will still have
in two years.** Without Play App Signing enrolment, losing this key means you
can never publish an update to the app. Enrol in Play App Signing — it makes
key loss recoverable.

## 3. Build

```bash
cd frontend
npm ci
npm run lint
npm run build
npx cap sync android

cd android
./gradlew testDebugUnitTest      # runs PaymentNotificationParserTest
./gradlew bundleRelease
```

Output: `frontend/android/app/build/outputs/bundle/release/app-release.aab`

Verify the signature before uploading:

```bash
jarsigner -verify -verbose -certs app/build/outputs/bundle/release/app-release.aab
```

If `keystore.properties` is absent the build still succeeds but produces an
**unsigned** bundle, which Play will reject. That is deliberate — a missing key
should not break CI or a debug build.

## 4. Backend

```bash
cd backend
npm ci
npm test        # 33 unit tests
npm run test:tz # the same tests under three server timezones
```

Required environment variables in production (Render):

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. Server only, never in the app. |
| `GEMINI_API_KEY` | |
| `NODE_ENV` | `production` — suppresses stack traces in responses |
| `FRONTEND_URL` | |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list |
| `APP_TIMEZONE` | Optional; defaults to `Asia/Kolkata` |

`APP_TIMEZONE` is what makes month boundaries and daily quotas line up with the
user's calendar rather than the server's. Leave it alone unless you are
launching outside India.

## 5. Versioning

Bump `versionCode` in `frontend/android/app/build.gradle` for **every** upload
to Play — Play rejects a duplicate. Bump `versionName` for anything users would
notice.

## 6. Before you submit

Work through `PLAY_STORE_CHECKLIST.md` and `DEVICE_TEST_CHECKLIST.md`. Run the
device checklist against the **release** build, not a debug build: R8
minification can break reflection-based Capacitor plugin loading, and a debug
pass proves nothing about that.
