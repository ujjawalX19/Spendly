> **SUPERSEDED (2026-09-13).** This document predates the P0 security and product work and contains claims that are no longer accurate. Use `LAUNCH_TODO.md`, `TEST_REPORT.md` and `RELEASE.md` instead.

# Applying the launch work to your local repo, then pushing

The seven commits were built in a cloud clone. That clone cannot push: the git
proxy refuses to issue a credential for `ujjawalX19/Spendly` because it is not
in this session's authorized repository set. Your own machine can push
normally — this file is how you get the history there.

**The file contents are already on your disk.** Every changed file was written
into `D:\paisa-buddy` directly. What is missing locally is only the *commit
history*; `git status` will currently show all of it as uncommitted changes on
top of `f0e3bea`.

Pick one of the two options below.

---

## Option A — keep the seven separate commits (recommended)

`spendly-launch-work.bundle` contains them. It applies cleanly on top of
`f0e3bea`, which is exactly where your local `main` is.

```powershell
cd D:\paisa-buddy

# 1. Safety net. Your working tree currently holds the same content as the
#    bundle tip, so this stash is a throwaway — but take it anyway.
git stash push -u -m "pre-bundle safety net"

# 2. Confirm you are at the bundle's base commit.
git rev-parse HEAD        # must print f0e3bea9a960385b15ad17f123f9bcc1628e550f

# 3. Bring the commits in.
git bundle verify spendly-launch-work.bundle
git fetch spendly-launch-work.bundle main:claude-launch

# 4. Fast-forward main onto them.
git merge --ff-only claude-launch

# 5. Check it looks right, then push.
git log --oneline -8
git push origin main

# 6. Clean up.
git branch -d claude-launch
git stash drop            # only after you have confirmed the tree looks right
del spendly-launch-work.bundle
```

If step 4 refuses with "local changes would be overwritten", step 1 did not
take everything — run `git status`, and stash or commit whatever it lists.

## Option B — one squashed commit

Simpler, loses the separation between the security fixes, the timezone fix, the
parser rewrite and the docs.

```powershell
cd D:\paisa-buddy
git add -A
git commit -m "feat: launch hardening - security, timezone, UPI parser, docs"
git push origin main
```

---

## Three deletions you must make by hand

The file bridge can write files but cannot delete them, so these are still on
your disk and need removing. Option A's bundle deletes them in git, which will
leave your working tree clean afterwards — but if you take Option B, delete
them first:

```powershell
del frontend\public\vite.svg
del frontend\src\assets\react.svg
del frontend\src\components\ProtectedRoute.jsx
```

`ProtectedRoute.jsx` matters: it reads a `token` value the auth context never
provides, so anything importing it would redirect every user to `/login`.
Nothing imports it today — `App.jsx` has its own — but leave it there and
someone will.

The two SVGs are default Vite/React placeholder artwork.

---

## Before the first `npm run dev` after this

```powershell
cd frontend
npm install        # @capacitor/browser was added for the OAuth fix
npx cap sync android
```

Without `npm install`, the app will fail to start — `AuthContext.jsx` now
imports `@capacitor/browser`. Without `cap sync`, the Android project will not
pick up the new plugin.

---

## Then, in order

1. Run `supabase/v1_1_launch_hardening.sql` in the Supabase SQL Editor, and its
   two verification queries. **Do this before deploying the backend** — the
   reporting endpoints now query `expenses.occurred_at`, which that migration
   creates.
2. Add `spendly://login-callback` to Supabase → Authentication → URL
   Configuration → Redirect URLs.
3. `cd backend && npm test` — expect 33 passing.
4. `cd frontend/android && .\gradlew testDebugUnitTest` — expect the 32
   parser tests passing under real JUnit.
5. `RELEASE.md` for the keystore and the AAB.
6. `DEVICE_TEST_CHECKLIST.md` on a real phone.

---

## Recovering your overwritten parser

`frontend/android/app/src/main/java/com/spendly/app/PaymentNotificationParser.java`
was overwritten by this session. It was untracked, so git has no copy of the
previous version.

In Android Studio: right-click the file → **Local History** → **Show History**.
The version from the previous session should be there. Worth diffing against
what is now in place before you discard it.
