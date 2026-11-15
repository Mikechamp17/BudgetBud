-- Row Level Security tests for the core schema (U2).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

-- Fixtures, created as the database owner.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.financial_accounts (id, user_id, name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'A current'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'B current');

insert into public.purchases (id, user_id, financial_account_id, booking_date, amount_minor, currency, description) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '2026-03-03', -4217, 'EUR', 'LIDL'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '2026-03-03', -500, 'EUR', 'CAFE');

insert into public.bank_links (id, user_id, institution_name, institution_country) values
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Revolut', 'MT');

insert into storage.objects (bucket_id, name, owner) values
  ('statements', '00000000-0000-0000-0000-00000000000b/march.csv', '00000000-0000-0000-0000-00000000000b');

select is((select count(*)::int from public.profiles), 2, 'A profile is created for each new auth user');

-- Signed in as user A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select is(
  (select count(*)::int from public.purchases where user_id = '00000000-0000-0000-0000-00000000000b'),
  0, 'User A reads none of user B''s purchases');

select is((select count(*)::int from public.purchases), 1, 'User A reads their own purchase');

select is_empty(
  $$update public.purchases set description = 'hacked' where id = '20000000-0000-0000-0000-00000000000b' returning 1$$,
  'User A updating user B''s purchase changes zero rows');

select throws_ok(
  $$insert into public.purchases (user_id, financial_account_id, booking_date, amount_minor, currency, description)
    values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '2026-03-04', -100, 'EUR', 'x')$$,
  '42501', null, 'User A cannot insert a purchase carrying user B''s user_id');

select throws_ok(
  $$insert into public.purchases (user_id, financial_account_id, booking_date, amount_minor, currency, description)
    values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b', '2026-03-04', -100, 'EUR', 'x')$$,
  '23503', null, 'User A cannot attach their purchase to user B''s account');

select ok((select count(*) from public.categories where user_id is null) >= 14, 'User A reads the built-in categories');

select is_empty(
  $$update public.categories set name = 'Mine' where user_id is null returning 1$$,
  'User A cannot edit a built-in category');

select throws_ok(
  $$insert into public.category_rules (user_id, match_name, category_id, origin)
    select null, 'evil', id, 'builtin' from public.categories where user_id is null limit 1$$,
  '42501', null, 'User A cannot add a built-in rule');

select throws_ok('select * from private.bank_sessions', '42501', null, 'User A cannot read private.bank_sessions');

select throws_ok(
  $$select public.get_bank_session('30000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'User A cannot execute the bank session functions');

select is(
  (select count(*)::int from storage.objects where name like '00000000-0000-0000-0000-00000000000b/%'),
  0, 'User A cannot list files in user B''s storage folder');

select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('statements', '00000000-0000-0000-0000-00000000000b/evil.csv')$$,
  '42501', null, 'User A cannot upload into user B''s storage folder');

-- Service role.
reset role;
set local role service_role;

select lives_ok(
  $$select public.put_bank_session('30000000-0000-0000-0000-00000000000b', 'session-123')$$,
  'The service role stores a bank session ID');

select is(public.get_bank_session('30000000-0000-0000-0000-00000000000b'), 'session-123',
  'The service role reads the bank session ID');

select lives_ok(
  $$select public.delete_bank_session('30000000-0000-0000-0000-00000000000b')$$,
  'The service role deletes a bank session ID');
select is(public.get_bank_session('30000000-0000-0000-0000-00000000000b'), null, 'The deleted bank session is gone');
select public.put_bank_session('30000000-0000-0000-0000-00000000000b', 'session-456');

-- Deleting a user cascades.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';

select is(
  (select count(*)::int from (
     select user_id from public.purchases union all
     select user_id from public.financial_accounts union all
     select user_id from public.bank_links union all
     select user_id from public.profiles
   ) t where user_id = '00000000-0000-0000-0000-00000000000b')
  + (select count(*)::int from private.bank_sessions),
  0, 'Deleting an auth user removes their rows and bank sessions');

select * from finish();
rollback;
