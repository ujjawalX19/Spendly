# UI and usability audit

**This is not yet a full screen-by-screen review.** Shared design tokens don't show that every screen is polished, and many screens were only machine-checked, not looked at.

## Coverage

- **Looked at, mobile, dark:** Home, Budgets, Reports, Month Calendar, Money Wrapped (not enough data), Money-Saved (empty), Money alerts (web), Pro, Groups, Group detail, onboarding goal, sign-in (release build on emulator).
- **Looked at, light:** Terms, Reports.
- **Machine-checked only:** Activity, Ask Vittova, Wealth, Profile, Recurring charges, Import, Subscription audit, Challenges, Save-to-Earn, Rewards, Recap, Goals, Privacy.
- **Not reviewed:** Owner Console, Delete Account visuals, sign-up, password flows, age gate, tablet and desktop for the new screens.

## Findings (not fixed)

| # | Severity | Finding |
|---|---|---|
| 1 | High | Sign-in took 12–37 s to appear on the emulator. If a phone is anywhere near this, it fails the 60-second goal. Measure first |
| 2 | Medium | New screens have no back button on mobile; only the bottom bar leaves them |
| 3 | Medium | Profile → Tools is now a long list of unlike things. Needs grouping |
| 4 | Medium | While rate-limited, Reports shows a loading block with no message for many seconds |
| 5 | Medium | Home is long; the most useful content needs scrolling past the checklist |
| 6 | Low | Pages load their data twice on start: two identical requests were seen on a clean load of Reports |
| 7 | Low | Pro page says "Planned for Pro" when purchases are off, even for a Pro user |
| 8 | Low | Money alerts are checked on app open, which a user may not expect |
| 9 | Low | The app offers no way to reach Wrapped or Money-Saved from Home |
| 10 | Unresolved | During testing, repeated requests were seen once; clean loads of 9 s and 14 s showed none. Watch for this on a phone |

Dead-button check: not completed across all screens. Only the flows named in FINAL_FEATURE_AUDIT.md were clicked.

No design changes were made in this pass, as you asked.
