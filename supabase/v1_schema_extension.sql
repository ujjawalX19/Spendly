-- ═══════════════════════════════════════════════════════════════
-- Spendly v1 — Schema Extension
-- Run this AFTER the base schema.sql in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════


-- ─── EXTEND PROFILES TABLE ────────────────────────────────────
-- New columns for Pro, Streak freezes, Investment target, Paisa Score

alter table public.profiles
  add column if not exists investment_target integer not null default 0,
  add column if not exists is_pro boolean not null default false,
  add column if not exists pro_expires_at timestamptz,
  add column if not exists streak_freezes_remaining integer not null default 0,
  add column if not exists paisa_score integer not null default 0 check (paisa_score >= 0 and paisa_score <= 850),
  add column if not exists receipt_scans_this_month integer not null default 0,
  add column if not exists chat_messages_today integer not null default 0,
  add column if not exists chat_messages_reset_at date not null default current_date,
  add column if not exists expenses_today integer not null default 0,
  add column if not exists expenses_reset_at date not null default current_date;


-- ═══════════════════════════════════════════════════════════════
-- TABLE: recurring_bills
-- User-defined recurring expenses for Safe-to-Spend calculation.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.recurring_bills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) <= 100),
  amount      numeric(10,2) not null check (amount > 0),
  due_day     integer not null check (due_day >= 1 and due_day <= 31),
  category    text not null default 'Other',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.recurring_bills is 'Monthly recurring bills for Safe-to-Spend calculation.';

create index if not exists idx_recurring_bills_user on public.recurring_bills (user_id);

-- RLS
alter table public.recurring_bills enable row level security;

create policy "Users can view own recurring bills"
  on public.recurring_bills for select
  using (auth.uid() = user_id);

create policy "Users can insert own recurring bills"
  on public.recurring_bills for insert
  with check (auth.uid() = user_id);

create policy "Users can update own recurring bills"
  on public.recurring_bills for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own recurring bills"
  on public.recurring_bills for delete
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: paisa_scores
-- Weekly snapshots of the user's Paisa Score for history tracking.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.paisa_scores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  score           integer not null check (score >= 0 and score <= 850),
  savings_rate    integer not null default 0,
  investment      integer not null default 0,
  budget_adherence integer not null default 0,
  no_zombie_subs  integer not null default 0,
  streak_bonus    integer not null default 0,
  week_start      date not null,
  created_at      timestamptz not null default now(),
  unique (user_id, week_start)
);

comment on table public.paisa_scores is 'Weekly Paisa Score snapshots with component breakdown.';

create index if not exists idx_paisa_scores_user on public.paisa_scores (user_id, week_start desc);

alter table public.paisa_scores enable row level security;

create policy "Users can view own paisa scores"
  on public.paisa_scores for select
  using (auth.uid() = user_id);

create policy "Users can insert own paisa scores"
  on public.paisa_scores for insert
  with check (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: pdf_imports
-- Tracks bank statement PDF import history.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.pdf_imports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  bank_name         text,
  transactions_count integer not null default 0,
  period_start      date,
  period_end        date,
  status            text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  created_at        timestamptz not null default now()
);

comment on table public.pdf_imports is 'Bank statement PDF import history.';

alter table public.pdf_imports enable row level security;

create policy "Users can view own pdf imports"
  on public.pdf_imports for select
  using (auth.uid() = user_id);

create policy "Users can insert own pdf imports"
  on public.pdf_imports for insert
  with check (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: streak_activities
-- Tracks daily streak check-in activities for the Duolingo model.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.streak_activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  activity    text not null check (activity in ('log_expense', 'read_tip', 'check_safe_to_spend')),
  activity_date date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (user_id, activity, activity_date)
);

comment on table public.streak_activities is 'Daily streak activity completions.';

create index if not exists idx_streak_activities_user_date on public.streak_activities (user_id, activity_date desc);

alter table public.streak_activities enable row level security;

create policy "Users can view own streak activities"
  on public.streak_activities for select
  using (auth.uid() = user_id);

create policy "Users can insert own streak activities"
  on public.streak_activities for insert
  with check (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- DONE! v1 schema extensions applied.
-- ═══════════════════════════════════════════════════════════════
