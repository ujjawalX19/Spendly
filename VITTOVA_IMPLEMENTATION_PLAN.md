# Implementation plan and status

| Phase | Scope | Status |
|---|---|---|
| 0 Audit | AI, context, intents, production usage | Done (`VITTOVA_PRODUCT_AUDIT.md`) |
| 1 Data foundation | Context with provenance; duplicate check; figure-keeping check | Done, tested |
| 2 AI intelligence | Persona, Hinglish, capabilities, memory, injection handling, fixed refusals | Done, tested; real-model wording partly evaluated (quota) |
| 3 Coaching | Money, budget, goal, affordability, debt, subscription, education | Done for the questions in the evaluation set |
| 4 App integration | Actions with confirmation; links; Ask Vittova on Budgets, Goals, Reports; Memory screen | Partly: Transactions, Calendar, Wrapped, Money-Saved not yet |
| 5 UX redesign | AI home screen with overview card; app-wide pass | **Not started.** `/api/ai/insights` now returns an `overview` the screen does not show yet |
| 6 QA and release | Automated tests; browser check; real-device | Automated and browser done; **real-device not done** |

## Next, in order

1. Raise the Gemini quota (owner), then rerun the evaluation for wording quality.
2. Show the `overview` card on the AI screen and Home.
3. Add "Ask Vittova" to Transactions (unusual expense), Month Calendar (cash-flow pressure), Wrapped and Money-Saved.
4. A small, dated education library with sources for the concept answers.
5. Streaming replies to cut perceived wait (2–3 s today).
