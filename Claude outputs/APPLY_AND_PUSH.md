> **SUPERSEDED (2026-09-13).** This document predates the P0 security and product work and contains claims that are no longer accurate. Use `LAUNCH_TODO.md`, `TEST_REPORT.md` and `RELEASE.md` instead.

# Landing the launch work and pushing — CORRECTED

**The previous version of this file was wrong.** It assumed your local `main`
was at `f0e3bea`, matching `origin/main`. It is not: your local `main` is at
**`f5d9b9b`**, a commit that exists only on your machine and that this session
has never seen.

That changes the answer. `git merge --ff-only` would have refused, because
`f5d9b9b` and the bundle's tip are two different descendants of `f0e3bea` —
divergent, not fast-forward. If you had forced past it, you would have lost
`f5d9b9b`. Use Option B below instead; the bundle is now a backup, not the
main path.

---

## Current state, as observed

| Thing | State |
|---|---|
| `origin/main` on GitHub | `f0e3bea` — unchanged, nothing pushed |
| Your local `main` | `f5d9b9b` — one or more local commits, never pushed, ~11 days old |
| Working tree | Holds all 58 changed files this session wrote |
| `frontend/src/components/ProtectedRoute.jsx` | Still present — needs deleting |
| `frontend/public/vite.svg`, `src/assets/react.svg` | Still present — need deleting |
| `node_modules/@capacitor/browser` | **Not installed** — `npm install` has not run |
| `spendly-launch-work.bundle` | Still in the repo root |

Nothing here is a problem. It just means the steps below have not run yet.

---

## Do this

### 1. See what your local commit actually contains

Worth two minutes before anything else, because this session never saw it:

```powershell
cd D:\paisa-buddy
git log --oneline origin/main..HEAD     # what f5d9b9b adds on top of f0e3bea
git show --stat f5d9b9b
```

If `f5d9b9b` is the previous session's work-in-progress, its content is
already superseded by what is in your working tree now — the file contents
written this session were built on top of exactly that state. Keeping the
commit in history is still correct; it is your record of how you got here.

### 2. Remove the three dead files

The file bridge can write but not delete, so these are still on disk:

```powershell
del frontend\src\components\ProtectedRoute.jsx
del frontend\public\vite.svg
del frontend\src\assets\react.svg
```

`ProtectedRoute.jsx` is the one that matters: it reads a `token` value the
auth context never provides, so anything importing it would redirect every
user to `/login`. Nothing imports it today — `App.jsx` defines its own — but
leaving it there is an accident waiting to happen.

### 3. Install the new dependency

```powershell
cd frontend
npm install
npx cap sync android
cd ..
```

`AuthContext.jsx` now imports `@capacitor/browser` for the Custom Tab OAuth
fix. Until `npm install` runs, the app will not start. Until `cap sync` runs,
the Android project will not know about the plugin.

### 4. Commit and push

```powershell
cd D:\paisa-buddy
git add -A
git status                # read this before committing
git commit -m "feat: launch hardening - security, timezone, UPI parser, docs

Closes three group-route authorization holes, corrects all calendar math
to run in IST rather than the server's UTC clock, rewrites UPI
notification parsing with classification and deduplication, adds expense
editing, transaction dates, search/filter and CSV export, and hardens the
Android release configuration."
git push origin main
```

Check `git status` output before committing. Nothing matching `.env`,
`.jks`, `keystore.properties` or `google-services.json` should appear —
`.gitignore` now covers all of them, but look anyway.

### 5. Clean up

```powershell
del spendly-launch-work.bundle
del APPLY_AND_PUSH.md
```

---

## If you would rather keep the seven separate commits

The bundle still works, but it needs a rebase rather than a fast-forward,
because of the divergence described at the top:

```powershell
git stash push -u -m "safety net"
git fetch spendly-launch-work.bundle main:claude-launch
git rebase --onto main f0e3bea claude-launch
```

Expect conflicts: the bundle's first commit (`2152e23`, a checkpoint of the
uncommitted working-tree state) very likely overlaps with whatever `f5d9b9b`
already committed. Resolving them is real work for little gain — the commit
messages are the only thing you lose by taking Option B, and they are all
reproduced in `FINAL_LAUNCH_REPORT.md`.

If the rebase goes wrong: `git rebase --abort`, then `git stash pop`, and you
are back where you started.

---

## Then, in order

1. Run `supabase/v1_1_launch_hardening.sql` in the Supabase SQL Editor, plus
   its two verification queries. **Before deploying the backend** — the
   reporting endpoints now query `expenses.occurred_at`, which that migration
   creates. Deploy the code first and every report returns an error.
2. Add `spendly://login-callback` to Supabase → Authentication → URL
   Configuration → Redirect URLs.
3. `cd backend && npm test` — expect 33 passing.
4. `cd frontend\android && .\gradlew testDebugUnitTest` — expect 32 parser
   tests passing under real JUnit.
5. `RELEASE.md` for the keystore and the AAB.
6. `DEVICE_TEST_CHECKLIST.md` on a real phone.

---

## Recovering your overwritten parser

`frontend/android/app/src/main/java/com/spendly/app/PaymentNotificationParser.java`
was overwritten by this session. It was untracked, so git has no copy.

Android Studio: right-click the file → **Local History** → **Show History**.
Diff the previous session's version against what is there now before you
discard it.
