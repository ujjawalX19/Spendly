-- v1.18 — an optional subcategory on an expense. Additive and safe to run twice.
alter table public.expenses add column if not exists subcategory text check (char_length(subcategory) <= 40);
