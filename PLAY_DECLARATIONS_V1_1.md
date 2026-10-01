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
| `RECEIVE_SMS`, `READ_SMS` (new, versionCode 10) | Automatic expense tracking from bank debit SMS | **Permissions Declaration Form required** before this build can be published. See "SMS permissions" below. |
| Notification Access (user setting) | Optional extra source: payment-app notifications from the listed apps | Prominent disclosure in the access sheet. |
| No `SEND_SMS`, call log, `SCHEDULE_EXACT_ALARM`, contacts, location | — | — |

## SMS permissions (versionCode 10 onwards)

Why: most UPI apps post no notification for a completed payment (confirmed on
a Pixel 9 Pro, 2026-09-30), so Notification Access alone captured nothing. The
bank's debit SMS is the one signal every payment produces.

What the code does (`SmsSources`, `SmsIntake`, `SmsPaymentReceiver`):

- Asked at runtime only from a tap, after an in-app disclosure (Onboarding
  permission screen; Home banner / Profile → the SMS sheet). Never at launch.
- Reads only DLT business sender IDs (`XX-HDFCBK`); promotional (`-P`)
  headers and all phone numbers are skipped **before** the body is read.
- Only new messages: live via `SMS_RECEIVED` (receiver protected by
  `BROADCAST_SMS`), and an inbox catch-up limited to messages received after
  the grant / last scan. Older messages are never imported.
- OTPs, offers, credits, failed or declined payments, mandates and dues are
  dropped. From a debit, only amount, payee, bank, time and a hashed reference
  are kept on the phone; the SMS text is never stored, logged or uploaded.
- The expense (amount, payee, time) is uploaded like any other expense.
- No `SEND_SMS`, no default-SMS-handler role, no call log.

Play Console → App content → Sensitive permissions → **SMS and Call Log**:

| Field | Answer |
|---|---|
| Core functionality | **SMS-based money management** — "apps that track and manage budget" is a listed permitted exception. |
| Permissions | `RECEIVE_SMS`, `READ_SMS` |
| Description (draft) | Vittova is a personal budgeting app for India. Its core feature is automatic expense tracking: when the user allows SMS access, Vittova reads debit alerts from banks' business sender IDs and records the amount, payee and time as an expense in the user's budget. Messages from phone numbers are never read, one-time passwords and promotional messages are skipped, only messages received after the user allows access are read, and the message text is not stored or uploaded. The user can turn this off in the app or revoke the permission at any time. |
| Video | Release build, ~60 s: Onboarding → SMS disclosure screen → "Allow bank SMS" → Android dialog → a real ₹1 UPI payment → debit SMS arrives → expense appears on Home → Profile → Payment tracking → Bank SMS switch. Upload it unlisted and paste the link. |

Honest risk: Google decides whether SMS tracking is "core" for this app, and
reviews of this exception are strict. Google also requires the core use to be
prominently documented and promoted in the description: the listing now leads
with it (store-listing/PLAY_STORE_LISTING.md). SMS tracking is part of V1.1 by
decision; if the declaration is rejected, the release waits until it is
resolved (appeal or a changed build). Not submitted, not approved.

Data safety for SMS (checked against Google's Data safety definitions,
answer/10787469, 1 Oct 2026: "User data accessed by your app that is only
processed locally on the user's device and not sent off device does not need
to be disclosed"): the SMS text never leaves the phone, so **Messages → SMS or
MMS is not declared**. The expense it produces is uploaded and is declared as
**Financial info → Purchase history** ("information about purchases or
transactions a user has made"). The full answer sheet is in
release-final/PLAY-STORE-OPTIMIZATION.md.

## Subscriptions (when billing is switched on)

- Play Console → Subscriptions → `vittova_pro` with base plans `monthly` (₹49) and `yearly` (₹449); offer `launch-199` on `yearly` (₹199 for the first year, then ₹449) with the eligibility you choose (e.g. new customers only). Set `LIMITED_OFFER_ENABLED=true` only while that offer is live.
- Student plans (`student-monthly` ₹29, `student-yearly` ₹249): **do not create** until a real student-verification process exists. The server refuses and never acknowledges student-plan purchases.
- Store listing / paywall copy must match: no guaranteed savings, no fake urgency.

## Google sign-in (in-app, versionCode 17)

- Google Cloud → Google Auth Platform → Clients, project `spendly-505616`: one **Android** client per signing certificate, each with package `com.vittova.app`:
  - the Play **app signing** key (Play Console → Test and release → App integrity → App signing key certificate). Client "Android client 1" holds `B0:18:FC:18:2E:A6:FA:73:F0:9E:8F:C3:B5:ED:2E:E0:73:3D:99:BD`: **confirm it equals the SHA-1 Play Console shows**;
  - the **upload** key `3B:AE:EA:F4:06:E1:17:8C:2A:8B:81:C5:8B:75:39:8A:39:7F:8D:46`, for sideloaded release APKs. **Missing as of 1 Oct 2026**: until it exists, the sideloaded APK shows "Google sign-in isn't available in this version of the app yet".
- Supabase → Authentication → Providers → Google: keep the Web client id (`721097065853-laesaqu6…`); "Skip nonce check" must stay **off**.
- OAuth consent screen: no new scopes (still `email`, `profile`, `openid`).
- **Before production:** install from a Play testing track and sign in with Google once. That is the only test of the Play-signed certificate.
- The website keeps the browser flow; its Redirect URLs in Supabase stay as they are.
