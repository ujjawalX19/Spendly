# Vittova AI — financial mentor

How Vittova AI turns a question into an answer, what data it uses, and what it
will not do. Code: `backend/routes/ai.js`, `backend/lib/financialInsights.js`,
`backend/lib/safeToSpend.js`, `frontend/src/pages/Chatbot.jsx`.

## Pipeline

```
question ─► auth (token) ─► rate limits ─► free quota (proGate)
        ─► load ONLY req.user.id data ─► buildFacts (deterministic maths)
        ─► classify intent ─► composeAnswer (complete calculated answer)
        ─► Gemini re-words it (optional, 15 s timeout, ≤ 2 attempts)
        ─► reject if empty / malformed / any ₹ or % not in the facts
        ─► calculated answer used on any rejection or failure
```

The model never does arithmetic. Every rupee figure and percentage comes from
`buildFacts`/`composeAnswer`; `numbersAreGrounded` discards any reply that
introduces another one.

## Data used (only what Vittova stores)

| Source | Used for |
|---|---|
| `expenses` (last 4 months) | spending, categories, pace, trends, unusual items, detected recurring charges |
| `profiles.monthly_budget` | budget, projection, Safe-to-Spend |
| `profiles.investment_target` | monthly savings target, goal and emergency-fund timelines |
| `recurring_bills` | bills still due this month |
| `profiles.total_chillar`, `streak_current` | round-ups noted, logging streak |
| Group Pool (`group_*`, `settlements`) | what the user owes / is owed (up to 5 groups) |

**Not tracked, never assumed:** income, bank balance, savings balance,
investments, debts/loans, named goals. Answers say so and use the budget
instead. No names, emails, ids or tokens are sent to the model.

## Deterministic calculations (all tested in `tests/mentorLogic.test.js`)

- **Safe-to-Spend** (`lib/safeToSpend.js`, shared with the dashboard):
  budget − spent this month − active bills due today or later − savings target,
  ÷ days left including today. Never negative; overshoot reported separately.
- Daily pace, projected month end, overshoot, date the budget runs out.
- Same-point-last-month comparison and category changes.
- Monthly average over the previous 3 months **that have data** (not ÷ 3).
- Category spikes (≥ 1.5× average and ≥ ₹500 above), unusual expenses (≥ 3× the category median).
- Affordability: fits Safe-to-Spend? still covers the usual pace afterwards? months to save the gap.
- Goal timeline, what-if saving more (total, 12-month total, assumed-6% illustration, Safe-to-Spend impact), budget cut scenario for income what-ifs.
- Emergency fund tiers: ₹10,000 → 1 month → 3–6 months of typical spending, and time to reach them.
- Priorities: shortfall → overspending pace → category spike → Group Pool debt → recurring charges → no savings target → too little data.

## Question types

Spending analysis, budget (and planning), savings, goals, Safe-to-Spend,
finishing the month, affordability, what-if, emergency fund, priorities,
debt (general order; debts not tracked), subscriptions, unusual spending,
monthly summary, investing (education only) and concepts.

Answer structure: short answer → **Your numbers** → **Why it matters** →
**What I recommend** → **Next step** → **Note**.

## Endpoints

| Endpoint | Cost | Notes |
|---|---|---|
| `POST /api/ai/invest-advice` | 1 free question (Pro unlimited) | `{ reply, intent, source: 'ai' \| 'calculated', aiFallback, answer, quota }`; refunded on 4xx/5xx |
| `GET /api/ai/insights` | none | "Your money today" card and quick prompts; no model call |
| `GET /api/ai/history` | none | last 100 messages |

Errors: `PROFILE_NOT_FOUND` (404), `AI_UNAVAILABLE` (503, "Your financial data
is safe"), `QUOTA_EXCEEDED` (429), `RATE_LIMITED` (429).

## Safety

- User id only from the verified token; strict request schema (extra fields → 400).
- Question and history wrapped as data; the prompt tells the model to ignore instructions inside them.
- No named securities, schemes, brokers, apps or links; links stripped; education disclaimer on investing answers; never claims SEBI registration.
- Known limit: figures the user types in their own question are allowed in the reply, so a user can make the model repeat a number they supplied. It cannot reveal another user's data.

## Environment

| Variable | Required | Default |
|---|---|---|
| `GEMINI_API_KEY` | No (calculated answers without it) | — |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` |
| `AI_REPLY_TIMEOUT_MS` | No | `15000` |
