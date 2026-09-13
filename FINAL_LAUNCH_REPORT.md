> **SUPERSEDED (2026-09-13).** This document predates the P0 security and product work and contains claims that are no longer accurate. Use `LAUNCH_TODO.md`, `TEST_REPORT.md` and `RELEASE.md` instead.

# Spendly — Launch Report

**Date:** 12 September 2026
**Scope:** Full audit, fix, test and release-preparation pass
**Baseline:** `f0e3bea` on `main`, plus uncommitted local working-tree changes

## Overall status: 🟡 CONDITIONALLY READY

The code is in materially better shape than at the start of this pass: three
authorization holes, a systemic financial-calculation bug, the Android
login-redirect bug, and a notification parser that invented expenses are all
fixed and covered by tests.

It is **not** 🟢 because nothing has been verified on a device, no Android
build has been produced, the Supabase production configuration cannot be
inspected from source, and Play Billing is deliberately disabled. Those are
external dependencies, not unfinished code.

---

## Executive summary

Spendly's architecture was sound. The problems were in the places that are easy
to get wrong and hard to notice: authorization on a backend that bypasses its
own database's row-level security, calendar arithmetic on a UTC server serving
Indian users, and a notification parser that treated any rupee sign as
spending.

The single most consequential finding was not a security bug. It was that
**every month boundary and day count in the app was computed in UTC** while
every user is in IST. Expenses logged in the first five and a half hours of any
month were attributed to the previous month, and from 18:30 IST each evening —
peak spending time in India — the server believed it was still yesterday.
For an app whose core promise is "here is what you can safely spend", the
numbers were quietly wrong for a quarter of every day.

The second was that the UPI listener recorded **money received** as money
spent, along with failed payments, payment requests, promotional offers, and
account-balance figures — and counted a single payment two or three times when
Android reposted the notification. Automatic tracking is Spendly's
differentiator; it was actively producing false data.

---

## Project health

| Area | Status | Note |
|---|---|---|
| Architecture | 🟢 PASS | React/Capacitor + Express + Supabase is a sensible fit. No rewrite needed or performed. |
| Backend authorization | 🟢 PASS | Three holes found and closed; every route re-checked. |
| Secret handling | 🟢 PASS | No secret in any tracked file, historical or current. |
| Financial correctness | 🟢 PASS | Timezone bug fixed, logic extracted and tested. |
| Notification parsing | 🟢 PASS | Rewritten, classified, deduplicated, 32 tests. |
| Android auth flow | 🟡 WARNING | Fixed in code; **not verified on a device**. |
| Supabase production config | 🔴 BLOCKED | Cannot be inspected from source. |
| Release build | 🔴 BLOCKED | No signing key; no Android SDK in this environment. |
| Monetisation | 🟡 WARNING | Architecture ready, purchases correctly refused. |
| Test coverage | 🟡 WARNING | Good on pure logic; none on HTTP routes or React components. |
| Frontend UX | 🟡 WARNING | Real gaps remain — no transaction list, no onboarding. |
| Performance | 🟡 WARNING | 1.14 MB single JS chunk; measured, not yet addressed. |

---

## Major issues found

Ordered by how much damage each was doing.

**1. Group expenses readable by anyone — `GET /api/groups/:id/expenses`**
No membership check whatsoever. Any authenticated user could read any group's
expenses by supplying a group id, and the response joined in member **email
addresses**. Because the backend uses the Supabase service-role key, RLS never
saw the query.

**2. Settlements forgeable, karma farmable — `POST /api/groups/:id/settle`**
No membership check on either the payer or the payee. A caller could insert
settlement records into any group against any user, and each call awarded
themselves +5 karma with no limit.

**3. Split lists trusted from the client — `POST /api/groups/:id/expenses`**
`splitAmong` was written straight to the database, so splits could be created
against users who were not in the group.

**4. All calendar math in the wrong timezone**
Described above. Affected safe-to-spend, burn rate, paisa score, subscription
detection, AI context, streaks, and the free-tier daily quota reset.

**5. UPI parser produced false expenses**
Matched any rupee amount in any notification from five apps. Income, failures,
requests, marketing and balances all became spending, and reposts duplicated
real payments.

**6. Google sign-in navigated the WebView to Google**
The reported "app redirects to the Spendly website" symptom. `signInWithOAuth`
assigns the provider URL to `window.location` by default, so the Capacitor
WebView left the app. Google also rejects OAuth in embedded WebViews. A second,
independent cause is configuration: if `spendly://login-callback` is not in the
Supabase redirect allow-list, Supabase silently falls back to the project's
Site URL and lands the user on the website — that half is still on you.

**7. `allowBackup="true"` on a finance app**
Auth tokens live in WebView local storage. Backup enabled means a live session
could be extracted via `adb backup` or carried to another phone by device
transfer.

**8. Monthly quota that could never reset**
The receipt-scan counter reset only if a request happened to arrive on the 1st.
A user who did not open the app that day kept last month's usage indefinitely.

**9. `Infinity` in a JSON response**
`/api/pro/status` returned `Infinity` for Pro limits, which serialises to
`null`. Pro users were shown "null scans remaining".

**10. Machine-specific JDK path committed**
`org.gradle.java.home=C:/Program Files/...` in tracked `gradle.properties`
broke the Android build on every machine except the one it was written on.

**11. A dead component that would have logged everyone out**
`ProtectedRoute.jsx` read a `token` field the auth context never provided, so
anything importing it would redirect every user to `/login`. Unused today, but
a live landmine.

---

## What was fixed

Five commits on `main`, each self-contained.

| Commit | Contents |
|---|---|
| `2152e23` | Checkpoint of uncommitted local work found on the machine, so none of it was lost |
| `4d6c477` | Group authorization (#1–3) and the timezone rewrite (#4) |
| `89e5913` | Android OAuth via Custom Tabs (#6), in-app navigation, API config centralised, dead code removed (#11) |
| `44f6b68` | Notification parser rewrite (#5) |
| `e595bfd` | Expense editing, `occurred_at`, search/filter, CSV export, Android release hardening (#7, #10) |
| `docs` | Full documentation set |

New tested modules: `backend/lib/appTime.js`, `backend/lib/streak.js`,
`backend/lib/csv.js`, `frontend/src/lib/apiConfig.js`,
`frontend/src/lib/errors.js`,
`frontend/android/.../PaymentNotificationParser.java`.

---

## Features added

**Expense editing** via `PATCH /api/expenses/:id`. Round-up savings and streaks
are deliberately not recomputed — those were earned at logging time, and
silently rewriting someone's savings total because they fixed a typo would be
worse than leaving it.

**Transaction dates.** `expenses.occurred_at` separates when money moved from
when the row was written, which is what makes backdating, editing, and correct
statement import possible. Every aggregation now reports on it.

**Search, filtering, sorting and pagination** on the expense list, with the
CSV export sharing the same query builder so the two cannot drift.

**CSV export**, free-tier, RFC 4180 quoted, with spreadsheet formula injection
neutralised.

**Human error messages**, including a distinct offline case.

---

## Security audit

| Check | Result |
|---|---|
| Secrets in tracked files | 🟢 None |
| Secrets in git history | 🟡 The Supabase **anon** key was committed in `1b5b8b9`. Public by design, so not a breach — but it means RLS is the only protection, and the project ref is public. Verify RLS. |
| Service-role key exposure | 🟢 Backend only; never reaches the frontend or APK |
| Premium bypass via client | 🟢 Column-level grants prevent it; `proGate` enforces server-side; `/pro/activate` returns 503 |
| Per-user data scoping | 🟢 All routes re-audited; three failures fixed |
| Android permissions | 🟢 Minimal; no SMS access anywhere |
| Session storage | 🟢 Backup and device-transfer now excluded |
| Sensitive logging | 🟢 Notification text no longer logged; no tokens or passwords logged |
| CSV formula injection | 🟢 Neutralised |
| Production RLS policies | 🔴 **Cannot be verified from source.** Run the queries in `v1_1_launch_hardening.sql`. |

---

## Testing

**Verified by running:**

| Suite | Result |
|---|---|
| Backend unit tests (`node --test`) | 33 pass, 0 fail |
| Same suite under UTC, IST, New York, Kiritimati | 33 pass each |
| Android parser tests (JDK 21) | 32 pass, 0 fail |
| `eslint` across the frontend | Clean, 0 errors, 0 warnings |
| Production `vite build` | Succeeds |
| Backend syntax check, all files | Clean |

The parser suite caught a genuine bug in its own first draft: the
"not a transaction" guard rejected any notification containing "avl bal",
which would have discarded most real bank debit alerts, since Indian banks
append the running balance to them.

**NOT VERIFIED — REQUIRES PHYSICAL DEVICE:** every Android behaviour. Google
sign-in, the Custom Tab returning to the app, notification capture,
deduplication in the field, session restore across reboot, offline behaviour.

**NOT VERIFIED — REQUIRES ANDROID SDK:** no Gradle build was run. The AAB has
never been produced, and R8 minification has not been exercised against the
Capacitor plugin reflection.

**NOT VERIFIED — REQUIRES SUPABASE DASHBOARD:** production RLS policies,
column grants, and the OAuth redirect allow-list.

**NOT COVERED:** HTTP-level route tests and React component tests. The pure
logic is well covered; the wiring is not.

---

## Performance

Measured, not guessed. The production bundle is **1,143 KB (341 KB gzipped)**
in a single chunk, with `recharts` and `framer-motion` loaded before the login
screen can render. On the mid-range Android hardware this app targets, that is
a real cold-start cost. Route-level code splitting is the fix and is filed as
LAUNCH_TODO #26 — deliberately not attempted here, because it touches every
route and belongs in its own change with its own device verification.

---

## Android

| Item | State |
|---|---|
| `targetSdk` 36, `minSdk` 24 | 🟢 Meets the current Play requirement |
| Permissions | 🟢 Minimal, no SMS |
| `allowBackup` | 🟢 Now false, with rules files |
| Release signing config | 🟢 Wired; key itself 🔴 blocked |
| `debuggable false`, R8, resource shrinking | 🟢 |
| ProGuard keeps for plugins + parser | 🟢 |
| Deep link declared | 🟢 |
| App icons | 🟡 Still Capacitor defaults — needs design assets |
| Build produced | 🔴 Never run |

---

## Play Store readiness

🟡 Everything in-repository is ready. Everything requiring your account is not:
listing copy, screenshots, feature graphic, hosted privacy-policy URL, the data
safety form, the notification-listener permission justification, and the closed
testing period Play now requires before production. `PLAY_STORE_CHECKLIST.md`
separates the two.

---

## Monetisation

🟡 The architecture is correct and the restraint is deliberate. Free-tier
limits are enforced server-side in `proGate`, so bypassing the frontend gate
achieves nothing. `is_pro` cannot be set by a client. `POST /api/pro/activate`
returns **503** and writes nothing, and will keep doing so until real
server-side purchase verification exists — a client-submitted purchase token is
not proof of purchase.

One product note: the free tier caps expenses at 20/day. That is generous for
most users, but it does put a ceiling on basic expense tracking, which
`ROADMAP.md` argues against. Consider making manual expense entry unlimited and
monetising insight rather than input.

**Do not ship a purchase button that cannot complete a purchase.** Either wire
billing end-to-end or hide the Pro CTA for v1.

---

## Remaining blockers

| # | Blocker | What is needed | Owner |
|---|---|---|---|
| 1 | Supabase migration not applied | Run `v1_1_launch_hardening.sql` **before** deploying the backend | You |
| 2 | RLS/grants unverified | Run the verification queries in that file | You |
| 3 | OAuth redirect allow-list | Add `spendly://login-callback` in Supabase | You |
| 4 | No signing key | Create an upload keystore; see `RELEASE.md` | You |
| 5 | No AAB produced | Requires the Android SDK | You |
| 6 | Device testing | `DEVICE_TEST_CHECKLIST.md` | You |
| 7 | Play Billing | Play Console + verification provider | You |
| 8 | Three Android Java files | This session could not read them on your disk (path nesting limit) and did **not** overwrite them. New versions are in the repo; review and copy manually. | You |
| 9 | App icons | Design assets | You |

### Environment limitations that shaped this pass

The Linux workspace on your machine failed to start, so all work happened in a
cloud clone of the GitHub repository with your uncommitted local changes
overlaid. That ruled out running Gradle. Separately, three Java files under
`frontend/android/app/src/main/java/com/spendly/app/` are nested too deep for
this session's file bridge to read — including an uncommitted
`PaymentNotificationParser.java` from a previous session. Rather than overwrite
work I could not see, the new versions were written in the repo only.

---

## Recommended next steps

**Before anything else**

1. Run `supabase/v1_1_launch_hardening.sql` and its verification queries.
2. Add `spendly://login-callback` to the Supabase redirect allow-list.
3. Review the three Android Java files against your local copies, then apply.
4. Run `cd frontend/android && ./gradlew testDebugUnitTest` to confirm the
   parser tests pass in the real Gradle/JUnit setup.

**Then, to a build**

5. Create and back up the upload keystore.
6. `npm run build && npx cap sync android && ./gradlew bundleRelease`.
7. Install the **release** build on a real phone and work through
   `DEVICE_TEST_CHECKLIST.md`. The Google sign-in and UPI notification sections
   are the ones that matter — they are the two things this pass changed most
   and could verify least.

**Before production**

8. Decide on Pro: wire billing end-to-end, or hide the CTA for v1.
9. Build the transaction list UI (LAUNCH_TODO #22) — the API is done, and
   without a screen users cannot find past spending.
10. Add the three-screen onboarding (#24). Notification access asked cold, with
    no explanation, is why most users will decline the feature the whole
    product depends on.

---

## Closing assessment

The riskiest problems were the quiet ones: numbers that were wrong for part of
every day, and a tracker that invented transactions. Both are fixed and both
are now covered by tests that would fail again if the behaviour regressed.
What remains is largely not code — it is a migration, a dashboard setting, a
signing key, and a phone.

The product thesis is sound, and Safe-to-Spend is a genuinely better answer
than the spending summaries every competitor ships. Get it onto a device, prove
the two flows above work in the real world, and ship it free. Monetise insight
once people are returning.
