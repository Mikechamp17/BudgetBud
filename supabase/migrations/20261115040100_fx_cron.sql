-- Daily ECB rate load (U7, KTD10, KTD13).
-- Before this job can run, store two secrets in Supabase Vault (Dashboard > Integrations > Vault, or SQL):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<secret or service role key>', 'secret_key');
-- No secret is written in this migration. The job reads both at run time.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.call_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body := p_body,
    timeout_milliseconds := 60000
  );
$$;

revoke execute on function private.call_edge_function(text, jsonb) from public, anon, authenticated;

-- The ECB publishes around 16:00 CET. Run at 16:47 UTC on weekdays.
select cron.schedule('fx-rates-daily', '47 16 * * 1-5', $$select private.call_edge_function('fx-rates')$$);
