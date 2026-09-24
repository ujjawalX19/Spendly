# Vittova Pro — billing architecture

Status (2026-09-23, app v1.1): **Google Play Billing and server-side
verification are implemented and tested, but switched OFF.** Pro cannot be
bought until the manual Play Console and Google Cloud steps below are done and
`PLAY_BILLING_ENABLED=true` is set on the server. Until then the app shows
"Coming soon" with no price and no purchase button, and
`POST /api/pro/verify-purchase` returns `501 BILLING_NOT_AVAILABLE`.

## Principle

```
Google Play purchase ──► app sends ONLY the purchase token ──► backend verifies with Google
      ──► backend stores the entitlement ──► app reads /api/pro/status
```

Never `button tapped ──► is_pro = true`, and never trust a client body.

## What exists

| Piece | Where | Guarantee |
|---|---|---|
| Android purchase | `frontend/android/.../PlayBillingPlugin.java` (Play Billing Library 8.0.0) | Launches Google's purchase sheet with `obfuscatedAccountId` from the backend; returns tokens. Grants nothing. |
| App flow | `frontend/src/lib/billing.js`, `pages/ProUpgrade.jsx`, `contexts/ProContext.jsx` | Price is Google Play's formatted price. Subscribe, Restore purchases, Manage subscription; on each app start, unverified purchases are sent to the server. |
| Billing config | `GET /api/pro/billing-config` | Product ids and the account's `obfuscatedAccountId` (sha256 of the user id), only when billing is on. |
| Verification | `POST /api/pro/verify-purchase` → `lib/playBilling.verifyAndStore` | Calls `purchases.subscriptionsv2.get`; requires a known product, `obfuscatedExternalAccountId` = this account, and a token not bound to another account. Acknowledges (Play refunds unacknowledged purchases after 3 days). |
| Entitlement | `play_purchases` (v1_8), `profiles.is_pro / pro_expires_at / pro_source` | Pro while state is ACTIVE, IN_GRACE_PERIOD or CANCELED **and** expiry is in the future. PENDING, ON_HOLD, PAUSED, EXPIRED → no Pro. Upgrades supersede the old token. Manual grants (`pro_source = 'manual'`) are never removed by billing. |
| Real-time notifications | `POST /api/pro/rtdn` | Pub/Sub push, authenticated by Google's signed OIDC token (issuer, audience, expiry, sender verified against Google's keys). The body only names a token; the subscription is always re-read from Google. 503 on failure so Pub/Sub retries. |
| Reconciliation | `GET /api/pro/status` → `reconcileUser` | Re-verifies entitlements older than 12 h, past expiry or unacknowledged (catches missed notifications). |
| Enforcement | `lib/entitlements.hasActivePro`, `middleware/proGate` | Unchanged: Pro only if `is_pro` and not expired. |
| Write protection | RLS (v1_2, v1_8) | Clients cannot read or write `play_purchases` or any Pro column. |

Tests: `backend/tests/billing.test.js` (forged token, token reuse, wrong
account, wrong product, pending/expired/on-hold, cancellation, renewal, refund,
grace, hold, forged notifications, Google outage, restore, upgrade, missed
notification, manual grant, account deletion), `backend/tests/playDeveloperApi.test.js`
(real JWT signing and push-token verification with local keys),
`supabase/tests/rls.test.mjs` (v1_8), `frontend/tests/billingPlan.test.js`.

**Not tested:** a real purchase against Google Play (needs the manual steps below
and a licence tester on a testing track).

## Plans (lib/billingPlans.js)

| Plan | Play Console | Intended price | Server |
|---|---|---|---|
| Pro Monthly | base plan `monthly` (env `PLAY_PLAN_MONTHLY`) | ₹49 / month | listed |
| Pro Yearly | base plan `yearly` (`PLAY_PLAN_YEARLY`) | ₹449 / year | listed |
| Offer | offer `launch-199` on `yearly` (`PLAY_OFFER_LIMITED`) | ₹199 first year, then ₹449 / year | listed only with `LIMITED_OFFER_ENABLED=true`, and shown only if Google returns it to that user |
| Student Monthly / Yearly | `student-monthly` / `student-yearly` | ₹29 / ₹249 | **never listed**; a purchase is refused and not acknowledged (Google refunds it) until a real student-verification process exists |

Prices are never stored in the app or server; the paywall renders Google
Play's pricing phases ("₹199 for the first year · Renews at ₹449/year after
the offer period unless cancelled").

## Manual steps before switching billing on

1. **Play Console → Monetise → Subscriptions:** create `vittova_pro` with
   base plans `monthly` (₹49, auto-renewing) and `yearly` (₹449), and, if
   wanted, the offer `launch-199` on `yearly` with its eligibility rule.
2. **Play Console → Setup → Licence testing:** add tester Gmail accounts.
3. **Google Cloud:** create a service account; download its JSON key.
   **Play Console → Users and permissions:** invite the service account with
   *View financial data* and *Manage orders and subscriptions* for Vittova.
4. **Real-time developer notifications:** create a Pub/Sub topic, grant
   `google-play-developer-notifications@system.gserviceaccount.com` the
   *Pub/Sub Publisher* role on it, and set it in Play Console → Monetisation
   setup. Create a **push** subscription to
   `https://spendly-t8s6.onrender.com/api/pro/rtdn` with authentication
   enabled (a service account of your choice; audience = that URL).
5. **Supabase:** run `supabase/v1_8_play_billing.sql`, then
   `supabase/tests/verify_production.sql` (all PASS).
6. **Render environment** (secrets, never committed):
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (JSON or base64), `PLAY_PRO_PRODUCT_IDS=vittova_pro`,
   `PLAY_RTDN_AUDIENCE=<push audience>`, `PLAY_RTDN_SERVICE_ACCOUNT=<push service account email>`,
   then `PLAY_BILLING_ENABLED=true`.
7. **Legal and store, same day:**
   - Terms §4 → replace with: *"Vittova Pro is an optional subscription sold
     through Google Play. The price and billing period are shown before you
     buy. It renews automatically until you cancel in Google Play → Payments &
     subscriptions; access continues until the end of the paid period.
     Refunds follow Google Play's refund policies."* (update
     `frontend/tests/legalPages.test.js`, which currently checks the
     "not yet available" sentence).
   - Privacy policy → service providers: *Google Play Billing processes
     payments; Vittova stores the purchase token, order id, product, status and
     expiry to provide Pro, and never sees card or bank details.*
   - Play Console Data safety → add **Financial info → Purchase history**
     (collected, not shared, app functionality, required for subscribers).
8. **Test on a licence-tester device** from an internal testing track: buy,
   cancel, restore on a second install, let a test subscription renew/expire
   (test subscriptions renew every few minutes), and check the Owner Console /
   `play_purchases` rows.

## Streak freezes

`streak_freezes_remaining` is server-owned and can only be granted manually.
`POST /api/pro/add-freezes` still returns 501.
