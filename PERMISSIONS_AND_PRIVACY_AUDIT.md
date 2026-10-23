# Permissions and privacy audit, vc33 (23 Oct 2026)

Source: `aapt2 dump badging` of the signed release `Vittova-1.1.3-vc33.apk`. That APK is built from the same merged release manifest as the AAB, so it includes everything dependencies add.

## Every permission in the final release manifest

| Permission | Source | Actual use | Feature | Policy | Action |
|---|---|---|---|---|---|
| `INTERNET` | app manifest | API and Supabase | everything | normal | keep |
| `RECEIVE_SMS` | app manifest | `SmsPaymentReceiver` (protected by `BROADCAST_SMS`) for new debit alerts | automatic expense tracking | restricted; SMS-based money management exception, declaration needed | **keep** (Strategy A) |
| `READ_SMS` | app manifest | `SmsIntake.scanInbox`: catch-up limited to messages received **after** access was granted; body read only for business senders | same | same | **keep** |
| `POST_NOTIFICATIONS` | app manifest | expected-debit reminders, asked only when turned on | Pro reminders | runtime, not restricted | keep |
| `RECEIVE_BOOT_COMPLETED` | app manifest | re-arm reminders after reboot | reminders | normal | keep |
| `com.android.vending.BILLING` | Play Billing library | subscriptions | Pro | normal | keep |
| `ACCESS_NETWORK_STATE` | Play Billing library | connectivity | Pro | normal | keep |
| `com.vittova.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX (own-signature) | internal | — | normal | keep |

**Absent** (checked in the merged manifest): `RECEIVE_MMS`, `RECEIVE_WAP_PUSH`, `SEND_SMS`, `WRITE_SMS`, `READ_CALL_LOG`, `WRITE_CALL_LOG`, `PROCESS_OUTGOING_CALLS`, contacts, location, exact alarms.

The permissions are identical to vc32. vc33 adds none.

## Strategy decision: A, keep SMS access

Google's current policy (answer/10208820, read 23 Oct 2026):

- It lists "SMS-based money management (e.g., apps that track and manage budget)" as an eligible exception for `READ_SMS` and `RECEIVE_SMS`.
- The exception requires that there is no alternative method for the core functionality.
- The core feature must be prominently promoted in the listing.
- Google must review and approve it.

Why keeping it is supportable:

| Test | Assessment |
|---|---|
| Implemented core feature? | Yes. It's the app's headline feature and runs while the app is closed. |
| Prominent in the listing? | Yes. Short description: "Auto-track spending from your bank's debit SMS…". The full description leads with it (`store-listing/PLAY_STORE_LISTING.md`). |
| Alternatives? | **Notification Access:** most UPI apps post no notification for a payment (seen on a Pixel 9 Pro, 30 Sep). **Account Aggregator:** needs a licensed RBI financial-information user, which Vittova is not. **PDF statement import and manual entry:** exist, but they're after-the-fact and manual, not automatic tracking. None gives the same automatic capture. |
| Minimum data? | Senders that aren't business IDs are rejected **before** the body is read. Promotional (`-P`) headers are skipped. OTPs, credits, failed payments and offers are dropped. Only amount, payee, bank, time and a **hash** of the reference are kept. The SMS text is never stored, logged or uploaded (`SmsIntake`, `PipelineLog` records event names only). |
| Shared data | The resulting expense (amount, payee, time) goes to Vittova's server like a manual expense. It isn't sold or shared. Gemini gets financial summaries only when the user asks the AI (declared). |
| Unrelated messages | Never read. No third-party SDK touches SMS: the dependencies are Capacitor, Play Billing and AndroidX. |

Strategy B (removal) would remove the core feature. The policy explicitly allows this use, so B isn't justified.

## Authentication vs SMS

They're separate. Sign-in uses email and password, 6-digit codes **sent by email** that the user types, or Google. No SMS OTP, no SMS Retriever and no OTP reading. The parser actively **drops** OTP messages, as test `SmsSamplePreviewTest.otpIsSkipped` shows. The Play declaration must not claim account verification.

## Disclosure and consent (unchanged in vc33, reviewed)

- **Before Android's dialog:** onboarding step and `SmsAccessSheet`. They say what is read, what is kept, that the text isn't uploaded, that older messages aren't imported, and how to turn it off.
- **Consent:** Android's dialog appears only after a tap on "Allow bank SMS". It's never shown at launch. "Not now" continues with manual entry.
- **If denied, or denied permanently:** the app explains the choice, and everything else keeps working.
- **Revoking:** Profile → Payment tracking switch, or Android settings.
- **Privacy policy** (https://vittova.in/privacy, static HTML, no login, checked 23 Oct). It matches the code:
  - business sender IDs only;
  - only messages after access is granted;
  - no sending SMS, no call log;
  - message text stays on the phone.

## Data safety (Play Console, owner)

The SMS text never leaves the phone. Google's Data safety rules exclude data processed only on the device, so "Messages → SMS" is not declared. The uploaded expense is "Financial info". Unchanged from the current declaration.

## Open questions (not legal advice)

- Whether Google grants the exception is Google's decision.
- India's DPDP Act obligations weren't assessed beyond what the privacy policy already states.
