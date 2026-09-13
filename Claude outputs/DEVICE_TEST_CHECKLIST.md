# Spendly — Manual Device Test Checklist

Nothing in this file was verified by automation. Every item needs a physical
Android phone; the emulator cannot exercise UPI notifications, Play Billing, or
real Google sign-in.

**Before you start**

1. Run `supabase/v1_1_launch_hardening.sql` in the Supabase SQL Editor, then
   its verification queries. The backend will error on every reporting endpoint
   until this is done.
2. Add `spendly://login-callback` to Supabase → Authentication → URL
   Configuration → **Redirect URLs**. Without it, Google sign-in falls back to
   the project's Site URL and dumps the user on the website — the exact bug
   this release set out to fix.
3. Build and install: `cd frontend && npm run build && npx cap sync android`
   then `cd android && ./gradlew assembleRelease` (or install the AAB via
   internal testing).

Record the device, Android version, and build number with your results.

Device: ______________  Android: ______  Build: ______  Date: __________

---

## 1. Install

- [ ] App installs without a Play Protect warning
- [ ] Launcher icon is Spendly branding, not the Capacitor default
- [ ] App name reads "Spendly"

## 2. First launch

- [ ] Splash screen appears and dismisses cleanly
- [ ] No white/blank screen at any point
- [ ] Lands on the login screen, **not** the marketing landing page
- [ ] Status bar and notch are not overlapped by content

## 3. Signup (email)

- [ ] Weak password is rejected with a readable message
- [ ] Signing up with an existing email gives a clear message, not a raw error
- [ ] Confirmation email arrives
- [ ] Clicking the link, then logging in, succeeds
- [ ] A profile row is created (check `profiles` in Supabase)

## 4. Login (email)

- [ ] Correct credentials log in
- [ ] Wrong password shows a human message, not "AuthApiError"
- [ ] Airplane mode → login shows the offline message, not a spinner forever

## 5. Google login — the critical one

- [ ] Tapping "Continue with Google" opens a **Chrome Custom Tab**, not a full
      browser app, and **not** the app's own WebView
- [ ] The Spendly app is still visible behind/underneath
- [ ] After choosing an account, the Custom Tab closes **by itself**
- [ ] You land on the dashboard **inside the app**
- [ ] At no point does the Spendly website appear
- [ ] Pressing back / dismissing the Custom Tab mid-flow returns to the login
      screen with "Google sign-in was cancelled" — no hang, no blank screen
- [ ] Force-quit during the consent screen, then complete it: the app reopens
      via the deep link and still signs in (cold-start path)

## 6. Dashboard

- [ ] Loads within ~3 seconds on a mid-range phone
- [ ] Spending figure matches the sum of this month's expenses
- [ ] Safe-to-Spend shows a number and its assumptions
- [ ] Charts render and are readable at 360 dp width
- [ ] Empty state (new account) is helpful, not a blank page

## 7. Add expense

- [ ] Amount, category and description save
- [ ] The new expense appears immediately
- [ ] Round-up (chillar) is credited
- [ ] Streak increments
- [ ] Zero and negative amounts are rejected
- [ ] A 200-character description is accepted; longer is rejected cleanly

## 8. Edit expense

- [ ] `PATCH /api/expenses/:id` works (API verified; **no UI yet** — see
      LAUNCH_TODO #22). Test with curl if you want coverage before the UI lands.

## 9. Delete expense

- [ ] Deletion removes the row and updates the totals
- [ ] Deleting twice returns "not found" rather than a false success

## 10. UPI notification — single payment

- [ ] Grant Notification Access when prompted; the banner disappears after
      returning to the app
- [ ] Make a real ₹1–10 UPI payment
- [ ] A toast appears showing the correct amount and payee
- [ ] "Log it" creates exactly one expense with the right amount

## 11. UPI notification — the cases that used to break

- [ ] **Receive** money → toast says "Money received", and confirming does
      **not** create an expense
- [ ] **Failed** payment → no toast at all
- [ ] **Payment request** from a contact → no toast
- [ ] A promotional notification from GPay/Paytm mentioning ₹ → no toast
- [ ] A **bank** notification for the same payment → the payment is recorded
      **once**, not twice
- [ ] Lock the phone and pay: the toast appears when you next open the app,
      and still only once
- [ ] Force-quit the app, pay, reopen → no duplicate of an already-logged payment

## 12. AI coach

- [ ] A question returns a useful answer referencing the user's own figures
- [ ] Free tier stops at 10 messages/day with an upgrade prompt, not an error
- [ ] Chat history survives leaving and returning to the screen

## 13. Pro

- [ ] The Pro screen lists what is included
- [ ] Attempting to purchase shows "Purchases are not available…" (expected —
      billing is not configured, and the server deliberately refuses)
- [ ] No part of the UI claims the user is Pro when they are not
- [ ] Editing `localStorage` to fake Pro does **not** unlock server-gated
      features (try it — this should fail)

## 14. Logout

- [ ] Returns to login
- [ ] Back button does not return to the dashboard
- [ ] Reopening the app requires signing in again

## 15. Restart / session restore

- [ ] Force-quit and reopen while logged in → straight to the dashboard, no
      re-login
- [ ] Reboot the phone → still logged in
- [ ] Leave the app for 2+ hours → the token refreshes silently

## 16. Offline

- [ ] Airplane mode → a clear offline message, not a spinner or raw error
- [ ] Cached figures are either shown as cached or not shown — never presented
      as current
- [ ] Reconnecting recovers without a restart
- [ ] Adding an expense offline fails with a message that says the expense was
      **not** saved

## 17. Notification permission

- [ ] Denying Notification Access leaves the rest of the app fully usable
- [ ] The banner explains *why* the permission is wanted before asking
- [ ] Revoking it in Android settings updates the app on next resume

## 18. Account deletion

- [ ] Settings → Account → Delete Account requires explicit confirmation
- [ ] After deletion, the user is signed out
- [ ] The `profiles` row and all expenses are gone (check Supabase)
- [ ] The old credentials no longer log in
- [ ] Signing up again with the same email works

## 19. Data export

- [ ] Settings → Your Data → Export my expenses downloads a CSV
- [ ] The file opens in Excel/Sheets with readable ₹ amounts and dates
- [ ] Descriptions containing commas and quotes are intact
- [ ] Dates are IST, matching what the app displays

## 20. App update

- [ ] Install the previous version, log in, add data
- [ ] Install this version over it
- [ ] Session survives; data intact; no crash on first launch

---

## Cross-cutting

- [ ] Test on a small screen (360 × 640) — nothing clipped, no horizontal scroll
- [ ] Test in both light and dark system themes
- [ ] Rotate the device on each main screen — no crash, no lost input
- [ ] Set the system font size to largest — text still readable, buttons still tappable
- [ ] Every tappable target is at least 48 × 48 dp
- [ ] Set the device timezone to something other than IST and confirm figures
      still match what the server reports
- [ ] Set the device clock to 23:55 IST, add an expense, wait past midnight:
      the streak advances the next day, not immediately

---

## Sign-off

| Section | Pass | Fail | Notes |
|---|---|---|---|
| Install & first launch | | | |
| Email auth | | | |
| **Google auth** | | | |
| Dashboard & figures | | | |
| Expenses CRUD | | | |
| **UPI notifications** | | | |
| AI & Pro gating | | | |
| Session & offline | | | |
| Account deletion & export | | | |
| Accessibility & rotation | | | |

Do not ship with a failure in a **bold** section.
