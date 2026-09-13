# Authentication, OAuth and deep links

## Flows

| Flow | Web return URL | Android return URL |
|---|---|---|
| Google sign-in | `https://<site>/auth/callback` | `spendly://login-callback` |
| Email signup confirmation | `https://<site>/auth/callback` | `spendly://login-callback` |
| Password reset email | `https://<site>/reset-password` | `spendly://reset-password` |

All flows use Supabase **PKCE** (`flowType: 'pkce'` in
`frontend/src/lib/supabaseClient.js`):

1. The app starts the flow; supabase-js stores a random **code verifier** on the device.
2. The provider/email link returns to the app with a one-time `code`.
3. The app exchanges `code` + verifier for a session (`exchangeCodeForSession`).

A `code` without the verifier on *this* device is useless.

## Android handling (`frontend/src/App.jsx` → `DeepLinkHandler`)

- Only `spendly://login-callback` and `spendly://reset-password` are accepted
  (manifest intent filters and a runtime host check).
- **Tokens in the URL are ignored.** The old implicit flow accepted
  `#access_token=…&refresh_token=…`, which let another app that registers the
  same scheme read tokens, and let a crafted link sign a victim into an
  attacker's account. Now only a `code` matching `^[A-Za-z0-9._~-]{8,512}$` is used.
- Each URL is processed once (launch URL and `appUrlOpen` can both deliver it).
- Supabase error parameters (`error_code=otp_expired`, `access_denied`) show
  "This link has expired or has already been used" / "Sign-in was cancelled".
- A missing verifier (link opened on another device) shows "Open the link on
  the same device where you requested it."
- Google sign-in opens in a Chrome Custom Tab (`@capacitor/browser`), never in
  the WebView. Closing the tab resets the button (`useOAuthBrowserReset`).

## Password reset

`/forgot-password` → `resetPasswordForEmail(email, { redirectTo })`. The
screen shows the same confirmation whether or not the email has an account.
The link opens `/reset-password` with a recovery session; the user sets a
new password (min 8 chars) via `updateUser`. Expired or used links and links
opened without a recovery session show an explanation and a "Request a new
link" button.

## Custom scheme vs Android App Links

Custom URL schemes are **not verified**: any installed app can declare
`spendly://`. PKCE is what prevents a hijacked link from producing a session.
A hijacker would only receive a code it cannot redeem. The app still
treats the URL as untrusted input.

**Android App Links (verified `https://` links) are preferable for production**
and are feasible:

1. Use a domain you control (e.g. `spendly.app`, or the Vercel domain).
2. Publish `https://<domain>/.well-known/assetlinks.json` containing package
   `com.spendly.app` and the **SHA-256 fingerprint of the Play App Signing key**
   (Play Console → Setup → App signing), plus the upload key for testing.
3. Add an intent filter with `android:autoVerify="true"`, `scheme="https"`,
   `host="<domain>"`, `pathPrefix="/auth"`.
4. Change `loginRedirectUrl()` / `passwordResetRedirectUrl()` in
   `frontend/src/lib/authRedirects.js` to the https URLs on Android.
5. Add the https URLs to the Supabase redirect allow-list; keep the custom
   scheme as a fallback until adoption is confirmed.

This was **not** done in this phase because it needs the signing-key
fingerprint and a verified domain: see manual blockers.

## MANUAL BLOCKERS: Supabase dashboard (cannot be set from the repository)

Supabase → Authentication → URL Configuration → **Redirect URLs** must contain:

```
spendly://login-callback
spendly://reset-password
https://spendly-iota.vercel.app/auth/callback
https://spendly-iota.vercel.app/reset-password
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
```

(Replace the Vercel domain with the production site.) If an entry is missing,
Supabase silently redirects to the **Site URL** and the user lands on the
website instead of the app.

Also verify:
- Authentication → Providers → Email: "Confirm email" ON.
- Authentication → Email templates: default `{{ .ConfirmationURL }}` links
  (these work with PKCE).
- Authentication → Rate Limits: sensible limits for sign-in, sign-up, password
  reset and OTP emails (backend no longer proxies login).
- Authentication → Providers → Google: authorised redirect URI in Google
  Cloud console is `https://<project-ref>.supabase.co/auth/v1/callback`.
- Minimum password length set to 8 to match the app.

## Tests

Covered by unit/integration tests: backend auth rejection, banned users,
deleted-account token rejection. **Not automatable here, so run on a device**
(see `DEVICE_TEST_CHECKLIST.md`): Google sign-in round trip, email
confirmation link, reset with valid / invalid email / expired link /
already-used link / success / login with new password.
