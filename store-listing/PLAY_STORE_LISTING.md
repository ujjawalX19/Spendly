# Vittova — Google Play listing (draft)

Prepared content only. **Nothing has been published.** Every item below needs
to be entered manually in Play Console. Package: `com.vittova.app`
(permanent once published; users never see it).

| Field | Value | Limit |
|---|---|---|
| App name | `Vittova: Expense Tracker` | 30 chars (24) |
| Short description | `Auto-track spending from your bank's debit SMS and know what's safe to spend.` | 80 chars (77) |
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
Vittova — Your Money's Pulse. Your spending, tracked automatically from your
bank's debit SMS.

Vittova is a personal financial copilot for India. It helps you see where your
money goes and what you can safely spend, without spreadsheets.

AUTOMATIC EXPENSE TRACKING FROM BANK SMS (ANDROID)
This is what Vittova is built around. When you allow SMS access, Vittova
reads the debit alerts your bank sends and records each payment (amount,
payee and time) as an expense in your budget, even when the app is closed.
• Reads debit alerts from banks' official sender IDs, such as HDFC Bank, SBI,
  ICICI Bank, Axis Bank and Kotak. Formats differ between banks, so some
  alerts may not be recognised; anything unclear waits for your OK.
• Messages from people (phone numbers) are never read. One-time passwords,
  offers and other messages that are not payments are skipped.
• The message text stays on your phone. Only the expense is saved.
• No bank password and no bank-account connection.
• Turn it off in Profile or remove SMS access in Android settings any time.
• Optional extra: Notification Access also catches payments that supported
  UPI apps announce.
• Prefer typing? Add expenses yourself, or scan a receipt.

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
