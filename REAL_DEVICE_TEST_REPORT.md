# Real-device test report

**Result: NOT PERFORMED on a physical phone.** The owner's vivo V2146 was plugged in on 2 Nov, but Windows listed it as not connected and `adb` never saw it, over USB or Wi-Fi. An emulator is not a substitute, and nothing below counts as real-device verification.

## Emulator run, 2 Nov 2026 (Pixel_7, Android 16, software rendering)

A debug copy of the same code was pointed at a local test server (real server code, in-memory database, test accounts) and signed in. The temporary test settings were deleted before the release build.

| Test | Evidence | Result |
|---|---|---|
| Bank SMS, tracking on, bank sender | Pipeline log: received, sender allowed, parsed, saved on phone, queued. After the in-app review, 1 expense on the server: ₹150, source `upi_auto` | **Pass**, with a finding below |
| SMS from a person (phone number) | Log: `SMS_SENDER_SKIPPED`; 0 expenses | **Pass** |
| Bank SMS switched off in the app | Log: `TRACKING_OFF`; 0 expenses | **Pass** |
| SMS permission revoked in Android | No message reached the app; 0 expenses | **Pass** |
| Widget data | `vittova_home_widget.xml` holds today's date and amount, `showAmount=false` | **Pass**. Widget never placed on a home screen |
| Alerts scheduled | Weekly summary (Sunday 6 pm) and "Rent is due tomorrow" in the alert list; alarms registered. No budget alert was due | **Pass** for scheduling. **No alert was seen being delivered** |
| Alerts after reboot, app not opened | 8 alarms before; 0 right after boot; boot receiver started; 6 alarms after about 100 s | **Pass**. Android delivered the boot signal late |
| Polished signed release APK | Installs as vc34 / 1.2.0; reaches sign-in; 0 crashes | **Pass**, but about 75 s on a freshly booted software emulator |

**Finding, payment reading:** for "Rs.150.00 debited from a/c XX1234 to ALPHASHOP …" the app read the payee and bank but **not the amount**. It asked the user to check before saving instead of guessing, which is the intended safety behaviour. This bank wording therefore doesn't add itself automatically. The parser is the one already in the live app, so this is not new on this branch. Worth adding this wording to the parser and its tests.

**Not covered:** placing the widget, seeing an alert notification arrive, CSV/PDF share on Android, a real receipt photo, Pro purchases, Google sign-in, large fonts, TalkBack. Android killed the test app once while it updated its WebView component; there was no crash.

## Earlier attempts, 1 Nov

## What ran on the Pixel_7 emulator

| Check | Build | Result |
|---|---|---|
| Install, versionCode 34, 1.2.0 | Signed release APK, same commit as the AAB | Pass |
| Launch to sign-in screen | Same | Pass, but about 12–37 s on a software-rendered emulator. **Measure on a phone** |
| Crash on launch | Same | None seen in log |
| Widget receiver registered | Same | Pass; widget never placed |
| Install from the AAB itself | AAB | **Not done**: bundletool would not run from the Gradle cache |
| Bank SMS capture, person sender, revoked permission | Debug | **Inconclusive**: no queue file appeared even for the bank message, so delivery could not be told apart from rejection. Not a pass |

Chrome showed "keeps stopping" on the emulator before the app was installed. The app was not involved; the emulator is under-resourced.

Earlier note: the project's own build notes record a broken AAB that passed every automated test. **The AAB must be installed and launched before upload.**

## Why signed-in phone testing also needs a server

vc34 points at the production server, which has none of the new routes and tables. Testing on a phone needs a staging server and database (see DATABASE_MIGRATION_AUDIT.md), or an approved production deploy.

## Test plan for the phone (all owed)

| # | Test | Pass means |
|---|---|---|
| 1 | Google sign-in, email sign-in | Reaches Home |
| 2 | Add widget; amount off, then on; sign out | Hidden, shown, cleared |
| 3 | Next day, no app open | No figure shown as today's |
| 4 | Afford-It, each decision | Only Skipped reaches Money-Saved |
| 5 | Calendar free and Pro | Free sees explanation; Pro sees month |
| 6 | Wrapped with 5+ expenses; share | Shared text has counts only |
| 7 | Receipt photo split | Shares add up; nothing saved before confirm |
| 8 | Budgets, income, subcategory, duplicate | Saved and shown correctly |
| 9 | CSV and PDF on Android | File opens, figures match |
| 10 | Deny, then allow notifications | No crash; app explains the state |
| 11 | Each alert type, reboot before it fires | Delivered once, survives reboot |
| 12 | Allow SMS; real bank debit | Expense captured once |
| 13 | **Bank SMS off, then real debit** | **Nothing captured** |
| 14 | **Payment tracking off, then real debit** | **Nothing captured** |
| 15 | **Revoke SMS in Android, then real debit** | **Nothing captured** |
| 16 | Message from a person containing "debited" | Ignored |
| 17 | Licence-tester purchase, cancel, restore, expiry | Pro follows Google's state |
| 18 | 320 dp screen, largest font, TalkBack, offline | Usable, nothing clipped |

Do not insert transactions by hand to pass 12–16.
