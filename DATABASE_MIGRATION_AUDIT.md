# Database migration audit

**Nothing was run on staging or production. No staging environment exists.** Tests ran on PGlite, an embedded Postgres, using a stand-in for Supabase's auth setup. That is not a substitute for staging.

| Migration | Adds | Existing data | Drops | RLS | Indexes | Rollback |
|---|---|---|---|---|---|---|
| `v1_14_rewards` | 5 tables; `profiles.mission_difficulty`; widens 3 check constraints | Unchanged | Replaces its own triggers, policies and those 3 constraints | 5 tables, own-row read | 4 | Existing; deletes rewards data |
| `v1_15_razorpay_passes` | `razorpay_payments`; allows `pro_source = razorpay` | Unchanged | Replaces 1 constraint | Service role only, no client access | 1 | New; refuses while a Razorpay Pro account exists |
| `v1_16_budgets_income` | `category_budgets`, `income_entries` | Unchanged | Own policies only | Own-row read, server writes | 1 + primary keys | New; deletes those tables |
| `v1_17_financial_features` | `planned_purchases`, `savings_events`, `group_expense_receipts` | Unchanged | Own policies only | Own-row or group-member read, server writes | 2 + unique | New; split expenses remain |
| `v1_18_expense_subcategory` | Nullable `expenses.subcategory` | Unchanged | None | Inherits | None | New; drops the label |

No `DELETE`, `TRUNCATE`, data `UPDATE`, column type change or destructive `DROP` in any forward migration.

## Test results: 120 of 120 pass

Added here: on a database with an existing user, Pro state, expense and group, each migration ran **twice**; row counts, the expense amount and Pro source stayed the same. Each rollback ran in reverse order with the same result. Account deletion removes the new personal rows.

## Limits

- v1_14 and v1_15 replace check constraints, which validate existing rows. Real data could fail where test data didn't, so staging needs a copy of production's shape.
- v1_18 takes a brief lock on `expenses`. Run at a quiet time.
- `v1_16`–`v1_18` are not in a transaction wrapper in their forward form, but are safe to re-run.
- The file `supabase/tests/verify_production.sql` was not extended for these tables.
- Production's applied state (v1_3–v1_13, as of 22 Oct) wasn't re-checked.

## Procedure (owner approval required)

1. Create a Supabase staging project or branch with production's schema.
2. Run v1_14 to v1_18 in order; run `npm test` against a staging server.
3. Take and **test-restore** a production backup.
4. Run on production; run them **before** the server deploy.
