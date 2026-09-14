-- ═══════════════════════════════════════════════════════════════════════════
-- Spendly — production security verification (READ-ONLY)
--
-- Paste into the Supabase SQL Editor after applying v1_2_security_p0.sql.
-- Changes nothing. Every row should say PASS; investigate any FAIL before
-- releasing the app.
-- ═══════════════════════════════════════════════════════════════════════════

with
app_tables(t) as (
    values ('profiles'), ('expenses'), ('groups'), ('group_members'), ('group_expenses'),
           ('group_expense_splits'), ('settlements'), ('recurring_bills'), ('paisa_scores'),
           ('pdf_imports'), ('streak_activities'), ('ai_chat_history')
),
checks as (
    -- 1. RLS enabled on every app table
    select 'RLS enabled: ' || a.t as check_name,
           coalesce(c.relrowsecurity, false) as ok,
           case when c.oid is null then 'table missing' else '' end as detail
    from app_tables a
    left join pg_class c on c.relname = a.t and c.relnamespace = 'public'::regnamespace

    union all
    -- 2. No client write privileges on any public table (table- or column-level)
    select 'No INSERT/UPDATE/DELETE for anon/authenticated on ' || a.t,
           not exists (
               select 1 from information_schema.role_table_grants g
               where g.table_schema = 'public' and g.table_name = a.t
                 and g.grantee in ('anon', 'authenticated')
                 and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
           ) and not exists (
               select 1 from information_schema.column_privileges p
               where p.table_schema = 'public' and p.table_name = a.t
                 and p.grantee in ('anon', 'authenticated')
                 and p.privilege_type in ('INSERT', 'UPDATE')
           ),
           ''
    from app_tables a

    union all
    -- 3. anon cannot read app tables
    select 'No SELECT for anon on ' || a.t,
           not has_table_privilege('anon', 'public.' || a.t, 'SELECT'),
           ''
    from app_tables a

    union all
    -- 4. Explicit escalation checks on the most sensitive columns
    select 'authenticated cannot UPDATE profiles.' || col,
           not has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE'),
           ''
    from unnest(array['is_pro', 'pro_expires_at', 'role', 'is_banned', 'total_chillar',
                      'streak_current', 'streak_longest', 'chat_messages_today']) as col

    union all
    -- 5. The self-join group policy is gone
    select 'No "users can add themselves" group_members policy',
           not exists (
               select 1 from pg_policies
               where schemaname = 'public' and tablename = 'group_members' and cmd in ('INSERT', 'ALL')
           ),
           ''

    union all
    -- 6. group policies use the non-recursive helper
    select 'group_members SELECT policy uses private.is_group_member',
           exists (
               select 1 from pg_policies
               where schemaname = 'public' and tablename = 'group_members' and cmd = 'SELECT'
                 and qual like '%is_group_member%'
           ),
           ''

    union all
    -- 7. SECURITY DEFINER functions have a fixed search_path
    select 'search_path pinned on security definer ' || p.proname,
           coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false),
           n.nspname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname in ('public', 'private')

    union all
    -- 8. Helper is not exposed through the API schema
    select 'private.is_group_member not executable by anon',
           case when to_regprocedure('private.is_group_member(uuid)') is null then false
                else not has_function_privilege('anon', to_regprocedure('private.is_group_member(uuid)'), 'EXECUTE') end,
           case when to_regprocedure('private.is_group_member(uuid)') is null then 'function missing — run v1_2_security_p0.sql' else '' end

    union all
    -- 9. Expense sources required by the backend exist
    select 'expense_source has ' || v,
           exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid
                   where ty.typname = 'expense_source' and e.enumlabel = v),
           ''
    from unnest(array['manual', 'ai_scan', 'upi_auto', 'pdf_import']) as v

    union all
    -- 10. Nobody has Pro without an expiry unless deliberately granted (review list)
    select 'Profiles with is_pro = true (review manually; billing is not live)',
           (select count(*) from public.profiles where is_pro) = 0,
           (select count(*)::text || ' profile(s)' from public.profiles where is_pro)

    union all
    -- 11. Admins (review manually)
    select 'Admin accounts (review manually)',
           true,
           (select coalesce(string_agg(email, ', '), 'none') from public.profiles where role = 'admin')

    union all
    -- 11b. Owner admin panel objects (v1_4_admin_ops.sql) are service-role only
    select 'No client access to ' || o || ' (' || r || ')',
           case when to_regclass('public.' || o) is null then false
                else not has_table_privilege(r, 'public.' || o, 'SELECT') end,
           case when to_regclass('public.' || o) is null then 'missing — run v1_4_admin_ops.sql' else '' end
    from unnest(array['admin_audit_log', 'ops_events', 'admin_user_stats']) as o,
         unnest(array['anon', 'authenticated']) as r

    union all
    select 'RLS enabled: ' || o,
           coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || o)), false),
           ''
    from unnest(array['admin_audit_log', 'ops_events']) as o

    union all
    select 'Exactly one admin account (owner)',
           (select count(*) from public.profiles where role = 'admin') = 1,
           (select count(*)::text || ' admin(s); must also match ADMIN_EMAIL on the server' from public.profiles where role = 'admin')

    union all
    -- 12. Every table referencing profiles cascades on delete (no orphaned data)
    select 'ON DELETE CASCADE: ' || con.conrelid::regclass::text || '.' || con.conname,
           con.confdeltype = 'c',
           ''
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
)
select case when ok then 'PASS' else 'FAIL' end as result, check_name, detail
from checks
order by ok, check_name;
