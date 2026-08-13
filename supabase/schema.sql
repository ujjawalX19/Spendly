-- ═══════════════════════════════════════════════════════════════
-- FinDost — Supabase PostgreSQL Schema
-- Run this ENTIRE file in Supabase SQL Editor (Dashboard → SQL)
-- ═══════════════════════════════════════════════════════════════

-- ─── EXTENSIONS ────────────────────────────────────────────────
-- moddatetime: auto-update `updated_at` on row changes
create extension if not exists moddatetime schema extensions;

-- ─── CUSTOM TYPES (ENUMS) ─────────────────────────────────────

create type expense_category as enum (
  'Food', 'Transport', 'Shopping', 'Recharge',
  'Entertainment', 'Rent', 'Other'
);

create type expense_source as enum ('manual', 'ai_scan');

create type group_member_role as enum ('admin', 'member');


-- ═══════════════════════════════════════════════════════════════
-- TABLE: profiles
-- Extends Supabase auth.users with app-specific data.
-- Auto-populated via trigger on signup.
-- ═══════════════════════════════════════════════════════════════

create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text unique not null,
  full_name         text not null default '',
  role              text not null default 'user',
  is_banned         boolean not null default false,
  monthly_budget    integer not null default 5000,
  karma_score       integer not null default 100 check (karma_score >= 0 and karma_score <= 1000),
  streak_current    integer not null default 0,
  streak_last_log   timestamptz,
  streak_longest    integer not null default 0,
  total_chillar     numeric(10,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'User profiles extending Supabase auth. One row per user.';

-- Auto-update updated_at
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure moddatetime(updated_at);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: expenses
-- Personal expense tracking with round-up savings (chillar).
-- ═══════════════════════════════════════════════════════════════

create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  amount           numeric(10,2) not null check (amount > 0),
  category         expense_category not null default 'Other',
  description      text default '' check (char_length(description) <= 200),
  roundup_chillar  numeric(10,2) not null default 0,
  source           expense_source not null default 'manual',
  receipt_data     jsonb,  -- { merchantName, items: [{itemName, price}], scannedTotal, rawResponse }
  created_at       timestamptz not null default now()
);

comment on table public.expenses is 'Personal expenses with round-up savings tracking.';

-- Index: fast per-user, date-sorted queries
create index idx_expenses_user_date on public.expenses (user_id, created_at desc);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: groups
-- Hostel Pool / expense-splitting groups.
-- ═══════════════════════════════════════════════════════════════

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) <= 60),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  is_settled  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.groups is 'Expense-splitting groups (Hostel Pools).';

create trigger groups_updated_at
  before update on public.groups
  for each row execute procedure moddatetime(updated_at);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: group_members
-- Join table: which users belong to which groups.
-- ═══════════════════════════════════════════════════════════════

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.group_members is 'Group membership join table.';

-- Index: find all groups a user belongs to
create index idx_group_members_user on public.group_members (user_id);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: group_expenses
-- Individual expenses within a group, paid by one person.
-- ═══════════════════════════════════════════════════════════════

create table public.group_expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  description text not null check (char_length(description) <= 200),
  amount      numeric(10,2) not null check (amount > 0),
  paid_by     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.group_expenses is 'Expenses within a group, paid by one member.';

create index idx_group_expenses_group on public.group_expenses (group_id, created_at desc);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: group_expense_splits
-- Who is included in splitting a group expense.
-- ═══════════════════════════════════════════════════════════════

create table public.group_expense_splits (
  id                uuid primary key default gen_random_uuid(),
  group_expense_id  uuid not null references public.group_expenses(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  unique (group_expense_id, user_id)
);

comment on table public.group_expense_splits is 'Which users are part of a group expense split.';


-- ═══════════════════════════════════════════════════════════════
-- TABLE: settlements
-- Payment records between group members.
-- ═══════════════════════════════════════════════════════════════

create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  amount        numeric(10,2) not null check (amount > 0),
  created_at    timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

comment on table public.settlements is 'Settlement payments between group members.';

create index idx_settlements_group on public.settlements (group_id);


-- ═══════════════════════════════════════════════════════════════
-- TRIGGER: Auto-create profile on signup
-- When a user signs up via Supabase Auth, automatically insert
-- a row into public.profiles with their metadata.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ═══════════════════════════════════════════════════════════════

-- ─── PROFILES ──────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── EXPENSES ──────────────────────────────────────────────────
alter table public.expenses enable row level security;

create policy "Users can view own expenses"
  on public.expenses for select
  using (auth.uid() = user_id);

create policy "Users can insert own expenses"
  on public.expenses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own expenses"
  on public.expenses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own expenses"
  on public.expenses for delete
  using (auth.uid() = user_id);

-- ─── GROUPS ────────────────────────────────────────────────────
alter table public.groups enable row level security;

-- Users can view groups they are a member of
create policy "Members can view their groups"
  on public.groups for select
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = groups.id
        and group_members.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a group
create policy "Authenticated users can create groups"
  on public.groups for insert
  with check (auth.uid() = created_by);

-- Only group creator can update
create policy "Creator can update group"
  on public.groups for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- ─── GROUP MEMBERS ─────────────────────────────────────────────
alter table public.group_members enable row level security;

-- Members can see other members in their groups
create policy "Members can view group members"
  on public.group_members for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id = auth.uid()
    )
  );

-- Group admins (creator) can add members
create policy "Admins can add group members"
  on public.group_members for insert
  with check (
    exists (
      select 1 from public.groups
      where groups.id = group_members.group_id
        and groups.created_by = auth.uid()
    )
    or group_members.user_id = auth.uid()  -- Users can add themselves (join)
  );

-- ─── GROUP EXPENSES ────────────────────────────────────────────
alter table public.group_expenses enable row level security;

create policy "Members can view group expenses"
  on public.group_expenses for select
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = group_expenses.group_id
        and group_members.user_id = auth.uid()
    )
  );

create policy "Members can add group expenses"
  on public.group_expenses for insert
  with check (
    auth.uid() = paid_by
    and exists (
      select 1 from public.group_members
      where group_members.group_id = group_expenses.group_id
        and group_members.user_id = auth.uid()
    )
  );

-- ─── GROUP EXPENSE SPLITS ──────────────────────────────────────
alter table public.group_expense_splits enable row level security;

create policy "Members can view expense splits"
  on public.group_expense_splits for select
  using (
    exists (
      select 1 from public.group_expenses ge
      join public.group_members gm on gm.group_id = ge.group_id
      where ge.id = group_expense_splits.group_expense_id
        and gm.user_id = auth.uid()
    )
  );

create policy "Members can insert expense splits"
  on public.group_expense_splits for insert
  with check (
    exists (
      select 1 from public.group_expenses ge
      join public.group_members gm on gm.group_id = ge.group_id
      where ge.id = group_expense_splits.group_expense_id
        and gm.user_id = auth.uid()
    )
  );

-- ─── SETTLEMENTS ───────────────────────────────────────────────
alter table public.settlements enable row level security;

create policy "Members can view settlements"
  on public.settlements for select
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = settlements.group_id
        and group_members.user_id = auth.uid()
    )
  );

create policy "Members can add settlements"
  on public.settlements for insert
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1 from public.group_members
      where group_members.group_id = settlements.group_id
        and group_members.user_id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- DONE! All tables, indexes, RLS policies, and triggers created.
-- ═══════════════════════════════════════════════════════════════
