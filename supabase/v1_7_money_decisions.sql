-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.7 (app v1.1) — Money Decisions + Money Streak
--
-- Run in the Supabase SQL Editor AFTER v1_6_owner_console.sql. Idempotent.
-- Adds columns and tables; never modifies or deletes existing user data.
--
-- DEPLOY ORDER: apply this BEFORE the v1.1 backend goes live. The backend
-- reads the new profile columns (GET /api/pro/status, the money-check quota)
-- and the new tables (Money Streak). Then verify with
-- supabase/tests/verify_production.sql (every row PASS).
--
-- WHAT IT ADDS
--   profiles.money_checks_today / money_checks_reset_at
--       Free daily quota for Afford-It checks and SIP stress tests (server-owned).
--   profiles.money_streak_started_on
--       The day the user first opened Money Streak; earlier days never count.
--   money_streak_days
--       One locked row per finished day: that day's mission and whether it was
--       kept. Locked rows stop later edits from rewriting a streak.
--   money_xp_ledger
--       One row per XP award, unique per (user, reason, ref_key), so no award
--       can be paid twice.
--   streak_activities.activity 'no_spend_day'
--       A user marking today as a no-spend day.
--
-- ACCESS
--   The backend (service role) is the only writer. Signed-in users may read
--   their OWN streak days and XP rows; nobody else's. The anon role has no
--   access. None of the new profile columns is client-writable.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Server-owned profile columns ────────────────────────────────────────
alter table public.profiles add column if not exists money_checks_today integer not null default 0;
alter table public.profiles add column if not exists money_checks_reset_at text;
alter table public.profiles add column if not exists money_streak_started_on date;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_money_checks_today_range') then
        alter table public.profiles
            add constraint profiles_money_checks_today_range check (money_checks_today between 0 and 100000) not valid;
    end if;
end $$;


-- ─── 2. Locked Money Streak days ────────────────────────────────────────────
create table if not exists public.money_streak_days (
    user_id    uuid not null references public.profiles (id) on delete cascade,
    day        date not null,
    mission    text not null check (mission in ('under_limit', 'log_today', 'no_impulse', 'no_spend')),
    kept       boolean not null,
    spent      numeric(12, 2) not null default 0 check (spent >= 0),
    day_limit  numeric(12, 2) not null default 0 check (day_limit >= 0),
    created_at timestamptz not null default now(),
    primary key (user_id, day)
);
comment on table public.money_streak_days is 'Money Streak: one locked row per finished day (mission and whether it was kept). Written only by the backend.';

alter table public.money_streak_days enable row level security;


-- ─── 3. Money XP ledger ─────────────────────────────────────────────────────
create table if not exists public.money_xp_ledger (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    reason      text not null check (reason in ('expense_logged', 'daily_mission', 'weekly_goal', 'month_within_budget', 'streak_milestone')),
    ref_key     text not null check (char_length(ref_key) between 1 and 40),
    xp          integer not null check (xp between 1 and 100),
    created_at  timestamptz not null default now(),
    constraint money_xp_ledger_once unique (user_id, reason, ref_key)
);
comment on table public.money_xp_ledger is 'Money XP: one row per award; unique (user_id, reason, ref_key) so an award is never paid twice. Written only by the backend.';
create index if not exists idx_money_xp_ledger_user on public.money_xp_ledger (user_id, created_at desc);

alter table public.money_xp_ledger enable row level security;


-- ─── 4. Access: backend writes, owners read their own rows ─────────────────
revoke all on public.money_streak_days from anon, authenticated;
revoke all on public.money_xp_ledger   from anon, authenticated;
grant select on public.money_streak_days, public.money_xp_ledger to authenticated;

drop policy if exists "Users can view own money streak days" on public.money_streak_days;
create policy "Users can view own money streak days"
    on public.money_streak_days for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own money xp" on public.money_xp_ledger;
create policy "Users can view own money xp"
    on public.money_xp_ledger for select to authenticated
    using ((select auth.uid()) = user_id);


-- ─── 5. No-spend days ───────────────────────────────────────────────────────
alter table public.streak_activities drop constraint if exists streak_activities_activity_check;
alter table public.streak_activities
    add constraint streak_activities_activity_check
    check (activity in ('log_expense', 'read_tip', 'check_safe_to_spend', 'no_spend_day'));
