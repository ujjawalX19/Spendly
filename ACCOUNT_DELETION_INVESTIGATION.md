# Account deletion investigation — 2026-09-14 17:36:33 UTC

Read-only investigation. No accounts were deleted, restored or modified.
Evidence sources: repository code, production `ops_events` / `admin_audit_log`
and Supabase Auth user records (read with the service role), the local Claude
session transcripts on the development machine (every tool call is
timestamped), and screenshots taken during emulator testing.

**Not available:** Supabase Auth request logs, Render request logs, and the
emulator's logcat for 17:36 (cleared at 17:41:22 and the emulator was shut
down). Nothing records the client IP or user agent of an API request.

## 1. Every deletion path

| Path | Exists? | Deletes what | Guard |
|---|---|---|---|
| `DELETE /api/account` (`backend/routes/account.js`) | **Yes — the only code that deletes an auth user** | Caller's auth user (`auth.admin.deleteUser(req.user.id)`), cascade removes profile and data | `protect` (Supabase-verified bearer token, not banned), body `{"confirmation":"DELETE_MY_ACCOUNT"}` |
| App UI: Settings → Delete Account (`frontend/src/pages/Settings.jsx`) | Yes — the only client caller | Calls the endpoint above | Modal: button disabled and handler returns unless the text field equals `DELETE` |
| Any other app screen, hook or plugin | No | — | `grep` finds no other caller of `/api/account` |
| Admin web app / admin API (`routes/admin.js`) | **No** | Suspend/reinstate, grant/revoke/extend Pro only | Owner-only; no `deleteUser`, no profile delete |
| Other backend DELETE routes | Not accounts | Own expense, bill, group expense, leave group, un-cancel subscription | `protect` + ownership checks |
| Background jobs | No | `burnRateChecker` only reads profiles | — |
| Supabase SQL functions/triggers | No | Only `handle_new_user` (insert), `updated_at` triggers, `is_group_member` (read) | — |
| Supabase Auth (client, anon key) | No | Deleting an auth user requires the service role | — |
| Supabase dashboard / service-role key holder | **Outside the code** | Any user | Dashboard login; key only in `backend/.env` (git-ignored, never committed) and Render env |
| Test suites | No real accounts | Backend tests inject an in-memory fake Supabase and a fake URL/key; DB tests use PGlite | — |
| Scripts in repo | No | `build-apk.ps1` builds only | — |

## 2. Evidence for the observed deletion

Timeline (UTC):

| Time | Evidence |
|---|---|
| 17:26:20–17:26:43 | Emulator: tap "Continue with Google"; Chrome Custom Tab; Supabase shows `last_sign_in_at 17:26:43` for account `527e4f3a` (owner's address, email + Google identities). That account had no profile row, so the app showed "We couldn't load your account". |
| 17:28:43 | Production: **17** auth users, **9** profiles. |
| 17:28:43 → 17:34:00 | **No input sent to the emulator** (transcript). |
| 17:34:00 | New APK installed and launched on the emulator. |
| 17:34:51 | Production: **18** auth users, **10** profiles — one account *with* a profile was created in this window. |
| 17:35:22 | Emulator screenshot, Settings: signed in as **`[redacted-email]`** (read from that account's profile row). `527e4f3a` still had no profile (its profile was created at 18:06:07 by the backfill), so the emulator session was no longer `527e4f3a`. |
| ~17:35:43 | Last emulator input before the deletion: one `adb shell input tap` (bottom navigation). |
| **17:36:33.257** | `ops_events`: **`account_deleted`, route `DELETE /api/account`**. This row is written only after that endpoint succeeded, i.e. after `protect` accepted a valid token and the body contained `DELETE_MY_ACCOUNT`. It is the only deletion event in the log. `admin_audit_log` is empty. |
| 17:36:05–17:39:27 | Assistant tool calls: file reads/edits, lint, frontend unit tests, build — no network calls to the API and no emulator input. |
| 18:02:06 | Production: **17** auth users, **9** profiles; `[redacted-email]` no longer exists. |
| 18:06:07 | Backfill created missing profiles (owner ran `v1_5_backfill_profiles.sql`). |

Findings, by source:

1. **Android app** — *consistent with the evidence.* The deletion went through the
   app's endpoint with the app's exact confirmation body; the only client that
   sends it is Settings → Delete Account, which requires typing `DELETE`. The
   account shown on the emulator (`[redacted-email]`) is the one that disappeared.
   **No `adb input text` command was ever sent** (transcript), so the text field
   could not have been filled by the assistant's automation. The emulator was
   started with a normal, interactive desktop window, and between 17:28:43 and
   17:34:51 an account was created and the emulator's session changed while
   the automation sent no input.
2. **Backend** — *the deletion executed in the backend* (`account_deleted` event),
   but only as the handler for an authenticated request; nothing in the backend
   deletes users on its own.
3. **Supabase dashboard** — *no evidence.* A dashboard deletion leaves no
   `ops_events` row; the account and profile counts fell by exactly one while
   exactly one API deletion was recorded.
4. **Another authenticated session/device** — *cannot be excluded* without
   request logs: any client holding a valid `[redacted-email]` session could
   send the same request (web app at `spendly-iota.vercel.app`, or a direct
   API call). No evidence found for it either.
5. **Automated process** — *no evidence.* No job, trigger, test or script can
   delete accounts; the only other local Claude session on this machine ended
   at 14:16:52 UTC.
6. **Unknown** — the remaining uncertainty is *which client* sent the request.

**Most likely cause, as far as the evidence goes:** a person using an
interactive client signed in as `[redacted-email]` — most consistently the
emulator window on this computer, where that account appeared at 17:35 —
used Settings → Delete Account, typed `DELETE` and confirmed at 17:36:33.
There is no evidence of a bug, an automated deletion, or a cross-account
deletion.

**How to confirm (Supabase keeps Auth logs for a limited time — check soon):**
Supabase Dashboard → Logs → Auth, 17:25–17:40 UTC on 2026-09-14:
- `/signup` or `/token` for `[redacted-email]` between 17:28 and 17:34, and its client IP;
- `GET /user` followed by `DELETE /admin/users/<id>` at 17:36:33 (the backend's
  calls, from Render). The user id there confirms which account was deleted.

## 3. Unauthorized deletion

Not possible through the application: no or invalid token → 401; forged or
tampered token → 401; deleted user's token → 401 (Supabase re-verification on
every request). Covered by `tests/accountDeletion.test.js`.

## 4. Deleting another user

Not possible. The handler uses only `req.user.id` from the verified token.
Target ids in the body, query string or a path segment are ignored or 404.
No admin route deletes users. Tested.

## 5. Confirmation enforcement

- UI: typing `DELETE` required (button disabled, handler guard).
- Server: exact JSON `confirmation: "DELETE_MY_ACCOUNT"` required; missing,
  empty, wrong case, padded, array/object, wrong key, query string, form or
  text bodies, and malformed JSON are all rejected with 400. Tested.
- The server string is fixed and sent by the app, so the typed `DELETE` is a
  UI safeguard: a caller holding the user's valid access token can delete that
  same account without the UI (see remaining risk).

Other checks: CSRF — auth is a bearer header, not a cookie; a cookie-only
request is 401 and disallowed origins get no CORS grant (tested). Retries —
`apiFetch` retries only GET/HEAD and Settings uses a single `fetch`; a replay
after success is 401 (tested). Service-role key — only in `backend/.env`
(git-ignored, never in git history) and Render; built web, admin and APK
bundles contain only the public anon key.

## 6–8. Changes and tests

- No application code changed (no vulnerability found).
- Added `backend/tests/accountDeletion.test.js` (8 regression tests).
- Backend 170/170, frontend 8/8, database 35/35, lint clean.

## 9. Remaining risk

- **No re-authentication for deletion.** Anyone who obtains a user's access
  token (e.g. an unlocked phone, XSS on the web app) can delete that account in
  one request. Consider requiring a fresh sign-in or an emailed code.
- **No forensic trail.** Deletions record only a timestamp. A minimal audit
  record (hashed user id, request IP/user-agent class) would have answered this
  question directly; decide against privacy requirements.
- **Suspended users cannot delete their own account** (`protect` returns 403),
  which may conflict with deletion-request obligations; they must email support.
- Deleting an account deletes groups that user created, including other
  members' shared entries (documented, by design).
