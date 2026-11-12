# Implementation plan and status

| Phase | Scope | Status |
|---|---|---|
| 0 Audit | AI, context, intents, production usage | Done (`VITTOVA_PRODUCT_AUDIT.md`) |
| 1 Data foundation | Context with provenance; duplicate check; figure-keeping check | Done, tested |
| 2 AI intelligence | Persona, Hinglish, capabilities, memory, injection handling, fixed refusals | Done, tested; real-model wording partly evaluated (quota) |
| 3 Coaching | Money, budget, goal, affordability, debt, subscription, education (dated library with sources) | Done for the questions in the evaluation set |
| 4 App integration | Actions with confirmation; links; Ask Vittova on Budgets, Goals, Reports, Transactions, Month Calendar, Wrapped, Money-Saved; Memory screen; Home insight row fed by the coach overview | Done, browser-checked on the local harness |
| 5 UX redesign | Overview card on the AI screen; Home insight row; app-wide pass | Overview card and Home row done. **App-wide pass not started** |
| 6 QA and release | Automated tests; browser check; real-device | Automated and browser done; **real-device not done** |

## Next, in order

1. Raise the Gemini quota (owner), then rerun the evaluation for wording quality.
2. Owner approval of the Privacy Policy wording (drafted on this branch, dated 12 November 2026).
3. Run `v1_19` with a backup, then a phone test.
4. Streaming replies to cut perceived wait (2–3 s today).
5. App-wide redesign pass (separate brief).
