# Indus Appstore build + Razorpay Pro passes (23 Oct 2026)

Branch `feat/razorpay-indus` (local, from `fix/play-review-vc33`). Nothing pushed, deployed, applied or uploaded.

## What was built

| Where | How Pro is sold |
|---|---|
| Google Play app (vc33 AAB in `release-final/vc33/`) | Google Play Billing only. **Unchanged.** Google's policy forbids other payment methods in the Play app |
| Indus Appstore app (this build) | Razorpay pass |
| Website vittova.in | Razorpay pass |

**Passes:**
- ₹49 for 30 days, or ₹449 for 1 year;
- one payment, no auto-renew, no mandate;
- buying again before a pass ends adds the new period after the current one.

Pro bought anywhere works everywhere after sign-in.

### Safety design

- **The server sets the amount.** The app can only choose `monthly` or `yearly`.
- **Pro is granted only after the server confirms the payment.** It checks Checkout's signature, then re-reads the payment from Razorpay: same order, same amount, captured (it captures if only authorized).
- **Webhooks need Razorpay's signature** over the raw body. The body is treated only as a pointer, and the payment is always re-read. A webhook also catches payments whose verify call never arrived.
- **Idempotent.** Verify and the webhook racing each other grant one period.
- **Retries are safe.** A failed attempt leaves the order open for a retry.
- **Refunds.** A full refund ends that pass; a partial refund does not.
- **No double charge.** An account with active Play or manual Pro can't start a Razorpay order.
- **One shared Pro calculation** (`lib/proEntitlement.js`) over Play, Razorpay and manual grants. A Play cancellation can no longer switch off a paid Razorpay pass, which fixes the issue noted in PAYMENT_AUDIT.md §4.
- **Secrets.** The key secret and webhook secret stay on the server only. The app gets only the key id. No card, UPI or bank details are stored.

### Files

| Area | Files |
|---|---|
| Server | `backend/lib/razorpayApi.js`, `razorpayBilling.js`, `proEntitlement.js`; `playBilling.recomputeProfile` now uses the shared calculation; `routes/pro.js` (4 routes + `razorpayAvailable` in status); `app.js` (raw body for the webhook) |
| Database | `supabase/v1_15_razorpay_passes.sql` (new table, `pro_source` gains `razorpay`) |
| App and site | `src/lib/distribution.js`, `razorpayCheckout.js`, `razorpayPlan.js`, `ProContext.jsx`, `ProUpgrade.jsx`, `UpdateGate.jsx` (Indus users are told to update in the Indus Appstore, not Google Play), `vite.config.js` + `npm run build:indus` |
| Legal and copy | Terms §4 (both copies), privacy policy (Razorpay as a processor, both copies), homepage pricing and FAQ |

## Tests

| Suite | Result |
|---|---|
| Backend | **482/482** passed (17 new in `razorpay.test.js`: forged signatures, swapped or underpaid payments, another account's order, outages, webhook tampering, races, stacking, refunds, double charge, Play cancellation) |
| Database | **103/103** passed (6 new for v1_15: constraints, RLS denies clients, cascade on account deletion) |
| Frontend | **168/168** passed, including the bundle secret scan on the website build |
| Android JUnit | 112/112 passed |
| Lint | ESLint and Android lint clean |
| Emulator | the Indus APK installs and opens to sign-in, no crash |

**Not tested (needs your Razorpay keys and a phone):**
- a real Razorpay payment;
- a UPI app opening from Checkout inside the app.

UPI apps open through Android's normal link handling. If a UPI app doesn't open, UPI ID, QR, cards and net banking still work, and the fix would be Razorpay's native Android SDK.

## Indus artifacts (`D:\paisa-buddy\release-final\indus\`)

| File | SHA-256 |
|---|---|
| `Vittova-1.1.3-vc33-indus.apk` | `79952c2bc4c8f98f6da900ec19e71f8ccb0983f0d2e6c5f3b349d253913a8b1e` |
| `Vittova-1.1.3-vc33-indus.aab` | `944350a7e30fc00903863163e91db7ebd9c50ab3d66c1b35b8c64e844da103ec` |

- Package `com.vittova.app`, versionCode 33 / 1.1.3, signed with the upload key (SHA-1 `3B:AE…8D:46`).
- Google sign-in works with this key: Android client 3 in Spendly.
- Permissions are the same as the Play build. `com.android.vending.BILLING` comes from the Play Billing library and is unused in this build.
- An Indus copy and a Play copy can't update each other, because they're signed with different keys.

## Your steps, in order

1. **Razorpay dashboard:**
   - Settings → API Keys: generate **Test** keys first.
   - Webhooks → add `https://spendly-t8s6.onrender.com/api/pro/razorpay/webhook`, with events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, and a webhook secret.
2. **Supabase SQL editor:** run `supabase/v1_15_razorpay_passes.sql`.
3. **Render → Environment:**
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (test values);
   - `RAZORPAY_ENABLED=true`.
4. **Deploy:** push this branch to `main` (website and API deploy together). Ask me when you're ready.
5. **Test on the website with test keys:**
   - buy monthly with Razorpay's test card or UPI `success@razorpay` → Pro turns on;
   - refund it in the dashboard → Pro ends.
6. **Install the Indus APK on a phone.** Buy a pass with test UPI and confirm the UPI flow works.
7. **Switch to Live keys** in Render (the Live webhook has its own secret).
8. **Confirm the refund policy** in Terms §4. I wrote a common default (refund within 7 days if charged but Pro didn't activate, or charged twice); change it if yours differs. Razorpay requires a visible refund policy.
9. **Indus Appstore developer console:** upload `Vittova-1.1.3-vc33-indus.apk`, add the same listing, privacy URL and screenshots, and declare SMS use as on Play.
