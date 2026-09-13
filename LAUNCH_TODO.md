# Spendly Launch TODO

Audit date: 2026-09-13. Read-only audit of the working tree at `main` (f5d9b9b) **plus
52 uncommitted modified files and ~25 untracked files**. No code was changed.

This file replaces the previous `LAUNCH_TODO.md` (a copy remains in
`Claude outputs/LAUNCH_TODO.md`). That version marked issues "FIXED" with commit
ids (`4d6c477`, `44f6b68`, `89e5913`, `e595bfd`). **Those commits are not in this
repository.** They exist only in `spendly-launch-work.bundle`. The matching code
changes are in the working tree, but they are uncommitted. Every claim below was
re-checked against the files as they are now.

**What was run:** backend `npm test` (44/44 pass), frontend `eslint` (clean),
`npm audit --omit=dev` on backend and frontend. No build, Gradle, or device run.

**Checked and found OK:** no service-role key in the frontend, the git
history, `dist`, or the synced Android assets. The only key in history is the
Supabase **anon** key (public by design) in old `supabaseClient.js` versions.
`.env`, `.env.local`, `keystore.properties` and `*.jks` are git-ignored.
`allowBackup=false` with backup/extraction rules. Cleartext traffic is disabled.
Release has `minifyEnabled`/`shrinkResources`. `capacitor.config.json` has no
`server.url` (no live-reload to a website). Notification text is not logged.
Group routes check membership. Expense PATCH/DELETE check ownership.
`/api/pro/activate` refuses to grant Pro.

---

## P0 — Critical (launch blockers)

### P0-1 Launch work is uncommitted and exists only in the working tree
- **Problem:** 52 modified and ~25 untracked files (security fixes, the new parser, migrations, onboarding) are not committed. `main` is also 1 commit ahead of `origin/main`. The referenced commits live only in `spendly-launch-work.bundle`, which is untracked and **not git-ignored**. Overlapping docs are duplicated in `Claude outputs/`.
- **Why it matters:** One `git checkout .` or disk failure loses the hardening work. A deploy from `origin/main` ships the old, vulnerable code. The bundle could be committed by accident.
- **Proposed solution:** Review the diff, then commit it in logical commits on a branch. Push, and delete or ignore the bundle. Merge the duplicate docs. Deploy only after running `supabase/v1_1_launch_hardening.sql`: the backend now queries `expenses.occurred_at`.
- **Files:** whole repo, `spendly-launch-work.bundle`, `Claude outputs/`, `.gitignore`
- **Testing:** `git status` is clean. A fresh clone runs `npm test` and a frontend build. Staging deploy after the migration, then smoke-test every dashboard endpoint.

### P0-2 Premium and profile columns are writable from the client, or the app silently breaks
- **Problem:** `useExpenses` writes `total_chillar`, `streak_current` and `streak_longest` directly into `profiles` through the anon-key Supabase client (`AuthContext.updateProfile`). The hardened grant only allows `full_name, monthly_budget, investment_target`. So one of two things is true in production:
  - (a) `v1_1_launch_hardening.sql` / `security_hardening.sql` were **not** applied. Any user can then run `update profiles set is_pro=true, role='admin'` with the public anon key.
  - (b) They were applied, and every chillar/streak UI update fails silently (the error is returned, never surfaced).
- The RLS policies also let clients `insert`/`update`/`delete` `expenses`, and `insert` `paisa_scores`, `ai_chat_history`, `streak_activities` and `pdf_imports` directly. That bypasses the backend's validation and the free-tier `add_expense` quota. The frontend never uses these tables directly; only `profiles` select/update is used.
- **Why it matters:** Premium entitlement bypass and admin privilege escalation, or a broken core UI. Either way, the result cannot be verified from source.
- **Proposed solution:**
  1. In the dashboard, run verification query (b) from `v1_1_launch_hardening.sql`.
  2. Apply the hardening migration.
  3. Revoke `insert, update, delete` on all `public` tables from `anon` and `authenticated`. Keep `select` on own rows plus the three `profiles` columns.
  4. Stop writing server-owned columns from `useExpenses`. Update local state from the API response, or re-fetch the profile.
- **Files:** `frontend/src/hooks/useExpenses.js:109,144`, `frontend/src/contexts/AuthContext.jsx`, `supabase/*.sql`
- **Testing:** With a normal user's JWT, call PostgREST directly (`curl`). Updates to `is_pro`, `role` and `total_chillar`, and any insert into `expenses`, must all be rejected. Then add an expense in the app and confirm chillar/streak still update.

### P0-3 `group_members` RLS lets anyone join any group
- **Problem:** The insert policy has `or group_members.user_id = auth.uid()`, so any signed-in user can add themselves to any group id through the anon key. That user then passes every "member" RLS check and can read that group's expenses, splits and settlements. The `group_members` select policy also queries its own table, which causes Postgres "infinite recursion in policy". `group_expense_splits` and `settlements` inserts do not validate the other user ids.
- **Why it matters:** Cross-user financial data exposure (group ids leak through shares and screenshots).
- **Proposed solution:** Remove the self-join clause. Replace recursive checks with a `security definer` `is_group_member(group_id)` function that has `set search_path = ''`. Revoke client writes on group tables, since the backend is the only writer.
- **Files:** `supabase/schema.sql:268-351`, a new migration
- **Testing:** As user B, a direct PostgREST insert into user A's group must fail. The select policies must work without recursion errors.

### P0-4 Rate limiter is global for the whole user base behind Render's proxy
- **Problem:** `server.js` never sets `app.set('trust proxy', …)`. On Render, `req.ip` is the load balancer, so `globalLimiter` (200 req / 15 min) is **one shared bucket for all users**. One dashboard load makes about 6–8 API calls, and `apiFetch` retries 429s, which makes it worse. Indian mobile carrier NAT (CGNAT) has the same effect, even with trust proxy set.
- **Why it matters:** With a few dozen active users, everyone gets "Too many requests".
- **Proposed solution:** Set `trust proxy` to the correct hop count for Render. For authenticated routes, key the limiter on the verified user id, with a looser per-IP limit for unauthenticated traffic. Remove 429 from the automatic retry set.
- **Files:** `backend/server.js:40-51`, `frontend/src/lib/apiConfig.js:41`
- **Testing:** On staging, log `req.ip` to confirm it is the client address. Load test with 2 simulated users: one user hitting the limit must not block the other.

### P0-5 Dashboard opens Android settings automatically, without consent
- **Problem:** `Dashboard.jsx:692-697` calls `requestPermission()` 2 seconds after **every** dashboard mount when notification access is off. That throws the user out of the app to the system Notification Access screen. It happens even if they chose "Not now — I'll add expenses myself" in onboarding.
- **Why it matters:** This is an accidental redirect out of the app, repeated on every visit. Google Play's User Data policy requires a prominent disclosure and an affirmative user action before sensitive access is requested. An unrequested jump to the settings screen is a likely rejection reason.
- **Proposed solution:** Remove the auto-trigger. Only open settings from an explicit button (onboarding or `PermissionBanner`), after the disclosure. Persist the "not now" choice.
- **Files:** `frontend/src/pages/Dashboard.jsx:692-697`, `frontend/src/components/PermissionBanner.jsx`
- **Testing:** Fresh install → skip permission → navigate to Dashboard repeatedly: settings must never open by themselves. Grant access via the banner and confirm the banner disappears on resume.

### P0-6 Notification listener reads WhatsApp chats; the disclosure says otherwise
- **Problem:** `KNOWN_PACKAGES` includes `com.whatsapp` (every personal chat notification) and `com.jio.myjio`. A chat message like "I paid ₹500 for the tickets" parses as an EXPENSE. Onboarding promises "Reads notifications from UPI and bank apps only". It also says "Notification text never leaves your phone", but the extracted payee is sent to the backend as the expense description.
- **Why it matters:** Private messages are processed, false expenses get created, and the disclosure is inaccurate. That is a Play Store misrepresentation and user-data policy risk.
- **Proposed solution:** Remove WhatsApp, or restrict it to notifications from its payment channel if that can be identified reliably. Review every package in the list. Reword the disclosure to match reality, e.g. "the amount and payee name are saved to your Spendly account when you log them".
- **Files:** `frontend/android/app/src/main/java/com/spendly/app/PaymentNotificationParser.java:98-129`, `frontend/src/pages/Onboarding.jsx:127-132`, `frontend/src/pages/PrivacyPolicy.jsx`
- **Testing:** Add unit tests showing WhatsApp chat text is ignored. On a device, send a WhatsApp chat containing "paid ₹100": no prompt should appear.

### P0-7 Fake "Start Pro — ₹99/month" purchase flow
- **Problem:** `ProUpgrade.handlePurchase` waits 2 seconds ("Simulate purchase flow") and then calls `/api/pro/activate`, which always returns 503, so the user sees "Purchase failed". The screen advertises an auto-renewing Play subscription that does not exist. Upgrade CTAs appear across the app (ProGate, chat limit, graveyard).
- **Why it matters:** Play policy forbids misleading functionality and requires Play Billing for digital subscriptions. Reviewers and users hit a button that can never work.
- **Proposed solution:** Choose one. (a) Hide every purchase CTA and make the paywall say "coming soon" until billing is ready. (b) Implement Play Billing (e.g. RevenueCat) with **server-side** verification (Play Developer API / RTDN webhook). The backend must remain the only writer of `is_pro`.
- **Files:** `frontend/src/pages/ProUpgrade.jsx`, `frontend/src/components/ProGate.jsx`, `frontend/src/pages/Chatbot.jsx`, `backend/routes/pro.js`
- **Testing:** No reachable screen offers a purchase that fails. If billing is implemented: test purchase, renewal, cancellation, refund revocation, and a tampered client request (must not grant Pro).

### P0-8 AI endpoints are unmetered (Gemini cost exposure and free-tier bypass)
- **Problem:** The chat UI calls `POST /api/ai/invest-advice`, which has **no `proGate`**, no query length limit, and no per-user quota. The gated `/api/chatbot/msg` is dead code. The client-side `canUse('chat_message')` never increments. `GET /api/burn-rate` calls Gemini on every dashboard load when a user is projected over budget. `apiFetch` retries POSTs, which duplicates Gemini calls and history rows.
- **Why it matters:** One scripted account can run up an unbounded Gemini bill. The "10 AI messages/day" free limit is not enforced anywhere.
- **Proposed solution:** Add `proGate('chat_message')` and a `zod` length cap (e.g. 500 chars) to `/invest-advice`. Cache the burn-rate AI suggestion per user per day, or only generate it on demand. Do not auto-retry non-idempotent POSTs. Set a Google Cloud billing budget alert.
- **Files:** `backend/routes/ai.js:98`, `backend/routes/burnRate.js:109-121`, `backend/routes/chatbot.js`, `frontend/src/lib/apiConfig.js`, `frontend/src/pages/Chatbot.jsx`
- **Testing:** A free user's 11th message in a day returns 403 `LIMIT_REACHED`. A 10 KB query returns 400. Reloading the dashboard 20 times makes at most 1 Gemini burn-rate call.

### P0-9 Specific investment recommendations and placeholder affiliate links
- **Problem:** `buildLocalPlan` recommends named products tailored to the user's surplus: "UTI Nifty 50 Index Fund", "Parag Parikh Flexi Cap", "one share of TCS or HDFC Bank", specific brokers. The chat shows "Open Zerodha / Try Groww / Explore Kuvera" chips with made-up referral codes (`?ref=SPENDLY`) and a "Buy Digital Gold" link. `chatbot.js` tells the model to append affiliate links. A disclaimer does not change what the content is.
- **Why it matters:** Personalised, product-specific investment advice in India falls under SEBI's Investment Adviser rules, and paid referral links add to that. Google Play's Financial Services policy also applies. Non-functional referral links look deceptive. *(This is not legal advice — get a qualified review.)*
- **Proposed solution:** Before launch, keep the coach to budgeting and saving education with generic asset-class explanations. Remove named funds and stocks, broker/gold chips and affiliate instructions. Delete the unused `chatbot.js` route.
- **Files:** `backend/routes/ai.js:29-76,176-201`, `backend/routes/chatbot.js`, `frontend/src/pages/Chatbot.jsx:9-34,176-193`, `frontend/src/pages/Wealth.jsx`
- **Testing:** Ask "where should I invest ₹2000": no fund, stock or broker is named and no external link is shown. Ask a spending question and confirm it is still answered.

### P0-10 Privacy policy and Data Safety do not match what the app does
- **Problem:** `PrivacyPolicy.jsx`:
  - never mentions **notification access** or the payee/amount data it extracts;
  - claims push notification tokens and Google Play Billing, neither of which exists;
  - states "No personally identifiable financial data is used to train AI models", but bank statement text, receipt images and spending summaries go to the Gemini API, and whether they are used for training depends on the Google API tier and terms;
  - lists `support@spendly.app`, a domain that is not verified;
  - says "not directed at children under 13", while India's DPDP Act treats under-18s as children and the app targets students.
- There is no web-accessible account deletion URL, which Play requires in addition to in-app deletion.
- **Why it matters:** Play Store rejection or removal, and legal exposure.
- **Proposed solution:** Rewrite the policy to reflect actual data flows (Supabase, Render, Gemini, the notification listener, retention). Confirm the Gemini plan's data-use terms (paid tier). Use a working support email. Publish a public deletion-request page. Complete the Data Safety form from the same inventory.
- **Files:** `frontend/src/pages/PrivacyPolicy.jsx`, `frontend/src/pages/TermsOfService.jsx`, `PLAY_STORE_CHECKLIST.md`
- **Testing:** Line-by-line review against the data inventory. Open the policy and deletion URLs signed out, from a browser.

### P0-11 External configuration that cannot be verified from the repo
- **Problem:** No upload keystore (release is left unsigned). The Supabase redirect allow-list must contain `spendly://login-callback`; otherwise Supabase falls back to the **website Site URL** after Google sign-in. `GEMINI_API_KEY`, `ALLOWED_ORIGINS` and `NODE_ENV=production` on Render are unverified. Production RLS/grant state is unknown (see P0-2).
- **Why it matters:** No Play-uploadable AAB, and login lands on the website.
- **Proposed solution:** Create an upload key and enrol in Play App Signing. Configure the Supabase URL settings. Audit Render env vars.
- **Files:** `frontend/android/app/build.gradle`, `keystore.properties.example`, Supabase dashboard, Render dashboard
- **Testing:** `./gradlew bundleRelease` produces a signed AAB. On a device, Google login returns to the app, not the website.

---

## P1 — High

### P1-1 Invalid expense input crashes with 500
- **Problem:** `expenses.js:219` uses `parsed.error.errors`. Zod 4.4.3 has only `.issues` (verified), so any validation failure throws a TypeError and returns a 500.
- **Why it matters:** Users see "Something went wrong on our side" instead of a validation message, and the error is logged as a server fault.
- **Proposed solution:** Use `parsed.error.issues`, as the other handlers already do.
- **Files:** `backend/routes/expenses.js:219`
- **Testing:** `POST /api/expenses {amount:-5}` → 400 with field errors. Add a route test.

### P1-2 Detected payments are lost unless the Dashboard is open
- **Problem:** `UpiNotificationPlugin.notifyPayment` drops the event when the plugin instance is null (app killed or backgrounded), and nothing is queued. The JS listener exists only while `Dashboard` is mounted. `pendingPayment` holds a single slot, so a second payment overwrites the first. The fingerprint is marked "seen" before the user acts, so a skipped or overwritten payment never comes back. The static `instance` can also outlive its bridge.
- **Why it matters:** The headline feature ("track without typing") misses most real payments, which happen while Spendly is closed.
- **Proposed solution:** Persist detections natively in a small queue (app-private storage, excluded from backup). Drain the queue on app resume through a plugin method. Show a list of pending items. Mark an item seen only after it is logged or dismissed.
- **Files:** `UpiNotificationPlugin.java`, `PaymentNotificationListener.java`, `frontend/src/hooks/usePaymentNotifications.jsx`, `frontend/src/pages/Dashboard.jsx:686-690,782-809`
- **Testing:** Force-stop the app → make 3 UPI payments → open the app: 3 pending items appear. Skip one, restart the app: it does not reappear. Log one: no duplicate.

### P1-3 UPI expenses are recorded with the wrong metadata and quota
- **Problem:** The logged expense uses the current time instead of the notification timestamp, `category: 'Other'`, and `source: 'manual'`. The `expense_source` enum has only `manual, ai_scan`, so `GET /api/expenses?source=upi_auto` or `?source=pdf_import` errors with a 500. Auto-detected payments also count toward the 20/day free `add_expense` quota. The "is this right?" toast cannot edit the amount or category.
- **Why it matters:** Wrong dates skew month and day totals. Filtering crashes. Users are penalised for automation.
- **Proposed solution:** Add enum values through a migration and accept `source`/`occurred_at` from a validated UPI path. Allow editing before saving. Decide deliberately whether auto-detected expenses consume quota.
- **Files:** `backend/routes/expenses.js`, `supabase/` (new migration), `frontend/src/pages/Dashboard.jsx`
- **Testing:** A payment detected at 23:50 and logged at 00:10 is dated the previous day. The `source` filter returns 200.

### P1-4 Parser keyword matching drops real transactions and still admits noise
- **Problem:** Plain substring matching causes errors in both directions:
  - "refer" matches "reference", so alerts containing "UPI reference no." are dropped as marketing;
  - "win " matches "darwin "; "offer" matches "offered"; "expired" and "cancelled" can match unrelated text;
  - "sent" matches "consent" / "present", and "paid" matches "prepaid".
- Bank/UPI dedup relies on identical normalised merchants, but GPay says "Swiggy" while the bank says "VPA swiggy@icici", so the same payment is counted twice. The 4-minute window is shorter than typical bank alert delays. The tests use synthetic strings only.
- **Why it matters:** Wrong or missing expenses erode trust in every number.
- **Proposed solution:** Use word-boundary regexes. Build a corpus of real (anonymised) notifications per app and bank. Dedup on amount plus a time window across apps, and ask the user when a match is uncertain.
- **Files:** `PaymentNotificationParser.java`, `frontend/android/app/src/test/java/com/spendly/app/PaymentNotificationParserTest.java`
- **Testing:** Corpus-driven unit tests (at least 20 real samples per top app). Device test: GPay payment plus bank SMS-app notification → one expense.

### P1-5 Financial calculations produce wrong numbers
- **Problem:**
  - **Subscription graveyard is inverted:** `isZombie = daysSinceLastPayment > 30` flags subscriptions the user *stopped paying* as waste. `normalizeMerchant` groups on the first two words, so every "UPI Payment" / "Paid to…" row merges into one fake subscription.
  - **Burn rate:** `brokeDate` uses `setDate` and `toLocaleDateString` in the server timezone (UTC), so the date is off by one from 18:30 IST onward.
  - **Dashboard 7-day chart:** buckets by weekday name across *all* loaded expenses, so last week's Monday is added to this Monday.
  - **Client monthly total:** uses the device timezone and at most 500 rows, so it can disagree with the server's Safe-to-Spend.
  - **`todayRoundup`:** uses `created_at` instead of `occurred_at`.
  - **Safe-to-spend:** a bill due today that has already been logged is counted twice.
  - **Cron:** `'30 3 * * *'` with `timezone: 'Asia/Kolkata'` runs at 03:30 IST, not the documented 09:00.
- **Why it matters:** This is a money app. Visibly wrong figures destroy trust.
- **Proposed solution:** Fix each item. Move the chart and totals to server-computed, IST-bucketed values. Add unit tests beside `appTime`.
- **Files:** `backend/routes/subscriptions.js:84,135-145`, `backend/routes/burnRate.js:72-78`, `backend/routes/safeToSpend.js:57-64`, `backend/jobs/burnRateChecker.js:17`, `frontend/src/hooks/useExpenses.js:70-90`, `frontend/src/pages/Dashboard.jsx:739-742`
- **Testing:** Table-driven tests with fixed `now` values (month end, 23:00 IST, leap year). Seed an account with known data and compare every dashboard figure to a hand calculation.

### P1-6 Paisa Score shows fabricated components
- **Problem:**
  - `noZombieSubs` is hardcoded to 100.
  - `percentile` is just `score/850` presented as a percentile.
  - 200 points are awarded simply for having a non-zero investment target.
  - `GET` overwrites `profiles.paisa_score` on every call, so `change` ("this week") is 0 after the first refresh.
  - The `paisa_scores` history table is never written, so `/history` is always empty.
- **Why it matters:** A score users are told reflects their financial health is partly fake and misleading.
- **Proposed solution:** Remove or hide the unimplemented components and the fake percentile. Snapshot weekly into `paisa_scores` and compute `change` from the snapshot. Make GET side-effect free.
- **Files:** `backend/routes/paisaScore.js`, `frontend/src/pages/Dashboard.jsx`
- **Testing:** Identical data gives an identical score. `change` reflects last week's snapshot. The breakdown sums to the total.

### P1-7 Quotas and counters have read-modify-write races
- **Problem:** `proGate` reads a counter and writes `used + 1` later. `total_chillar`, `karma_score`, `streak_freezes_remaining` and the PDF-import chillar update all read, then write. Concurrent requests pass the quota check together, and simultaneous updates lose increments. `proGate` still fails open on unexpected exceptions for quota features.
- **Why it matters:** Free limits can be bypassed with parallel requests, and savings totals drift.
- **Proposed solution:** Use Postgres functions (RPC) that do conditional atomic increments (`update … set x = x + 1 where x < limit returning`), called with the service role.
- **Files:** `backend/middleware/proGate.js`, `backend/routes/expenses.js:34-72`, `backend/routes/groups.js:11-33`, `backend/routes/streaks.js:138-175`, `backend/routes/pdfImport.js:182-196`
- **Testing:** Fire 30 parallel `POST /api/expenses` as a free user: exactly 20 succeed. Chillar equals the sum of the round-ups.

### P1-8 PDF import duplicates data and crashes on bad rows
- **Problem:**
  - Re-importing the same statement inserts every transaction again.
  - A single unparseable AI date makes `new Date(t.date).toISOString()` throw a RangeError, failing the whole import.
  - Amounts have no upper bound, and future dates are accepted.
  - `source` is stored as `ai_scan` instead of `pdf_import`.
  - The inline Pro check ignores `pro_expires_at`.
  - Multer rejections (non-PDF, over 10 MB) reach the global handler as 500s.
  - The full statement text is sent to Gemini (a disclosure issue, see P0-10).
- **Why it matters:** Doubled spending and unexplained failures on a paid feature.
- **Proposed solution:** Validate each row with zod and skip invalid ones with a count. Dedup on (user, date, amount, description) or a statement hash. Correct the source. Rely on `proGate` alone. Map Multer errors to 400/413.
- **Files:** `backend/routes/pdfImport.js`
- **Testing:** Import the same PDF twice: second run imports 0. Import a PDF with one garbage row: the rest import. A 12 MB file returns 413.

### P1-9 Account deletion can leave a broken, re-loggable account
- **Problem:** `DELETE /api/account` deletes `profiles` first, then the auth user. If the auth deletion fails, the endpoint still reports success. The user can sign in again with no profile row, because `handle_new_user` only runs on insert, and every page breaks. A new Supabase client is created per request. There is no web deletion path (see P0-10).
- **Why it matters:** This is a Play-mandated flow, and a failure leaves a zombie account.
- **Proposed solution:** Delete the auth user first (profiles cascade from `auth.users`), and return an error if it fails. Reuse the existing service-role client. Sign out and clear local app data (onboarding flag, seen payments).
- **Files:** `backend/routes/account.js:22-71`, `frontend/src/pages/Settings.jsx:307-323`
- **Testing:** Delete an account, then try to log in: it must fail. Check that no rows remain in any table for that user id.

### P1-10 Banned users are not blocked
- **Problem:** The admin panel toggles `is_banned`, but neither `protect` nor any route checks it.
- **Why it matters:** The moderation feature does nothing.
- **Proposed solution:** Check `is_banned` in `protect` (cached briefly), or ban at the auth level with `auth.admin.updateUserById(id, { ban_duration })`.
- **Files:** `backend/middleware/authMiddleware.js`, `backend/routes/admin.js`
- **Testing:** Ban a user: their next API call returns 403 and the app shows a clear message.

### P1-11 Auth flows send users to the website or dead ends
- **Problem:**
  - `signUp` passes no `emailRedirectTo`, so on Android the confirmation email opens the **website** (Site URL) instead of the app.
  - There is **no "forgot password" flow** anywhere.
  - Google OAuth sends `prompt: 'consent'` and `access_type: 'offline'`, forcing the consent screen on every login for a Google refresh token that is never used.
  - Signup has no terms/privacy acceptance.
- **Why it matters:** Accidental redirects, locked-out users, and extra friction.
- **Proposed solution:** Set `emailRedirectTo` to the app callback on native. Add a password reset flow through the same callback. Remove `prompt`/`access_type`. Add links to Terms and Privacy on signup.
- **Files:** `frontend/src/contexts/AuthContext.jsx:83-110,140-152`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Signup.jsx`, `frontend/src/App.jsx`
- **Testing:** On a device: sign up → tap the email link → app opens and is logged in. Reset password end to end. Second Google login shows no consent screen.

### P1-12 OAuth deep link is interceptable and can be processed twice
- **Problem:** supabase-js defaults to the implicit flow, so access and refresh tokens arrive in the fragment of a custom `spendly://` URL. Any installed app can register that scheme and receive them. `getLaunchUrl()` is re-processed every time `DeepLinkHandler` mounts, reusing an already-consumed refresh token, which shows a spurious "could not complete sign-in". The async `onAuthStateChange` callback awaits another Supabase call; Supabase documents this as a deadlock risk.
- **Why it matters:** Session theft on a hostile device, and flaky login.
- **Proposed solution:** Use `flowType: 'pkce'` in `createClient`. Prefer Android App Links (a verified https callback). Remember handled URLs. In `onAuthStateChange`, set state synchronously and defer the profile fetch (`setTimeout(…, 0)`).
- **Files:** `frontend/src/lib/supabaseClient.js`, `frontend/src/App.jsx:115-205`, `frontend/src/contexts/AuthContext.jsx:36-59`, `AndroidManifest.xml`
- **Testing:** Cold-start login, warm login, rotate the device mid-login, background/foreground loop — no error banner, and the session persists after restart.

### P1-13 Hostel Pool is largely non-functional
- **Problem:** The UI only lists and creates groups. "Add member" adds a local name that is never saved. There is no UI to add group expenses or settle, and `/snapshot` is never called, so the pool resets on reload. The backend's `GET /groups` returns every member's **email** to all members. `POST /:id/members` adds any user id without that user's consent and without UUID validation. Settling repeatedly with a cooperating member farms +5 karma each time. Each group costs an extra request (N+1).
- **Why it matters:** A shipped feature that loses data, plus a privacy leak.
- **Proposed solution:** Either hide the feature for v1, or wire it to the existing endpoints with invite/accept. Drop `email` from member payloads. Cap karma per pair per day.
- **Files:** `frontend/src/pages/HostelPool.jsx`, `backend/routes/groups.js`
- **Testing:** Create a pool, add a member and an expense, reload: the data persists. The member payload contains no emails.

### P1-14 CSV export does nothing on Android but reports success
- **Problem:** `exportCsv` saves through a blob URL and an `<a download>` click. Android WebView ignores that, and the UI still shows "done".
- **Why it matters:** The data-portability promise is broken, and the success message is false.
- **Proposed solution:** On native, write the file with `@capacitor/filesystem` and open the share sheet (`@capacitor/share`). Both are official Capacitor plugins, added only for this.
- **Files:** `frontend/src/hooks/useExpenses.js:204-229`, `frontend/src/pages/Settings.jsx`
- **Testing:** On a device, export → share sheet → open the file in Sheets: the ₹ sign renders and row count matches.

### P1-15 Vulnerable dependencies
- **Problem:**
  - **Backend `npm audit`:** 11 findings, including a critical in `protobufjs` (via `@google/genai`) and highs in `multer` (direct), `ws`, `path-to-regexp`, `brace-expansion` and `ip-address`.
  - **Frontend:** 7 findings, including highs in `react-router-dom` (direct) and `vite` (direct, dev server only) and `postcss`.
  - `node-cron@3` depends on a vulnerable `uuid`.
- **Why it matters:** Known CVEs are reachable in request parsing (multer, path-to-regexp).
- **Proposed solution:** Run `npm audit fix` (non-breaking) on both projects. Evaluate `node-cron@4` separately. Re-run tests.
- **Files:** `backend/package.json`, `frontend/package.json`, lockfiles
- **Testing:** `npm audit --omit=dev` shows no high or critical findings. Backend tests pass, the frontend builds, and file upload still works.

### P1-16 Gemini model hardcoded in five places
- **Problem:** `'gemini-2.0-flash'` is repeated in `ai.js`, `burnRate.js`, `chatbot.js`, `expenses.js` and `pdfImport.js`. Older Gemini models are retired on a schedule. `chatbot.js` also returns `error.message` in production responses.
- **Why it matters:** When the model is retired, receipt scan, PDF import and chat all fail at once.
- **Proposed solution:** Confirm the model's current availability. Move the model name to a single `GEMINI_MODEL` env var with a supported default. Never return raw errors in production.
- **Files:** those five routes
- **Testing:** Smoke-test scan, import and chat against the configured model.

### P1-17 Default Capacitor branding in the Play listing
- **Problem:** The launcher icons (`mipmap-*`, unchanged since the "SpendIt" initial commit) and splash images are Capacitor defaults. The web manifest declares a single SVG as both 192 and 512 px. Name leftovers: "SpendIt" in `SubscriptionGraveyard.jsx:5`, "FinDost" in `schema.sql`. `frontend/README.md` is the stock "React + Vite" template, and `frontend/package.json` is named `frontend` at version `0.0.0`.
- **Why it matters:** Looks unfinished in the store and on the home screen.
- **Proposed solution:** Generate adaptive icons and splash from `spendly-logo.svg` (`@capacitor/assets` as a one-off `npx`, or Android Studio Image Asset). Add PNG manifest icons. Clean up the leftovers.
- **Files:** `frontend/android/app/src/main/res/mipmap-*`, `drawable*/splash.png`, `frontend/public/manifest.json`, `frontend/README.md`, `frontend/package.json`
- **Testing:** Install the release build: the icon is correct on light and dark launchers and the themed-icon setting, and the splash is not the default.

---

## P2 — Medium

### P2-1 Unnecessary Android permissions and weak permission check
- **Problem:** `<uses-permission BIND_NOTIFICATION_LISTENER_SERVICE>` is meaningless (it is a system signature permission; the `<service android:permission>` attribute is what matters). `POST_NOTIFICATIONS` is declared, but there are no push notifications and no runtime request. `isNotificationAccessGranted` substring-matches the package name. Release builds still log lifecycle `Log.i`/`Log.d` messages.
- **Why it matters:** Extra permissions draw reviewer scrutiny, and the substring check can misreport access.
- **Proposed solution:** Remove both `uses-permission` lines. Compare against `ComponentName.unflattenFromString`, or use `NotificationManagerCompat.getEnabledListenerPackages`. Gate the logs on `DEBUG`.
- **Files:** `AndroidManifest.xml:72,79`, `UpiNotificationPlugin.java:188-205`
- **Testing:** The merged manifest for release lists only INTERNET. The permission check is correct after a grant/revoke cycle.

### P2-2 Dead code and unnecessary dependencies
- **Problem:**
  - Unused backend routes: `/api/auth/signup|login` (the frontend uses Supabase directly; this is extra credential-stuffing surface) and `/api/chatbot/msg`.
  - `test-health.js` hits a non-existent `/investments`.
  - Unused frontend code: `secureStorageAdapter.js` plus `@aparajita/capacitor-secure-storage` (a native plugin shipped for nothing), and `typescript@7` as a devDependency in a JS-only project.
  - `express-validator` is used only by the dead auth routes.
  - Root `package.json` uses Windows-only `.\\gradlew.bat` and a `debug` build for `build:android`.
  - `burnRateChecker` selects `fcm_token`, which exists in no migration, so the daily job errors out. It also only logs, loops N+1 over all users, and does not run while the Render free instance sleeps.
- **Why it matters:** Attack surface, APK size, confusion.
- **Proposed solution:** Remove the dead routes, packages and scripts after confirming nothing references them. Fix or disable the cron job.
- **Files:** `backend/routes/auth.js`, `backend/routes/chatbot.js`, `test-health.js`, `frontend/src/lib/secureStorageAdapter.js`, `frontend/package.json`, `backend/package.json`, `package.json`, `backend/jobs/burnRateChecker.js`
- **Testing:** `grep` for imports, then build, lint, tests, and a device smoke test.

### P2-3 Backend hardening gaps
- **Problem:**
  - `express.json({ limit: '10mb' })` applies to every route (memory DoS); only `/scan` needs it.
  - `cors({ credentials: true })` is unnecessary with bearer tokens.
  - Group expense and settlement amounts and descriptions are unbounded in code.
  - `recurring_bills` POST/DELETE lack type and UUID validation.
  - Admin `DELETE /expenses/:id` has no UUID check and no audit log.
  - `handle_new_user` is `security definer` without `set search_path`.
  - `profiles.monthly_budget` has no DB check constraint, but is client-writable.
- **Why it matters:** Defence in depth for a finance app.
- **Proposed solution:** Per-route body limits, zod schemas on all write routes, `set search_path = ''`, a `check (monthly_budget between 500 and 10000000)` constraint, and an admin action log.
- **Files:** `backend/server.js`, `backend/routes/groups.js`, `backend/routes/safeToSpend.js`, `backend/routes/admin.js`, `supabase/` (new migration)
- **Testing:** A 5 MB JSON body to `/api/expenses` returns 413. Invalid bill input returns 400. Supabase database linter is clean.

### P2-4 Retry and state-handling issues in the client
- **Problem:**
  - `apiFetch` retries every method.
  - `ProContext` keeps the previous user's Pro state and limits after logout.
  - Settings saves the budget twice (API and direct client update).
  - The onboarding flag is per device, not per user.
  - `alert()` is used for purchase results.
  - `friendlyError` is not used on Dashboard, PdfImport or SubscriptionGraveyard, where fetch errors are silently swallowed.
- **Why it matters:** Duplicate writes, stale entitlement UI, silent failures.
- **Proposed solution:** Retry only GET. Reset contexts on sign-out. Use a single write path. Show inline error states.
- **Files:** `frontend/src/lib/apiConfig.js`, `frontend/src/contexts/ProContext.jsx`, `frontend/src/pages/Settings.jsx`, `frontend/src/pages/Dashboard.jsx:700-732`
- **Testing:** Log out, then log in as a different user: no stale Pro badge. With the network off, the dashboard shows an error state instead of blank cards.

### P2-5 Admin route UX
- **Problem:** `AdminRoute` depends on `user.role` from the profile fetch. If that fetch fails, an admin is bounced to `/dash` with no message.
- **Why it matters:** Minor, but it confuses support.
- **Proposed solution:** Show a clear error state when the profile cannot be loaded.
- **Files:** `frontend/src/App.jsx:65-72`
- **Testing:** Simulate a profile fetch failure.

### P2-6 Cold start and bundle performance
- **Problem:** On the Render free tier, the first request takes 30–60 s. Google Fonts are loaded from the network inside the APK, which is slow or fails offline on first launch. Dashboard makes 4 parallel API calls plus the expense list, and HostelPool makes N+1 calls.
- **Why it matters:** Poor first impression on mid-range Android phones and slow networks.
- **Proposed solution:** Use a paid always-on instance or a warm-up ping. Bundle the fonts locally. Add a combined dashboard summary endpoint.
- **Files:** `frontend/index.html`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/HostelPool.jsx`
- **Testing:** Lighthouse/WebPageTest on a throttled 4G profile, and airplane-mode first launch.

### P2-7 No production monitoring
- **Problem:** No crash reporting (native or JS) and no backend error tracking or uptime alerting.
- **Why it matters:** Production failures are invisible.
- **Proposed solution:** Add crash and error reporting with PII scrubbing (no amounts, payees or tokens). Declare it in Data Safety.
- **Files:** `frontend/src/main.jsx`, `frontend/src/components/ErrorBoundary.jsx`, `backend/server.js`
- **Testing:** A forced test crash is received with no PII.

### P2-8 Repository hygiene
- **Problem:** LF/CRLF warnings on nearly every file (no `.gitattributes`). The root `.gitignore` Android patterns are anchored to a non-existent root `android/` (currently covered by `frontend/android/.gitignore`). Many overlapping launch docs (`APPLY_AND_PUSH.md`, `FINAL_LAUNCH_REPORT.md`, `RELEASE.md`, `SECURITY.md`, …) contradict each other.
- **Why it matters:** Noisy diffs and misleading documentation.
- **Proposed solution:** Add `.gitattributes`. Fix the ignore paths. Consolidate into `README.md`, `RELEASE.md` and this file.
- **Files:** repo root
- **Testing:** `git status` is clean after normalisation.

---

## P3 — Future

Only items already implied by existing code or stubs:

- **Income/refund ledger.** The parser classifies INCOME and REFUND, but they are discarded (`Dashboard.jsx:794`). A `direction` column or an income table would make them visible.
- **Play Billing plus server entitlement.** `/api/pro/activate` and `/add-freezes` are stubs waiting for verified purchase events (RTDN webhook).
- **Push notifications.** The burn-rate job has an FCM TODO. It needs Firebase config, a token column, and the `POST_NOTIFICATIONS` runtime request.
- **Android App Links** to replace the custom-scheme callback (see P1-12).
- **Frontend tests and CI.** None exist. Add CI running backend tests, lint, build, Android unit tests and `bundleRelease`.
- **Staging environment.** Separate Supabase project and Render service, so migrations are tested before production.
