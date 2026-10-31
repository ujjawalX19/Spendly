# Final AAB build report: vc33 / 1.1.3 (23 Oct 2026)

| Item | Value |
|---|---|
| AAB | `D:\paisa-buddy\release-final\vc33\Vittova-1.1.3-vc33.aab` |
| AAB SHA-256 | `5f516aba24ae09306fe3e9769ac25858e8b5cf6e825d9c06451032dd5473deee` |
| APK (sideload testing only, not for Play) | `Vittova-1.1.3-vc33.apk`, SHA-256 `95b3f118d6579dc35ad328d89a68e31577ec3f8c86c61c2900380a6bbb67c073` |
| Package | `com.vittova.app` |
| versionCode / versionName | 33 / 1.1.3 |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |
| Variant | release (minified, not debuggable) |
| Signing | existing upload key, SHA-1 `3B:AE:EA:F4:06:E1:17:8C:2A:8B:81:C5:8B:75:39:8A:39:7F:8D:46`. `jarsigner -verify`: jar verified. APK: `apksigner verify` OK. No new key was made |
| Source | branch `fix/play-review-vc33` (local), from `main` @ `72763d1` |
| Permissions | INTERNET, RECEIVE_SMS, READ_SMS, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, BILLING, ACCESS_NETWORK_STATE, the app's own receiver permission. Identical to vc32 |
| Bundle contents | the sample preview strings are present in the web bundle. No Owner Console (`vittova-ops`), no `.env` and no service key in the assets. The secret-scan test passes on the website build |

## Why versionCode 33

Uploaded so far: up to vc29 (closed testing). vc30–vc32 were built but never uploaded. 33 is above every code built, so it can't clash. If Play Console shows a code ≥ 33 already in use, rebuild with the next number.

## Changes since vc32

| File | Change | Why |
|---|---|---|
| `SmsIntake.java` | `SAMPLES` and `preview()`: the real sender filter and parser, without queuing | lets a reviewer verify the declared SMS feature without a bank SMS (rejection R2) |
| `UpiNotificationPlugin.java` | `previewSampleSms` method | bridge to the screen |
| `SmsAccessSheet.jsx` | "See how it works (sample messages)" on every state of the sheet | the reviewer and user path |
| `Settings.jsx` | "How bank SMS tracking works" row once SMS is granted | without it, the sheet was unreachable after granting |
| `paymentTracking.js`, `UpiNotification.js` | sample labels, bridge docs | |
| `build.gradle` | 33 / 1.1.3 | new upload |
| tests | `SmsSamplePreviewTest.java`, `paymentTracking.test.js` | regression |
