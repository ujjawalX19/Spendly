# Vittova product audit: AI and coaching (12 Nov 2026)

Branch `feat/ai-coach`, from `main` `6750f3a` (what is live). Not deployed.

## What existed before this work

| Area | Existing implementation | Problems found | Change made | Priority |
|---|---|---|---|---|
| AI provider | Google Gemini via `lib/gemini.js` (`gemini-3.5-flash` default), 15 s timeout | Free-tier key hits `429 RESOURCE_EXHAUSTED` within ~20 requests; users then get calculated answers only | None in code; owner action to raise the quota | High (owner) |
| Answer pipeline | `routes/ai.js`: deterministic draft from `lib/financialInsights`, model re-words it, reply rejected if it adds numbers | Accepted a vague reply that dropped every figure | Reply must keep at least one of the draft's rupee figures, or it is retried once, then the draft is used | High |
| Context | Budget, expenses (4 months), bills, Group Pool, subscriptions | Ignored category budgets, income, savings goals, decisions, Money-Saved; said "Vittova doesn't store named goals" although it now does | New `lib/aiContext.js` adds all of these with source, period and reliability | High |
| Intents | Regex classifier, 18 intents | 7 of 18 evaluation questions fell to a generic reply: overspending, goal progress, bills, distress, irregular income, "went up", Hinglish | New intents `bills`, `irregular_income`, `savings_rate`; wider patterns; Hinglish summary words | High |
| Personalisation | Last 6 chat turns only | No user memory, no control | `ai_memories` with consent, view, edit, delete, switch-off (v1_19) | High |
| Actions | None | AI could only talk | Proposals for budgets, goals, savings target, alerts and memory; run only after the user taps "Do it", through the ordinary endpoints | High |
| Safety | Education-only rules, teen handling, number grounding | Stock-tip refusal depended on the model; injection attempts reached the model | Fixed refusal for stock tips with no model call; injection attempts answered from the draft with no model call | High |
| Feedback | None | No quality signal | `ai_feedback` and thumbs up/down | Medium |
| Duplicates | None in AI | Same purchase logged twice was invisible | `possibleDuplicates` (same amount and description within a day), shown as a question | Medium |
| App integration | Home insight row opens chat | Budgets, Goals, Reports had no route to the coach | "Ask Vittova about this" on those three screens; answers link back to Budgets, Goals, Reports, recurring charges, alerts | Medium |
| Production usage | `app_events` | 4 AI questions in the last 14 days | — the coach is barely used; discoverability matters more than wording | Note |

## Not changed in this pass

Transactions, Month Calendar, Money Wrapped and Money-Saved screens have no "Ask Vittova" entry yet. No app-wide visual redesign. No streaming responses. No dated, sourced education library (existing concept answers are kept). No real-device test.
