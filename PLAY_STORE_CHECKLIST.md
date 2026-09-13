# Spendly — Play Store Release Checklist

Split by what this repository can settle and what only you can, with an account
and a device in hand.

---

## Part A — Automated / in-repository

These were verified in the repo.

| Item | State |
|---|---|
| `targetSdkVersion 36`, `minSdkVersion 24` | Done — meets the current Play target-API requirement |
| Release build minified (R8) + resource shrinking | Done |
| `debuggable false` on release | Done |
| `usesCleartextTraffic="false"` | Done |
| `allowBackup="false"` + backup/data-extraction rules | Done |
| Signing config wired to git-ignored `keystore.properties` | Done — key itself is Part B |
| No secrets in tracked files (full-history scan) | Done |
| Permissions minimal: `INTERNET`, `POST_NOTIFICATIONS`, notification listener | Done |
| Account deletion endpoint + UI | Done |
| Data export (CSV) | Done |
| Privacy Policy and Terms screens in-app | Done |
| Deep link `spendly://login-callback` declared | Done |
| ProGuard keeps for Capacitor plugins and the parser | Done |
| Backend + parser unit tests | Done — 33 + 32 passing |
| `versionCode` / `versionName` | `1` / `1.0.0` — bump `versionCode` on every upload |

**Not verified here:** no Gradle build was run in this session (no Android SDK
available), so the AAB has never been produced. That is the first thing to do.

---

## Part B — Manual, requires your accounts

### Build and signing

- [ ] Create the upload keystore (see `RELEASE.md`)
- [ ] Fill `frontend/android/keystore.properties` — never commit it
- [ ] **Back up the keystore and passwords off-machine.** Losing the upload key
      without Play App Signing enrolment means you can never update the app.
- [ ] Enrol in **Play App Signing** (strongly recommended — it makes key loss
      recoverable)
- [ ] `cd frontend && npm run build && npx cap sync android`
- [ ] `cd android && ./gradlew bundleRelease`
- [ ] Verify the output: `frontend/android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Confirm it is signed: `jarsigner -verify -verbose app-release.aab`
- [ ] Install the release build on a real device and re-run
      `DEVICE_TEST_CHECKLIST.md` against **it**, not a debug build — R8 can
      break reflection-based plugin loading, so a debug pass proves nothing

### Store listing

- [ ] App name: **Spendly**
- [ ] Short description (80 chars max)
- [ ] Full description (4000 chars max) — describe automatic UPI tracking
      accurately; do not imply it reads SMS or bank accounts
- [ ] App icon 512 × 512 PNG, 32-bit with alpha
- [ ] Feature graphic 1024 × 500 PNG/JPG
- [ ] At least 2 phone screenshots (up to 8), 16:9 or 9:16, min 320 px
- [ ] Optional: 7-inch and 10-inch tablet screenshots
- [ ] Category: **Finance**
- [ ] Contact email, and a public privacy-policy **URL** (the in-app screen is
      not sufficient — Play needs a hosted page)

### Data safety form — must match the implementation

Answer from the actual behaviour, not aspiration. `SECURITY.md` documents it.

- [ ] Collects **Personal info**: name, email address (for the account)
- [ ] Collects **Financial info**: purchase history / other financial info
      (expense amounts, categories, merchant names)
- [ ] Data is **encrypted in transit** — yes
- [ ] Users can **request deletion** — yes, in-app, Settings → Delete Account
- [ ] Data shared with third parties: **Google (Gemini)** for receipt OCR and
      AI coaching; **Supabase** as the data processor
- [ ] Data is **not** sold
- [ ] Declare **no** SMS or call-log access — the app genuinely does not have it

### Permissions declaration

- [ ] `BIND_NOTIFICATION_LISTENER_SERVICE` — be ready to justify it. Explain
      that it is used solely to detect the user's own UPI payment
      notifications for automatic expense entry, that it is opt-in via Android
      settings, and that notification content is never transmitted or logged.
      Attach a short screen recording of the permission flow.
- [ ] `POST_NOTIFICATIONS` — budget and report alerts
- [ ] Confirm **no** `READ_SMS` / `RECEIVE_SMS` anywhere in the manifest —
      Play restricts these heavily and a stray declaration will fail review

### Content and audience

- [ ] Content rating questionnaire completed → expect **Everyone**
- [ ] Target audience: 18+ (a personal-finance app should not target children)
- [ ] Ads: **No**
- [ ] News app: **No**
- [ ] COVID-19 / government app: **No**
- [ ] Financial features declaration: this is a personal budgeting tool, **not**
      a lending, investment-advice, or payments product. Do not claim
      otherwise — India has separate Play requirements for those, and the
      in-app investment content must stay clearly informational (the
      `InvestmentDisclaimer` component exists for this reason).

### Subscriptions

Only if you enable Pro at launch — otherwise skip and ship free-only.

- [ ] Create the subscription product in Play Console
- [ ] Implement Play Billing in the app
- [ ] Implement **server-side** purchase verification (Google Play Developer
      API or RevenueCat webhook) and enable `POST /api/pro/activate`
- [ ] Implement restore purchases
- [ ] Handle cancellation, expiry, grace period, and refunds
- [ ] Test the full cycle in a closed testing track with a licence tester
- [ ] Do not ship with a purchase button that cannot complete a purchase

### Release tracks

- [ ] Internal testing first — up to 100 testers, available in minutes
- [ ] Closed testing — Play now requires a sustained closed test with real
      testers before a personal developer account can go to production.
      **Check the current requirement in Play Console; it has changed more than
      once.** Plan for this to gate your launch date.
- [ ] Open testing (optional)
- [ ] Production — staged rollout, start at 10–20 %

### Post-launch

- [ ] Watch Android vitals (ANR and crash rates) for the first 72 hours
- [ ] Watch the Supabase logs for authorization errors
- [ ] Have a rollback plan: keep the previous AAB and be ready to halt the
      staged rollout

---

## Launch gate

Do not submit to production until all of these are true:

1. `supabase/v1_1_launch_hardening.sql` has run and its verification queries
   return the expected output.
2. `spendly://login-callback` is in the Supabase redirect allow-list, and
   Google sign-in has been tested on a real device against the **release**
   build.
3. `DEVICE_TEST_CHECKLIST.md` has no failures in a bold section.
4. The upload keystore is backed up somewhere you will still have in two years.
5. Either Pro is fully wired end-to-end, or the purchase UI is hidden.
