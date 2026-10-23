# Play resubmission: owner handover (in order)

**Decision: CONDITIONAL GO.** The code and the signed vc33 AAB are ready. The reviewer account, the demo video and the Play Console declarations still need the owner. Only Google can approve the app.

1. **Reviewer account:** create and prepare it as in REVIEW_CREDENTIALS_SETUP.md: website sign-up, confirm the email, budget and made-up expenses, Pro grant in the Owner Console.
2. **Test it on a clean phone with vc33:**
   - sign in with the reviewer account, and check a wrong password shows an error;
   - skip onboarding;
   - Profile → Payment tracking → "See how it works (sample messages)": check four results (2 added, 1 skipped, 1 never read);
   - allow SMS, then revoke it in Android settings;
   - sign out and sign in again.
3. **Record the demo video** (REVIEW_CREDENTIALS_SETUP.md § Demo video) on your real phone. Blur personal data. Upload it to YouTube as Unlisted.
4. **Play Console → App content → App access:** "All or some functionality is restricted". Paste the instructions block with the real email and password and the video link.
5. **Play Console → App content → Sensitive permissions → SMS and Call Log:**
   - core functionality = **SMS-based money management** only, with no account-verification use;
   - permissions = `RECEIVE_SMS`, `READ_SMS`;
   - description = the text in PLAY_DECLARATIONS_V1_1.md;
   - video = the link from step 3.
6. **Check the other forms are unchanged:** Data safety, Ads = No, Financial features = Other, Target audience 18+.
7. **Upload** `release-final/vc33/Vittova-1.1.3-vc33.aab` (SHA-256 `5f516aba…73deee`) to the same track as the rejected release, which replaces that release. "What's new": "See how bank SMS tracking works, with sample messages. Stability improvements."
8. **Send for review** from the Publishing overview. Optionally reply to the rejection email or appeal, noting the reviewer account and video are now provided.
9. **Keep the reviewer account working** for as long as the app is published.

Not done by Claude: account creation, any Play Console change, upload, submission.
