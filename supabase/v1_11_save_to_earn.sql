-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.11 (app v1.1) — Save-to-Earn: personal Money Challenges,
-- Victory Pot, badges and sponsor partner roles
--
-- Run in the Supabase SQL Editor AFTER v1_10_sponsored_challenges.sql.
-- Idempotent. Adds tables and widens one check constraint; never modifies or
-- deletes existing user data.
--
-- DEPLOY ORDER: apply this BEFORE the backend that serves /api/save-to-earn.
-- Then verify with supabase/tests/verify_production.sql (every row PASS).
--
--   money_challenges    a user's personal challenges: template, window, outcome
--                       and the ESTIMATED spending avoided (Victory Pot). One
--                       active challenge per user (partial unique index), and
--                       a finished challenge can never be rewritten.
--   user_badges         badges a user has earned, once each.
--   campaign_members    which Vittova accounts may see a sponsor's aggregated
--                       campaign report (sponsor_viewer) or pause/resume that
--                       sponsor's campaigns (campaign_manager). Never user data.
--   money_xp_ledger     new award reason 'challenge_completed'.
--
-- ACCESS: the backend (service role) is the only writer. Signed-in users may
-- read their OWN challenges, badges and memberships; nobody else's. The anon
-- role has no access. Nothing here holds a transaction, balance, category
-- list, notification or score: only totals the user already sees.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Personal Money Challenges ───────────────────────────────────────────
create table if not exists public.money_challenges (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles (id) on delete cascade,
    template        text not null check (template in (
                        'no_food_delivery_7', 'no_impulse_5', 'daily_target_7', 'log_daily_7', 'spend_less_500',
                        'spend_less_1000', 'weekend_budget_7', 'no_cab_weekend', 'no_food_delivery_14')),
    params          jsonb not null default '{}'::jsonb check (pg_column_size(params) <= 256),
    duration_days   integer not null check (duration_days between 3 and 30),
    enrolled_at     timestamptz not null default now(),
    starts_on       date not null,
    ends_on         date not null,
    status          text not null default 'active' check (status in ('active', 'completed', 'not_completed', 'skipped')),
    result_reason   text check (char_length(result_reason) <= 200),
    judged_at       timestamptz,
    baseline_inr    integer check (baseline_inr >= 0),
    actual_inr      integer check (actual_inr >= 0),
    impact_inr      integer check (impact_inr between 0 and 10000000),
    created_at      timestamptz not null default now(),
    check (ends_on >= starts_on),
    check (status = 'completed' or impact_inr is null)
);
comment on table public.money_challenges is 'Save-to-Earn personal challenges and their estimated impact (Victory Pot). Written only by the backend.';
create unique index if not exists money_challenges_one_active on public.money_challenges (user_id) where status = 'active';
create index if not exists idx_money_challenges_user on public.money_challenges (user_id, created_at desc);

-- A finished challenge is final: its outcome and estimate cannot change.
create or replace function private.money_challenge_final() returns trigger
    language plpgsql set search_path = '' as $$
begin
    if old.status <> 'active' then
        raise exception 'a finished challenge cannot be changed';
    end if;
    if new.user_id is distinct from old.user_id or new.template is distinct from old.template
       or new.params is distinct from old.params or new.enrolled_at is distinct from old.enrolled_at
       or new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on then
        raise exception 'challenge terms are fixed once started';
    end if;
    return new;
end $$;
drop trigger if exists trg_money_challenges_final on public.money_challenges;
create trigger trg_money_challenges_final before update on public.money_challenges
    for each row execute function private.money_challenge_final();
revoke all on function private.money_challenge_final() from public, anon, authenticated;


-- ─── 2. Badges ──────────────────────────────────────────────────────────────
create table if not exists public.user_badges (
    user_id    uuid not null references public.profiles (id) on delete cascade,
    badge      text not null check (badge in ('first_challenge', 'streak_7', 'saved_500', 'budget_keeper', 'smart_decision', 'habit_30')),
    earned_at  timestamptz not null default now(),
    primary key (user_id, badge)
);
comment on table public.user_badges is 'Save-to-Earn badges, once each per user. Written only by the backend.';


-- ─── 3. Sponsor partner roles (aggregated reports only) ─────────────────────
create table if not exists public.campaign_members (
    user_id     uuid not null references public.profiles (id) on delete cascade,
    sponsor_id  uuid not null references public.sponsors (id) on delete cascade,
    role        text not null check (role in ('campaign_manager', 'sponsor_viewer')),
    created_at  timestamptz not null default now(),
    primary key (user_id, sponsor_id)
);
comment on table public.campaign_members is 'Accounts allowed to see one sponsor''s aggregated campaign report (and, for campaign_manager, pause/resume). Written only by the backend.';


-- ─── 4. XP for completed challenges ─────────────────────────────────────────
alter table public.money_xp_ledger drop constraint if exists money_xp_ledger_reason_check;
alter table public.money_xp_ledger
    add constraint money_xp_ledger_reason_check
    check (reason in ('expense_logged', 'daily_mission', 'weekly_goal', 'month_within_budget', 'streak_milestone', 'challenge_completed'));


-- ─── 5. Access: backend writes, owners read their own rows ─────────────────
alter table public.money_challenges enable row level security;
alter table public.user_badges      enable row level security;
alter table public.campaign_members enable row level security;

revoke all on public.money_challenges, public.user_badges, public.campaign_members from anon, authenticated;
grant select on public.money_challenges, public.user_badges, public.campaign_members to authenticated;

drop policy if exists "Users can view own money challenges" on public.money_challenges;
create policy "Users can view own money challenges"
    on public.money_challenges for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own badges" on public.user_badges;
create policy "Users can view own badges"
    on public.user_badges for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own campaign memberships" on public.campaign_members;
create policy "Users can view own campaign memberships"
    on public.campaign_members for select to authenticated
    using ((select auth.uid()) = user_id);
