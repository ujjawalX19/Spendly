-- ═══════════════════════════════════════════════════════════════════════════
-- v1.19 — Vittova AI memory and feedback
--
--   ai_memories     facts the user chose to tell Vittova AI ("salary arrives
--                   on the 1st", "saving for a laptop"). Structured, one row
--                   per fact, separate from the chat transcript. The user
--                   sees, edits and deletes them; personalisation can be
--                   switched off, which stops both reading and writing.
--   ai_feedback     thumbs up/down on an answer, for answer-quality tracking.
--   profiles        ai_personalisation: whether memories may be used (default
--                   on, the user turns it off in Profile).
--
-- ACCESS: the backend (service role) is the only writer. Users may read
-- their OWN rows. The anon role has no access.
--
-- Additive and safe to run twice. Nothing existing changes.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists ai_personalisation boolean not null default true;

create table if not exists public.ai_memories (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    kind        text not null check (kind in ('income_cycle', 'goal', 'preference', 'situation', 'habit_target', 'language')),
    content     text not null check (char_length(btrim(content)) between 2 and 200),
    source      text not null default 'user' check (source in ('user', 'confirmed')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
comment on table public.ai_memories is 'Facts the user chose to tell Vittova AI. Never inferred silently; the user controls every row.';
create index if not exists idx_ai_memories_user on public.ai_memories (user_id, updated_at desc);

create table if not exists public.ai_feedback (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    message_id  uuid references public.ai_chat_history (id) on delete cascade,
    helpful     boolean not null,
    intent      text,
    source      text,
    created_at  timestamptz not null default now()
);
create index if not exists idx_ai_feedback_user on public.ai_feedback (user_id, created_at desc);

alter table public.ai_memories enable row level security;
alter table public.ai_feedback enable row level security;

revoke all on public.ai_memories from anon;
revoke all on public.ai_feedback from anon;
revoke insert, update, delete on public.ai_memories from authenticated;
revoke insert, update, delete on public.ai_feedback from authenticated;
grant select on public.ai_memories to authenticated;
grant select on public.ai_feedback to authenticated;

drop policy if exists ai_memories_select_own on public.ai_memories;
create policy ai_memories_select_own on public.ai_memories
    for select to authenticated using (user_id = auth.uid());

drop policy if exists ai_feedback_select_own on public.ai_feedback;
create policy ai_feedback_select_own on public.ai_feedback
    for select to authenticated using (user_id = auth.uid());
