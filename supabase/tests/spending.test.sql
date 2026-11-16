-- Monthly spending and currency conversion tests (U7).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
insert into public.financial_accounts (id, user_id, name) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A current');
insert into public.imports (id, user_id, financial_account_id, kind) values
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'csv');

-- GBP per EUR. 2026-04-03 is a Friday, so Saturday 2026-04-04 uses it.
insert into public.fx_rates (currency, rate_date, rate) values
  ('GBP', '2026-04-03', 0.85),
  ('GBP', '2026-04-06', 0.80),
  ('GBP', '2025-04-01', 0.90);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

-- AE7: a €600 card payment in Transfers & payments plus €600 of purchases totals €600.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-03-02", "amount_minor": -40000, "currency": "EUR", "description": "IKEA"},
    {"booking_date": "2026-03-03", "amount_minor": -20000, "currency": "EUR", "description": "Zara"},
    {"booking_date": "2026-03-28", "amount_minor": -60000, "currency": "EUR", "description": "Credit card repayment"},
    {"booking_date": "2026-03-25", "amount_minor": 250000, "currency": "EUR", "description": "Salary March"}]');
select is((public.monthly_spending('2026-03-01')->>'total_minor')::bigint, 60000::bigint,
  'AE7: transfers and inflows are left out, so the month totals €600');

-- Moving a purchase out of Transfers & payments adds it.
select public.set_purchase_category(
  (select id from public.purchases where description = 'Credit card repayment'),
  (select id from public.categories where name = 'Bills & utilities' and user_id is null));
select is((public.monthly_spending('2026-03-01')->>'total_minor')::bigint, 120000::bigint,
  'Moving a purchase out of Transfers & payments adds it to spending');

-- AE8: £20.00 at 0.85 adds €23.53. A Saturday purchase uses Friday's rate.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-04-03", "amount_minor": -2000, "currency": "GBP", "description": "Amazon UK"}]');
select is((public.monthly_spending('2026-04-01')->>'total_minor')::bigint, 2353::bigint, 'AE8: £20.00 at 0.85 adds €23.53');

select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-04-04", "amount_minor": -1700, "currency": "GBP", "description": "Tesco UK"}]');
select is((public.monthly_spending('2026-04-01')->>'total_minor')::bigint, 4353::bigint,
  'A Saturday purchase uses Friday''s rate');

-- A historical purchase converts at its own date's rate.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2025-04-02", "amount_minor": -900, "currency": "GBP", "description": "Boots"}]');
select is((public.monthly_spending('2025-04-01')->>'total_minor')::bigint, 1000::bigint,
  'A purchase from a year earlier converts at its historical rate');

-- No rate on or before the date: left out and counted.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-04-10", "amount_minor": -5000, "currency": "USD", "description": "Steam"}]');
select is((public.monthly_spending('2026-04-01')->>'total_minor')::bigint, 4353::bigint,
  'A purchase with no rate is left out of the total');
select is((public.monthly_spending('2026-04-01')->>'unconverted')::int, 1, 'and counted as unconverted');

select * from finish();
rollback;
