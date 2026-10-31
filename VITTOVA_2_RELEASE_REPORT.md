# Vittova 2.0 — status report (1 Nov 2026)

Branch `feat/vittova-2`, from `main` `f367204` + vc33 (`fix/play-review-vc33`) + rewards and the financial-intelligence plan. **Nothing is deployed, migrated or uploaded.** Decision: **NOT READY for release.** The full brief is partly done; see the matrix.

## Feature completion matrix

"Done" means code and automated tests on this branch. No signed-in screen has been seen running, and nothing has been tested on a phone.

| Feature | State before | State now | Still needed |
|---|---|---|---|
| Onboarding | Slides + SMS ask for everyone | Goal step added; SMS ask only for the "track" goal, always skippable | Short visual demos; guided first expense is a Home checklist, not a walkthrough |
| Home | Working | Getting-started list, customise sections, budget/report shortcuts, quiet Pro row | Savings and income on Home |
| Expenses | Working: add, edit, delete, search, filters, CSV | Unchanged | Subcategories, manual-entry duplicate warning (not built); weekly view not checked |
| Income | Not built | Add, list, remove; shown in Reports | Not used in Safe-to-Spend or AI (deliberate for now) |
| Bank SMS tracking | Working, vc33 demo | Unchanged | Phone test: turning it off stops capture |
| Statement import | Pro | Unchanged | Not re-audited |
| Budgets | Monthly only | Category limits with progress and over-limit display | Overspending notifications |
| Savings goals | Built on `feat/rewards` | Merged here, needs v1_14 | Goal history insights |
| Vittova AI | Working | Unchanged | Period comparison and unusual-expense answers not audited |
| Wealth | Working | Unchanged | Not re-audited |
| Groups | Working: create, invite, split, balances, settle | Receipt split added | Group notifications |
| Reports | Not built | Week, month, year, category, income vs spending, budget, CSV | PDF |
| Notifications | Debit and mission reminders | Unchanged | Budget, unusual-spend, bill and weekly categories with settings |
| Can I Afford | Basic check | Records bought / later / skipped | Plan's 3-a-month allowance not applied (see below) |
| Month Calendar (Pro) | Plan only | Built: spending, bills, goal dates | Expected subscription renewals |
| Money-Saved | Plan only | Built: skipped purchases, lower prices | Cancelled subscriptions |
| Money Wrapped | Plan only | Built; sharing sends counts only, as text | Image share card |
| Split from Receipt (Pro) | Plan only | Built, retry-safe, shares add up exactly | Phone test with a real receipt |
| Home screen widget | Plan only | Built; amount hidden by default, cleared at sign-out | See it on a phone |
| Pro | Play Billing, verified server-side | Launch offer preselected when Play returns it; "Always free" section | Taxes line, see below |
| Web payments | Razorpay on separate branch | Not merged | Conflicts with this branch |
| Owner Console | Exists | Unchanged, not re-audited | Retention, revenue and acquisition review |
| Design system | Tokens and UI kit exist | New screens use them | Screen-by-screen visual pass not done |
| Phases 7–9 persona, accessibility and journey testing | | **Not done** | Needs signed-in test environment and a phone |

Not built from the plan: rollback feature flags, the `feature_usage` allowance table, and the bill double-count engine change (already fixed separately on `main`).

## Test results (this branch)

| Suite | Result |
|---|---|
| Server | 537 of 537 |
| Website | 195 of 195 |
| Database rules (RLS) | 112 of 112, includes the new tables |
| Android debug build, unit tests, lint | Pass, including 3 widget privacy tests |

One server test, "AI spending analysis", failed once just after midnight on the 1st: it creates expenses minutes apart, which can cross into the previous month. It passed on rerun. Timing issue in the test, not fixed here.

## Security and compliance

- New tables: users read only their own rows, only the server writes, anon has no access. Tested.
- Every new route is scoped to the signed-in user; other users' records return nothing or 404. Tested.
- Pro features are checked on the server, never by the app.
- Receipt photos for splitting are not stored. CSV export uses the existing formula-injection protection.
- The widget holds no token and makes no requests.
- **Before release, the Privacy Policy and Play Data safety need updating:** income entries, purchase decisions and savings records are new data. Wording is the owner's to approve, so it has not been changed.
- A build passing does not mean Play compliance. The SMS flow changed: the disclosure now appears in onboarding only for the "track" goal; it still appears before any SMS request through the Dashboard and Profile sheet.

## Billing

Unchanged verification. **Purchases not tested on this branch.** ₹199 is what Play charges for the first year, then ₹449/year: the existing `launch-199` offer. It is not ₹199 every year. Google Play shows the final amount with any tax at purchase, so the app shows no separate tax figure.

## Owner actions, in order

1. Decide on the items under "Decisions".
2. Apply `v1_14_rewards.sql`, `v1_16_budgets_income.sql`, `v1_17_financial_features.sql` in Supabase before the server goes out.
3. Confirm the `launch-199` offer is active in Play Console, then set `LIMITED_OFFER_ENABLED=true` on Render.
4. Approve Privacy Policy and Data safety updates.
5. Test on a phone, then authorise deploy. The next upload must be versionCode 34 or higher; this branch is still 33.

## Decisions

- Free Afford-It stays at 5 a day. The plan's 3 a month would change a public offer, so it was not applied.
- Month Calendar and Split from Receipt are Pro, as planned. Reports, budgets, income, Wrapped and Money-Saved are free.
