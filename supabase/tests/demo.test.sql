-- Demo data reset (portfolio demo account).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000de', 'demo@example.com');

select ok((private.reset_demo_data('00000000-0000-0000-0000-0000000000de') -> 'revolut_csv' ->> 'merged')::int > 0,
  'The sample statement upload merges with synced purchases');
select ok((select count(*) from public.purchases) > 40, 'Three months of purchases are created');
select is((select count(*)::int from public.purchases where category_source = 'none'), 0, 'Every sample purchase is sorted');
select ok((select count(*) from public.purchases where is_new_place) > 5, 'New places are flagged');

select lives_ok($$select private.reset_demo_data('00000000-0000-0000-0000-0000000000de')$$, 'The reset runs again');
select is((select count(*)::int from public.financial_accounts), 2, 'A second reset replaces the data instead of adding to it');

select * from finish();
rollback;
