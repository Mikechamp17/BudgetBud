-- Hardening from code review.

-- Serialize ingest per financial account. Two imports into one account at the same time (a bank sync and a
-- CSV upload) could otherwise each miss the other's uncommitted purchase and both create it.
-- (The lock itself is taken at the start of ingest_source_records, see 20261115020000_ingest.sql.)

-- Bank-link columns on an account are set only by Edge Functions. A user setting another account's
-- provider_account_uid could otherwise make the daily sync import that account's transactions.
revoke update on public.financial_accounts from authenticated;
grant update (name, institution_name, currency, file_mapping) on public.financial_accounts to authenticated;
drop policy "Users insert own rows" on public.financial_accounts;
create policy "Users insert own rows" on public.financial_accounts for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and bank_link_id is null and provider_account_id is null and provider_account_uid is null
  );

-- Removing a bank link goes through the bank-link function, which revokes the session at the bank.
-- A direct delete would skip that and cascade away the accounts and their purchase history.
drop policy "Users delete own rows" on public.bank_links;
