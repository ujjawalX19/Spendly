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
| POST | /api/auth/profile | contexts/AuthContext.jsx (profile missing) | routes/auth.js | Yes | ✅ tested · creates a default profile only |
| GET | /api/expenses `?q,category,source,from,to,minAmount,maxAmount,sort,limit,offset` | hooks/useExpenses.js, hooks/useTransactionSearch.js | routes/expenses.js | Yes | ✅ prod 401 · tested |
| POST | /api/expenses | hooks/useExpenses.js | routes/expenses.js | Yes + quota | ✅ tested |
| PATCH | /api/expenses/:id | hooks/useExpenses.js | routes/expenses.js | Yes | ✅ prod 401 (was 404) · tested |
| DELETE | /api/expenses/:id | hooks/useExpenses.js | routes/expenses.js | Yes | ✅ tested |
| GET | /api/expenses/export.csv | hooks/useExpenses.js | routes/expenses.js | Yes + limit | ✅ prod 401 (was 404) · tested |
| POST | /api/expenses/scan | hooks/useExpenses.js | routes/expenses.js | Yes + limit + quota | ✅ |
| GET | /api/ai/history | pages/Chatbot.jsx | routes/ai.js | Yes | ✅ prod 401 (was 404) · tested · **needs v1_3 table** |
| POST | /api/ai/invest-advice | pages/Chatbot.jsx | routes/ai.js | Yes + limits + quota | ✅ tested (mentorRoutes) |
| GET | /api/ai/insights | pages/Chatbot.jsx | routes/ai.js ("Your money today" + quick prompts; no model call, no quota) | Yes | ✅ tested · not yet deployed |
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

### Owner admin API (separate admin web app, `frontend/admin`)

All behind `protect` + `requireOwner`: confirmed email = `ADMIN_EMAIL` **and** `profiles.role = 'admin'`. Non-owners get `404`. See [ADMIN_PANEL.md](ADMIN_PANEL.md).

| Method | Path | Admin app page | Notes | Status |
|---|---|---|---|---|
| GET | /api/admin/me | App.jsx (session gate) | Owner check | ✅ tested |
| GET | /api/admin/overview | pages/Overview.jsx | Aggregates only | ✅ tested |
| GET | /api/admin/health | pages/Health.jsx, Overview.jsx | Real probes | ✅ tested |
| GET | /api/admin/users | pages/Users.jsx | Server-side filters/sort/pagination; **needs v1_4 view** for usage columns | ✅ tested |
| GET | /api/admin/users/:id | pages/UserDetail.jsx | Counts only; audited view | ✅ tested |
| GET | /api/admin/users/:id/timeline | pages/UserDetail.jsx | No amounts/contents | ✅ tested |
| POST | /api/admin/users/:id/suspend, /reinstate | pages/UserDetail.jsx | Reason required, audited | ✅ tested |
| POST/DELETE | /api/admin/users/:id/pro | UserDetail.jsx, Pro.jsx | Grant/revoke; reason required, audited | ✅ tested |
| POST | /api/admin/users/:id/pro/extend | UserDetail.jsx, Pro.jsx | Compare-and-set on expiry | ✅ tested |
| GET | /api/admin/pro | pages/Pro.jsx | Entitlements + history | ✅ tested |
| GET | /api/admin/audit-log | pages/AuditLog.jsx | **needs v1_4** | ✅ tested |

Removed (confirmed 404 in production after deploy): `POST /api/auth/login`,
`POST /api/auth/signup` (unused credential proxies) and `POST /api/chatbot/msg`
(unused route with fabricated affiliate links).

Removed with the owner admin panel: `GET /api/admin/expenses/recent`,
`DELETE /api/admin/expenses/:id` (cross-user transaction access) and
`POST /api/admin/users/:id/ban` (replaced by explicit, audited suspend/reinstate).
The in-app `/admin` route was removed from the Android/user app.
