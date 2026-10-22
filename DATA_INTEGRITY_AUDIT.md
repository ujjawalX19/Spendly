# Data integrity audit (22 Oct 2026)

All production figures are read-only aggregates (no personal data). Queries: GET requests with the service key from the local backend env file; script kept outside the repository.

## Owner Console vs database (production)

| Measure | Owner Console source | Direct query | Match |
|---|---|---|---|
| Expenses (all users) | `admin_user_stats.expense_count` sum = 72 | `expenses` = 72 | ✔ (0 per-user mismatches over 68 users) |
| AI questions | 21 | `ai_chat_history role=user` = 21 | ✔ |
| Pools (memberships) | 12 | `group_members` = 12 | ✔ |
| Subscriptions | 0 | recurring_bills 0 + cancelled 0 | ✔ |
| Receipt scans / imports | 0 / 0 | 0 / 0 | ✔ |
| "Goals" | 11 | profiles with investment_target > 0 = 11 | ✔ but **mislabelled** (not savings goals) |

Users: 68 auth users = 68 profiles (0 without profile); 18 sign-ups on 22 Oct (IST) — 13 Google, 5 email, 0 unconfirmed. "Last active" is written on any signed-in API call (at most every 10 minutes); 16 profiles show "never", of which 12 signed in before activity tracking existed, 3 Google accounts never signed in after creation, 1 unconfirmed email.
Versions: website reports the frontend package version (1.1.0); Android reports versionName. Installs include developer/emulator runs (1.1.0-debug, 1.1.1, 1.1.2) — install counts are not user counts.

## Expense data health (production)

0 exact duplicates (same user, amount, description, time); 0 duplicate payment references; 0 future-dated; 0 non-positive amounts; 0 orphaned rows. Sources: 29 manual, 43 automatic (SMS/notification).

## Safe-to-Spend (implemented formula)

```
remaining = monthly budget (₹5,000 if unset) − spent this month (IST month)
            − active bills with due day ≥ today and not already paid this month
            − monthly savings target
daily     = round(remaining ÷ days left in the month including today), floored at 0
```
Inputs: `profiles.monthly_budget`, `profiles.investment_target`, `expenses.amount` (this month), `recurring_bills` (active). "Already paid" = an expense this month sharing a name/category word, amount within 10%, on or after due day − 5 (one expense per bill) — **in the release branch only; live after deploy.** One function (`lib/safeToSpend`) serves Home, Afford-It, Month Shape, Wealth, the AI coach and Money Streak.

| Case | Expected | Actual |
|---|---|---|
| Budget 20,000, spent 8,000 rent (logged 2nd, due 5th) + Wi-Fi 799 due 20th, 3 Oct | remaining 11,201 | 11,201 (release branch) / 3,201 (live: rent counted twice) |
| Same, nothing logged | 20,000 − 8,000 − 799 = 11,201 | 11,201 |
| Bill amount 10% off / name unrelated / last month | still due | still due |
| Zero or unset budget | ₹5,000 default, flagged as default in Afford-It | ✔ (missing-data note) |
| Negative remaining | 0 shown, shortfall reported | ✔ |
| Edit to 31 Feb | refused | refused (release branch) |
| Month boundary / leap day | IST month; 29 Feb 2024 accepted | ✔ tests |

Other financial areas (tests): Group Pool splits in paise sum exactly; settlements reduce balances; leave blocked while balance ≠ 0; Afford-It uses the same remaining figure (reconciliation test). Not in this release: savings goals, Money-Saved, receipt splitting, calendar.
