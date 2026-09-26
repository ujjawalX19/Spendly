-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.10 (app v1.1) — Sponsored Save-to-Earn Challenges
--
-- Run in the Supabase SQL Editor AFTER v1_9_subscription_audit.sql. Idempotent.
-- Adds tables only; the feature stays off until SPONSORED_CHALLENGES_ENABLED
-- and CAMPAIGN_DASHBOARD_ENABLED are set on the server.
--
-- BRAND DATA FIREWALL: none of these tables holds a transaction, balance,
-- category, score or notification. A sponsor's view is built from counts.
--
--   sponsors               brand name and website
--   campaigns              one challenge offer: rules, fixed reward, dates, terms
--   campaign_vouchers      the sponsor's voucher codes (inventory)
--   challenge_enrollments  who joined, their challenge window and outcome
--   challenge_completions  immutable record of a completed challenge
--   reward_issuances       which voucher went to which completion (+ a random
--                          redemption id the sponsor can see)
--   campaign_impressions   anonymous impression / view counts (no user id)
--
-- ACCESS: service role only. Users reach their own data through the API; no
-- table is readable or writable by the anon or authenticated roles.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.sponsors (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique check (char_length(name) between 2 and 80),
    website     text check (website is null or website ~ '^https://'),
    created_at  timestamptz not null default now()
);

create table if not exists public.campaigns (
    id               uuid primary key default gen_random_uuid(),
    sponsor_id       uuid not null references public.sponsors (id),
    name             text not null check (char_length(name) between 3 and 120),
    challenge_type   text not null check (challenge_type in ('no_food_delivery', 'home_food', 'no_impulse', 'daily_target', 'weekend_budget', 'spend_less')),
    duration_days    integer not null check (duration_days between 3 and 30),
    params           jsonb not null default '{}'::jsonb check (pg_column_size(params) <= 512),
    reward_label     text not null check (char_length(reward_label) between 3 and 80),
    reward_value_inr integer not null check (reward_value_inr between 1 and 100000),
    voucher_expiry   date,
    starts_at        timestamptz not null,
    ends_at          timestamptz not null,
    eligibility      text not null check (char_length(eligibility) between 3 and 1000),
    terms            text not null check (char_length(terms) between 20 and 4000),
    target_audience  text not null default 'all_pro' check (target_audience in ('all_pro')),
    status           text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'paused', 'ended', 'archived')),
    created_by       uuid,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    check (ends_at > starts_at)
);

create table if not exists public.campaign_vouchers (
    id           uuid primary key default gen_random_uuid(),
    campaign_id  uuid not null references public.campaigns (id) on delete cascade,
    code         text not null check (char_length(code) between 3 and 120),
    issued_at    timestamptz,
    -- Kept (set null) when the account is deleted: an issued code is never reissued.
    issued_to    uuid,
    created_at   timestamptz not null default now(),
    unique (campaign_id, code)
);
create index if not exists idx_campaign_vouchers_free on public.campaign_vouchers (campaign_id) where issued_at is null;

create table if not exists public.challenge_enrollments (
    id              uuid primary key default gen_random_uuid(),
    campaign_id     uuid not null references public.campaigns (id) on delete cascade,
    user_id         uuid not null references public.profiles (id) on delete cascade,
    enrolled_at     timestamptz not null default now(),
    starts_on       date not null,
    ends_on         date not null,
    status          text not null default 'active' check (status in ('active', 'completed', 'failed', 'withdrawn')),
    failure_reason  text check (char_length(failure_reason) <= 200),
    judged_at       timestamptz,
    unique (user_id, campaign_id)
);
create index if not exists idx_challenge_enrollments_campaign on public.challenge_enrollments (campaign_id, status);

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'campaign_vouchers_issued_to_fkey') then
        alter table public.campaign_vouchers
            add constraint campaign_vouchers_issued_to_fkey foreign key (issued_to) references public.challenge_enrollments (id) on delete set null;
    end if;
end $$;

create table if not exists public.challenge_completions (
    enrollment_id  uuid primary key references public.challenge_enrollments (id) on delete cascade,
    campaign_id    uuid not null references public.campaigns (id) on delete cascade,
    completed_at   timestamptz not null default now()
);

create table if not exists public.reward_issuances (
    enrollment_id  uuid primary key references public.challenge_enrollments (id) on delete cascade,
    campaign_id    uuid not null references public.campaigns (id) on delete cascade,
    voucher_id     uuid not null unique references public.campaign_vouchers (id),
    redemption_id  uuid not null unique default gen_random_uuid(),
    issued_at      timestamptz not null default now(),
    revealed_at    timestamptz
);

create table if not exists public.campaign_impressions (
    id           bigint generated always as identity primary key,
    campaign_id  uuid not null references public.campaigns (id) on delete cascade,
    kind         text not null check (kind in ('impression', 'view')),
    created_at   timestamptz not null default now()
);
create index if not exists idx_campaign_impressions on public.campaign_impressions (campaign_id, kind);

-- ─── Immutability ───────────────────────────────────────────────────────────
-- A completion can never be edited; an issuance can only be marked revealed
-- once; an issued voucher can never be made available again.
create or replace function private.forbid_update() returns trigger
    language plpgsql set search_path = '' as $$
begin
    raise exception '% is immutable', tg_table_name;
end $$;

create or replace function private.issuance_reveal_only() returns trigger
    language plpgsql set search_path = '' as $$
begin
    if new.enrollment_id is distinct from old.enrollment_id or new.campaign_id is distinct from old.campaign_id
       or new.voucher_id is distinct from old.voucher_id or new.redemption_id is distinct from old.redemption_id
       or new.issued_at is distinct from old.issued_at
       or (old.revealed_at is not null and new.revealed_at is distinct from old.revealed_at) then
        raise exception 'reward_issuances can only be marked revealed once';
    end if;
    return new;
end $$;

create or replace function private.voucher_issue_once() returns trigger
    language plpgsql set search_path = '' as $$
begin
    if old.issued_at is not null and new.issued_at is distinct from old.issued_at then
        raise exception 'an issued voucher cannot be reissued';
    end if;
    if new.code is distinct from old.code or new.campaign_id is distinct from old.campaign_id then
        raise exception 'voucher code and campaign are fixed';
    end if;
    return new;
end $$;

drop trigger if exists trg_challenge_completions_immutable on public.challenge_completions;
create trigger trg_challenge_completions_immutable before update on public.challenge_completions
    for each row execute function private.forbid_update();
drop trigger if exists trg_reward_issuances_reveal_only on public.reward_issuances;
create trigger trg_reward_issuances_reveal_only before update on public.reward_issuances
    for each row execute function private.issuance_reveal_only();
drop trigger if exists trg_campaign_vouchers_issue_once on public.campaign_vouchers;
create trigger trg_campaign_vouchers_issue_once before update on public.campaign_vouchers
    for each row execute function private.voucher_issue_once();

-- ─── Access: backend only ──────────────────────────────────────────────────
alter table public.sponsors              enable row level security;
alter table public.campaigns             enable row level security;
alter table public.campaign_vouchers     enable row level security;
alter table public.challenge_enrollments enable row level security;
alter table public.challenge_completions enable row level security;
alter table public.reward_issuances      enable row level security;
alter table public.campaign_impressions  enable row level security;

revoke all on public.sponsors, public.campaigns, public.campaign_vouchers, public.challenge_enrollments,
              public.challenge_completions, public.reward_issuances, public.campaign_impressions
    from anon, authenticated;
revoke all on function private.forbid_update(), private.issuance_reveal_only(), private.voucher_issue_once() from public, anon, authenticated;
