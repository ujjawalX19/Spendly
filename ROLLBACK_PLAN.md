# Rollback plan

| Component | Change in this release | How to roll back | Data impact |
|---|---|---|---|
| Android app (vc32) | New build on Play | Play Console → Production → **Halt rollout** (staged rollout keeps the previous version for everyone not yet updated). A Play build cannot be "downgraded" for users who already installed it; ship a fixed vc33 instead | None |
| Backend (Render) | Deploy of `release/vc31` | Render → service → **Rollback** to the deploy of commit `8c8731e` (or redeploy that commit) | None: no migration in this release |
| Website (Vercel) | Unchanged by this release (already `main` @ `e024cad`) | Vercel → Deployments → promote the previous deployment (previous good: `4cd51a7`) | None |
| Database | No migration | — | — |
| Force update | Not used | `MIN_SUPPORTED_ANDROID_VERSION_CODE` stays 0; never raise it as part of a rollback | — |
| Google sign-in config (A1) | Android OAuth clients in Google Cloud | Deleting a newly added client restores the previous state; never delete the Web client | Users mid-sign-in retry |

Owner: you (Render, Vercel, Google Cloud); Milan (Play Console).
Signals to watch after release: Owner Console Errors and System Health, `/api/health` version, `login_failed` events by code, Android vitals (crash and ANR rates) in Play Console.
