# Financial intelligence expansion — Phase 0 plan (18 Oct 2026)

Branch `feat/financial-intelligence`, cut from `feat/rewards` @ `1df928f` (= `main` @ `e024cad` + v1.14 rewards + 16 Oct audit fixes). Nothing pushed, merged or deployed. `D:\paisa-buddy` (branch `feat/website-dark-first`) has untracked user files (`PRO_STRATEGY_RESEARCH.md`, `logo/`, `store-listing/*`); untouched.

Release state: vc29 on Play closed testing; vc30 built (`release-final/vc30`, from `d774ad5`), not uploaded; **no vc31 exists**. Production access is pending with Google. The next upload needs versionCode ≥ 31.

## What already exists (reused, not rebuilt)

| Need | Existing | Reuse |
|---|---|---|
| One financial engine | `lib/financialInsights.buildFacts` → `lib/safeToSpend.computeSafeToSpend`; `lib/financeData.loadFinanceData` | New `lib/projection.js` builds on the same inputs and the same Safe-to-Spend definition; reconciliation tests tie them together. |
| Afford check | `lib/moneyDecisions.affordCheck`, `POST /api/decisions/afford`, `AffordItSheet` (Free, `money_check` quota 5/day shared with SIP test) | Feature 1 becomes v2 of this: the same facts plus the projection. The old route stays for installed app versions. |
| Month projection | `moneyDecisions.monthShape` (`GET /api/decisions/month-shape`) | Calendar totals reconcile with it. |
| Quotas / Pro | `middleware/proGate` (CAS counters on `profiles`), `lib/entitlements.hasActivePro`, Play Billing | Pro checks via `hasActivePro`. Retry-safe slots are a new small table (below). |
| Subscriptions | `lib/subscriptions` (detection, `nextExpected`), `cancelled_subscriptions`, `recurring_expectations` | Calendar renewals; Money-Saved subscription events. |
| Group splits | `group_expenses`, `group_expense_splits.share_amount` (v1_3), `POST /api/groups/:id/expenses` with per-person paise shares, `lib/groupBalances` | Feature 5 writes the same rows. No new share model. |
| Receipt scan | `POST /api/expenses/scan` (Gemini; image not stored), `lib/receiptParse` | Feature 5 extends parsing to line items, tax, discount, service, tip. |
| Recap / share card | `lib/weeklyRecap`, `frontend/src/lib/recapCard.js` | Money Wrapped uses the same privacy-first card pattern. |
| Savings | `savings_goals` / `savings_contributions` (v1.14, self-reported), Victory Pot (estimates) | Money-Saved reads them but keeps its own audited ledger. |
| Native | `DebitRemindersPlugin` pattern (Capacitor plugin + receivers) | Widget follows the same pattern. |

## Facts and limits the engine must respect

- Currency: INR only (no currency column anywhere). Amounts in `numeric(…,2)`; the new engine works in integer paise.
- Time zone: one app time zone (`APP_TIMEZONE`, default Asia/Kolkata); no per-user setting exists.
- No income, bank balance or cash-buffer data exists. The budget is a plan, never a balance.
- Refunds are not recorded as a separate type (`expenses.amount > 0`); a refund is an edit or delete of the expense.
- Bills: `recurring_bills` (amount, due_day 1–31, active). A due day past the month's end falls on the last day.

## Dependency map

```
loadFinanceData ─► buildFacts ─► computeSafeToSpend (Home)
        │                │
        └──► projection (paise, day by day) ◄── planned_purchases
                 │      │
     Can I Afford (F1)  Month Calendar (F2) ── subscriptions.nextExpected, savings_goals
                 │
         planned purchase decisions ─► Money-Saved ledger (F4) ◄── cancelled_subscriptions + expenses
                                              │
Money Wrapped (F3) ◄── expenses, streaks, money_streak_days, goals, Money-Saved
Split from Receipt (F5) ◄── receiptParse (items) ─► split allocation (paise) ─► group_expenses/splits
Widget (F6) ◄── Safe-to-Spend snapshot pushed by the app (no token in the widget)
```

## Database (one migration per update)

- **v1_15_financial_intelligence.sql (Update A)**: `feature_usage` (retry-safe free-allowance slots, unique per user/feature/period/slot and per request id); `planned_purchases` (planned/bought/deferred/skipped decisions); `savings_events` (Money-Saved ledger with status) + append-only `savings_event_log`. RLS owner-read, backend-write, cascade on account deletion. Rollback file included.
- **v1_16 (Update B)**: receipt split audit (`group_expense_receipts`: original total, currency, allocation JSON, idempotency key; no image).

## API

- `POST /api/afford` (F1, v2; 3 free a month, Pro unlimited), `POST /api/afford/:id/decision` (bought / deferred / skipped).
- `GET /api/calendar?month=YYYY-MM` (F2, Pro).
- `GET /api/wrapped?period=month|year&key=…` (F3, free).
- `GET /api/savings-ledger`, `POST /api/savings-ledger/price-difference` (F4).
- `POST /api/groups/:id/receipt-split` (F5), receipt scan with items (F5).
- Widget: no new endpoint; the app hands the widget a snapshot.

## Decisions that need your authorization (not taken silently)

1. **Free allowance change.** Live website and Pro screen say "5 Afford-It checks a day" free. The brief asks for 3 a month for the new check. Implemented as a central setting (`FREE_AFFORD_CHECKS_PER_MONTH`, default 3) with copy updated on this branch only. The old daily allowance still applies to the old route used by installed apps and to the SIP test. Publishing this changes a public offer: your call before release.
2. Calendar and Split from Receipt are Pro. Pro is not purchasable yet ("Coming soon"), so free users see an explanation, not a paywall that cannot be paid.
3. Bills already logged as expenses: the engine stops double-counting a bill when an expense this month clearly matches it (same name, amount within 10%, on or after 5 days before the due day). This also changes Home's Safe-to-Spend for those users (it was double-counting). Documented and tested.

## Risks

Financial accuracy (mitigated by paise arithmetic, reconciliation tests); free-allowance abuse (DB-unique slots); group authorization (server-side membership checks at submit); receipt privacy (no image storage, Gemini processing disclosed); widget data on a shared screen (amounts hidden by default, cleared on sign-out); policy (Phase 2 review with official sources).

## Test plan

Unit (engine, afford outcomes, calendar months/leap years, wrapped eligibility, savings rules, split allocation and rounding), route (quotas, concurrency, retries, entitlement expiry, isolation, group membership), DB (RLS, constraints, rollback), frontend (display rules, share-card privacy), JUnit (widget privacy and sign-out), browser screenshots (320–414 px, both themes, large text), Android build + emulator. Device tests listed as manual.

## Milestones and rollback

A1 engine → A2 Afford → A3 Calendar → A4 Money-Saved → A5 Wrapped → A6 Update A validation (+ commit) → B1 receipt split → B2 widget → B3 validation. Each update is its own commit range. Rollback: feature flags (`AFFORD_V2_ENABLED`, `CALENDAR_ENABLED`, `WRAPPED_ENABLED`, `SAVINGS_LEDGER_ENABLED`, `RECEIPT_SPLIT_ENABLED`) plus migration rollback scripts; the old Afford route is kept.
