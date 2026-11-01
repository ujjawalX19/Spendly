# Play policy compliance

A passing build does not show compliance, and approval is Google's decision. Source read 1 Nov 2026: [Use of SMS or Call Log permission groups](https://support.google.com/googleplay/android-developer/answer/10208820). It lists "SMS-based money management" (apps that track and manage budget) as an exception for `READ_SMS` and `RECEIVE_SMS`, subject to Play review. It also says the form must be resubmitted if the way the permissions are used changes. The page announces a change effective 27 Jan 2027 about `READ_CALL_LOG` for account verification; Vittova doesn't request call-log access.

## Merged release manifest (`release-final/vc34/merged-manifest.xml`)

`INTERNET`, `RECEIVE_SMS`, `READ_SMS`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `com.android.vending.BILLING`, `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, `ACCESS_NETWORK_STATE`.

Exported: `MainActivity`, `PaymentNotificationListener`, `SmsPaymentReceiver`, `HomeWidgetProvider` (new), Google's `RevocationBoundService`, `ProfileInstallReceiver`. No `SEND_SMS`, no call-log, no new sensitive permission.

## Findings

| Area | Finding | State |
|---|---|---|
| SMS use | Same as approved vc33: business senders, debit alerts, new messages only | Code reviewed; behaviour not shown on a device |
| Disclosure | **Changed:** onboarding asks only people who pick "track". Others see the same disclosure in the access sheet before any request | Owner to review |
| Core-function risk | SMS must stay core functionality. Making it optional in onboarding, and adding many features, could weaken that argument. Keep it first in the listing | Risk |
| Declaration | Use is unchanged, so it may not need resubmitting, but the flow changed. Check the form against the new flow | Owner |
| Reviewer access | Reviewer needs a working login and the sample-message demo. The password was shared in chat and should be changed; update App access at the same time. Don't leave a weak password | **Owner, blocker** |
| Payments | Play build sells through Play Billing only; Razorpay wording hidden in-app. Razorpay code and text are still in the bundle but unreachable in that build | Fixed, confirm on device |
| Google sign-in | vc34 signed with the upload key `3B:AE…8D:46`, Play re-signs. Worked on 1.1.3 in telemetry | **Test on Play-delivered vc34** |
| Data safety | Must add user-entered financial info: income, budgets, purchase decisions, savings records; group members see split items | **Owner, blocker** |
| Privacy Policy | Updated on this branch, not live. Must be live before the upload | **Owner approval** |
| Widget | Amount hidden by default, cleared at sign-out | Confirm on device |
| Alerts | Off until chosen; no amounts. Bill and goal names you entered can show on the lock screen | Accepted, owner to confirm |
| Lint | Release lint passes with 6 errors filtered by the existing `lint-baseline.xml`. Those were not re-examined | **Review** |
