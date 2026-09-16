-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.6 — Owner Console: install & product-event telemetry, error
-- resolution state, append-only audit log
--
-- Run in the Supabase SQL Editor AFTER v1_4_admin_ops.sql (and v1_5). Idempotent;
-- creates tables, indexes, one trigger and replaces one admin-only view. Never
-- modifies or deletes user data.
--
-- DEPLOY ORDER: safe in either order with the backend. Every telemetry write
-- is best effort, and the Owner Console shows "not available — run
-- supabase/v1_6_owner_console.sql" until this has been applied.
--
-- PRIVACY
--   app_installs  one row per app installation: a random id the app generates
--                 on first launch (no advertising id, IMEI, Android id, phone
--                 number or IP), the platform, the app version and when it was
--                 first/last seen. Linked to an account only once that account
--                 signs in on the install; unlinked if the account is deleted.
--   app_events    event name, time, platform/version and a few allow-listed
--                 enum-like properties (e.g. sign-in method, failure code).
--                 Never amounts, descriptions, merchants, statement text,
--                 AI questions or answers, emails or tokens.
--
-- None of these objects is readable or writable by the anon or authenticated
-- roles. Only the backend's service-role client touches them.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Installs (first launches reported by the app) ──────────────────────
create table if not exists public.app_installs (
    install_id     uuid primary key,
    platform       text not null check (platform in ('android', 'ios', 'web')),
    app_version    text check (char_length(app_version) <= 32),
    user_id        uuid references auth.users (id) on delete set null,
    first_seen_at  timestamptz not null default now(),
    last_seen_at   timestamptz not null default now()
);
create index if not exists idx_app_installs_first_seen on public.app_installs (first_seen_at desc);
create index if not exists idx_app_installs_last_seen on public.app_installs (last_seen_at desc);
create index if not exists idx_app_installs_user on public.app_installs (user_id, last_seen_at desc) where user_id is not null;

alter table public.app_installs enable row level security;


-- ─── 2. Product events ──────────────────────────────────────────────────────
-- source 'server': recorded by the backend from the outcome of an
--                  authenticated API request (trusted).
-- source 'client': reported by the app (sign-in outcomes, app opens); the
--                  endpoint is unauthenticated for first launches, so these
--                  counts are self-reported and labelled as such.
create table if not exists public.app_events (
    id           bigint generated always as identity primary key,
    name         text not null check (name ~ '^[a-z][a-z0-9_]{0,59}$'),
    source       text not null check (source in ('client', 'server')),
    install_id   uuid,
    user_id      uuid references auth.users (id) on delete set null,
    platform     text check (platform in ('android', 'ios', 'web')),
    app_version  text check (char_length(app_version) <= 32),
    props        jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 1024),
    status_code  integer,
    duration_ms  integer,
    created_at   timestamptz not null default now()
);
create index if not exists idx_app_events_created on public.app_events (created_at desc);
create index if not exists idx_app_events_name_created on public.app_events (name, created_at desc);
create index if not exists idx_app_events_user_created on public.app_events (user_id, created_at desc) where user_id is not null;
create index if not exists idx_app_events_install on public.app_events (install_id) where install_id is not null;

alter table public.app_events enable row level security;


-- ─── 3. Error Center: resolution state for grouped operational issues ──────
-- An issue is a fingerprint of (type, route, code, status) from ops_events.
-- It counts as resolved while no occurrence is newer than resolved_at, so a
-- recurrence re-opens it automatically.
create table if not exists public.ops_issue_states (
    fingerprint        text primary key check (char_length(fingerprint) between 1 and 300),
    resolved_at        timestamptz not null default now(),
    resolved_by        uuid,
    resolved_by_email  text,
    note               text check (char_length(note) <= 500)
);

alter table public.ops_issue_states enable row level security;


-- ─── 4. Privileges: service role only ───────────────────────────────────────
revoke all on public.app_installs, public.app_events, public.ops_issue_states from anon, authenticated;
revoke all on sequence public.app_events_id_seq from anon, authenticated;
grant select, insert, update on public.app_installs to service_role;
grant select, insert on public.app_events to service_role;
grant select, insert, update, delete on public.ops_issue_states to service_role;


-- ─── 5. Audit log is append-only at the database ───────────────────────────
-- v1.4 relied on the backend never updating or deleting rows. Enforce it: no
-- role, including service_role, can rewrite or remove an audit entry. (A
-- superuser can still drop the trigger deliberately from the SQL editor.)
create or replace function public.admin_audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'admin_audit_log is append-only';
end;
$$;

drop trigger if exists trg_admin_audit_log_append_only on public.admin_audit_log;
create trigger trg_admin_audit_log_append_only
    before update or delete on public.admin_audit_log
    for each row execute function public.admin_audit_log_append_only();

revoke all on function public.admin_audit_log_append_only() from public, anon, authenticated;


-- ─── 6. admin_user_stats: add receipt-scan and import counts ───────────────
-- Same columns as v1.4, two appended (create or replace view only allows
-- adding columns at the end). Counts only.
create or replace view public.admin_user_stats
with (security_invoker = true) as
select
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.is_banned,
    p.is_pro,
    p.pro_expires_at,
    p.created_at,
    p.last_active_at,
    (select count(*) from public.expenses e where e.user_id = p.id)::int                               as expense_count,
    (case when p.investment_target > 0 then 1 else 0 end)::int                                          as goal_count,
    ((select count(*) from public.recurring_bills b where b.user_id = p.id)
      + (select count(*) from public.cancelled_subscriptions c where c.user_id = p.id))::int            as subscription_count,
    (select count(*) from public.ai_chat_history a where a.user_id = p.id and a.role = 'user')::int    as ai_question_count,
    (select count(*) from public.group_members g where g.user_id = p.id)::int                          as group_count,
    greatest(
        (select max(e.created_at) from public.expenses e where e.user_id = p.id),
        (select max(a.created_at) from public.ai_chat_history a where a.user_id = p.id and a.role = 'user'),
        (select max(i.created_at) from public.pdf_imports i where i.user_id = p.id)
    )                                                                                                   as last_activity_at,
    (select count(*) from public.expenses e where e.user_id = p.id and e.source = 'ai_scan')::int     as receipt_scan_count,
    (select count(*) from public.pdf_imports i where i.user_id = p.id)::int                            as pdf_import_count
from public.profiles p;

revoke all on public.admin_user_stats from anon, authenticated;
grant select on public.admin_user_stats to service_role;


-- ─── 7. Retention (run manually or schedule with pg_cron if enabled) ────────
--   delete from public.app_events where created_at < now() - interval '400 days';
-- app_installs is one small row per install and is kept for install totals.

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Verify:
--   select has_table_privilege('authenticated', 'public.app_events', 'select');      -- false
--   select has_table_privilege('anon', 'public.app_installs', 'insert');             -- false
--   select has_table_privilege('authenticated', 'public.ops_issue_states', 'select'); -- false
--   update public.admin_audit_log set action = action where false;                   -- no-op (0 rows)
-- ═══════════════════════════════════════════════════════════════════════════
