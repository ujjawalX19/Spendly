-- Vittova v1.17 ROLLBACK. THIS SCRIPT DELETES DATA: purchase decisions, the
-- Money-Saved ledger and receipt-split records. Export them first. Group
-- expenses and their shares created by a receipt split are kept, so balances
-- do not change.
begin;
drop table if exists public.savings_events;
drop table if exists public.planned_purchases;
drop table if exists public.group_expense_receipts;
commit;
