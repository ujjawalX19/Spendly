-- ═══════════════════════════════════════════════════════════════════════════
-- v1.16 — category budgets and income
--
--   category_budgets   a monthly limit per expense category, one row per
--                      user and category.
--   income_entries     money the user says they received. Self-reported:
--                      Vittova cannot see bank balances.
--
-- ACCESS: the backend (service role) is the only writer. Signed-in users may
-- read their OWN rows; nobody else's. The anon role has no access.
--
-- Additive and safe to run twice. Nothing existing changes.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.category_budgets (
    user_id     uuid not null references public.profiles (id) on delete cascade,
    category    public.expense_category not null,
    limit_inr   integer not null check (limit_inr between 1 and 100000000),
    updated_at  timestamptz not null default now(),
    primary key (user_id, category)
);
comment on table public.category_budgets is 'A user''s monthly spending limit for one category.';

create table if not exists public.income_entries (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.profiles (id) on delete cascade,
    amount_inr   integer not null check (amount_inr between 1 and 100000000),
    source       text not null default 'Other' check (source in ('Salary', 'Freelance', 'Family', 'Refund', 'Other')),
    note         text check (char_length(note) <= 200),
    received_on  date not null,
    created_at   timestamptz not null default now()
);
comment on table public.income_entries is 'Income the user entered themselves. Not verified against any bank.';
create index if not exists idx_income_entries_user_date on public.income_entries (user_id, received_on desc);

alter table public.category_budgets enable row level security;
alter table public.income_entries   enable row level security;

revoke all on public.category_budgets from anon;
revoke all on public.income_entries   from anon;
revoke insert, update, delete on public.category_budgets from authenticated;
revoke insert, update, delete on public.income_entries   from authenticated;
grant select on public.category_budgets to authenticated;
grant select on public.income_entries   to authenticated;

drop policy if exists category_budgets_select_own on public.category_budgets;
create policy category_budgets_select_own on public.category_budgets
    for select to authenticated using (user_id = auth.uid());

drop policy if exists income_entries_select_own on public.income_entries;
create policy income_entries_select_own on public.income_entries
    for select to authenticated using (user_id = auth.uid());
