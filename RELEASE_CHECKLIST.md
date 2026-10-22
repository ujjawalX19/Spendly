# Release checklist — vc32 (1.1.2)

Tick each box yourself. Items marked ✅ were verified in the 19 Oct audit (see PRODUCTION_AUDIT.md, BUILD_REPORT.md).

## Build (done)
- ✅ Clean build from lockfiles; all suites pass (465 / 97 / 163 / 107)
- ✅ AAB and APK signed with the upload key and verified; checksums in `release-final/vc32/SHA256SUMS.txt`
- ✅ Same permissions as the live version; no secrets or Owner Console in the bundle
- ✅ Emulator launch, no crash

## Before uploading
- [ ] **Launch blocker (22 Oct audit A1):** Google sign-in fails on Android (`native_oauth_client_mismatch`). In Google Cloud project Spendly, check Android clients 1–3 for the upload-key SHA-1 `3B:AE:EA:F4:…:8D:46`; if it's registered in another project, move it to Spendly; add Play's hybrid certificate SHA-1s (see PRODUCTION_AUDIT.md §A1)
- [ ] Confirm which version is live on Play (Play Console → Releases overview)
- [ ] On a Play-installed copy (testing track): **Continue with Google** works
- [ ] Data safety, Financial features, App access and SMS permission declarations show as approved in Play Console
- [ ] Decide on the backend deploy (recommended, see below)

## Upload (you or Milan)
- [ ] Upload `release-final/vc32/Vittova-1.1.2-vc32.aab` (not the APK, not vc31)
- [ ] "What's new": *Security and stability improvements, and small fixes.*
- [ ] Staged rollout recommended (e.g. 20%) with Android vitals watched for 24–48 h

## After it is live (on a phone)
- [ ] Update installs over the previous version; open it straight after updating
- [ ] Sign in with email and with Google; sign out; sign in as a second account
- [ ] Add, edit (change the date), delete an expense; Safe-to-Spend looks right after logging a bill payment
- [ ] SMS / payment-app capture adds a payment; debit reminder shows
- [ ] Pro screen: plans load; a licence-tester purchase grants Pro; cancel and restore

## Backend deploy (needs your go-ahead)
Deploy branch `release/vc31` (commit `6a8e9ff`) to Render. It contains the critical `proxy-addr` patch and the bill and date fixes. No database migration is needed. Check `/api/health` reports the new commit afterwards.

## Rollback
- App: halt the staged rollout in Play Console; the previous release stays live for everyone not yet updated. Raising `MIN_SUPPORTED_ANDROID_VERSION_CODE` is never needed for a rollback.
- Backend: redeploy commit `8c8731e` in Render (the current production backend).
- Website: unaffected by this release.
