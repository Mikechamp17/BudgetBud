-- Receipt matching (U10, KTD19). A receipt never creates a purchase. It attaches to the purchase
-- with the same total and currency, a date within 3 days, and a similar merchant, or waits until one arrives.

create function public.set_receipt_merchant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_merchant := case when new.merchant_name is null then null else public.normalize_merchant(new.merchant_name) end;
  return new;
end;
$$;

create trigger set_receipt_merchant
  before insert or update of merchant_name on public.receipts
  for each row execute function public.set_receipt_merchant();

-- True when a purchase is a match for a receipt.
create function public.receipt_fits_purchase(r public.receipts, p public.purchases)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p.user_id = r.user_id
    and p.currency = r.currency
    and p.amount_minor = -r.total_minor
    and r.receipt_date is not null
    and p.booking_date between r.receipt_date - 3 and r.receipt_date + 3
    and (
      r.normalized_merchant is null
      or exists (
        select 1 from public.source_records s
        where s.purchase_id = p.id and public.merchants_match(s.normalized_merchant, r.normalized_merchant))
    )
    and not exists (select 1 from public.receipts other where other.purchase_id = p.id and other.id <> r.id);
$$;

-- Attaches a pending receipt to the closest matching purchase. Returns the purchase, or null if none matches yet.
create function public.match_receipt(p_receipt_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_receipt public.receipts;
  v_purchase uuid;
begin
  select * into v_receipt from public.receipts where id = p_receipt_id;
  if not found then
    raise exception 'receipt % not found', p_receipt_id using errcode = 'P0002';
  end if;
  if v_receipt.status = 'matched' then
    return v_receipt.purchase_id;
  end if;

  select p.id into v_purchase
  from public.purchases p
  where p.user_id = v_receipt.user_id
    and public.receipt_fits_purchase(v_receipt, p)
  order by abs(p.booking_date - v_receipt.receipt_date), p.created_at
  limit 1;

  if v_purchase is not null then
    update public.receipts set purchase_id = v_purchase, status = 'matched' where id = p_receipt_id;
  end if;
  return v_purchase;
end;
$$;

-- The user attaches a receipt to a purchase by hand.
create function public.link_receipt(p_receipt_id uuid, p_purchase_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.purchases where id = p_purchase_id) then
    raise exception 'purchase % not found', p_purchase_id using errcode = 'P0002';
  end if;
  update public.receipts set purchase_id = p_purchase_id, status = 'matched' where id = p_receipt_id;
  if not found then
    raise exception 'receipt % not found', p_receipt_id using errcode = 'P0002';
  end if;
end;
$$;

-- Every source record ingest links retries the owner's pending receipts against its purchase,
-- whatever path the record came from. It runs after the record exists, so the merchant check can see it.
create function public.retry_pending_receipts_for_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_receipt uuid;
begin
  select * into v_purchase from public.purchases where id = new.purchase_id;
  select r.id into v_receipt
  from public.receipts r
  where r.user_id = new.user_id
    and r.status = 'pending'
    and public.receipt_fits_purchase(r, v_purchase)
  order by abs(v_purchase.booking_date - r.receipt_date), r.created_at
  limit 1;
  if v_receipt is not null then
    update public.receipts set purchase_id = v_purchase.id, status = 'matched' where id = v_receipt;
  end if;
  return null;
end;
$$;

create trigger retry_pending_receipts
  after insert on public.source_records
  for each row execute function public.retry_pending_receipts_for_source();

revoke execute on function public.match_receipt(uuid) from public, anon;
revoke execute on function public.link_receipt(uuid, uuid) from public, anon;
grant execute on function public.match_receipt(uuid) to authenticated, service_role;
grant execute on function public.link_receipt(uuid, uuid) to authenticated, service_role;
