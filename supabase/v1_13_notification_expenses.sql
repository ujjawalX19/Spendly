-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.13 (app v1.1) — Idempotent automatic expenses
--
-- Run in the Supabase SQL Editor AFTER v1_12_age_awareness.sql. Idempotent.
-- Adds one nullable column and one index; never modifies or deletes existing
-- user data.
--
--   expenses.client_ref   the phone's id for a payment it detected from a
--                         supported payment-app notification (32 hex
--                         characters, derived on the device; no notification
--                         text). Set only by the backend, only for
--                         source = 'upi_auto'. Null for every other expense.
--
--   unique (user_id, client_ref) where client_ref is not null
--                         so a detection the phone uploads twice (a retry after
--                         a lost response, the app reopened mid-upload) is
--                         stored once. The API answers a repeat with the
--                         existing expense instead of creating another.
--
-- ACCESS: unchanged. Clients still have no INSERT/UPDATE/DELETE on expenses
-- (v1_2); every write goes through the API with the verified user id.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.expenses add column if not exists client_ref text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'expenses_client_ref_format') then
        alter table public.expenses
            add constraint expenses_client_ref_format
            check (client_ref is null or client_ref ~ '^[0-9a-f]{32}$') not valid;
    end if;
end $$;

create unique index if not exists expenses_client_ref_once
    on public.expenses (user_id, client_ref)
    where client_ref is not null;

comment on column public.expenses.client_ref is 'Device id of a payment detected from a supported payment-app notification (source upi_auto). Unique per user so a retried upload is stored once. Written only by the backend.';
