# Release readiness: Vittova AI coach

**Decision: ready for staging, not for production.**

## What changed

| Change | Why | Files |
|---|---|---|
| Extended financial context with provenance | The coach ignored budgets, income, goals and decisions, and said goals did not exist | `backend/lib/aiContext.js` |
| Coaching capabilities, persona, Hinglish, fixed refusals, empathy | Generic answers; tips depended on the model | `backend/lib/aiCoach.js`, `backend/lib/financialInsights.js` |
| Memory with consent and controls | Personalisation the user controls | `backend/lib/aiMemory.js`, `frontend/src/pages/AiMemory.jsx`, `supabase/v1_19_ai_memory.sql` |
| Confirmable actions and links | Advice that leads somewhere | `routes/ai.js`, `frontend/src/lib/aiActions.js`, `aiActionRules.js`, `pages/Chatbot.jsx` |
| Figure-keeping check, duplicate detection | Vague replies replaced specific ones; duplicates invisible | `routes/ai.js`, `lib/financialInsights.js` |
| Feedback | A quality signal | `routes/ai.js`, `Chatbot.jsx` |
| Ask Vittova on Budgets, Goals, Reports | The coach was isolated | `components/AskVittova.jsx` |

Tests changed: three existing tests updated where the behaviour changed deliberately (prompt wording, quota-call counting, profile label rule), each keeping its original guarantee.

## Database

`v1_19_ai_memory.sql`: adds `ai_memories`, `ai_feedback`, `profiles.ai_personalisation`. Additive, re-runnable, rollback file included, tested on existing data. **Must run before the server deploy.**

## Owner actions

1. **Gemini quota:** the key returns `429 RESOURCE_EXHAUSTED` after about 20 requests. Enable billing or a higher tier in Google AI Studio, or users mostly get calculated answers.
2. Run `v1_19` in Supabase (backup first: the Free plan has none).
3. Approve Privacy Policy wording for AI memory and feedback (not yet written: needs a paragraph on what memories hold, that they are optional, and how to delete them).
4. Legal/compliance review of the financial-education boundary.
5. Phone test of the chat, actions and memory screen.

## Known limitations

Real-model wording after the last fixes is unverified (quota). No streaming. Transactions, Calendar, Wrapped and Money-Saved lack coach entry points. No app-wide redesign in this pass. The AI home `overview` card is returned by the server but not shown.
