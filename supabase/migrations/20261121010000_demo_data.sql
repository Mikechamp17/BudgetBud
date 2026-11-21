-- Demo data for the portfolio demo account.
-- private.reset_demo_data wipes one user's data and fills it with three months of sample spending, dated
-- relative to today so the demo always looks current. It runs through ingest_source_records, so the sample
-- shows real merging, sorting, and new-place flags. Only the database owner (pg_cron, the SQL editor) can run it.

create function private.reset_demo_data(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_revolut uuid;
  v_bov uuid;
  v_bank_import uuid;
  v_csv_import uuid;
  v_bov_import uuid;
  v_month date;
  v_m int;
  v_bank jsonb := '[]'::jsonb;
  v_csv jsonb := '[]'::jsonb;
  v_bov_rows jsonb := '[]'::jsonb;
  v_row record;
  v_day date;
  v_amount bigint;
  v_rent uuid;
  v_bills uuid;
  v_result jsonb := '{}'::jsonb;
begin
  if p_user is null then
    raise exception 'demo user id is required';
  end if;

  -- Start clean. Accounts cascade to imports, purchases, and their sources.
  delete from public.receipts where user_id = p_user;
  delete from public.financial_accounts where user_id = p_user;
  delete from public.merchants where user_id = p_user;
  delete from public.category_rules where user_id = p_user;
  delete from public.bank_links where user_id = p_user;
  delete from public.ai_usage where user_id = p_user;

  insert into public.financial_accounts (user_id, name, institution_name, currency, file_mapping)
  values (p_user, 'Revolut EUR', 'Revolut', 'EUR',
    '{"date":"Started Date","description":"Description","amount":"Amount","currency":"Currency","dateFormat":"YYYY-MM-DD","decimalSeparator":"."}')
  returning id into v_revolut;
  insert into public.financial_accounts (user_id, name, institution_name, currency, file_mapping)
  values (p_user, 'BOV Current', 'Bank of Valletta', 'EUR',
    '{"date":"Date","description":"Description","debit":"Debit","credit":"Credit","dateFormat":"DD/MM/YYYY","decimalSeparator":"."}')
  returning id into v_bov;

  -- Sample spending pattern per month: day of month, description, amount in cents (negative is spent),
  -- account, and whether the same purchase also appears in an uploaded CSV (to show merging).
  for v_m in 0..2 loop
    v_month := (date_trunc('month', current_date) - make_interval(months => v_m))::date;
    for v_row in
      select * from (values
        (1, 'Rent Msida apartment', -95000, 'revolut', false),
        (2, 'LIDL MT 1234 QORMI', -4217, 'revolut', true),
        (3, 'Cafe Cordina Valletta', -680, 'revolut', false),
        (4, 'Bolt', -1150, 'revolut', false),
        (5, 'NETFLIX.COM', -1399, 'revolut', false),
        (6, 'PAVI SUPERMARKET QORMI', -6385, 'revolut', true),
        (7, 'Wolt Malta', -2390, 'revolut', false),
        (8, 'MALTA PUBLIC TRANSPORT', -2500, 'revolut', false),
        (9, 'SPOTIFY P2F3', -1099, 'revolut', false),
        (10, 'WELBEES SWIEQI', -3842, 'revolut', true),
        (11, 'Top-Up by *4821', 30000, 'revolut', false),
        (12, 'STARBUCKS SLIEMA', -545, 'revolut', false),
        (13, 'BROWN S PHARMACY', -1870, 'revolut', false),
        (14, 'LIDL MT 1234 QORMI', -3366, 'revolut', false),
        (15, 'AMAZON EU SARL', -2999, 'revolut', true),
        (16, 'EDEN CINEMAS', -1700, 'revolut', false),
        (17, 'Bolt', -890, 'revolut', false),
        (18, 'OPENAI CHATGPT SUBSCR', -2000, 'revolut', false),
        (19, 'The Harbour Club Valletta', -5640, 'revolut', false),
        (20, 'PAVI SUPERMARKET QORMI', -5120, 'revolut', false),
        (22, 'GO MOBILE', -2500, 'revolut', false),
        (24, 'Cafe Cordina Valletta', -720, 'revolut', false),
        (25, 'SALARY ACME LTD', 265000, 'revolut', false),
        (26, 'WELBEES SWIEQI', -2955, 'revolut', false),
        (27, 'Wolt Malta', -1880, 'revolut', false),
        (8, 'ENEMALTA PLC', -6240, 'bov', false),
        (12, 'SHELL', -5500, 'bov', false),
        (18, 'ARMS', -2310, 'bov', false),
        (23, 'GREENS SUPERMARKET', -7425, 'bov', false)
      ) as t (day, description, amount, account, in_csv)
    loop
      v_day := v_month + (v_row.day - 1);
      continue when v_day > current_date;
      -- Vary amounts month to month so the bars change.
      v_amount := case when v_row.description ~ '^(Rent|SALARY|NETFLIX|SPOTIFY|OPENAI|GO MOBILE)'
        then v_row.amount
        else round(v_row.amount * (0.85 + (abs(hashtext(v_row.description || v_month)) % 30) / 100.0))::bigint end;
      if v_row.account = 'revolut' then
        v_bank := v_bank || jsonb_build_object(
          'provider_transaction_id', 'demo-' || to_char(v_day, 'YYYYMMDD') || '-' || abs(hashtext(v_row.description)),
          'booking_date', v_day, 'amount_minor', v_amount, 'currency', 'EUR', 'description', v_row.description);
        if v_row.in_csv then
          -- The same purchase in an uploaded statement, a day later and with a shorter name.
          v_csv := v_csv || jsonb_build_object(
            'booking_date', least(v_day + 1, current_date), 'amount_minor', v_amount, 'currency', 'EUR',
            'description', initcap(split_part(v_row.description, ' ', 1)));
        end if;
      else
        v_bov_rows := v_bov_rows || jsonb_build_object(
          'booking_date', v_day, 'amount_minor', v_amount, 'currency', 'EUR', 'description', v_row.description);
      end if;
    end loop;
  end loop;

  insert into public.imports (user_id, financial_account_id, kind, file_name)
  values (p_user, v_revolut, 'bank_sync', null) returning id into v_bank_import;
  insert into public.imports (user_id, financial_account_id, kind, file_name)
  values (p_user, v_revolut, 'csv', 'revolut-statement.csv') returning id into v_csv_import;
  insert into public.imports (user_id, financial_account_id, kind, file_name)
  values (p_user, v_bov, 'csv', 'bov-statement.csv') returning id into v_bov_import;

  v_result := jsonb_build_object(
    'bank', public.ingest_source_records(v_bank_import, v_bank),
    'revolut_csv', public.ingest_source_records(v_csv_import, v_csv),
    'bov_csv', public.ingest_source_records(v_bov_import, v_bov_rows));

  -- A user correction that becomes a rule: rent counts as a bill. The restaurant shows AI-style sorting.
  select id into v_bills from public.categories where user_id is null and name = 'Bills & utilities';
  select id into v_rent from public.purchases where user_id = p_user and description like 'Rent%'
  order by booking_date desc limit 1;
  if v_rent is not null then
    perform public.set_purchase_category(v_rent, v_bills);
    update public.purchases p
    set category_id = v_bills, category_source = 'user_rule'
    where p.user_id = p_user and p.description like 'Rent%' and p.id <> v_rent;
  end if;
  insert into public.category_rules (user_id, match_name, match_type, category_id, origin)
  select p_user, m.normalized_name, 'exact', c.id, 'ai'
  from public.merchants m, public.categories c
  where m.user_id = p_user and m.normalized_name like 'the harbour club%' and c.user_id is null and c.name = 'Dining';
  update public.purchases p
  set category_id = c.id, category_source = 'ai'
  from public.categories c, public.merchants m
  where p.user_id = p_user and p.merchant_id = m.id and m.normalized_name like 'the harbour club%'
    and c.user_id is null and c.name = 'Dining';
  update public.merchants set ai_sorted_at = now() where user_id = p_user;

  return v_result;
end;
$$;

revoke execute on function private.reset_demo_data(uuid) from public, anon, authenticated, service_role;
