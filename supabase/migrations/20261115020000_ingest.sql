-- Ingest, merge, and split (U4). One function owns merging for every import path (KTD3).

-- Merchant names -------------------------------------------------------------
-- Lowercase, strip accents and card-processor noise (KTD7). Matching and new-place flags both use this.

create function public.normalize_merchant(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
begin
  v := lower(extensions.unaccent(coalesce(p_name, '')));
  -- Card-processor prefixes such as "CRV*", "SumUp *", "SQ *", "PayPal *".
  v := regexp_replace(v, '^\s*(crv|sumup|sq|zettle|izettle|paypal|sp|pos|vp|ccv|nayax|mypos)\s*\*\s*', '');
  v := regexp_replace(v, '^\s*(pos|card|visa|mastercard|debit|purchase)\s+', '');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  -- Drop tokens containing digits (store numbers, dates, card fragments).
  v := regexp_replace(v, '\m\w*[0-9]\w*\M', ' ', 'g');
  -- Drop country codes.
  v := regexp_replace(v, '\m(mt|mlt|mal|gb|gbr|ie|irl|de|deu|it|ita|fr|fra|es|esp|nl|nld|eu|lu|lux)\M', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  if v = '' then
    v := btrim(regexp_replace(lower(coalesce(p_name, '')), '\s+', ' ', 'g'));
  end if;
  if v = '' then
    v := 'unknown';
  end if;
  return v;
end;
$$;

-- Two normalized names match when trigram similarity is at least 0.4 or one contains the other (KTD5).
create function public.merchants_match(p_a text, p_b text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extensions.similarity(p_a, p_b) >= 0.4
    or strpos(p_a, p_b) > 0
    or strpos(p_b, p_a) > 0;
$$;

-- New places -----------------------------------------------------------------
-- The earliest purchase at a merchant is its new place. Once the user dismisses the flag, nothing is re-flagged.

create function public.refresh_new_place(p_merchant_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_first uuid;
  v_first_date date;
begin
  select p.id, p.booking_date into v_first, v_first_date
  from public.purchases p
  where p.merchant_id = p_merchant_id
  order by p.booking_date, p.created_at, p.id
  limit 1;

  update public.merchants set first_purchase_date = v_first_date where id = p_merchant_id;

  if exists (select 1 from public.purchases where merchant_id = p_merchant_id and new_place_dismissed) then
    update public.purchases set is_new_place = false where merchant_id = p_merchant_id and is_new_place;
  else
    update public.purchases
    set is_new_place = (id = v_first)
    where merchant_id = p_merchant_id and is_new_place is distinct from (id = v_first);
  end if;
end;
$$;

-- Find or create the merchant for a normalized name.
create function public.upsert_merchant(p_user_id uuid, p_normalized text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.merchants where user_id = p_user_id and normalized_name = p_normalized;
  if v_id is null then
    insert into public.merchants (user_id, normalized_name, display_name)
    values (p_user_id, p_normalized, initcap(p_normalized))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Ingest ---------------------------------------------------------------------
-- p_records is a JSON array of objects:
--   booking_date (YYYY-MM-DD), amount_minor (integer, outflows negative), currency (ISO code),
--   description, optional provider_transaction_id (bank records), optional raw (object).
-- Runs with the caller's rights: RLS limits a signed-in user to their own import, and the
-- service role (scheduled sync) may ingest for any user. Every row is written under the import's owner.

create function public.ingest_source_records(p_import_id uuid, p_records jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_import public.imports;
  v_kind public.source_kind;
  v_channel text;
  v_rec record;
  v_key text;
  v_norm text;
  v_purchase uuid;
  v_merchant uuid;
  v_created int := 0;
  v_merged int := 0;
  v_skipped int := 0;
begin
  select * into v_import from public.imports where id = p_import_id;
  if not found then
    raise exception 'import % not found', p_import_id using errcode = 'P0002';
  end if;

  v_kind := case v_import.kind when 'bank_sync' then 'bank' else v_import.kind::text end::public.source_kind;
  -- The channel for KTD5: the bank account feed for bank records, the uploaded file otherwise.
  v_channel := case when v_kind = 'bank'
    then 'bank:' || v_import.financial_account_id
    else 'import:' || v_import.id end;

  for v_rec in
    select
      (r.value ->> 'booking_date')::date as booking_date,
      (r.value ->> 'amount_minor')::bigint as amount_minor,
      upper(r.value ->> 'currency') as currency,
      btrim(r.value ->> 'description') as description,
      nullif(r.value ->> 'provider_transaction_id', '') as provider_transaction_id,
      coalesce(r.value -> 'raw', '{}'::jsonb) as raw,
      -- Occurrence among identical rows in this batch, so two real identical purchases stay two (KTD6).
      row_number() over (
        partition by r.value ->> 'booking_date', r.value ->> 'amount_minor', upper(r.value ->> 'currency'), btrim(r.value ->> 'description')
        order by r.ordinality
      ) as occurrence
    from jsonb_array_elements(p_records) with ordinality as r (value, ordinality)
    order by r.ordinality
  loop
    if v_rec.provider_transaction_id is not null then
      v_key := 'tx:' || v_import.financial_account_id || ':' || v_rec.provider_transaction_id;
    else
      v_key := 'h:' || md5(concat_ws('|',
        v_import.financial_account_id, case when v_kind = 'bank' then 'bank' else 'file' end,
        v_rec.booking_date, v_rec.amount_minor, v_rec.currency, v_rec.description, v_rec.occurrence));
    end if;

    if exists (select 1 from public.source_records where user_id = v_import.user_id and source_key = v_key) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_norm := public.normalize_merchant(v_rec.description);

    select p.id into v_purchase
    from public.purchases p
    where p.user_id = v_import.user_id
      and p.financial_account_id = v_import.financial_account_id
      and p.currency = v_rec.currency
      and p.amount_minor = v_rec.amount_minor
      and p.booking_date between v_rec.booking_date - 3 and v_rec.booking_date + 3
      and not exists (
        select 1 from public.source_records s where s.purchase_id = p.id and s.channel = v_channel)
      and exists (
        select 1 from public.source_records s where s.purchase_id = p.id and public.merchants_match(s.normalized_merchant, v_norm))
      -- A split record must never merge back: skip purchases it was split from.
      and not exists (
        select 1 from public.merge_exclusions e
        join public.source_records x on x.id = e.source_record_id
        where e.purchase_id = p.id
          and x.booking_date = v_rec.booking_date
          and x.amount_minor = v_rec.amount_minor
          and x.normalized_merchant = v_norm)
    order by abs(p.booking_date - v_rec.booking_date), p.created_at
    limit 1;

    if v_purchase is not null then
      v_merged := v_merged + 1;
    else
      v_merchant := public.upsert_merchant(v_import.user_id, v_norm);
      insert into public.purchases (user_id, financial_account_id, merchant_id, booking_date, amount_minor, currency, description)
      values (v_import.user_id, v_import.financial_account_id, v_merchant, v_rec.booking_date, v_rec.amount_minor, v_rec.currency, v_rec.description)
      returning id into v_purchase;
      perform public.refresh_new_place(v_merchant);
      v_created := v_created + 1;
    end if;

    insert into public.source_records (
      user_id, purchase_id, financial_account_id, import_id, kind, channel, source_key,
      booking_date, amount_minor, currency, description, normalized_merchant, raw)
    values (
      v_import.user_id, v_purchase, v_import.financial_account_id, v_import.id, v_kind, v_channel, v_key,
      v_rec.booking_date, v_rec.amount_minor, v_rec.currency, v_rec.description, v_norm, v_rec.raw);

    v_purchase := null;
  end loop;

  update public.imports
  set created_count = created_count + v_created,
      merged_count = merged_count + v_merged,
      skipped_count = skipped_count + v_skipped
  where id = v_import.id;

  return jsonb_build_object('created', v_created, 'merged', v_merged, 'skipped', v_skipped);
end;
$$;

-- Split ----------------------------------------------------------------------
-- Moves one source record to a new purchase and records that it must never merge back.

create function public.split_source_record(p_source_record_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_src public.source_records;
  v_old public.purchases;
  v_new uuid;
  v_merchant uuid;
  v_first public.source_records;
  v_old_merchant uuid;
begin
  select * into v_src from public.source_records where id = p_source_record_id;
  if not found then
    raise exception 'source record % not found', p_source_record_id using errcode = 'P0002';
  end if;
  select * into v_old from public.purchases where id = v_src.purchase_id;
  if (select count(*) from public.source_records where purchase_id = v_old.id) < 2 then
    raise exception 'purchase % has only one source', v_old.id using errcode = '22023';
  end if;

  v_merchant := public.upsert_merchant(v_src.user_id, v_src.normalized_merchant);
  insert into public.purchases (
    user_id, financial_account_id, merchant_id, category_id, category_source,
    booking_date, amount_minor, currency, description)
  values (
    v_src.user_id, v_src.financial_account_id, v_merchant, v_old.category_id, v_old.category_source,
    v_src.booking_date, v_src.amount_minor, v_src.currency, v_src.description)
  returning id into v_new;

  update public.source_records set purchase_id = v_new where id = v_src.id;
  insert into public.merge_exclusions (user_id, source_record_id, purchase_id)
  values (v_src.user_id, v_src.id, v_old.id);

  -- Recompute the old purchase from its earliest remaining source.
  select * into v_first from public.source_records
  where purchase_id = v_old.id order by booking_date, created_at limit 1;
  v_old_merchant := public.upsert_merchant(v_first.user_id, v_first.normalized_merchant);
  update public.purchases
  set booking_date = v_first.booking_date,
      description = v_first.description,
      merchant_id = v_old_merchant,
      updated_at = now()
  where id = v_old.id;

  -- Recompute new-place flags for every merchant the split touched: the split-out record's,
  -- the old purchase's original one, and the one it moved to.
  perform public.refresh_new_place(m)
  from (select distinct m from unnest(array[v_merchant, v_old.merchant_id, v_old_merchant]) as m where m is not null) t;

  return v_new;
end;
$$;

revoke execute on function public.ingest_source_records(uuid, jsonb) from public, anon;
revoke execute on function public.split_source_record(uuid) from public, anon;
revoke execute on function public.refresh_new_place(uuid) from public, anon;
revoke execute on function public.upsert_merchant(uuid, text) from public, anon;
grant execute on function public.ingest_source_records(uuid, jsonb) to authenticated, service_role;
grant execute on function public.split_source_record(uuid) to authenticated, service_role;
grant execute on function public.refresh_new_place(uuid) to authenticated, service_role;
grant execute on function public.upsert_merchant(uuid, text) to authenticated, service_role;
