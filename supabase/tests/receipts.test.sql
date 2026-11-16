-- Receipt matching tests (U10).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
insert into public.financial_accounts (id, user_id, name) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A current');
insert into public.imports (id, user_id, financial_account_id, kind) values
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'csv'),
  ('40000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'csv');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

create function pg_temp.add_receipt(p_merchant text, p_date date, p_total bigint) returns uuid language sql as $$
  insert into public.receipts (user_id, merchant_name, receipt_date, total_minor, currency)
  values ('00000000-0000-0000-0000-00000000000a', p_merchant, p_date, p_total, 'EUR') returning id
$$;

-- A receipt matching an existing purchase attaches to it.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-03-03", "amount_minor": -1840, "currency": "EUR", "description": "PAVI SUPERMARKET QORMI"}]');
select is(
  public.match_receipt(pg_temp.add_receipt('Pavi Supermarket', '2026-03-03', 1840)),
  (select id from public.purchases where amount_minor = -1840),
  'A receipt matching an existing purchase attaches to it');

-- AE3: no match yet, then the purchase arrives two days later.
select is(public.match_receipt(pg_temp.add_receipt('Welbees Swieqi', '2026-03-10', 2599)), null, 'AE3: an unmatched receipt stays pending');
select is((select status::text from public.receipts where merchant_name = 'Welbees Swieqi'), 'pending', 'AE3: its status is pending');
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-03-12", "amount_minor": -2599, "currency": "EUR", "description": "WELBEES SWIEQI"}]');
select is((select status::text from public.receipts where merchant_name = 'Welbees Swieqi'), 'matched',
  'AE3: the receipt attaches when the matching purchase arrives');

-- 30 days pending, then a later statement upload.
select pg_temp.add_receipt('Greens Supermarket', '2026-02-01', 4410);
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
  '[{"booking_date": "2026-02-02", "amount_minor": -4410, "currency": "EUR", "description": "GREENS SUPERMARKET"}]');
select isnt((select purchase_id from public.receipts where merchant_name = 'Greens Supermarket'), null,
  'A receipt pending for weeks attaches when its purchase arrives in a later upload');

-- Closest date wins.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-04-01", "amount_minor": -1000, "currency": "EUR", "description": "Cafe Cordina"}]');
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
  '[{"booking_date": "2026-04-05", "amount_minor": -1000, "currency": "EUR", "description": "Cafe Cordina"}]');
select is(
  (select booking_date from public.purchases where id = (select public.match_receipt(pg_temp.add_receipt('Cafe Cordina', '2026-04-04', 1000)))),
  '2026-04-05'::date, 'A receipt matching two purchases attaches to the closest date');

-- Manual link.
select public.link_receipt(
  pg_temp.add_receipt('Market stall', '2026-04-20', 700),
  (select id from public.purchases where booking_date = '2026-04-01'));
select is((select status::text from public.receipts where merchant_name = 'Market stall'), 'matched',
  'The user links a pending receipt to a purchase by hand');

-- Receipts never create purchases.
select is((select count(*)::int from public.purchases), 5, 'Receipts never create purchases');

select * from finish();
rollback;
