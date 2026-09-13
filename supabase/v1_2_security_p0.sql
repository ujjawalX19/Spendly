-- ═══════════════════════════════════════════════════════════════════════════
-- Spendly v1.2 — P0 security migration
--
-- Run in the Supabase SQL Editor AFTER, in order:
--   1. schema.sql  2. v1_schema_extension.sql  3. security_hardening.sql
--   4. v1_1_launch_hardening.sql
-- then run this file, then supabase/tests/verify_production.sql.
--
-- Idempotent: safe to run more than once. It changes privileges, policies,
-- functions and enum values. It does NOT modify or delete any user data.
--
-- DEPLOY ORDER: run this BEFORE deploying the backend that writes
-- source = 'upi_auto' / 'pdf_import'.
--
-- WHAT THIS FIXES
--  1. Clients (anon / authenticated keys) could write server-owned data
--     directly through PostgREST: insert expenses past the free-tier quota,
--     and — wherever the older hardening scripts were not applied — set
--     is_pro, role, total_chillar or streak columns on their own profile.
--     The Spendly app never writes tables directly; every write goes through
--     the backend, which uses the service-role key. So clients now get
--     SELECT on their own rows only, and no INSERT/UPDATE/DELETE anywhere.
--  2. group_members allowed "users can add themselves", so anyone could join
--     any group and then read its expenses. Removed.
--  3. The group_members SELECT policy queried group_members itself, which
--     Postgres rejects with "infinite recursion detected in policy".
--     Replaced by a SECURITY DEFINER membership check in a non-exposed schema.
--  4. handle_new_user() was SECURITY DEFINER without a fixed search_path.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0. Tables this migration secures, in case an earlier file was only ───
--        partly applied (production was missing ai_chat_history)
create table if not exists public.ai_chat_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user', 'bot')),
  content     text not null,
  chips       jsonb default '[]'::jsonb,
  created_at  timestamptz not null default now()
);


-- ─── 1. Expense sources used by the backend ─────────────────────────────────
alter type public.expense_source add value if not exists 'upi_auto';
alter type public.expense_source add value if not exists 'pdf_import';


-- ─── 2. Client privileges: read own data only ───────────────────────────────
-- Revoking a table privilege also revokes the matching column privileges, so
-- this removes the column-level UPDATE grants from the earlier scripts too.
revoke insert, update, delete, truncate, references, trigger
    on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;
revoke usage, select, update on all sequences in schema public from anon, authenticated;

grant select on
    public.profiles,
    public.expenses,
    public.groups,
    public.group_members,
    public.group_expenses,
    public.group_expense_splits,
    public.settlements,
    public.recurring_bills,
    public.paisa_scores,
    public.pdf_imports,
    public.streak_activities,
    public.ai_chat_history
to authenticated;

-- Tables created later by this role should not silently become client-writable.
-- (Supabase grants broad default privileges to anon/authenticated on new
-- tables; new tables must grant SELECT explicitly and enable RLS.)
alter default privileges in schema public
    revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
    revoke select on tables from anon;


-- ─── 3. RLS on every table (idempotent) ─────────────────────────────────────
alter table public.profiles             enable row level security;
alter table public.expenses             enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.group_expenses       enable row level security;
alter table public.group_expense_splits enable row level security;
alter table public.settlements          enable row level security;
alter table public.recurring_bills      enable row level security;
alter table public.paisa_scores         enable row level security;
alter table public.pdf_imports          enable row level security;
alter table public.streak_activities    enable row level security;
alter table public.ai_chat_history      enable row level security;


-- ─── 4. Drop every client write policy ──────────────────────────────────────
-- Without write privileges these are inert, but leaving them invites someone
-- to "fix" a permission error by re-granting and reopening the hole.
drop policy if exists "Users can update own profile"                        on public.profiles;
drop policy if exists "Users can update own profile (restricted columns)"   on public.profiles;
drop policy if exists "Users can insert own expenses"                       on public.expenses;
drop policy if exists "Users can update own expenses"                       on public.expenses;
drop policy if exists "Users can delete own expenses"                       on public.expenses;
drop policy if exists "Authenticated users can create groups"               on public.groups;
drop policy if exists "Creator can update group"                            on public.groups;
drop policy if exists "Admins can add group members"                        on public.group_members;
drop policy if exists "Members can add group expenses"                      on public.group_expenses;
drop policy if exists "Members can insert expense splits"                   on public.group_expense_splits;
drop policy if exists "Members can add settlements"                         on public.settlements;
drop policy if exists "Users can insert own recurring bills"                on public.recurring_bills;
drop policy if exists "Users can update own recurring bills"                on public.recurring_bills;
drop policy if exists "Users can delete own recurring bills"                on public.recurring_bills;
drop policy if exists "Users can insert own paisa scores"                   on public.paisa_scores;
drop policy if exists "Users can insert own pdf imports"                    on public.pdf_imports;
drop policy if exists "Users can insert own streak activities"              on public.streak_activities;
drop policy if exists "Users can insert own chat history"                   on public.ai_chat_history;


-- ─── 5. Non-recursive group membership check ────────────────────────────────
-- SECURITY DEFINER is genuinely needed here: a policy on group_members that
-- reads group_members would re-apply its own policy and recurse. The function
-- runs as its owner (which bypasses RLS on these tables), is pinned to an empty
-- search_path, only ever answers about the *calling* user, and lives in a
-- schema that PostgREST does not expose, so it cannot be called as an RPC.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.group_members gm
        where gm.group_id = p_group_id
          and gm.user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_group_member(uuid) from public, anon;
grant execute on function private.is_group_member(uuid) to authenticated;


-- ─── 6. Read policies ───────────────────────────────────────────────────────
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Users can view own expenses" on public.expenses;
create policy "Users can view own expenses"
    on public.expenses for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Members can view their groups" on public.groups;
create policy "Members can view their groups"
    on public.groups for select to authenticated
    using (private.is_group_member(id));

drop policy if exists "Members can view group members" on public.group_members;
create policy "Members can view group members"
    on public.group_members for select to authenticated
    using (user_id = (select auth.uid()) or private.is_group_member(group_id));

drop policy if exists "Members can view group expenses" on public.group_expenses;
create policy "Members can view group expenses"
    on public.group_expenses for select to authenticated
    using (private.is_group_member(group_id));

drop policy if exists "Members can view expense splits" on public.group_expense_splits;
create policy "Members can view expense splits"
    on public.group_expense_splits for select to authenticated
    using (exists (
        select 1 from public.group_expenses ge
        where ge.id = group_expense_splits.group_expense_id
          and private.is_group_member(ge.group_id)
    ));

drop policy if exists "Members can view settlements" on public.settlements;
create policy "Members can view settlements"
    on public.settlements for select to authenticated
    using (private.is_group_member(group_id));

drop policy if exists "Users can view own recurring bills" on public.recurring_bills;
create policy "Users can view own recurring bills"
    on public.recurring_bills for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own paisa scores" on public.paisa_scores;
create policy "Users can view own paisa scores"
    on public.paisa_scores for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own pdf imports" on public.pdf_imports;
create policy "Users can view own pdf imports"
    on public.pdf_imports for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own streak activities" on public.streak_activities;
create policy "Users can view own streak activities"
    on public.streak_activities for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own chat history" on public.ai_chat_history;
create policy "Users can view own chat history"
    on public.ai_chat_history for select to authenticated
    using ((select auth.uid()) = user_id);


-- ─── 7. Signup trigger with a fixed search_path ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;


-- ─── 8. Data-integrity guards for new writes ────────────────────────────────
-- NOT VALID: enforced for new and updated rows without failing on any existing
-- row that predates the backend's validation. Validate later with
--   alter table public.profiles validate constraint <name>;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_role_valid') then
        alter table public.profiles
            add constraint profiles_role_valid check (role in ('user', 'admin')) not valid;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'profiles_monthly_budget_range') then
        alter table public.profiles
            add constraint profiles_monthly_budget_range check (monthly_budget between 0 and 10000000) not valid;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'profiles_investment_target_range') then
        alter table public.profiles
            add constraint profiles_investment_target_range check (investment_target between 0 and 10000000) not valid;
    end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Now run supabase/tests/verify_production.sql and confirm every check
-- reports PASS.
-- ═══════════════════════════════════════════════════════════════════════════
