-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.5 — backfill missing profile rows
--
-- Run in the Supabase SQL Editor. Idempotent. Only INSERTS rows that are
-- missing; never updates or deletes existing data.
--
-- Why: production had 17 auth accounts but 9 profiles (checked 2026-09-14).
-- Accounts created before the signup trigger worked have no profile row, and
-- the app cannot load for them ("We couldn't load your account"). The backend
-- now also creates a missing row on sign-in (POST /api/auth/profile), so this
-- script is a one-time cleanup that fixes everyone at once.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create a default profile for every auth account that has none.
insert into public.profiles (id, email, full_name)
select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 2. Make sure the signup trigger exists, so this cannot recur.
--    (handle_new_user itself is defined in v1_2_security_p0.sql.)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify (both should return 0):
--   select count(*) from auth.users u left join public.profiles p on p.id = u.id where p.id is null;
--   select count(*) from pg_trigger where tgname = 'on_auth_user_created' and not tgenabled = 'O';
-- ═══════════════════════════════════════════════════════════════════════════
