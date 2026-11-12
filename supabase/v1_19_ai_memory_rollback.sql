-- Vittova v1.19 ROLLBACK. THIS SCRIPT DELETES DATA: every AI memory and every
-- answer rating. Export both tables first. The AI keeps working without them;
-- memories simply answer as unavailable.
begin;
drop table if exists public.ai_feedback;
drop table if exists public.ai_memories;
alter table public.profiles drop column if exists ai_personalisation;
commit;
