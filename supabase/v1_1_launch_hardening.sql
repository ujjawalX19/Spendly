-- ═══════════════════════════════════════════════════════════════════════════
-- Spendly v1.1 — Launch Hardening
--
-- Run this in the Supabase SQL Editor AFTER:
--   1. schema.sql
--   2. v1_schema_extension.sql
--   3. security_hardening.sql
--
-- Every statement is idempotent — running it twice is safe.
--
-- WHAT THIS MIGRATION DOES
--   1. Gives expenses a real transaction date (`occurred_at`) separate from
--      the row's insert time, so expenses can be edited, backdated, imported
--      from statements, and grouped into the correct calendar month.
--   2. Adds a month key for the monthly receipt-scan quota, replacing logic
--      that only reset if the user happened to open the app on the 1st.
--   3. Re-asserts the column-level UPDATE whitelist on profiles, which the
--      v1 extension's new billing columns (`is_pro`, `pro_expires_at`, quota
--      counters) were never covered by. Without this, a client holding the
--      public anon key could grant itself Pro.
--   4. Enables RLS on the v1 tables that were created after
--      security_hardening.sql was written.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. EXPENSES: a real transaction date ────────────────────────────────────
-- `created_at` records when the row was written. It is the wrong thing to
-- report on: a statement import, a backdated cash entry, or an edited date all
-- need the date the money actually moved.

alter table public.expenses
  add column if not exists occurred_at timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

-- Backfill: for existing rows the insert time is the best estimate we have.
update public.expenses
   set occurred_at = created_at
 where occurred_at is null;

alter table public.expenses
  alter column occurred_at set default now();

alter table public.expenses
  alter column occurred_at set not null;

-- Reporting queries filter by user and sort by transaction date.
create index if not exists idx_expenses_user_occurred
  on public.expenses (user_id, occurred_at desc);

-- Keep updated_at honest.
drop trigger if exists expenses_updated_at on public.expenses;
create trigger expenses_updated_at
  before update on public.expenses
  for each row execute procedure moddatetime(updated_at);


-- ─── 2. MONTHLY QUOTA RESET KEY ──────────────────────────────────────────────
-- The old code reset `receipt_scans_this_month` only when a request happened to
-- land on the 1st of the month. A user who did not open the app that day kept
-- last month's usage forever. Storing the month the counter belongs to makes
-- the reset self-correcting.

alter table public.profiles
  add column if not exists receipt_scans_reset_month text;

update public.profiles
   set receipt_scans_reset_month = to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM')
 where receipt_scans_reset_month is null;


-- ─── 3. RE-ASSERT THE PROFILE UPDATE WHITELIST ───────────────────────────────
-- security_hardening.sql granted UPDATE on (full_name, monthly_budget) at a
-- time when those were the only user-editable columns. v1_schema_extension.sql
-- then added billing and quota columns. Column-level GRANTs are a whitelist, so
-- the new columns are not client-writable — but re-asserting it here makes the
-- guarantee explicit and survives a fresh database being built from these files
-- in a different order.
--
-- `is_pro`, `pro_expires_at`, `paisa_score`, `karma_score`, `role`,
-- `is_banned`, `streak_*` and every quota counter are deliberately absent:
-- they are written only by the backend's service-role client.

revoke update on public.profiles from authenticated;
grant  update (full_name, monthly_budget, investment_target)
  on public.profiles to authenticated;

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update own profile (restricted columns)" on public.profiles;

create policy "Users can update own profile (restricted columns)"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ─── 4. RLS ON THE v1 TABLES ─────────────────────────────────────────────────
-- These tables were created after security_hardening.sql, so they were never
-- covered by its blanket ENABLE pass. The policies themselves already exist in
-- v1_schema_extension.sql; this only guarantees RLS is switched on.

alter table if exists public.recurring_bills   enable row level security;
alter table if exists public.paisa_scores      enable row level security;
alter table if exists public.pdf_imports       enable row level security;
alter table if exists public.streak_activities enable row level security;
alter table if exists public.ai_chat_history   enable row level security;


-- ─── 5. VERIFICATION QUERIES ─────────────────────────────────────────────────
-- Run these by hand after the migration and confirm the output.
--
-- (a) Every public table must report rowsecurity = true:
--
--     select tablename, rowsecurity
--       from pg_tables
--      where schemaname = 'public'
--      order by tablename;
--
-- (b) `authenticated` must hold UPDATE on exactly three profile columns:
--
--     select column_name
--       from information_schema.column_privileges
--      where table_name = 'profiles'
--        and grantee = 'authenticated'
--        and privilege_type = 'UPDATE'
--      order by column_name;
--
--     Expected: full_name, investment_target, monthly_budget
--     Anything else — especially is_pro or role — is a privilege-escalation bug.
-- ═══════════════════════════════════════════════════════════════════════════
