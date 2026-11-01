# Real-device test report

**Result: NOT PERFORMED. No physical Android device was connected (`adb devices` listed none).** An emulator is not a substitute, and nothing below counts as real-device verification.

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
