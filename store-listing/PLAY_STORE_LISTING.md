# Vittova — Google Play listing (draft)

Prepared content only. **Nothing has been published.** Every item below needs
to be entered manually in Play Console. Package: `com.spendly.app` (unchanged
legacy identifier; users never see it).

| Field | Value | Limit |
|---|---|---|
| App name | `Vittova: Expense Tracker` | 30 chars (24) |
| Short description | `Track spending, know what's safe to spend, and split bills with friends.` | 80 chars (72) |
| Category | Finance | |
| Contact email | `support@vittova.in` — **only after the mailbox is confirmed to receive mail** | |
| Website | `https://vittova.in` — **only after DNS + HTTPS are live** | |
| Privacy policy URL | `https://vittova.in/privacy` | |
| Account deletion URL | `https://vittova.in/delete-account` | |
| App icon | `store-listing/icon-512.png` (512×512) | |
| Feature graphic | `store-listing/feature-graphic-1024x500.png` (source: `feature-graphic.svg`) | |
| Screenshots | **Not prepared.** Capture 2–8 from a real device running the Vittova build (login, dashboard, AI, Group Pool, Settings). Do not use mock-ups with invented numbers presented as real. | |

## Full description

```
Vittova — Your Money's Pulse.

Vittova is a personal financial copilot for India. It helps you see where your
money goes and what you can safely spend, without spreadsheets.

TRACK WITHOUT TYPING
• Optional: turn on Android Notification Access and Vittova spots payment
  notifications from Google Pay, PhonePe, Paytm, BHIM and other supported UPI
  and bank apps, then asks you before adding an expense.
• Vittova does not read SMS and does not connect to your bank account.
• Prefer manual entry? Add expenses yourself, or scan a receipt.

KNOW WHAT YOU CAN SPEND
• Safe-to-Spend: what's left this month after your bills and savings target.
• Spending forecast that warns when you're on pace to overspend.
• Spend Score: a weekly habits score from your own Vittova data (not a credit
  score).

VITTOVA AI
• Ask why spending went up, whether you can afford something, or how long a
  goal will take. Numbers come from your own expenses and budget.
• General financial education only — not investment advice. Vittova is not a
  SEBI-registered investment adviser.

SPLIT SHARED BILLS
• Create a group, invite friends with a code, add shared expenses and see who
  owes whom. Vittova records settle-ups; you pay through your usual UPI app.

RECURRING CHARGES
• See subscriptions and repeat payments detected from your expenses, and mark
  the ones you've cancelled.

YOUR DATA
• Each account can read only its own data.
• Export your expenses as CSV, or delete your account from Settings at any time.
```

Do **not** add: "bank-grade", "SEBI compliant", user counts, ratings, "invests
your round-ups", or Pro pricing. Vittova Pro is **not purchasable** (billing
not connected).

## Manual Play Console actions

1. Store listing → enter the fields above; upload icon, feature graphic, screenshots.
2. App content → Privacy policy URL, Data safety (see `PLAY_STORE_CHECKLIST.md`),
   Financial features declaration, **Notification listener / sensitive
   permission declaration** (explain opt-in payment detection; include a short
   demo video if requested).
3. App access → provide a test account for reviewers.
4. Upload a signed AAB (needs the upload keystore — see `RELEASE.md`).
