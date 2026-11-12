# Financial context spec (`lib/aiContext.js`)

All sums are done on the server, in paise for the new blocks. The model only reads them.

| Block | Source table | Period | Status values |
|---|---|---|---|
| reliability.expenses | `expenses` | current month | confirmed (10+ this and last month) / incomplete |
| reliability.budget | `profiles.monthly_budget` | current month | confirmed / estimated (default budget) |
| categoryBudgets | `category_budgets` vs this month's category totals | current month | unavailable when the table is missing |
| income | `income_entries` (user-entered) | current month | confirmed (self-reported) / **unknown** (no entry: never zero) / unavailable |
| netThisMonth | income − expenses | current month | estimated; only when income is known |
| goals | `savings_goals` + `savings_contributions` | to each goal's date | progress is self-reported |
| purchaseDecisions | `planned_purchases` | last 5 | — |
| moneySaved | `savings_events` | current month | not a balance |
| recurringReviewed | `recurring_decisions` | — | count only |
| memories | `ai_memories` | — | `mayBeStale` after 90 days; empty when personalisation is off |
| notTracked | — | — | income (when unknown), bank balance, investments, debts and loans |

Comparisons use the same day of last month, not the whole month. Refunds are edits or deletions of an expense in Vittova, so they are not counted twice. Vittova does not import transfers between a user's own accounts, so none can be counted as spending.

A missing table makes its block `unavailable`; the answer still works from the rest.
