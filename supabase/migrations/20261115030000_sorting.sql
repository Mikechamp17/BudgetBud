-- Sorting and new places (U5). User rules first, then built-in rules, else Uncategorized for AI sorting.

-- Finds the best rule for a normalized merchant name: the user's rules before built-in ones,
-- exact matches before word matches, and longer (more specific) names first.
create function public.find_category_rule(p_user_id uuid, p_normalized text)
returns table (category_id uuid, origin public.rule_origin)
language sql
stable
set search_path = ''
as $$
  select r.category_id, r.origin
  from public.category_rules r
  where (r.user_id = p_user_id or r.user_id is null)
    and (
      (r.match_type = 'exact' and r.match_name = p_normalized)
      or (r.match_type = 'contains' and p_normalized ~ ('\m' || r.match_name || '\M'))
    )
  order by (r.user_id is null), (r.match_type = 'contains'), length(r.match_name) desc
  limit 1;
$$;

create function public.uncategorized_category_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.categories where user_id is null and name = 'Uncategorized';
$$;

-- Sorts each new purchase that arrives without a category.
create function public.sort_new_purchase()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_normalized text;
  v_category uuid;
  v_origin public.rule_origin;
begin
  if new.category_id is not null then
    return new;
  end if;
  select normalized_name into v_normalized from public.merchants where id = new.merchant_id;
  if v_normalized is not null then
    select f.category_id, f.origin into v_category, v_origin
    from public.find_category_rule(new.user_id, v_normalized) f;
  end if;
  if v_category is null then
    new.category_id := public.uncategorized_category_id();
    new.category_source := 'none';
  else
    new.category_id := v_category;
    new.category_source := case v_origin
      when 'user' then 'user_rule'
      when 'builtin' then 'builtin_rule'
      else 'ai'
    end::public.category_source;
  end if;
  return new;
end;
$$;

create trigger sort_new_purchase
  before insert on public.purchases
  for each row execute function public.sort_new_purchase();

-- The user moves a purchase to a category. The choice becomes a rule for that merchant (R14).
create function public.set_purchase_category(p_purchase_id uuid, p_category_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_normalized text;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id;
  if not found then
    raise exception 'purchase % not found', p_purchase_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'category % not found', p_category_id using errcode = 'P0002';
  end if;

  update public.purchases
  set category_id = p_category_id, category_source = 'manual', updated_at = now()
  where id = p_purchase_id;

  select normalized_name into v_normalized from public.merchants where id = v_purchase.merchant_id;
  if v_normalized is not null then
    insert into public.category_rules (user_id, match_name, match_type, category_id, origin)
    values (v_purchase.user_id, v_normalized, 'exact', p_category_id, 'user')
    on conflict (user_id, match_name) do update
      set category_id = excluded.category_id, origin = 'user', match_type = 'exact';
  end if;
end;
$$;

-- Clears the new-place flag on one purchase.
create function public.dismiss_new_place(p_purchase_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.purchases
  set is_new_place = false, new_place_dismissed = true, updated_at = now()
  where id = p_purchase_id;
$$;

revoke execute on function public.set_purchase_category(uuid, uuid) from public, anon;
revoke execute on function public.dismiss_new_place(uuid) from public, anon;
grant execute on function public.set_purchase_category(uuid, uuid) to authenticated, service_role;
grant execute on function public.dismiss_new_place(uuid) to authenticated, service_role;
