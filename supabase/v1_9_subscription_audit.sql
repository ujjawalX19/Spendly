-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.9 (app v1.1) — Subscription & Recurring Expense Audit
--
-- Run in the Supabase SQL Editor AFTER v1_8_play_billing.sql. Idempotent.
-- Adds two tables; never modifies existing data.
--
-- recurring_decisions      what the user said about a detected recurring
--                          payment: confirmed / dismissed / intentional / unwanted
-- recurring_expectations   the next expected debit of a payment Vittova reminds
--                          about, and whether it was then seen (matched) or not
--                          (not_confirmed). Resolved once; never re-checked.
--
-- Only a normalised merchant key (e.g. "netflix"), dates and amounts are
-- stored. The backend (service role) is the only writer; users read their own.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.recurring_decisions (
    user_id      uuid not null references public.profiles (id) on delete cascade,
    merchant_key text not null check (merchant_key ~ '^[a-z0-9 ]{1,60}$'),
    decision     text not null check (decision in ('confirmed', 'dismissed', 'intentional', 'unwanted')),
    updated_at   timestamptz not null default now(),
    primary key (user_id, merchant_key)
);

create table if not exists public.recurring_expectations (
    user_id            uuid not null references public.profiles (id) on delete cascade,
    merchant_key       text not null check (merchant_key ~ '^[a-z0-9 ]{1,60}$'),
    expected_date      date not null,
    expected_amount    numeric(12, 2) not null check (expected_amount > 0),
    status             text not null default 'pending' check (status in ('pending', 'matched', 'not_confirmed')),
    matched_amount     numeric(12, 2),
    matched_on         date,
    matched_expense_id uuid,
    resolved_at        timestamptz,
    created_at         timestamptz not null default now(),
    primary key (user_id, merchant_key, expected_date)
);
create index if not exists idx_recurring_expectations_pending on public.recurring_expectations (user_id, status, expected_date);

alter table public.recurring_decisions enable row level security;
alter table public.recurring_expectations enable row level security;
revoke all on public.recurring_decisions, public.recurring_expectations from anon, authenticated;
grant select on public.recurring_decisions, public.recurring_expectations to authenticated;

drop policy if exists "Users can view own recurring decisions" on public.recurring_decisions;
create policy "Users can view own recurring decisions"
    on public.recurring_decisions for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own recurring expectations" on public.recurring_expectations;
create policy "Users can view own recurring expectations"
    on public.recurring_expectations for select to authenticated
    using ((select auth.uid()) = user_id);
