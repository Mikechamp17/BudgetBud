-- Re-syncing the same date range creates nothing new (U12, KTD6).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
insert into public.financial_accounts (id, user_id, name) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Revolut');
insert into public.imports (id, user_id, financial_account_id, kind) values
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'bank_sync'),
  ('40000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'bank_sync'),
  ('40000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'bank_sync');

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"provider_transaction_id": "t1", "booking_date": "2026-03-03", "amount_minor": -4217, "currency": "EUR", "description": "LIDL"},
    {"booking_date": "2026-03-04", "amount_minor": -500, "currency": "EUR", "description": "CAFE"},
    {"booking_date": "2026-03-04", "amount_minor": -500, "currency": "EUR", "description": "CAFE"}]');

select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a2',
    '[{"provider_transaction_id": "t1", "booking_date": "2026-03-03", "amount_minor": -4217, "currency": "EUR", "description": "LIDL"},
      {"booking_date": "2026-03-04", "amount_minor": -500, "currency": "EUR", "description": "CAFE"},
      {"booking_date": "2026-03-04", "amount_minor": -500, "currency": "EUR", "description": "CAFE"}]'),
  '{"created": 0, "merged": 0, "skipped": 3}'::jsonb,
  'Syncing the same dates twice, with and without transaction IDs, creates nothing new');

select is((select count(*)::int from public.purchases), 3, 'The two identical café transactions stay two purchases');

-- A later sync window that starts mid-way still recognises what it already has.
select is(
  public.ingest_source_records('40000000-0000-0000-0000-0000000000a3',
    '[{"booking_date": "2026-03-04", "amount_minor": -500, "currency": "EUR", "description": "CAFE"},
      {"booking_date": "2026-03-04", "amount_minor": -500, "currency": "EUR", "description": "CAFE"},
      {"booking_date": "2026-03-09", "amount_minor": -1200, "currency": "EUR", "description": "WOLT"}]')->'created',
  '1'::jsonb, 'Only the new transaction is created');

select * from finish();
rollback;
