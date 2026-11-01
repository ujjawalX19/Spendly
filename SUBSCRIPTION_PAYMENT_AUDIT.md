# Subscription and payment audit

**No real purchase was made on this build, and Play Console was not read.** No Play credentials are on this computer; they're on Render.

## Google Play

| Item | Expected in code | Verified against Play? |
|---|---|---|
| Product | `vittova_pro` | **No** |
| Base plans | `monthly`, `yearly` | **No** |
| Offer | `launch-199`, ₹199 first year | **No, owner must confirm it's active** |
| Renewal | ₹449/year | **No** |
| Eligibility | Decided by Google | **No** |
| Shown price | Google's own pricing phases, not hard-coded in the paywall | Unit tests |
| Server verification, refunds, expiry | `playBilling`, tested with a fake Google | Fake only |
| Restore | Paywall button and a sync on sign-in | Fake only. vc29 tester purchase worked on 5 Oct; renew, cancel and restore never verified |
| Offer flag | `LIMITED_OFFER_ENABLED`, default off; Render value unknown | **No** |

Homepage prices (₹49, ₹449, ₹199) are fixed text and must match Play Console. The label "Diwali and launch offer" is the app's own; check the Play offer has no conflicting end date.

## Razorpay (website and Indus only)

Orders use the server's price; payments are re-read from Razorpay and matched on amount before Pro is granted; signatures and the webhook are checked; retries don't double-grant. All tested against a fake Razorpay. **No live or test-mode payment made.** `RAZORPAY_*` isn't set, and the refund terms were written by Claude and **need owner approval**. Razorpay's own rules for the offer label and pricing page weren't reviewed.

## Play steering

Play build: the channel resolves to Play Billing, the checkout component isn't shown, the homepage isn't reachable, and in-app legal text no longer mentions other payment. A Pro pass bought on the website does unlock the Play app. Passes aren't advertised in the app, but **ask whether this needs review against current Play payments rules**; those rules were not read in this pass.
