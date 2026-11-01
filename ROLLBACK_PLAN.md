# Rollback plan

Untested on real infrastructure. Use the least destructive step that solves the problem.

| Problem | Action | Data lost |
|---|---|---|
| ₹199 offer wrong | `LIMITED_OFFER_ENABLED=false` on Render | None |
| Razorpay wrong | `RAZORPAY_ENABLED=false` | None |
| Rewards wrong | `REWARDS_ENABLED=false` | None |
| Website or server bad | Redeploy `f367204`, the current `main` | None; new tables stay unused |
| vc34 bad on Play | Halt the staged rollout. Google Play can't downgrade people already updated, so fix forward with vc35. Use a staged rollout from the start | None |
| Widget or alerts bad | No server switch exists; needs a new app build. Users can remove the widget or turn alerts off | None |
| Migration failed partway | All re-runnable: fix and re-run | None |
| Migration must be removed | Run the `_rollback.sql` for it, newest first (v1_18 → v1_14), after exporting the tables | **Yes**, see below |
| Corruption | Restore the verified backup | Writes since the backup |

**Rollback scripts delete data:** rewards and goals (v1_14), Razorpay payment records (v1_15; keep for accounting), budgets and income (v1_16), decisions, savings and split records (v1_17), subcategory labels (v1_18).

**Limits:** vc34 expects the new server. vc33 keeps working with the new server by design, but this has not been run end to end. There are no individual off switches for the newer features, because the plan's rollback flags weren't built.
