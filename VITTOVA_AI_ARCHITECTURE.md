# Vittova AI architecture

```
App (Chatbot.jsx, AskVittova entry points)
   │  POST /api/ai/invest-advice { query, screen? }      (auth, rate limit, free quota)
   ▼
routes/ai.js
   1. loadEverything(user)
        financeData + groups ──► financialInsights.buildFacts      dashboard figures (Safe-to-Spend etc.)
        aiContext.assembleContext ──► budgets, income, goals,     each with source / period / status
                                      decisions, Money-Saved,
                                      aiMemory.forPrompt (if personalisation on)
   2. classifyIntent → aiCoach.capabilityFor
   3. Fixed answers, no model:   stock tip · off-topic · under-18 investing
      Injection attempt:         draft only, no model
   4. Draft = aiCoach.composeWithContext ‖ financialInsights.composeAnswer, then withEmpathy
   5. Gemini re-words the draft (persona, English/Hinglish, capability style)
        reject if: empty/malformed · drops all draft figures · adds any figure not in facts/context/draft/question
        one retry with the reason, then fall back to the draft
   6. aiCoach.proposeActions  ← chosen from facts, never from model text
   7. Save chat turn, return { reply, actions[], links[], messageId, capability, language, source }
   ▼
App: renders reply · "Do it" on an action → lib/aiActions → ordinary endpoint
     (PUT /planning/category-budgets, POST /goals, PUT /account/investment-target, POST /ai/memory)
```

**Read tools** are not live model function calls. The model cannot fetch anything; the server assembles the full context up front. This is the safer choice for a small model: no tool can be called with a forged user id or argument.

**Write tools** are proposals only. The server picks the tool and its values from the user's own data; the client validates them again (`lib/aiActionRules.js`); the endpoint validates them a third time. There is no tool for payments, transfers, cancellations, bank details or security settings.

**Data the model never receives:** user id, email, name, tokens, other users' data, raw SMS.

**Endpoints added:** `GET/POST/PATCH/DELETE /api/ai/memory`, `PUT /api/ai/memory/personalisation`, `DELETE /api/ai/memory` (all), `POST /api/ai/feedback`.

**Migration:** `supabase/v1_19_ai_memory.sql` (+ rollback). Additive. Not run anywhere but the test database.
