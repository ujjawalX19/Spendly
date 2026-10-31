# v1.14 rewards — migration report

Files: `supabase/v1_14_rewards.sql` (apply after v1_13), `supabase/v1_14_rewards_rollback.sql`.
Status: **not applied to production.** Tested only against PGlite (real Postgres in WebAssembly) in `supabase/tests/rls.test.mjs`.

## What it adds

| Object | Purpose |
| --- | --- |
| `profiles.mission_difficulty` | `auto` (default) / `easy` / `balanced` / `advanced`. Backend-written only. |
| `money_daily_missions` | One mission per user per IST day; only today's row can change; replacements 0–2, never decreasing. |
| `money_mission_checkins` | Self-reported mission confirmations; once per user/day/mission and once per event id. |
| `money_points_ledger` | Vittova Points. Append-only, unique per (user, reason, ref_key), balance can never go below zero (per-user advisory lock on debits). Rows go only with the account (cascade). |
| `savings_goals` | Goals; `reward_target_inr` keeps the highest target ever set so lowering a target cannot pay milestones early. |
| `savings_contributions` | Self-reported amounts, unique per (user, client_ref); must belong to the goal's owner. |
| Widened checks | `money_streak_days.mission` (+4 kinds), `money_xp_ledger.reason` (+`goal_milestone`), `user_badges.badge` (+`first_goal`, `goal_reached`, `level_6`, `level_7`). Every existing row still passes. |

RLS on all five tables; `anon` has no access; `authenticated` may only SELECT its own rows; no client writes anywhere (verified in tests and by `verify_production.sql`).

## Levels (no data migration)

Levels are computed from total XP on every request; nothing stores a level. So adding levels changes no row.

| Level | Name | From XP | Status |
| --- | --- | --- | --- |
| 1 | Money Starter | 0 | unchanged |
| 2 | Budget Builder | 250 | unchanged |
| 3 | Money Smart | 750 | unchanged |
| 4 | Money Master | 2,000 | unchanged |
| 5 | Money Pro | 4,000 | unchanged |
| 6 | Money Champion | 7,000 | **new** |
| 7 | Money Legend | 12,000 | **new** |

No XP total maps to a lower level than before (tested at every boundary: 0, 249/250, 749/750, 1999/2000, 3999/4000, 6999/7000, 11999/12000, 1e9). XP, badges, streaks and history are untouched.

### Who is affected (run read-only in the SQL editor before deploying)

```sql
-- Users whose displayed level will change (only upward, from 5 to 6 or 7)
select case when total >= 12000 then 7 when total >= 7000 then 6 end as new_level, count(*)
from (select user_id, sum(xp) as total from public.money_xp_ledger group by user_id) t
where total >= 7000
group by 1 order by 1;
```

Test accounts: none were inspected; run the query above against production to see the real count. At current earning rates (roughly 1,000–1,300 XP a month for a perfect user) and v1.1 going live in October 2026, the expected count is zero.

## Points are not retroactive

Points are paid only with an XP award recorded by the v1.14 backend (or one recorded in the previous 48 hours, to heal an interrupted request). Days without a personalised mission (everything before v1.14) pay no Points.

## Deploy order

1. Apply `v1_14_rewards.sql`. 2. Run `supabase/tests/verify_production.sql`: every row PASS. 3. Deploy the backend. A backend deployed first keeps working: Money Streak uses the old rotation, Points are `null`, and goals return 503.

## Rollback

1. Soft (keeps data): set `REWARDS_ENABLED=false` on the backend and redeploy.
2. Full: deploy the previous backend, then run `v1_14_rewards_rollback.sql`. **This deletes** all daily missions, check-ins, Points, goals and contributions. Locked streak days, XP and badges stay; the old check constraints come back `NOT VALID` (enforced for new writes only). Tested: rollback twice, then v1_14 re-applied, `verify_production.sql` all PASS.

Note: re-running `v1_11_save_to_earn.sql` after v1_14 narrows the XP reasons again. Re-running any migration means re-running every later one, in order.
