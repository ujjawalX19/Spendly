# Final release checklist

## Decision: NO-GO

There is no real-device evidence, no staging run, and no check of Play Console pricing. A signed candidate exists for testing, not for upload.

## Release candidate

| Item | Value |
|---|---|
| File | `D:\paisa-buddy\release-final\vc34\Vittova-1.2.0-vc34.aab` (git-ignored) |
| SHA-256 | `c3d28ed107e8068aabda76cbc34b5f9bf7b12cc32360ea0b35f53bbe51a5c774` (polished build, 2 Nov; the 1 Nov build is kept as `superseded-first-build-…aab` and must not be uploaded) |
| Package | `com.vittova.app` |
| Version | versionCode 34, versionName 1.2.0 |
| Commit | The polish commit after `e8d2639` (see `git log`) |
| Contents checked | No test-server address, production API present, no cleartext setting in the manifest |
| Signature | `jar verified`; upload key SHA-1 `3B:AE:EA:F4:06:E1:17:8C:2A:8B:81:C5:8B:75:39:8A:39:7F:8D:46` |
| Merged manifest | `release-final\vc34\merged-manifest.xml` |
| Current Play version | vc33 per your report and telemetry; **not read from Play Console** |
| AAB launched | **No.** A signed APK from the same build launched on the emulator to sign-in, with 0 crashes |

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
- [x] Lint baseline errors reviewed: the 6 are in the Capacitor library's own baseline, not Vittova code
- [x] Bank SMS on, person sender, SMS off, permission revoked: passed on the emulator (phone still owed)
- [x] Alerts re-armed after reboot: passed on the emulator
- [ ] Parser: read the amount in "Rs.X debited from a/c … to …" bank wording
- [ ] Refund terms approved; Razorpay test payment made

## Order, when approved

1. Backup → 2. migrations → 3. server and website deploy (flags off) → 4. internal-track upload → 5. phone tests → 6. flags on → 7. production rollout.
