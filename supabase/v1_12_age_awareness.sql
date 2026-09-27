-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.12 (app v1.1) — Age-aware accounts
--
-- Run in the Supabase SQL Editor AFTER v1_11_save_to_earn.sql. Idempotent.
-- Adds columns and one table; never modifies or deletes existing user data.
--
--   profiles.birth_year_month   'YYYY-MM' only (no day, no document): the least
--                               needed to know whether someone is under 18 and
--                               when they turn 18. Set once by the backend from
--                               the user's own answer; not client-writable.
--   profiles.age_confirmed_at   when it was given.
--   guardian_consents           for under-18 accounts, IF the under-18
--                               experience is ever switched on: whether a
--                               parent/guardian's consent was verified, how
--                               (method label only) and by whom (the admin).
--                               No guardian documents or ID numbers are stored.
--
-- ACCESS: backend only writes. Users read their own consent row. The new
-- profile columns are covered by the existing profiles SELECT policy; clients
-- have no UPDATE on profiles at all (v1_2: every change goes through the API).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists birth_year_month text;
alter table public.profiles add column if not exists age_confirmed_at timestamptz;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_birth_year_month_format') then
        alter table public.profiles
            add constraint profiles_birth_year_month_format
            check (birth_year_month is null or birth_year_month ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$') not valid;
    end if;
end $$;

create table if not exists public.guardian_consents (
    user_id      uuid primary key references public.profiles (id) on delete cascade,
    status       text not null default 'pending' check (status in ('pending', 'verified', 'revoked')),
    method       text check (method is null or method in ('support_verified')),
    verified_by  uuid references public.profiles (id) on delete set null,
    requested_at timestamptz not null default now(),
    decided_at   timestamptz,
    check (status <> 'verified' or (method is not null and decided_at is not null))
);
comment on table public.guardian_consents is 'Parent/guardian consent state for under-18 accounts (only used if the under-18 experience is enabled). No documents or ID numbers stored. Written only by the backend.';

alter table public.guardian_consents enable row level security;
revoke all on public.guardian_consents from anon, authenticated;
grant select on public.guardian_consents to authenticated;

drop policy if exists "Users can view own guardian consent" on public.guardian_consents;
create policy "Users can view own guardian consent"
    on public.guardian_consents for select to authenticated
    using ((select auth.uid()) = user_id);

