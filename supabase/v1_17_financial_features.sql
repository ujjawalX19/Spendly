-- ═══════════════════════════════════════════════════════════════════════════
-- v1.17 — purchase decisions, Money-Saved and receipt splits
--
--   planned_purchases      what the user decided after an Afford-It check.
--   savings_events         the Money-Saved ledger. Self-reported: an avoided
--                          purchase or a lower price, as the user stated it.
--   group_expense_receipts how a receipt was divided; no image is kept.
--
-- ACCESS: the backend (service role) is the only writer. Users may read their
-- OWN purchases and savings, and receipts of groups they belong to.
--
-- Additive and safe to run twice. Nothing existing changes.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.planned_purchases (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    label       text check (char_length(label) <= 60),
    amount      numeric(12,2) not null check (amount > 0),
    decision    text not null check (decision in ('bought', 'deferred', 'skipped')),
    created_at  timestamptz not null default now()
);
create index if not exists idx_planned_purchases_user on public.planned_purchases (user_id, created_at desc);

create table if not exists public.savings_events (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    kind        text not null check (kind in ('skipped_purchase', 'price_difference')),
    label       text check (char_length(label) <= 60),
    amount      numeric(12,2) not null check (amount > 0),
    purchase_id uuid references public.planned_purchases (id) on delete set null,
    created_at  timestamptz not null default now()
);
create index if not exists idx_savings_events_user on public.savings_events (user_id, created_at desc);

create table if not exists public.group_expense_receipts (
    id               uuid primary key default gen_random_uuid(),
    group_expense_id uuid not null references public.group_expenses (id) on delete cascade,
    group_id         uuid not null references public.groups (id) on delete cascade,
    created_by       uuid not null references public.profiles (id) on delete cascade,
    client_ref       text not null check (char_length(client_ref) between 8 and 64),
    total            numeric(12,2) not null check (total > 0),
    allocation       jsonb not null,
    created_at       timestamptz not null default now(),
    unique (group_id, client_ref)
);

alter table public.planned_purchases      enable row level security;
alter table public.savings_events         enable row level security;
alter table public.group_expense_receipts enable row level security;

revoke all on public.planned_purchases      from anon;
revoke all on public.savings_events         from anon;
revoke all on public.group_expense_receipts from anon;
revoke insert, update, delete on public.planned_purchases      from authenticated;
revoke insert, update, delete on public.savings_events         from authenticated;
revoke insert, update, delete on public.group_expense_receipts from authenticated;
grant select on public.planned_purchases      to authenticated;
grant select on public.savings_events         to authenticated;
grant select on public.group_expense_receipts to authenticated;

drop policy if exists planned_purchases_select_own on public.planned_purchases;
create policy planned_purchases_select_own on public.planned_purchases
    for select to authenticated using (user_id = auth.uid());

drop policy if exists savings_events_select_own on public.savings_events;
create policy savings_events_select_own on public.savings_events
    for select to authenticated using (user_id = auth.uid());

drop policy if exists group_expense_receipts_select_member on public.group_expense_receipts;
create policy group_expense_receipts_select_member on public.group_expense_receipts
    for select to authenticated using (
        exists (select 1 from public.group_members m where m.group_id = group_expense_receipts.group_id and m.user_id = auth.uid())
    );
