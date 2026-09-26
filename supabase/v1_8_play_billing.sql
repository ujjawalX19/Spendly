-- ═══════════════════════════════════════════════════════════════════════════
-- Vittova v1.8 (app v1.1) — Google Play Billing entitlements
--
-- Run in the Supabase SQL Editor AFTER v1_7_money_decisions.sql. Idempotent.
-- Adds one table and one profile column; never modifies existing user data.
--
-- DEPLOY ORDER: apply BEFORE switching billing on (PLAY_BILLING_ENABLED=true
-- on the server). While billing is off, nothing reads or writes these objects.
--
-- play_purchases
--   One row per Google Play subscription purchase token that the backend has
--   verified with the Google Play Developer API. The token is bound to the
--   first account that verifies it (unique token_hash). The raw token is kept
--   so the backend can re-read the subscription from Google (renewals,
--   cancellations, refunds); it is not a payment credential and grants
--   nothing on its own. Service role only: clients can neither read nor write.
--
-- profiles.pro_source
--   'play' when Pro comes from a verified Google Play subscription, 'manual'
--   for a deliberate operator grant (billing never removes those), or null.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists pro_source text;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_pro_source_valid') then
        alter table public.profiles
            add constraint profiles_pro_source_valid check (pro_source is null or pro_source in ('play', 'manual')) not valid;
    end if;
end $$;

create table if not exists public.play_purchases (
    token_hash         text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
    user_id            uuid not null references public.profiles (id) on delete cascade,
    purchase_token     text not null check (char_length(purchase_token) between 10 and 4096),
    product_id         text not null check (char_length(product_id) between 1 and 100),
    base_plan_id       text check (char_length(base_plan_id) <= 100),
    offer_id           text check (char_length(offer_id) <= 100),
    state              text not null check (char_length(state) between 1 and 60),
    expires_at         timestamptz,
    entitled           boolean not null default false,
    acknowledged       boolean not null default false,
    order_id           text check (char_length(order_id) <= 100),
    linked_token_hash  text check (linked_token_hash is null or linked_token_hash ~ '^[0-9a-f]{64}$'),
    test_purchase      boolean not null default false,
    last_verified_at   timestamptz not null default now(),
    created_at         timestamptz not null default now()
);
comment on table public.play_purchases is 'Google Play subscriptions verified server-side with the Play Developer API. Written and read only by the backend (service role).';
create index if not exists idx_play_purchases_user on public.play_purchases (user_id, entitled);

alter table public.play_purchases enable row level security;
revoke all on public.play_purchases from anon, authenticated;
