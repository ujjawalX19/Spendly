# Reviewer access setup (owner actions)

No account was created and no credentials exist in this repository. Creating a production account needs the owner. Keep the password out of Git, chat and screenshots. Enter it only in Play Console.

## What the reviewer will meet (verified in code)

| Gate | Behaviour | Reviewer impact |
|---|---|---|
| Sign-in | Email + password (`signInWithPassword`). **No OTP at sign-in.** | None, once the email is confirmed |
| Email confirmation | Needed once at sign-up (6-digit code by email) | **Do it yourself when you create the account.** The reviewer never sees it |
| Onboarding | Three screens, then the bank-SMS step. "Skip" / "Not now" continue | None |
| Pro (reminders etc.) | Server-side entitlement | Give the account a **manual Pro grant** in the Owner Console, ending after the review |
| Region | None | None |
| Server wake-up | Render can take ~30 s on the first request | Mention it in the instructions |

## Steps

1. Create a mailbox you control, for example a new Gmail address used only for review. Don't use a personal account.
2. In the **website** at https://vittova.in, create the Vittova account with email + password. Confirm it with the emailed code. Use a strong password that doesn't expire.
3. Sign in on a phone. Set a monthly budget (e.g. ₹20,000). Add 6–10 **made-up** expenses across categories and dates. Use no real banking data.
4. Owner Console (vittova.in/vittova-ops): grant Pro to this account until at least 31 Jan 2027.
5. Sign out, then sign in again on a clean install of vc33 to prove the credentials work.
6. Keep the account unchanged for as long as the app is on Play. Don't change the password without updating Play Console.

## Play Console → App content → App access

Choose **"All or some functionality is restricted"** → Add instructions:

```
Name: Vittova reviewer account
Username: <REVIEWER EMAIL>
Password: <REVIEWER PASSWORD — entered by the owner only>

Instructions (English):
1. Open Vittova. On "Sign in", type the email and password above and tap
   Continue. Do not use "Continue with Google". No OTP, phone number or
   bank connection is required. The first sign-in can take up to 30 seconds
   while the server starts.
2. Onboarding: tap Next on the intro screens. On "Track payments from bank
   SMS" you can tap "Allow bank SMS" (Android asks for SMS permission) or
   "Not now". The app works either way.
3. Home shows the budget, Safe-to-Spend and recent expenses (sample data).
   Add an expense with the + button.
4. SMS-based money management (the declared SMS feature):
   Profile -> Payment tracking -> Bank SMS. Tap "See how it works (sample
   messages)": the app runs its real bank-SMS rules on four example
   messages and shows that an HDFC and an SBI debit become expenses, a bank
   OTP is skipped and a message from a phone number is never read. Nothing
   is read from the inbox for this preview.
   Live capture needs a debit SMS from an Indian bank's sender ID (e.g.
   VM-HDFCBK), which a reviewer device will not receive; the attached video
   shows a real one: <UNLISTED VIDEO LINK>.
5. Other screens: Insights, Wealth, AI assistant, Group Pool, Subscription
   audit. Pro features are unlocked on this account.
6. To turn SMS tracking off: Profile -> Payment tracking -> Bank SMS switch,
   or Android Settings -> Apps -> Vittova -> Permissions -> SMS.
Support: support@vittova.in
```

Use `support@vittova.in` only if that mailbox is confirmed to receive mail. Otherwise use the developer email shown on the Play listing.

## Demo video (needed for R2)

About 60–90 s, recorded on a real phone with the vc33 release build. Upload it to YouTube as **Unlisted** and paste the link into both App access and the SMS declaration.

1. Fresh install, then sign in.
2. Onboarding SMS screen: show the disclosure text, then "Allow bank SMS" and Android's dialog → Allow.
3. Make a real small UPI payment (₹1). The bank's debit SMS arrives.
4. Open Vittova: the expense appears on Home with amount, payee and bank.
5. Profile → Payment tracking: show the Bank SMS switch and "See how it works".
6. Show the SMS permission in Android settings, and that it can be revoked.

Blur the phone number, account digits, UPI ID and any personal messages before uploading.
