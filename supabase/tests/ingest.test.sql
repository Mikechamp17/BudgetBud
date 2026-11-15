-- Ingest, merge, and split tests (U4).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.financial_accounts (id, user_id, name) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A current'),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'A card'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B current');

insert into public.imports (id, user_id, financial_account_id, kind) values
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'bank_sync'),
  ('40000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'csv'),
  ('40000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'csv'),
  ('40000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2', 'csv'),
  ('40000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000b1', 'csv');

-- Merchant normalization.
select ok(length(public.normalize_merchant('POS 0000')) > 0, 'A noise-only merchant still normalizes to a non-empty name');
select is(public.normalize_merchant('LIDL MT 1234 QORMI'), 'lidl qormi', 'Store numbers and country codes are removed');
select ok(
  public.merchants_match(public.normalize_merchant('SumUp *Café Cordina'), public.normalize_merchant('CAFE CORDINA VALLETTA'))
  and public.merchants_match(public.normalize_merchant('Café Cordina'), public.normalize_merchant('CAFE CORDINA VALLETTA'))
  and public.merchants_match(public.normalize_merchant('SumUp *Café Cordina'), public.normalize_merchant('Café Cordina')),
  'Café Cordina variants match each other');

-- Signed in as user A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

-- AE1: a bank record and a file record for the same purchase merge.
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
    '[{"provider_transaction_id": "tx-1", "booking_date": "2026-03-03", "amount_minor": -4217, "currency": "EUR", "description": "LIDL MT 1234 QORMI"}]'),
  '{"created": 1, "merged": 0, "skipped": 0}'::jsonb, 'The bank record creates a purchase');
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
    '[{"booking_date": "2026-03-04", "amount_minor": -4217, "currency": "EUR", "description": "Lidl"}]'),
  '{"created": 0, "merged": 1, "skipped": 0}'::jsonb, 'The matching file record merges');
select is(
  (select count(*)::int from public.source_records s join public.purchases p on p.id = s.purchase_id where p.amount_minor = -4217),
  2, 'AE1: one purchase has both sources');
select is((select count(*)::int from public.purchases where amount_minor = -4217), 1, 'AE1: only one purchase exists');

-- Four days apart does not merge.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"provider_transaction_id": "tx-2", "booking_date": "2026-03-10", "amount_minor": -1999, "currency": "EUR", "description": "PAVI SUPERMARKET"}]');
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
    '[{"booking_date": "2026-03-14", "amount_minor": -1999, "currency": "EUR", "description": "Pavi Supermarket"}]'),
  '{"created": 1, "merged": 0, "skipped": 0}'::jsonb, 'A file record 4 days after a bank record creates a second purchase');

-- Two identical café rows in one file stay two purchases.
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a3',
    '[{"booking_date": "2026-03-05", "amount_minor": -500, "currency": "EUR", "description": "Cafe Cordina"},
      {"booking_date": "2026-03-05", "amount_minor": -500, "currency": "EUR", "description": "Cafe Cordina"}]'),
  '{"created": 2, "merged": 0, "skipped": 0}'::jsonb, 'Two identical rows in one file create two purchases');

-- Re-importing the same records creates nothing.
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a3',
    '[{"booking_date": "2026-03-05", "amount_minor": -500, "currency": "EUR", "description": "Cafe Cordina"},
      {"booking_date": "2026-03-05", "amount_minor": -500, "currency": "EUR", "description": "Cafe Cordina"}]'),
  '{"created": 0, "merged": 0, "skipped": 2}'::jsonb, 'Importing the same records twice skips them the second time');

-- Different currencies never merge.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"provider_transaction_id": "tx-3", "booking_date": "2026-03-07", "amount_minor": -2500, "currency": "EUR", "description": "Amazon"}]');
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
    '[{"booking_date": "2026-03-07", "amount_minor": -2500, "currency": "GBP", "description": "Amazon"}]'),
  '{"created": 1, "merged": 0, "skipped": 0}'::jsonb, 'Equal amounts in different currencies never merge');

-- Different financial accounts never merge.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
  '[{"booking_date": "2026-03-20", "amount_minor": -350, "currency": "EUR", "description": "Kingsway Cafe"}]');
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a4',
    '[{"booking_date": "2026-03-21", "amount_minor": -350, "currency": "EUR", "description": "Kingsway Cafe"}]'),
  '{"created": 1, "merged": 0, "skipped": 0}'::jsonb, 'Equal amounts from two different accounts never merge');

-- AE5: new places.
select is(
  (select count(*)::int from public.purchases where amount_minor = -500 and is_new_place),
  1, 'AE5: only the first purchase at a merchant is a new place');

select public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
  '[{"booking_date": "2026-03-20", "amount_minor": -900, "currency": "EUR", "description": "Zara Sliema"}]');
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
  '[{"booking_date": "2026-03-02", "amount_minor": -1200, "currency": "EUR", "description": "Zara Sliema"}]');
select is(
  (select array_agg(booking_date order by booking_date) from public.purchases p
     join public.merchants m on m.id = p.merchant_id where m.normalized_name = 'zara sliema' and p.is_new_place),
  array['2026-03-02'::date], 'Only the earlier purchase stays flagged when an earlier one arrives later');

-- AE2: split, then re-ingest.
select isnt(
  public.split_source_record((select s.id from public.source_records s where s.description = 'Lidl')),
  null, 'Splitting a merged source returns the new purchase');
select is((select count(*)::int from public.purchases where amount_minor = -4217), 2, 'AE2: the split leaves two purchases');
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
    '[{"booking_date": "2026-03-04", "amount_minor": -4217, "currency": "EUR", "description": "Lidl"}]'),
  '{"created": 0, "merged": 0, "skipped": 1}'::jsonb, 'AE2: re-ingesting the split record is skipped');
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a3',
    '[{"booking_date": "2026-03-04", "amount_minor": -4217, "currency": "EUR", "description": "Lidl"}]')->'merged',
  '0'::jsonb, 'AE2: the same purchase from another file never re-merges with the bank purchase');

-- Ownership.
select throws_ok(
  $$select public.ingest_source_records('40000000-0000-0000-0000-0000000000b1',
    '[{"booking_date": "2026-03-04", "amount_minor": -100, "currency": "EUR", "description": "x"}]')$$,
  'P0002', null, 'User A cannot ingest into user B''s import');

-- Service role ingests for a user.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000b1',
    '[{"booking_date": "2026-03-04", "amount_minor": -100, "currency": "EUR", "description": "Wolt"}]'),
  '{"created": 1, "merged": 0, "skipped": 0}'::jsonb, 'The service role ingests into a user''s import');
select is(
  (select array_agg(distinct user_id) from (
     select user_id from public.purchases where amount_minor = -100
     union all select user_id from public.source_records where amount_minor = -100
     union all select m.user_id from public.merchants m where m.normalized_name = 'wolt') t),
  array['00000000-0000-0000-0000-00000000000b'::uuid], 'Every row written by the service role belongs to the account owner');

select * from finish();
rollback;
