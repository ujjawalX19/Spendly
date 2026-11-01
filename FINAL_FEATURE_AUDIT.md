# Final feature audit (1 Nov 2026)

Branch `feat/vittova-2`. Release-candidate code commit `9e21020`, based on `main` `f367204`. Working tree was clean before the reports were added; nothing is uncommitted. Not merged, not deployed.

**Change size:** the brief mentions a 45-file change. The branch actually differs from `main` by **155 files (+12,202 / -795)**, because it also contains vc33, rewards, the audit fixes and Razorpay. The extra commits are listed by `git log origin/main..feat/vittova-2`.

## Status key

- **Code + tests:** written, automated tests pass.
- **Browser:** tried signed in, on the real server code with a fake local database.
- **Phone:** tried on a physical phone. **Nothing has this status yet.**

| Feature | Evidence | Status |
|---|---|---|
| Widget | 3 unit tests; receiver registered on emulator | Never placed on a home screen |
| Can I Afford decisions | Tests; browser: skipped purchase reached Money-Saved | Phone owed |
| Month Calendar | Tests; browser | Phone owed |
| Money-Saved | Tests; browser, empty state and ledger total | Phone owed |
| Money Wrapped | Tests; browser, "not enough data" state only | Full summary not seen |
| Split from Receipt | Tests; browser, typed items | Photo scan never run (no Gemini locally) |
| Category budgets | Tests; browser, list view | Setting a limit not clicked through |
| Income | Tests; browser, list view | Add form not clicked through |
| CSV and PDF reports | Tests (PDF header checked) | PDF never opened; Android share never run |
| Money alerts | Logic tests | **Never delivered on any device** |
| Subcategories | Tests; browser, add | Edit form not clicked through |
| Duplicate warning | Tests; browser, warn then "Add anyway" | Phone owed |
| Bank SMS controls | Existing unit tests; code shows both switches checked | **Emulator test inconclusive** |
| Pro purchase and restore | Server tests with a fake Google | **Not tested on this build** |
| Razorpay | Server tests with a fake Razorpay | **No real payment made** |
| Google sign-in | Production telemetry on 1.1.3 only | Not tested on vc34 |

## Defects fixed in this pass

1. In-app Terms and Privacy in the Play build described paying by Razorpay. Now hidden in that build.
2. Home choices and the widget amount setting survived sign-out. Now cleared.
3. Privacy Policy did not cover income, decisions, savings, receipt splits, alerts or the widget. Added, **pending owner approval**.
4. `v1_15`–`v1_18` had no rollback. Added and tested.

## Known gaps

No group notifications (no push service). Income is not on Home or in Vittova AI. Calendar omits expected subscription renewals. Alerts run on app open only.
