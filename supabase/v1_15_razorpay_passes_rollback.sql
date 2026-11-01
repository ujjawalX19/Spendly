-- Vittova v1.15 ROLLBACK. Prefer the soft rollback first: RAZORPAY_ENABLED=false
-- on the server keeps every record.
--
-- THIS SCRIPT DELETES DATA: every Razorpay order and payment record, which may
-- be needed for accounts. Export razorpay_payments first. It refuses to run
-- while any account's Pro comes from Razorpay.
begin;
do $$
begin
    if exists (select 1 from public.profiles where pro_source = 'razorpay') then
        raise exception 'Accounts still have pro_source = razorpay. Resolve them first.';
    end if;
end $$;
drop table if exists public.razorpay_payments;
alter table public.profiles drop constraint if exists profiles_pro_source_valid;
alter table public.profiles add constraint profiles_pro_source_valid check (pro_source is null or pro_source in ('play', 'manual'));
commit;
