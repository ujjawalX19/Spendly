# Privacy data inventory

The source of truth behind `frontend/src/pages/PrivacyPolicy.jsx` and the
Google Play **Data safety** form. Update all three together.

| Data | Collected when | Stored where | Sent to | Retention | Deletion |
|---|---|---|---|---|---|
| Email, name | Sign-up / Google sign-in | Supabase Auth + `profiles` | Supabase; Google (if Google sign-in) | Until account deletion | Account deletion (auth user delete cascades) |
| Password | Email sign-up | Supabase Auth (hashed) | Supabase | Until deletion | Account deletion |
| Expenses (amount, category, description, date, source) | User adds / confirms / scans / imports | `expenses` | Spendly API (Render), Supabase | Until user deletes | Per item or account deletion |
| Recurring bills, budget, savings target | User enters | `recurring_bills`, `profiles` | API, Supabase | Until deletion | Account deletion |
| Round-ups, streaks, score history, quota counters | Derived | `profiles`, `paisa_scores`, `streak_activities` | API, Supabase | Until deletion | Account deletion |
| Coach questions and answers | User asks | `ai_chat_history` | API, Supabase, **Google Gemini** (question + spending summary) | Until deletion; Google per Gemini API terms | Account deletion |
| Receipt photo | Receipt scan | **Not stored** by Spendly; extracted merchant/items/total in `expenses.receipt_data` | API (memory), **Google Gemini** | Photo: request lifetime; Google per terms | Extracted data: expense/account deletion |
| Bank statement PDF (Pro, not yet purchasable) | Upload | **Not stored**; extracted transactions in `expenses`; summary in `pdf_imports` | API (memory), **Google Gemini** (text ≤15,000 chars) | PDF: request lifetime | Account deletion |
| Payment notification data (Android, opt-in) | Notification from an allowlisted app | **Device only**: SharedPreferences queue with kind, amount, payee, app name, time, fingerprint. Raw text never stored. | Nothing, unless user taps *Add expense* (then amount/payee/time as an expense) | ≤7 days or until add/dismiss | Dismiss, sign-out clears JS state, uninstall |
| Session tokens | Sign-in | Device (WebView localStorage), excluded from backup | Supabase | Until sign-out/expiry | Sign-out, deletion |
| Server logs | Every request | Render | — | Provider default (limited) | Rotation |

**Not collected:** SMS, contacts, location, advertising ID, device ID, analytics
events, crash reports, payment card data, bank credentials.

**Not present:** ads, analytics SDKs, crash reporting SDKs, push
notifications, Google Play Billing, data sale or sharing for advertising.

## Play Data safety form: suggested answers (verify before submitting)

- Data collected: Personal info (Name, Email address); Financial info (Other
  financial info: expense records; Purchase history is *not* collected);
  App activity (Other user-generated content: coach questions); Photos
  (receipt images, processed ephemerally).
- Shared with third parties: Google (Gemini API) processes coach questions,
  receipt images and statement text on Spendly's behalf ("service provider";
  confirm classification against current Play definitions).
- Encrypted in transit: Yes. User can request deletion: Yes (in-app and
  `/delete-account` web page).
- Notification access: declare in the permissions/sensitive-access section with
  the in-app prominent disclosure (Onboarding → permission screen).

## Open items (manual)

- Confirm the Gemini plan (paid vs free tier) and whether Google may use
  submitted content to improve its products under that plan; reflect the
  answer in the policy if a stronger statement is wanted.
- Confirm Supabase project region and Render region.
- Confirm log retention periods for Render and Supabase.
- Make `VITE_SUPPORT_EMAIL` a monitored mailbox.
