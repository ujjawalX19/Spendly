-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova (formerly Spendly) — production security verification (READ-ONLY)
--
-- Paste into the Supabase SQL Editor after applying v1_2_security_p0.sql.
-- Changes nothing. Every row should say PASS; investigate any FAIL before
-- releasing the app.
-- ═══════════════════════════════════════════════════════════════════════════

with
app_tables(t) as (
    values ('profiles'), ('expenses'), ('groups'), ('group_members'), ('group_expenses'),
           ('group_expense_splits'), ('settlements'), ('recurring_bills'), ('paisa_scores'),
           ('pdf_imports'), ('streak_activities'), ('ai_chat_history'),
           -- v1_7_money_decisions.sql (app v1.1)
           ('money_streak_days'), ('money_xp_ledger'),
           -- v1_9_subscription_audit.sql
           ('recurring_decisions'), ('recurring_expectations')
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
    -- (a missing table is reported, not an error, so the script always runs)
    select 'No SELECT for anon on ' || a.t,
           case when to_regclass('public.' || a.t) is null then false
                else not has_table_privilege('anon', 'public.' || a.t, 'SELECT') end,
           case when to_regclass('public.' || a.t) is null then 'table missing' else '' end
    from app_tables a

    union all
    -- 4. Explicit escalation checks on the most sensitive columns
    select 'authenticated cannot UPDATE profiles.' || col,
           case when not exists (select 1 from information_schema.columns
                                 where table_schema = 'public' and table_name = 'profiles' and column_name = col) then false
                else not has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE') end,
           case when not exists (select 1 from information_schema.columns
                                 where table_schema = 'public' and table_name = 'profiles' and column_name = col) then 'column missing' else '' end
    from unnest(array['is_pro', 'pro_expires_at', 'role', 'is_banned', 'total_chillar',
                      'streak_current', 'streak_longest', 'chat_messages_today',
                      'money_checks_today', 'money_checks_reset_at', 'money_streak_started_on', 'pro_source']) as col

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
    -- v1.6 Owner Console telemetry: backend (service role) only
    select r || ' cannot SELECT/INSERT ' || o,
           case when to_regclass('public.' || o) is null then false
                else not (has_table_privilege(r, 'public.' || o, 'SELECT') or has_table_privilege(r, 'public.' || o, 'INSERT')) end,
           case when to_regclass('public.' || o) is null then 'missing — run v1_6_owner_console.sql' else '' end
    from unnest(array['app_events', 'app_installs', 'ops_issue_states']) as o,
         unnest(array['anon', 'authenticated']) as r

    union all
    select 'RLS enabled: ' || o,
           coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || o)), false),
           case when to_regclass('public.' || o) is null then 'missing — run v1_6_owner_console.sql' else '' end
    from unnest(array['app_events', 'app_installs', 'ops_issue_states']) as o

    union all
    select 'admin_audit_log is append-only (trigger)',
           exists (select 1 from pg_trigger where tgname = 'trg_admin_audit_log_append_only' and tgrelid = to_regclass('public.admin_audit_log')),
           'run v1_6_owner_console.sql'

    union all
    -- v1.7 (app v1.1): no-spend days are an allowed streak activity
    select 'streak_activities accepts no_spend_day',
           exists (select 1 from pg_constraint
                   where conname = 'streak_activities_activity_check'
                     and pg_get_constraintdef(oid) like '%no_spend_day%'),
           'run v1_7_money_decisions.sql'

    union all
    select 'Money XP awards are unique per (user, reason, ref_key)',
           exists (select 1 from pg_constraint where conname = 'money_xp_ledger_once' and contype = 'u'),
           'run v1_7_money_decisions.sql'

    union all
    -- v1.8 (app v1.1): Google Play purchases are backend-only
    select r || ' cannot SELECT/INSERT play_purchases',
           case when to_regclass('public.play_purchases') is null then false
                else not (has_table_privilege(r, 'public.play_purchases', 'SELECT') or has_table_privilege(r, 'public.play_purchases', 'INSERT')) end,
           case when to_regclass('public.play_purchases') is null then 'missing — run v1_8_play_billing.sql' else '' end
    from unnest(array['anon', 'authenticated']) as r

    union all
    select 'RLS enabled: play_purchases',
           coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.play_purchases')), false),
           case when to_regclass('public.play_purchases') is null then 'missing — run v1_8_play_billing.sql' else '' end

    union all
    -- v1.10 (app v1.1): sponsored challenge tables are backend-only
    select r || ' cannot SELECT/INSERT ' || o,
           case when to_regclass('public.' || o) is null then false
                else not (has_table_privilege(r, 'public.' || o, 'SELECT') or has_table_privilege(r, 'public.' || o, 'INSERT')) end,
           case when to_regclass('public.' || o) is null then 'missing — run v1_10_sponsored_challenges.sql' else '' end
    from unnest(array['sponsors', 'campaigns', 'campaign_vouchers', 'challenge_enrollments', 'challenge_completions', 'reward_issuances', 'campaign_impressions']) as o,
         unnest(array['anon', 'authenticated']) as r

    union all
    select 'Challenge completions are immutable (trigger)',
           exists (select 1 from pg_trigger where tgname = 'trg_challenge_completions_immutable'),
           'run v1_10_sponsored_challenges.sql'

    union all
    select 'Exactly one admin account (owner)',
           (select count(*) from public.profiles where role = 'admin') = 1,
           (select count(*)::text || ' admin(s); must also match ADMIN_EMAIL on the server' from public.profiles where role = 'admin')

    union all
    -- 12. Every Vittova table referencing profiles cascades on delete (no orphaned data)
    -- Telemetry rows are anonymised (SET NULL) instead: counts survive, the link to the person does not.
    -- Only tables in the public schema are ours; Supabase's own auth.* tables
    -- (e.g. auth.scim_users) are managed by Supabase and excluded.
    select 'ON DELETE CASCADE: ' || con.conrelid::regclass::text || '.' || con.conname,
           con.confdeltype = 'c'
             or (con.confdeltype = 'n' and (select relname from pg_class where oid = con.conrelid) in ('app_events', 'app_installs')),
           ''
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and con.connamespace = 'public'::regnamespace
)
select case when ok then 'PASS' else 'FAIL' end as result, check_name, detail
from checks
order by ok, check_name;
