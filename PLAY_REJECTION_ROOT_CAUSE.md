# Google Play rejection: root cause (23 Oct 2026)

## The rejection

Email from Google Play, 23 Oct 2026, 14:51, to the developer account (Milnix), for `com.vittova.app`:

- **App status:** Rejected. Changes were not published, and the older version stays as it was.
- **Issue found:** "Issue with test credentials". Google says reviewers need valid login credentials. If parts of the app are restricted, it asks for a video link. The email names the declared use: track, budget and manage SMS-based financial transactions, and related account verification.
- **Area:** Policy Declaration for SMS/Call Log.
- **Policy:** Permissions and APIs that Access Sensitive Information.

Google rejected the release because **its reviewer could not verify the SMS feature we declared.** It did not say the SMS use itself is forbidden.

## What the evidence shows

| # | Finding | Evidence | Kind |
|---|---|---|---|
| R1 | The reviewer instructions in our submission guide only point to **Notification Access**. They never mention bank SMS, so a reviewer had no route to the feature the SMS declaration claims. | `PLAY_CONSOLE_SUBMISSION.md` §3.2, steps 1–4 | Play Console text (owner) |
| R2 | The declared feature only does something when a **real debit SMS from an Indian bank** arrives. A reviewer without an Indian bank account cannot make one, so on the reviewer's phone the feature shows nothing. Google's email asks for a video in exactly this case. | `SmsIntake.process` accepts only DLT business senders. Google's email: "please share a link to a video" | Product + Play Console |
| R3 | It is **unknown** whether the App access credentials in Play Console were present and working on 19 Oct. The Play Console account belongs to Milan, and I cannot see it. | — | Owner must check |
| R4 | The email names "related account verification". Vittova does **no** SMS-based verification: sign-in uses email/password with codes sent by email, or Google. If the declaration form ticked a verification-type use, it doesn't match the app. | `AuthContext.jsx` (`signInWithPassword`, `verifyOtp` for email codes). No SMS Retriever or OTP reading anywhere | Play Console form (owner) |

What the code does **not** show:

- No undisclosed or extra permissions. The final merged manifest has exactly `RECEIVE_SMS` and `READ_SMS` among restricted ones (see PERMISSIONS_AND_PRIVACY_AUDIT.md).
- No SMS access before consent.
- No upload of SMS text.

## The fix

1. **Code (vc33):** "See how it works (sample messages)" in the bank-SMS sheet (Home banner, or Profile → Payment tracking). It runs the phone's **real** bank-SMS rules on four built-in sample messages:
   - an HDFC debit → would be added: ₹250 to SWIGGY;
   - an SBI UPI debit → would be added: ₹120 to TEA STALL;
   - a bank OTP → skipped;
   - a message from a phone number → never read.

   It reads no SMS, needs no permission and saves nothing. A reviewer anywhere can now check what the feature keeps and what it ignores. It doesn't bypass the permission and doesn't get message data any other way.
2. **Owner, Play Console:**
   - a working reviewer account with sample data and Pro;
   - App access instructions that lead to the SMS feature and the sample preview;
   - an unlisted demo video of a real debit SMS being captured, linked in the SMS declaration;
   - the declaration set to "SMS-based money management" only.

   See REVIEW_CREDENTIALS_SETUP.md and PLAY_RESUBMISSION_CHECKLIST.md.

Approval is not guaranteed. Only Google decides whether the exception is granted.
