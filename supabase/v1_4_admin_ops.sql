-- ═══════════════════════════════════════════════════════════════════════════
-- Spendly v1.4 — owner admin panel: audit log, operational events, activity
--
-- Run in the Supabase SQL Editor AFTER v1_3_product_core.sql. Idempotent;
-- creates tables, one column, one view and indexes. Never modifies or deletes
-- user data.
--
-- DEPLOY ORDER: run this BEFORE deploying the backend that writes these
-- tables. The backend treats every write here as best effort, so an older
-- database degrades the admin panel ("not tracked yet") rather than the app.
--
-- None of these objects is readable or writable by the anon or authenticated
-- roles. Only the backend's service-role client touches them, and only the
-- admin API (owner-only, see backend/middleware/requireOwner.js) reads them.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Activity: when a user last made an authenticated API request ───────
-- Written by `protect` at most once every 10 minutes per user. Powers the
-- active-user counts; it records a timestamp only, never what was done.
alter table public.profiles
    add column if not exists last_active_at timestamptz;

create index if not exists idx_profiles_last_active on public.profiles (last_active_at desc);
create index if not exists idx_profiles_created_at on public.profiles (created_at desc);


-- ─── 2. Admin audit log ─────────────────────────────────────────────────────
-- Every sensitive admin action and every refused admin access attempt.
-- `details` holds action parameters (e.g. new Pro expiry, reason); never
-- tokens, passwords or financial transaction contents.
create table if not exists public.admin_audit_log (
    id              uuid primary key default gen_random_uuid(),
    actor_id        uuid,                       -- no FK: the log must outlive a deleted account
    actor_email     text,
    action          text not null check (char_length(action) between 1 and 60),
    target_user_id  uuid,
    details         jsonb not null default '{}'::jsonb,
    ip              text,
    created_at      timestamptz not null default now()
);
create index if not exists idx_admin_audit_log_created on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_target on public.admin_audit_log (target_user_id, created_at desc);

-- Append-only in practice: the backend never updates or deletes rows.
alter table public.admin_audit_log enable row level security;


-- ─── 3. Operational events ──────────────────────────────────────────────────
-- Failures and background-job runs, for the System Health screen. Messages
-- are fixed error codes, never provider responses, request bodies, statement
-- text or AI output (which can contain personal financial data).
create table if not exists public.ops_events (
    id           uuid primary key default gen_random_uuid(),
    type         text not null check (char_length(type) between 1 and 60),
    severity     text not null default 'error' check (severity in ('info', 'warning', 'error')),
    route        text check (char_length(route) <= 120),
    code         text check (char_length(code) <= 60),
    status_code  integer,
    duration_ms  integer,
    created_at   timestamptz not null default now()
);
create index if not exists idx_ops_events_created on public.ops_events (created_at desc);
create index if not exists idx_ops_events_type_created on public.ops_events (type, created_at desc);

alter table public.ops_events enable row level security;


-- ─── 4. Privileges: service role only ───────────────────────────────────────
-- No policies are created, so with RLS enabled the anon and authenticated
-- roles see zero rows even if a grant were added by mistake.
revoke all on public.admin_audit_log, public.ops_events from anon, authenticated;


-- ─── 5. Per-user usage counts for the admin user table ─────────────────────
-- One row per profile with COUNTS only (no amounts, descriptions or merchants),
-- so the admin API can filter, sort by usage and paginate server-side without
-- loading every user into the browser. Requires cancelled_subscriptions
-- (v1_3_product_core.sql).
--
-- security_invoker: the view runs with the caller's privileges. Only the
-- service role (which bypasses RLS) is granted access; clients get nothing.
-- Correlated counts are fine at Spendly's current scale; if the user base
-- grows large, replace this with a materialized view refreshed on a schedule.
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
    )                                                                                                   as last_activity_at
from public.profiles p;

revoke all on public.admin_user_stats from anon, authenticated;
grant select on public.admin_user_stats to service_role;

create index if not exists idx_ai_chat_history_user_role on public.ai_chat_history (user_id, role);


-- ─── 6. Retention (run manually or schedule with pg_cron if enabled) ────────
--   delete from public.ops_events where created_at < now() - interval '90 days';
-- The audit log is kept indefinitely.

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Verify:
--   select has_table_privilege('authenticated', 'public.admin_audit_log', 'select'); -- false
--   select has_table_privilege('authenticated', 'public.ops_events', 'select');      -- false
--   select has_table_privilege('authenticated', 'public.admin_user_stats', 'select'); -- false
--   select has_table_privilege('anon', 'public.admin_user_stats', 'select');          -- false
-- ═══════════════════════════════════════════════════════════════════════════
