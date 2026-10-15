-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.14 (app v1.2) — Rewards: personalised daily missions with
-- difficulty, Vittova Points, savings goals, mission check-ins
--
-- Run in the Supabase SQL Editor AFTER v1_13_notification_expenses.sql.
-- Idempotent. Adds tables and columns and widens check constraints; never
-- modifies or deletes existing user data. Rollback: v1_14_rewards_rollback.sql.
--
-- DEPLOY ORDER: apply this BEFORE the backend that serves /api/rewards,
-- /api/goals and /api/recap. A backend deployed first keeps working: Money
-- Streak falls back to the fixed daily rotation and pays no Points until the
-- tables exist. Then verify with supabase/tests/verify_production.sql.
--
-- RE-RUNNING OLDER MIGRATIONS: v1_11_save_to_earn.sql redefines the XP
-- reasons without 'goal_milestone'. If an older migration is ever re-run,
-- re-run every later one after it, in order, ending with this file.
--
--   profiles.mission_difficulty   the user's preferred mission difficulty
--                                 ('auto' = adapt to how missions have gone).
--   money_daily_missions          the mission given to a user for a calendar
--                                 day, fixed once given (terms never change
--                                 under the user), replaceable at most twice
--                                 that day.
--   money_mission_checkins        self-reported mission actions ("I set the
--                                 money aside"), once per user, day and mission.
--   money_points_ledger           Vittova Points: append-only, one row per
--                                 award, unique per (user, reason, ref_key);
--                                 the balance is the sum and can never go below
--                                 zero.
--   savings_goals                 a user's goals: name, target and date.
--   savings_contributions         amounts the user says they put aside, once
--                                 per client reference. Self-reported: Vittova
--                                 cannot see bank balances.
--   money_streak_days.mission     widened to the new mission kinds.
--   money_xp_ledger.reason        new reason 'goal_milestone'.
--   user_badges.badge             new badges: first_goal, goal_reached,
--                                 level_6, level_7.
--
-- LEVELS: levels are calculated from total XP (backend/lib/moneyStreak.js),
-- not stored, so adding levels 6 and 7 needs no data change here. The five
-- existing thresholds and names are unchanged; nobody's level moves.
--
-- ACCESS: the backend (service role) is the only writer. Signed-in users may
-- read their OWN rows in every new table; nobody else's. The anon role has no
-- access.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Mission difficulty preference ───────────────────────────────────────
alter table public.profiles add column if not exists mission_difficulty text not null default 'auto';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_mission_difficulty_check') then
        alter table public.profiles
            add constraint profiles_mission_difficulty_check
            check (mission_difficulty in ('auto', 'easy', 'balanced', 'advanced'));
    end if;
end $$;


-- ─── 2. Daily missions (one per user and calendar day) ─────────────────────
create table if not exists public.money_daily_missions (
    user_id       uuid not null references public.profiles (id) on delete cascade,
    day           date not null,
    mission       text not null check (mission in (
                      'under_limit', 'log_today', 'no_impulse', 'no_spend',
                      'delivery_cap', 'bill_ready', 'goal_step', 'review_recurring')),
    difficulty    text not null check (difficulty in ('easy', 'balanced', 'advanced')),
    params        jsonb not null default '{}'::jsonb check (pg_column_size(params) <= 512),
    reason        text not null check (char_length(reason) between 1 and 200),
    source        text not null check (source in ('personalised', 'fallback', 'replacement')),
    replacements  smallint not null default 0 check (replacements between 0 and 2),
    previous      text[] not null default '{}' check (cardinality(previous) <= 2),
    assigned_at   timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    primary key (user_id, day)
);
comment on table public.money_daily_missions is 'The mission given to a user for a calendar day. Written only by the backend.';

-- A mission can be replaced only on its own day (Asia/Kolkata), and only by
-- moving forward: the replacement count never goes down.
create or replace function private.money_daily_mission_guard() returns trigger
    language plpgsql set search_path = '' as $$
begin
    if new.user_id is distinct from old.user_id or new.day is distinct from old.day then
        raise exception 'a mission cannot move to another user or day';
    end if;
    if old.day <> (now() at time zone 'Asia/Kolkata')::date then
        raise exception 'only today''s mission can be changed';
    end if;
    if new.replacements < old.replacements then
        raise exception 'the replacement count cannot go down';
    end if;
    new.updated_at := now();
    return new;
end $$;
drop trigger if exists trg_money_daily_missions_guard on public.money_daily_missions;
create trigger trg_money_daily_missions_guard before update on public.money_daily_missions
    for each row execute function private.money_daily_mission_guard();
revoke all on function private.money_daily_mission_guard() from public, anon, authenticated;


-- ─── 3. Self-reported mission actions ───────────────────────────────────────
create table if not exists public.money_mission_checkins (
    user_id     uuid not null references public.profiles (id) on delete cascade,
    day         date not null,
    mission     text not null check (mission in ('bill_ready', 'review_recurring')),
    event_id    uuid not null,
    created_at  timestamptz not null default now(),
    primary key (user_id, day, mission),
    constraint money_mission_checkins_event_once unique (user_id, event_id)
);
comment on table public.money_mission_checkins is 'Self-reported mission actions, once per user, day and mission. Written only by the backend.';


-- ─── 4. Vittova Points ledger ───────────────────────────────────────────────
create table if not exists public.money_points_ledger (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    reason      text not null check (reason in (
                    'daily_mission', 'weekly_goal', 'month_within_budget', 'streak_milestone',
                    'challenge_completed', 'goal_milestone', 'reversal', 'adjustment', 'redemption')),
    ref_key     text not null check (char_length(ref_key) between 1 and 80),
    points      integer not null check (points between -100000 and 1000 and points <> 0),
    note        text check (char_length(note) <= 200),
    created_at  timestamptz not null default now(),
    constraint money_points_ledger_once unique (user_id, reason, ref_key),
    -- Earning reasons add; reversals, adjustments and redemptions are the only debits.
    constraint money_points_ledger_sign check (
        (reason in ('reversal', 'redemption') and points < 0)
        or (reason = 'adjustment')
        or (reason not in ('reversal', 'redemption', 'adjustment') and points > 0))
);
comment on table public.money_points_ledger is 'Vittova Points: append-only, one row per award or debit; the balance is the sum. Points are an in-app reward balance, not cash. Written only by the backend.';
create index if not exists idx_money_points_ledger_user on public.money_points_ledger (user_id, created_at desc);

-- Append-only, and the balance can never go below zero. A debit takes a
-- per-user transaction lock first, so two debits at once cannot both pass.
-- Rows go only with the account itself (the cascade from profiles, which runs
-- inside the foreign key's own trigger, so pg_trigger_depth() > 1).
create or replace function private.money_points_guard() returns trigger
    language plpgsql set search_path = '' as $$
declare
    balance bigint;
begin
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
        return old;
    end if;
    if tg_op <> 'INSERT' then
        raise exception 'points history cannot be changed or removed';
    end if;
    if new.points < 0 then
        perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 14));
        select coalesce(sum(points), 0) into balance from public.money_points_ledger where user_id = new.user_id;
        if balance + new.points < 0 then
            raise exception 'not enough points';
        end if;
    end if;
    return new;
end $$;
drop trigger if exists trg_money_points_guard on public.money_points_ledger;
create trigger trg_money_points_guard before insert or update or delete on public.money_points_ledger
    for each row execute function private.money_points_guard();
revoke all on function private.money_points_guard() from public, anon, authenticated;


-- ─── 5. Savings goals ───────────────────────────────────────────────────────
create table if not exists public.savings_goals (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references public.profiles (id) on delete cascade,
    name              text not null check (char_length(btrim(name)) between 1 and 60),
    kind              text not null default 'custom' check (kind in ('laptop', 'emergency', 'education', 'travel', 'buffer', 'custom')),
    target_inr        integer not null check (target_inr between 100 and 100000000),
    target_date       date not null,
    note              text check (char_length(note) <= 200),
    plan_monthly_inr  integer check (plan_monthly_inr between 0 and 100000000),
    -- The target milestone rewards are measured against: the highest target the
    -- goal has had, so lowering a target never pays a milestone early.
    reward_target_inr integer check (reward_target_inr between 100 and 100000000),
    status            text not null default 'active' check (status in ('active', 'completed', 'archived')),
    completed_at      timestamptz,
    archived_at       timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
comment on table public.savings_goals is 'A user''s savings goals. Progress comes from savings_contributions (self-reported). Written only by the backend.';
create index if not exists idx_savings_goals_user on public.savings_goals (user_id, status, created_at desc);

create table if not exists public.savings_contributions (
    id              uuid primary key default gen_random_uuid(),
    goal_id         uuid not null references public.savings_goals (id) on delete cascade,
    user_id         uuid not null references public.profiles (id) on delete cascade,
    amount_inr      integer not null check (amount_inr between 1 and 100000000),
    source          text not null default 'self_reported' check (source in ('self_reported')),
    contributed_on  date not null,
    note            text check (char_length(note) <= 120),
    client_ref      uuid not null,
    created_at      timestamptz not null default now(),
    constraint savings_contributions_once unique (user_id, client_ref)
);
comment on table public.savings_contributions is 'Amounts a user says they put aside for a goal (self-reported; Vittova cannot see bank balances). Once per client reference. Written only by the backend.';
create index if not exists idx_savings_contributions_goal on public.savings_contributions (goal_id, created_at desc);
create index if not exists idx_savings_contributions_user on public.savings_contributions (user_id, created_at desc);

-- A contribution always belongs to the goal's own user.
create or replace function private.savings_contribution_owner() returns trigger
    language plpgsql set search_path = '' as $$
begin
    if not exists (select 1 from public.savings_goals g where g.id = new.goal_id and g.user_id = new.user_id) then
        raise exception 'a contribution must belong to the goal''s owner';
    end if;
    return new;
end $$;
drop trigger if exists trg_savings_contribution_owner on public.savings_contributions;
create trigger trg_savings_contribution_owner before insert or update on public.savings_contributions
    for each row execute function private.savings_contribution_owner();
revoke all on function private.savings_contribution_owner() from public, anon, authenticated;


-- ─── 6. Widen existing checks (existing rows all still pass) ────────────────
alter table public.money_streak_days drop constraint if exists money_streak_days_mission_check;
alter table public.money_streak_days
    add constraint money_streak_days_mission_check
    check (mission in ('under_limit', 'log_today', 'no_impulse', 'no_spend',
                       'delivery_cap', 'bill_ready', 'goal_step', 'review_recurring'));

alter table public.money_xp_ledger drop constraint if exists money_xp_ledger_reason_check;
alter table public.money_xp_ledger
    add constraint money_xp_ledger_reason_check
    check (reason in ('expense_logged', 'daily_mission', 'weekly_goal', 'month_within_budget',
                      'streak_milestone', 'challenge_completed', 'goal_milestone'));

alter table public.user_badges drop constraint if exists user_badges_badge_check;
alter table public.user_badges
    add constraint user_badges_badge_check
    check (badge in ('first_challenge', 'streak_7', 'saved_500', 'budget_keeper', 'smart_decision', 'habit_30',
                     'first_goal', 'goal_reached', 'level_6', 'level_7'));


-- ─── 7. Access: backend writes, owners read their own rows ─────────────────
alter table public.money_daily_missions   enable row level security;
alter table public.money_mission_checkins enable row level security;
alter table public.money_points_ledger    enable row level security;
alter table public.savings_goals          enable row level security;
alter table public.savings_contributions  enable row level security;

revoke all on public.money_daily_missions, public.money_mission_checkins, public.money_points_ledger,
              public.savings_goals, public.savings_contributions from anon, authenticated;
grant select on public.money_daily_missions, public.money_mission_checkins, public.money_points_ledger,
                public.savings_goals, public.savings_contributions to authenticated;

drop policy if exists "Users can view own daily missions" on public.money_daily_missions;
create policy "Users can view own daily missions"
    on public.money_daily_missions for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own mission checkins" on public.money_mission_checkins;
create policy "Users can view own mission checkins"
    on public.money_mission_checkins for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own points" on public.money_points_ledger;
create policy "Users can view own points"
    on public.money_points_ledger for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own savings goals" on public.savings_goals;
create policy "Users can view own savings goals"
    on public.savings_goals for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own savings contributions" on public.savings_contributions;
create policy "Users can view own savings contributions"
    on public.savings_contributions for select to authenticated
    using ((select auth.uid()) = user_id);

-- mission_difficulty is written only through the backend (PUT
-- /api/money-streak/preferences). Clients may update only the profile columns
-- granted in v1_1_launch_hardening; this column is not one of them.
