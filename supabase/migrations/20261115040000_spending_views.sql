-- Monthly spending in euros (U7). Conversion happens at read time with ECB rates (KTD13).

create function public.currency_minor_digits(p_currency text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_currency in ('JPY', 'KRW', 'ISK', 'CLP', 'VND') then 0
    when p_currency in ('BHD', 'KWD', 'JOD', 'OMR', 'TND') then 3
    else 2
  end;
$$;

-- Converts minor units of a currency to euro cents with the latest ECB rate on or before the date.
-- Returns null when no such rate exists.
create function public.to_eur_minor(p_amount_minor bigint, p_currency text, p_date date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case
    when p_currency = 'EUR' then p_amount_minor
    else (
      select round(p_amount_minor::numeric / power(10, public.currency_minor_digits(p_currency)) / r.rate * 100)::bigint
      from public.fx_rates r
      where r.currency = p_currency and r.rate_date <= p_date
      order by r.rate_date desc
      limit 1
    )
  end;
$$;

-- Spending for the caller's month: outflows outside excluded categories, in euro cents, as positive numbers.
-- Returns {month, total_minor, unconverted, categories: [{category_id, name, total_minor, count}]}.
create function public.monthly_spending(p_month date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with month_purchases as (
    select p.category_id, public.to_eur_minor(-p.amount_minor, p.currency, p.booking_date) as eur_minor
    from public.purchases p
    left join public.categories c on c.id = p.category_id
    where p.user_id = (select auth.uid())
      and p.booking_date >= date_trunc('month', p_month)::date
      and p.booking_date < (date_trunc('month', p_month) + interval '1 month')::date
      and p.amount_minor < 0
      and not coalesce(c.excluded_from_totals, false)
  ),
  by_category as (
    select mp.category_id, c.name, sum(mp.eur_minor)::bigint as total_minor, count(*)::int as count
    from month_purchases mp
    left join public.categories c on c.id = mp.category_id
    where mp.eur_minor is not null
    group by mp.category_id, c.name
  )
  select jsonb_build_object(
    'month', date_trunc('month', p_month)::date,
    'total_minor', coalesce((select sum(total_minor) from by_category), 0),
    'unconverted', (select count(*) from month_purchases where eur_minor is null),
    'categories', coalesce(
      (select jsonb_agg(jsonb_build_object('category_id', category_id, 'name', name, 'total_minor', total_minor, 'count', count)
              order by total_minor desc)
       from by_category),
      '[]'::jsonb)
  );
$$;

revoke execute on function public.monthly_spending(date) from public, anon;
grant execute on function public.monthly_spending(date) to authenticated;
