# Release readiness: Vittova AI coach

**Decision: ready for staging, not for production.**

## What changed

| Change | Why | Files |
|---|---|---|
| Extended financial context with provenance | The coach ignored budgets, income, goals and decisions, and said goals did not exist | `backend/lib/aiContext.js` |
| Coaching capabilities, persona, Hinglish, fixed refusals, empathy | Generic answers; tips depended on the model | `backend/lib/aiCoach.js`, `backend/lib/financialInsights.js` |
| Education library with dated official sources | Concept answers had no source | `backend/lib/educationLibrary.js` |
| Memory with consent and controls | Personalisation the user controls | `backend/lib/aiMemory.js`, `frontend/src/pages/AiMemory.jsx`, `supabase/v1_19_ai_memory.sql` |
| Confirmable actions and links | Advice that leads somewhere | `routes/ai.js`, `frontend/src/lib/aiActions.js`, `aiActionRules.js`, `pages/Chatbot.jsx` |
| Figure-keeping check, duplicate detection | Vague replies replaced specific ones; duplicates invisible | `routes/ai.js`, `lib/financialInsights.js` |
| Feedback | A quality signal | `routes/ai.js`, `Chatbot.jsx` |
| Ask Vittova on Budgets, Goals, Reports, Transactions, Month Calendar, Wrapped, Money-Saved | The coach was isolated | `components/AskVittova.jsx` |
| Overview card on the AI screen; Home insight row uses the overview (category over its limit, or goal pace) | Where things stand, one tap from a question | `Chatbot.jsx`, `components/HomeCards.jsx`, `pages/Dashboard.jsx` |
| Bill due day fix | The bills answer and overview read `due_day`, but the facts carry `dueDay`, so "on day undefined" / "day null" | `lib/aiCoach.js`, `routes/ai.js`; the bills test now checks the day number |
| Privacy Policy and Terms date | Memory, ratings and confirmed actions described; both copies identical | `PrivacyPolicy.jsx`, `public/legal/privacy.html`, `legal.js`, Terms date |

Tests changed: three existing tests updated where the behaviour changed deliberately (prompt wording, quota-call counting, profile label rule), each keeping its original guarantee. The bills test was tightened, not loosened.

Test counts: server 594/594, website 214/214, database 121/121.

## Database

`v1_19_ai_memory.sql`: adds `ai_memories`, `ai_feedback`, `profiles.ai_personalisation`. Additive, re-runnable, rollback file included, tested on existing data. **Must run before the server deploy.**

## Owner actions

1. **Gemini quota:** the key returns `429 RESOURCE_EXHAUSTED` after about 20 requests. Enable billing or a higher tier in Google AI Studio, or users mostly get calculated answers.
2. Run `v1_19` in Supabase (backup first: the Free plan has none).
3. **Approve the Privacy Policy wording** for AI memory, ratings and confirmed actions (sections 1 and 4, dated 12 November 2026). It is drafted on this branch, not live. The date change is display-only and does not ask users to accept again.
4. Legal/compliance review of the financial-education boundary.
5. Phone test of the chat, actions, memory screen and the Home insight row.

## Known limitations

Real-model wording after the last fixes is unverified (quota). No streaming. No app-wide redesign in this pass. The Home row shows one item: the spending-pace alert wins over a category limit, which wins over goal pace and the food tip.
