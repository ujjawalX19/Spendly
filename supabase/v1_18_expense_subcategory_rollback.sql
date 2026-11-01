-- Vittova v1.18 ROLLBACK. THIS SCRIPT DELETES DATA: every expense subcategory
-- label. Expenses themselves are kept, and the server saves new ones without
-- the label when the column is missing.
alter table public.expenses drop column if exists subcategory;
