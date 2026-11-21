-- The single-use bank link state, as bank-link's consumeState runs it (U11):
-- update bank_links set auth_state = null where auth_state = $state and user_id = $user returning id.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.bank_links (id, user_id, institution_name, institution_country, auth_state) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Revolut', 'MT', 'state-a');

set local role service_role;

select is_empty(
  $$update public.bank_links set auth_state = null
    where auth_state = 'state-a' and user_id = '00000000-0000-0000-0000-00000000000b' returning id$$,
  'Another user cannot consume the state');
select results_eq(
  $$update public.bank_links set auth_state = null
    where auth_state = 'state-a' and user_id = '00000000-0000-0000-0000-00000000000a' returning id$$,
  $$values ('30000000-0000-0000-0000-00000000000a'::uuid)$$,
  'The owner consumes the state once');
select is((select auth_state from public.bank_links), null, 'The state is cleared');
select is_empty(
  $$update public.bank_links set auth_state = null
    where auth_state = 'state-a' and user_id = '00000000-0000-0000-0000-00000000000a' returning id$$,
  'The same state cannot be used twice');

select * from finish();
rollback;
