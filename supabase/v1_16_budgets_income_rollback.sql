-- Vittova v1.16 ROLLBACK. THIS SCRIPT DELETES DATA: every category budget and
-- income entry. Export both tables first. The app and server keep working
-- without them: budgets and income answer as unavailable.
begin;
drop table if exists public.category_budgets;
drop table if exists public.income_entries;
commit;
