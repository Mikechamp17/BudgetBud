-- Daily bank sync (U12, KTD10). Uses the Vault secrets project_url and secret_key described in the fx cron migration.
-- 04:23 UTC, after most banks post the previous day's transactions.
select cron.schedule('bank-sync-daily', '23 4 * * *', $$select private.call_edge_function('bank-sync')$$);
