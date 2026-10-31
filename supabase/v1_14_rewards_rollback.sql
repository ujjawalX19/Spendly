-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.14 ROLLBACK — removes what v1_14_rewards.sql added
--
-- Use only if v1.14 must be withdrawn. Prefer the soft rollback first:
-- set REWARDS_ENABLED=false on the backend (Money Streak then falls back to
-- the fixed daily rotation and no Points, goals or recap routes are served).
-- That keeps every user's data.
--
-- THIS SCRIPT DELETES DATA: every daily mission assignment, mission check-in,
-- Vittova Points row, savings goal and savings contribution. Export those
-- tables first if they may be needed. Locked streak days, XP rows and badges
-- are kept: rows written with the new values stay, and the old checks come
-- back as NOT VALID, so they apply to new writes only.
--
-- Order: deploy the previous backend (or REWARDS_ENABLED=false) FIRST, then
-- run this. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists public.savings_contributions;
drop table if exists public.savings_goals;
drop table if exists public.money_points_ledger;
drop table if exists public.money_mission_checkins;
drop table if exists public.money_daily_missions;

drop function if exists private.savings_contribution_owner();
drop function if exists private.money_points_guard();
drop function if exists private.money_daily_mission_guard();

alter table public.profiles drop constraint if exists profiles_mission_difficulty_check;
alter table public.profiles drop column if exists mission_difficulty;

alter table public.money_streak_days drop constraint if exists money_streak_days_mission_check;
alter table public.money_streak_days
    add constraint money_streak_days_mission_check
    check (mission in ('under_limit', 'log_today', 'no_impulse', 'no_spend')) not valid;

alter table public.money_xp_ledger drop constraint if exists money_xp_ledger_reason_check;
alter table public.money_xp_ledger
    add constraint money_xp_ledger_reason_check
    check (reason in ('expense_logged', 'daily_mission', 'weekly_goal', 'month_within_budget', 'streak_milestone', 'challenge_completed')) not valid;

alter table public.user_badges drop constraint if exists user_badges_badge_check;
alter table public.user_badges
    add constraint user_badges_badge_check
    check (badge in ('first_challenge', 'streak_7', 'saved_500', 'budget_keeper', 'smart_decision', 'habit_30')) not valid;
