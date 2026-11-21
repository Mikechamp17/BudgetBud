-- Sorting and new-place tests (U5).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.financial_accounts (id, user_id, name) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A current');
insert into public.imports (id, user_id, financial_account_id, kind) values
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'csv');

create function pg_temp.category_of(p_description text) returns text language sql as $$
  select c.name from public.purchases p join public.categories c on c.id = p.category_id
  where p.description = p_description order by p.created_at desc, p.booking_date desc limit 1
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

-- Built-in rules.
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-03-01", "amount_minor": -5000, "currency": "EUR", "description": "Revolut Top-Up by *1234"},
    {"booking_date": "2026-03-02", "amount_minor": -3000, "currency": "EUR", "description": "LIDL MT 1234 QORMI"},
    {"booking_date": "2026-03-03", "amount_minor": -1500, "currency": "EUR", "description": "JOES MARKET"}]');
select is(pg_temp.category_of('Revolut Top-Up by *1234'), 'Transfers & payments', 'A Revolut top-up is sorted by a built-in rule');
select is(pg_temp.category_of('LIDL MT 1234 QORMI'), 'Groceries', 'Lidl is sorted into Groceries');
select is(
  (select category_source::text from public.purchases where description = 'JOES MARKET'),
  'none', 'An unknown merchant stays Uncategorized for AI sorting');
select is(pg_temp.category_of('JOES MARKET'), 'Uncategorized', 'An unknown merchant is shown as Uncategorized');

-- AE4: a user's correction sticks for that merchant.
select public.set_purchase_category(
  (select id from public.purchases where description = 'JOES MARKET'),
  (select id from public.categories where name = 'Groceries' and user_id is null));
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-03-09", "amount_minor": -1800, "currency": "EUR", "description": "JOES MARKET"}]');
select is(
  (select c.name || '/' || p.category_source from public.purchases p join public.categories c on c.id = p.category_id
   where p.booking_date = '2026-03-09'),
  'Groceries/user_rule', 'AE4: the next Joe''s Market record is sorted as Groceries by the user rule');

-- A user rule beats a built-in rule.
select public.set_purchase_category(
  (select id from public.purchases where description = 'LIDL MT 1234 QORMI'),
  (select id from public.categories where name = 'Shopping' and user_id is null));
select public.ingest_source_records('40000000-0000-0000-0000-0000000000a1',
  '[{"booking_date": "2026-03-15", "amount_minor": -2200, "currency": "EUR", "description": "LIDL MT 9999 QORMI"}]');
select is(
  (select c.name from public.purchases p join public.categories c on c.id = p.category_id where p.booking_date = '2026-03-15'),
  'Shopping', 'A user rule wins over a built-in rule');

-- Dismissing a new-place flag.
select public.dismiss_new_place((select id from public.purchases where description = 'JOES MARKET' and booking_date = '2026-03-03'));
select is(
  (select count(*)::int from public.purchases where description = 'JOES MARKET' and is_new_place),
  0, 'Dismissing a new-place flag clears it');
select is(
  (select count(*)::int from public.purchases where description <> 'JOES MARKET' and is_new_place),
  2, 'Dismissing one flag leaves other merchants flagged');

-- User B cannot read user A's rules.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is(
  (select count(*)::int from public.category_rules where user_id = '00000000-0000-0000-0000-00000000000a'),
  0, 'User B cannot read user A''s rules');

select * from finish();
rollback;
