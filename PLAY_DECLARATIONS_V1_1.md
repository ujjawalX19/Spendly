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
reviews of this exception are strict. If the declaration is rejected, the
fallback is a build without `RECEIVE_SMS`/`READ_SMS` (notification-only
tracking); the app handles no SMS access everywhere already.

Data safety for SMS: the SMS content itself never leaves the phone, and
on-device-only processing is not "collected" in Play's definition. The
expense it produces is **Financial info → Other financial info** (already
declared). If unsure, declaring **Messages → SMS or MMS** as collected
(optional, app functionality, not shared) is the conservative answer.
**Verify against Play's current wording before submitting.**

## Subscriptions (when billing is switched on)

- Play Console → Subscriptions → `vittova_pro` with base plans `monthly` (₹49) and `yearly` (₹449); offer `launch-199` on `yearly` (₹199 for the first year, then ₹449) with the eligibility you choose (e.g. new customers only). Set `LIMITED_OFFER_ENABLED=true` only while that offer is live.
- Student plans (`student-monthly` ₹29, `student-yearly` ₹249): **do not create** until a real student-verification process exists. The server refuses and never acknowledges student-plan purchases.
- Store listing / paywall copy must match: no guaranteed savings, no fake urgency.

## Google sign-in (native)

- Google Cloud → Credentials → create an **Android** OAuth client for package `com.vittova.app` with the SHA-1 of (a) the Play **app signing** key (Play Console → Test and release → App integrity) and (b) the **upload** key (for side-loaded test builds). Same project as the Web client `721097065853-laesaqu6…`.
- Supabase → Authentication → Providers → Google: keep the Web client id; "Skip nonce check" must stay **off**.
- OAuth consent screen: no new scopes (still `email`, `profile`, `openid`).
- Until the Android client exists, the app falls back to the existing browser sign-in automatically.
