# API inventory

Generated 2026-09-13 against commit `1138e8e`. Enforced by
`backend/tests/apiInventory.test.js`, which scans `frontend/src` for every API
path and fails if any is not routed by the backend.

**Production (Render) verification:** every path below returned **401** without
a token after deploying `1138e8e` (health reports `version: 1138e8e`), i.e. the
route exists and requires authentication. Authenticated behaviour was verified
by the backend test suite, not against production — that needs a signed-in
test account (manual).

| Method | Path | Frontend caller | Backend | Auth | Status |
|---|---|---|---|---|---|
| GET | /api/health | — (uptime, `?diag=proxy`) | app.js | No | ✅ prod 200 |
| GET | /api/auth/me | — | routes/auth.js | Yes | ✅ |
| GET | /api/expenses `?q,category,source,from,to,minAmount,maxAmount,sort,limit,offset` | hooks/useExpenses.js, hooks/useTransactionSearch.js | routes/expenses.js | Yes | ✅ prod 401 · tested |
| POST | /api/expenses | hooks/useExpenses.js | routes/expenses.js | Yes + quota | ✅ tested |
| PATCH | /api/expenses/:id | hooks/useExpenses.js | routes/expenses.js | Yes | ✅ prod 401 (was 404) · tested |
| DELETE | /api/expenses/:id | hooks/useExpenses.js | routes/expenses.js | Yes | ✅ tested |
| GET | /api/expenses/export.csv | hooks/useExpenses.js | routes/expenses.js | Yes + limit | ✅ prod 401 (was 404) · tested |
| POST | /api/expenses/scan | hooks/useExpenses.js | routes/expenses.js | Yes + limit + quota | ✅ |
| GET | /api/ai/history | pages/Chatbot.jsx | routes/ai.js | Yes | ✅ prod 401 (was 404) · tested · **needs v1_3 table** |
| POST | /api/ai/invest-advice | pages/Chatbot.jsx | routes/ai.js | Yes + limits + quota | ✅ tested |
| GET | /api/wealth | pages/Wealth.jsx | routes/wealth.js | Yes | ✅ prod 401 (was 404) · tested |
| GET | /api/safe-to-spend | pages/Dashboard.jsx | routes/safeToSpend.js | Yes | ✅ |
| GET/POST/DELETE | /api/safe-to-spend/bills[/:id] | — | routes/safeToSpend.js | Yes | ✅ |
| GET | /api/burn-rate | pages/Dashboard.jsx | routes/burnRate.js | Yes | ✅ tested |
| GET | /api/paisa-score | pages/Dashboard.jsx | routes/paisaScore.js | Yes | ✅ tested |
| GET | /api/paisa-score/history | — | routes/paisaScore.js | Yes | ✅ |
| POST | /api/streaks/check-in | pages/Dashboard.jsx | routes/streaks.js | Yes | ✅ |
| GET | /api/streaks, POST /api/streaks/freeze | — | routes/streaks.js | Yes | ✅ |
| GET | /api/groups | pages/HostelPool.jsx | routes/groups.js | Yes | ✅ tested |
| POST | /api/groups | pages/HostelPool.jsx | routes/groups.js | Yes | ✅ tested · **needs v1_3 column** |
| POST | /api/groups/join | pages/HostelPool.jsx | routes/groups.js | Yes + limit | ✅ tested · **needs v1_3** |
| GET | /api/groups/:id | pages/GroupDetail.jsx | routes/groups.js | Yes (member) | ✅ tested · **needs v1_3** |
| POST | /api/groups/:id/expenses | pages/GroupDetail.jsx | routes/groups.js | Yes (member) | ✅ tested · **needs v1_3** |
| DELETE | /api/groups/:id/expenses/:expenseId | — | routes/groups.js | Payer/admin | ✅ |
| POST | /api/groups/:id/settle | pages/GroupDetail.jsx | routes/groups.js | Yes (party) | ✅ tested |
| POST | /api/groups/:id/invite-code | — | routes/groups.js | Admin | ✅ tested |
| DELETE | /api/groups/:id/members/me | pages/GroupDetail.jsx | routes/groups.js | Yes (member) | ✅ tested |
| POST | /api/groups/:id/members | — | routes/groups.js (refuses: use invite code) | Yes | ✅ 400 by design |
| GET | /api/subscriptions/detect | pages/SubscriptionGraveyard.jsx | routes/subscriptions.js | Yes | ✅ tested |
| POST | /api/subscriptions/cancelled | pages/SubscriptionGraveyard.jsx | routes/subscriptions.js | Yes | ✅ tested · **needs v1_3 table** |
| DELETE | /api/subscriptions/cancelled/:name | pages/SubscriptionGraveyard.jsx | routes/subscriptions.js | Yes | ✅ tested · **needs v1_3** |
| POST | /api/pdf-import | pages/PdfImport.jsx | routes/pdfImport.js | Pro + limit | ✅ tested (Pro gate) · **needs v1_2 enum** |
| GET | /api/pdf-import/history | — | routes/pdfImport.js | Yes | ✅ |
| GET | /api/pro/status | contexts/ProContext.jsx | routes/pro.js | Yes | ✅ tested |
| POST | /api/pro/activate, /api/pro/add-freezes | — | routes/pro.js (501 until billing) | Yes | ✅ 501 by design |
| DELETE | /api/account | pages/Settings.jsx | routes/account.js | Yes | ✅ tested |
| PUT | /api/account/budget, /api/account/investment-target | pages/Settings.jsx | routes/account.js | Yes | ✅ tested |
| GET/POST/DELETE | /api/admin/* | pages/Admin/AdminDashboard.jsx | routes/admin.js | Admin role | ✅ tested |

Removed (confirmed 404 in production after deploy): `POST /api/auth/login`,
`POST /api/auth/signup` (unused credential proxies) and `POST /api/chatbot/msg`
(unused route with fabricated affiliate links).
