-- ═══════════════════════════════════════════════════════════════════════════
-- Spendly v1.3 — product core
--
-- Run in the Supabase SQL Editor AFTER v1_2_security_p0.sql, then run
-- supabase/tests/verify_production.sql. Idempotent; creates tables and
-- columns only, never modifies or deletes existing user data.
--
-- Why this exists: a read-only check of production on 2026-09-13 found that
-- v1_schema_extension.sql was only partly applied (ai_chat_history and
-- groups.pool_state were missing) and v1_2 was not applied at all. Everything
-- the current backend needs beyond v1_2 is created here, safely, whether or
-- not the earlier files ran.
--
-- All tables follow the v1_2 model: clients get SELECT on their own rows via
-- RLS; every write goes through the backend's service-role key.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. AI coach history (missing in production) ────────────────────────────
create table if not exists public.ai_chat_history (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles(id) on delete cascade,
    role        text not null check (role in ('user', 'bot')),
    content     text not null,
    chips       jsonb default '[]'::jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists idx_ai_chat_history_user on public.ai_chat_history (user_id, created_at desc);

alter table public.ai_chat_history enable row level security;
drop policy if exists "Users can insert own chat history" on public.ai_chat_history;
drop policy if exists "Users can view own chat history" on public.ai_chat_history;
create policy "Users can view own chat history"
    on public.ai_chat_history for select to authenticated
    using ((select auth.uid()) = user_id);


-- ─── 2. Cancelled subscriptions ─────────────────────────────────────────────
-- What the user told Spendly they cancelled. One row per recurring payee; the
-- unique key prevents duplicate records.
create table if not exists public.cancelled_subscriptions (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.profiles(id) on delete cascade,
    normalized_name  text not null check (char_length(normalized_name) between 1 and 100),
    merchant         text not null check (char_length(merchant) <= 200),
    monthly_amount   numeric(10,2) not null check (monthly_amount >= 0),
    cancelled_at     timestamptz not null default now(),
    created_at       timestamptz not null default now(),
    unique (user_id, normalized_name)
);
create index if not exists idx_cancelled_subscriptions_user on public.cancelled_subscriptions (user_id);

alter table public.cancelled_subscriptions enable row level security;
drop policy if exists "Users can insert own cancelled subscriptions" on public.cancelled_subscriptions;
drop policy if exists "Users can update own cancelled subscriptions" on public.cancelled_subscriptions;
drop policy if exists "Users can delete own cancelled subscriptions" on public.cancelled_subscriptions;
drop policy if exists "Users can view own cancelled subscriptions" on public.cancelled_subscriptions;
create policy "Users can view own cancelled subscriptions"
    on public.cancelled_subscriptions for select to authenticated
    using ((select auth.uid()) = user_id);


-- ─── 3. Group pools: invitations and exact split shares ─────────────────────
-- Joining a group requires its invite code, which only members can see. This
-- is the consent step the old "users can add themselves" policy lacked.
alter table public.groups
    add column if not exists invite_code text,
    add column if not exists pool_state jsonb default '[]'::jsonb;

create unique index if not exists idx_groups_invite_code on public.groups (invite_code) where invite_code is not null;

-- Each participant's share, stored when the expense is added so balances do
-- not change if split rules change later.
alter table public.group_expense_splits
    add column if not exists share_amount numeric(10,2);

create index if not exists idx_group_expense_splits_expense on public.group_expense_splits (group_expense_id);
create index if not exists idx_settlements_group_created on public.settlements (group_id, created_at desc);


-- ─── 4. Client privileges for the new objects ───────────────────────────────
revoke insert, update, delete, truncate, references, trigger
    on public.ai_chat_history, public.cancelled_subscriptions from anon, authenticated;
revoke select on public.ai_chat_history, public.cancelled_subscriptions from anon;
grant select on public.ai_chat_history, public.cancelled_subscriptions to authenticated;

-- invite_code must never be readable by non-members. Group rows are already
-- limited to members by RLS (v1_2), so only members can read the code.

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Run supabase/tests/verify_production.sql.
-- ═══════════════════════════════════════════════════════════════════════════
