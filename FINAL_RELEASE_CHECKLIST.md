# Final release checklist

## Decision: NO-GO

There is no real-device evidence, no staging run, and no check of Play Console pricing. A signed candidate exists for testing, not for upload.

## Release candidate

| Item | Value |
|---|---|
| File | `D:\paisa-buddy\release-final\vc34\Vittova-1.2.0-vc34.aab` (git-ignored) |
| SHA-256 | `d0b97753403337e461960c4df98f37c9457e68704ad853b88741a516be724344` |
| Package | `com.vittova.app` |
| Version | versionCode 34, versionName 1.2.0 |
| Commit | `9e21020` |
| Signature | `jar verified`; upload key SHA-1 `3B:AE:EA:F4:06:E1:17:8C:2A:8B:81:C5:8B:75:39:8A:39:7F:8D:46` |
| Merged manifest | `release-final\vc34\merged-manifest.xml` |
| Current Play version | vc33 per your report and telemetry; **not read from Play Console** |
| AAB launched | **No.** Only a signed APK from the same commit |

## Test counts at this commit

Server 562/562 (last run before the final client-only and test-only changes; those don't touch the server), website 205/205, database 120/120, Android release unit tests and lint pass (6 lint errors in the baseline). All automated.

## Blockers

- [ ] Physical phone test plan (REAL_DEVICE_TEST_REPORT.md), especially tests 13–15
- [ ] AAB installed and launched
- [ ] Staging environment created and migrations run
- [ ] Verified, test-restored production backup
- [ ] `vittova_pro`, `launch-199`, ₹199 and ₹449 confirmed in Play Console
- [ ] Licence-tester purchase, cancel, restore and expiry
- [ ] Privacy Policy approved and live
- [ ] Data safety form updated
- [ ] SMS declaration reviewed against the new flow
- [ ] Reviewer login working, weak password replaced, App access updated
- [ ] Google sign-in on a Play-delivered vc34
- [ ] Launch time measured on a phone
- [ ] Lint baseline errors reviewed
- [ ] Refund terms approved; Razorpay test payment made

## Order, when approved

1. Backup → 2. migrations → 3. server and website deploy (flags off) → 4. internal-track upload → 5. phone tests → 6. flags on → 7. production rollout.
