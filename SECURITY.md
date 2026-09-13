# Security

## Reporting a vulnerability

Email **ujjawalshrivastava270@gmail.com** with a description, reproduction
steps, and impact. Please do not open a public issue for anything that exposes
user data. Expect an acknowledgement within 72 hours.

---

## The one thing to understand about this codebase

The backend talks to Supabase with the **service-role key**, which bypasses Row
Level Security entirely. RLS is configured and should stay configured — it
protects the app's direct client-side Supabase calls — but it will **not** save
a backend route that forgets to scope a query.

Every route that touches user data must filter by `req.user.id` itself, and
every group-scoped route must prove membership before reading or writing.
Three authorization holes found during the launch audit were all of this shape.
When reviewing a backend change, the question is: *if RLS did not exist, would
this query still be safe?*

---

## Secrets

| Secret | Lives in | Exposure |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env`, server env only | **Never** ships to the frontend or the APK. Full database access, bypasses RLS. |
| `GEMINI_API_KEY` | `backend/.env`, server env only | Server-side only. Billable. |
| `VITE_SUPABASE_ANON_KEY` | `frontend/.env.local`, baked into the build | Public by design. Safe **only because** RLS is enabled. |
| Upload keystore + passwords | `android/keystore.properties`, `*.jks` | Never committed. Losing it means you cannot update the app. |

`.env`, `.env.*`, `*.jks`, `*.keystore`, `keystore.properties` and
`google-services.json` are all git-ignored. Verify before any commit:

```bash
git status --porcelain --ignored | grep -E "\.env|\.jks|keystore"
```

Files prefixed `!!` are ignored and safe. Anything else is about to be
committed.

### Known historical exposure

The Supabase **anon** key and the project ref were committed to git history in
`1b5b8b9` as a hardcoded fallback, and removed from the working tree later. The
anon key is designed to be public, so this is not itself a breach — but it
means **RLS is the only thing protecting your data**, and the project ref is
known to anyone who reads the history.

Action required: run the verification queries at the end of
`supabase/v1_1_launch_hardening.sql` and confirm every table reports
`rowsecurity = true`. Rotating the anon key is optional; verifying RLS is not.

No service-role key, Gemini key, or private key has ever been committed. This
was verified with a full-history scan (`git log --all -p`).

---

## Preventing premium bypass

Pro entitlement is **never** read from the client. `localStorage`, React state
and request bodies are all untrusted.

- `is_pro` and `pro_expires_at` live on `profiles` and are written only by the
  service-role backend.
- The `authenticated` Postgres role holds column-level `UPDATE` on exactly
  `full_name`, `monthly_budget` and `investment_target`. A client cannot grant
  itself Pro even with a valid session and the anon key.
- `middleware/proGate.js` enforces free-tier quotas server-side, so bypassing
  the frontend `ProGate` component achieves nothing.
- `POST /api/pro/activate` returns **503** and writes nothing. It will stay
  that way until a verified Google Play Developer API or RevenueCat webhook
  exists. A client-submitted purchase token is not proof of purchase.

Re-run the column-grant verification query after **any** migration that adds a
column to `profiles` — grants are a whitelist, and it is easy to widen one by
accident.

---

## Authentication

Sessions are Supabase JWTs. `middleware/authMiddleware.js` verifies every
bearer token against Supabase Auth on each request; it does not decode tokens
locally.

On Android, Google OAuth runs in a Chrome Custom Tab, never in the app's
WebView. This is both a UX and a security property: an embedded WebView can
observe everything typed into it, which is exactly why Google rejects OAuth
there.

Tokens are stored in the Capacitor WebView's local storage, which is sandboxed
to the app. `android:allowBackup="false"` plus the backup and data-extraction
rules prevent that storage from leaving the device via `adb backup`, cloud
backup, or device-to-device transfer.

---

## What the app collects, and what it does not

- The notification listener reads **notifications only**. It does not read SMS,
  contacts, or the clipboard. It requires the user to grant Notification Access
  explicitly in Android settings, and it ignores every app outside its
  allow-list of payment and banking apps.
- Notification text is **never logged**. It contains payee names and amounts,
  and `logcat` is readable over `adb` and by crash reporters.
- Receipt images are sent to Google Gemini for OCR. The prompt instructs the
  model to omit card numbers, CVVs, account numbers and UPI IDs, and the parsed
  result is filtered before storage. Treat this as best-effort, not a
  guarantee — it is a model instruction, not an enforced filter.
- The AI coach receives aggregate spending figures, never raw transaction rows
  belonging to other users.

If you add analytics or crash reporting, never send amounts, payee names,
descriptions, tokens, or email addresses.

---

## CSV export

Exported cells beginning with `=`, `+`, `-` or `@` are prefixed with a single
quote. Without that, a description a user typed — or one parsed from a
receipt — executes as a formula when the file is opened in Excel, LibreOffice
or Google Sheets. See `backend/lib/csv.js`.

---

## Dependency and build hygiene

```bash
cd backend  && npm audit --omit=dev
cd frontend && npm audit --omit=dev
```

Release builds are `debuggable false` with R8 minification and resource
shrinking enabled. `usesCleartextTraffic` is `false`, so the app cannot make
plaintext HTTP requests.
