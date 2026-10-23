-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.15 — Vittova Pro passes paid through Razorpay
--
-- Run in the Supabase SQL Editor AFTER v1_13_notification_expenses.sql.
-- Independent of v1_14 (rewards, unreleased). Idempotent. Adds one table and
-- widens one check constraint; never modifies existing user data.
--
-- DEPLOY ORDER: apply BEFORE switching Razorpay on (RAZORPAY_ENABLED=true on
-- the server). While it is off, nothing reads or writes this table.
--
-- razorpay_payments
--   One row per Razorpay order the backend created for a Pro pass (one-time
--   payment: 30 days or 1 year, no renewal, no mandate). Bound to the account
--   that created the order. Moves created -> paid once, after the backend has
--   re-read the payment from Razorpay; paid -> refunded on a full refund.
--   No card, UPI or bank details are stored: only Razorpay's ids. Service
--   role only: clients can neither read nor write.
--
-- profiles.pro_source gains 'razorpay'.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists pro_source text; -- from v1_8; kept so this file stands alone
alter table public.profiles drop constraint if exists profiles_pro_source_valid;
alter table public.profiles
    add constraint profiles_pro_source_valid check (pro_source is null or pro_source in ('play', 'manual', 'razorpay')) not valid;

create table if not exists public.razorpay_payments (
    order_id      text primary key check (order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
    user_id       uuid not null references public.profiles (id) on delete cascade,
    plan          text not null check (plan in ('monthly', 'yearly')),
    amount_paise  integer not null check (amount_paise > 0),
    currency      text not null default 'INR' check (currency = 'INR'),
    status        text not null default 'created' check (status in ('created', 'paid', 'refunded')),
    payment_id    text unique check (payment_id is null or payment_id ~ '^pay_[A-Za-z0-9]{6,40}$'),
    period_start  timestamptz,
    period_end    timestamptz,
    paid_at       timestamptz,
    refunded_at   timestamptz,
    created_at    timestamptz not null default now(),
    check (status = 'created' or (payment_id is not null and period_start is not null and period_end > period_start))
);
comment on table public.razorpay_payments is 'Vittova Pro passes paid through Razorpay, confirmed server-side with the Razorpay API. Written and read only by the backend (service role).';
create index if not exists idx_razorpay_payments_user on public.razorpay_payments (user_id, status);

alter table public.razorpay_payments enable row level security;
revoke all on public.razorpay_payments from anon, authenticated;
