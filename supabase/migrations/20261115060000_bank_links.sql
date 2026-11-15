-- Bank linking state (U11).
-- auth_state is a random single-use value sent with the authorization request and checked on the redirect.
-- available_accounts holds the accounts a completed session returned, until the user maps them.
-- A financial account keeps a stable provider_account_id across reconnects and the current session's
-- account uid in provider_account_uid, which is what transaction requests use.

alter table public.bank_links
  add column auth_state text unique,
  add column available_accounts jsonb not null default '[]'::jsonb;

alter table public.financial_accounts
  add column provider_account_uid text;

-- Users may read and rename their links, but only Edge Functions change state, status, or expiry.
drop policy "Users insert own rows" on public.bank_links;
drop policy "Users update own rows" on public.bank_links;
