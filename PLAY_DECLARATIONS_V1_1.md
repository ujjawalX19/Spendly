# Vittova 1.1 — Google Play declarations to confirm

What the app actually does in this build, and what that means for each Play
Console form. Answer from the live state of the server flags, not from plans.

## Financial features declaration

| Option | Answer | Why |
|---|---|---|
| Banking, loans, credit, BNPL, payments, crypto, trading, insurance, credit reports | **No** | Vittova moves no money, lends nothing and never executes investments. |
| Financial advice | **No** | Safe-to-Invest and the SIP stress test are cash-flow checks with no named products and a "not investment advice / not SEBI-registered" note. Keep it that way. |
| Rewards, points and other incentives | **Yes, only when `SPONSORED_CHALLENGES_ENABLED=true`** | Sponsored challenges give fixed vouchers supplied by a sponsor. Money XP has no cash value and does not count. Update the declaration the day challenges go live. |
| Other | Keep **Other**: personal budgeting / expense tracking (as filed for 1.0). | |

## Data safety

Already declared for 1.0 and still true: Name, Email, User IDs, Other financial info (shared with Google Gemini), Photos, App interactions, Other user-generated content, Crash logs, Diagnostics, Device or other IDs.

New in 1.1:

| When | Add |
|---|---|
| Now (Subscription audit on for Pro) | Nothing new: recurring-payment decisions and expected debits are "Other financial info" (already declared, collected, not shared). Reminders stay on the device. |
| When billing is on | **Financial info → Purchase history** — collected, not shared, app functionality, optional (subscribers only). |
| When sponsored challenges are on | **App activity → Other actions** (challenge participation) — collected, not shared. Sponsors receive only aggregate counts and their own voucher codes, which is not "sharing user data" in Play's definition; re-check Play's current wording before submitting. |

## Permissions

| Permission | Why | Play form |
|---|---|---|
| `INTERNET` | Everything | — |
| `com.android.vending.BILLING`, `ACCESS_NETWORK_STATE` | Google Play Billing Library | — |
| `POST_NOTIFICATIONS` (new) | Expected-debit reminders; asked only when the user turns them on | No declaration. Not a sensitive permission. |
| Notification Access (user setting, unchanged) | Payment-notification detection from 21 listed payment apps | Unchanged from 1.0 (prominent disclosure in onboarding). The subscription audit does **not** add any notification or SMS access. |
| No `SCHEDULE_EXACT_ALARM`, SMS, contacts, location | — | — |

## Subscriptions (when billing is switched on)

- Play Console → Subscriptions → `vittova_pro` with base plans `monthly` (₹49) and `yearly` (₹449); offer `launch-199` on `yearly` (₹199 for the first year, then ₹449) with the eligibility you choose (e.g. new customers only). Set `LIMITED_OFFER_ENABLED=true` only while that offer is live.
- Student plans (`student-monthly` ₹29, `student-yearly` ₹249): **do not create** until a real student-verification process exists. The server refuses and never acknowledges student-plan purchases.
- Store listing / paywall copy must match: no guaranteed savings, no fake urgency.

## Google sign-in (native)

- Google Cloud → Credentials → create an **Android** OAuth client for package `com.vittova.app` with the SHA-1 of (a) the Play **app signing** key (Play Console → Test and release → App integrity) and (b) the **upload** key (for side-loaded test builds). Same project as the Web client `721097065853-laesaqu6…`.
- Supabase → Authentication → Providers → Google: keep the Web client id; "Skip nonce check" must stay **off**.
- OAuth consent screen: no new scopes (still `email`, `profile`, `openid`).
- Until the Android client exists, the app falls back to the existing browser sign-in automatically.
