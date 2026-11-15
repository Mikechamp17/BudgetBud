-- Core schema for the BudgetBud core loop (U2).
-- Money is stored as bigint minor units with an ISO 4217 currency code. Outflows are negative.
-- Every user table carries user_id, has RLS enabled here, and is indexed on user_id.
-- Child rows reference parents through (id, user_id) so a row can never point at another user's data.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Enums ---------------------------------------------------------------------

create type public.bank_link_status as enum ('pending', 'active', 'expiring', 'expired', 'failed', 'revoked');
create type public.import_kind as enum ('csv', 'ofx', 'pdf', 'bank_sync');
create type public.source_kind as enum ('bank', 'csv', 'ofx', 'pdf');
create type public.rule_origin as enum ('builtin', 'user', 'ai');
create type public.rule_match as enum ('exact', 'contains');
create type public.category_source as enum ('user_rule', 'builtin_rule', 'ai', 'manual', 'none');
create type public.receipt_status as enum ('pending', 'matched');

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bank links ----------------------------------------------------------------

create table public.bank_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'enable_banking',
  institution_name text not null,
  institution_country char(2) not null,
  status public.bank_link_status not null default 'pending',
  valid_until timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index bank_links_user_id_idx on public.bank_links (user_id);
alter table public.bank_links enable row level security;

-- Financial accounts ----------------------------------------------------------

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank_link_id uuid,
  name text not null,
  institution_name text,
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  provider_account_id text,
  file_mapping jsonb,
  last_booked_date date,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (bank_link_id, provider_account_id),
  foreign key (bank_link_id, user_id) references public.bank_links (id, user_id) on delete cascade
);
create index financial_accounts_user_id_idx on public.financial_accounts (user_id);
create index financial_accounts_bank_link_id_idx on public.financial_accounts (bank_link_id);
alter table public.financial_accounts enable row level security;

-- Imports -------------------------------------------------------------------

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  financial_account_id uuid not null,
  kind public.import_kind not null,
  file_name text,
  storage_path text,
  created_count integer not null default 0,
  merged_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (financial_account_id, user_id) references public.financial_accounts (id, user_id) on delete cascade
);
create index imports_user_id_idx on public.imports (user_id);
create index imports_financial_account_id_idx on public.imports (financial_account_id);
alter table public.imports enable row level security;

-- Categories and rules ------------------------------------------------------
-- Built-in rows have a null user_id. They are readable by every signed-in user and writable by none.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  excluded_from_totals boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, name)
);
create index categories_user_id_idx on public.categories (user_id);
alter table public.categories enable row level security;

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  match_name text not null check (length(match_name) > 0),
  match_type public.rule_match not null default 'exact',
  category_id uuid not null references public.categories (id) on delete cascade,
  origin public.rule_origin not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, match_name),
  check ((user_id is null) = (origin = 'builtin'))
);
create index category_rules_user_id_idx on public.category_rules (user_id);
create index category_rules_category_id_idx on public.category_rules (category_id);
alter table public.category_rules enable row level security;

-- Merchants -----------------------------------------------------------------

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  first_purchase_date date,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, normalized_name)
);
create index merchants_normalized_name_trgm_idx on public.merchants using gin (normalized_name extensions.gin_trgm_ops);
alter table public.merchants enable row level security;

-- Purchases -----------------------------------------------------------------

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  financial_account_id uuid not null,
  merchant_id uuid,
  category_id uuid references public.categories (id) on delete set null,
  category_source public.category_source not null default 'none',
  booking_date date not null,
  amount_minor bigint not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  description text not null,
  is_new_place boolean not null default false,
  new_place_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (financial_account_id, user_id) references public.financial_accounts (id, user_id) on delete cascade,
  foreign key (merchant_id, user_id) references public.merchants (id, user_id) on delete set null (merchant_id)
);
create index purchases_user_id_booking_date_idx on public.purchases (user_id, booking_date);
create index purchases_account_match_idx on public.purchases (financial_account_id, currency, amount_minor, booking_date);
create index purchases_merchant_id_idx on public.purchases (merchant_id);
create index purchases_category_id_idx on public.purchases (category_id);
alter table public.purchases enable row level security;

-- Source records --------------------------------------------------------------
-- The raw record from each import path. A purchase is merged from one or more of these.

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_id uuid not null,
  financial_account_id uuid not null,
  import_id uuid,
  kind public.source_kind not null,
  channel text not null,
  source_key text not null,
  booking_date date not null,
  amount_minor bigint not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  description text not null,
  normalized_merchant text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, source_key),
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade,
  foreign key (financial_account_id, user_id) references public.financial_accounts (id, user_id) on delete cascade,
  foreign key (import_id, user_id) references public.imports (id, user_id) on delete set null (import_id)
);
create index source_records_purchase_id_idx on public.source_records (purchase_id);
create index source_records_financial_account_id_idx on public.source_records (financial_account_id);
create index source_records_import_id_idx on public.source_records (import_id);
alter table public.source_records enable row level security;

-- Merge exclusions --------------------------------------------------------------
-- A split records that a source record must never merge into the purchase it was split from.

create table public.merge_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_record_id uuid not null,
  purchase_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_record_id, purchase_id),
  foreign key (source_record_id, user_id) references public.source_records (id, user_id) on delete cascade,
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade
);
create index merge_exclusions_user_id_idx on public.merge_exclusions (user_id);
create index merge_exclusions_purchase_id_idx on public.merge_exclusions (purchase_id);
alter table public.merge_exclusions enable row level security;

-- Receipts ------------------------------------------------------------------

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_id uuid,
  storage_path text,
  merchant_name text,
  normalized_merchant text,
  receipt_date date,
  total_minor bigint,
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  status public.receipt_status not null default 'pending',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete set null (purchase_id)
);
create index receipts_user_id_status_idx on public.receipts (user_id, status);
create index receipts_purchase_id_idx on public.receipts (purchase_id);
alter table public.receipts enable row level security;

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  receipt_id uuid not null,
  position integer not null default 0,
  description text not null,
  quantity numeric,
  amount_minor bigint,
  foreign key (receipt_id, user_id) references public.receipts (id, user_id) on delete cascade
);
create index receipt_items_user_id_idx on public.receipt_items (user_id);
create index receipt_items_receipt_id_idx on public.receipt_items (receipt_id);
alter table public.receipt_items enable row level security;

-- AI usage ------------------------------------------------------------------
-- Written by Edge Functions with the service role. Users can read their own rows.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  model text not null,
  purpose text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_id_created_at_idx on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security;

-- Exchange rates ------------------------------------------------------------
-- ECB reference rates: units of currency per 1 EUR. Shared, written only by the service role.

create table public.fx_rates (
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  rate_date date not null,
  rate numeric not null check (rate > 0),
  primary key (currency, rate_date)
);
alter table public.fx_rates enable row level security;

-- Policies ------------------------------------------------------------------

create policy "Users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'bank_links', 'financial_accounts', 'imports', 'merchants', 'purchases',
    'source_records', 'merge_exclusions', 'receipts', 'receipt_items'
  ] loop
    execute format('create policy "Users read own rows" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "Users insert own rows" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Users update own rows" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Users delete own rows" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

create policy "Users read built-in and own categories" on public.categories for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy "Users insert own categories" on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own categories" on public.categories for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own categories" on public.categories for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read built-in and own rules" on public.category_rules for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy "Users insert own rules" on public.category_rules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own rules" on public.category_rules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own rules" on public.category_rules for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read own AI usage" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

create policy "Signed-in users read exchange rates" on public.fx_rates for select to authenticated using (true);

-- Bank sessions (private) ---------------------------------------------------
-- The private schema is not exposed through the API. Only the service role reaches it, through these functions.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.bank_sessions (
  bank_link_id uuid primary key references public.bank_links (id) on delete cascade,
  session_id text not null,
  created_at timestamptz not null default now()
);

create function public.put_bank_session(p_bank_link_id uuid, p_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.bank_sessions (bank_link_id, session_id)
  values (p_bank_link_id, p_session_id)
  on conflict (bank_link_id) do update set session_id = excluded.session_id, created_at = now();
$$;

create function public.get_bank_session(p_bank_link_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select session_id from private.bank_sessions where bank_link_id = p_bank_link_id;
$$;

create function public.delete_bank_session(p_bank_link_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.bank_sessions where bank_link_id = p_bank_link_id;
$$;

revoke execute on function public.put_bank_session(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_bank_session(uuid) from public, anon, authenticated;
revoke execute on function public.delete_bank_session(uuid) from public, anon, authenticated;
grant execute on function public.put_bank_session(uuid, text) to service_role;
grant execute on function public.get_bank_session(uuid) to service_role;
grant execute on function public.delete_bank_session(uuid) to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
