-- packages/db/migrations/0005_psa_estimates.sql
-- PSA-based price estimates (spec: docs/superpowers/specs/2026-10-20-psa-estimates-design.md).
-- pc_* tables and price_estimates are service-role only. The public reads public_price_estimates, which has no pct,
-- so the PSA price cannot be recovered as estimate / pct.

create table pc_imports (
  id          uuid primary key default gen_random_uuid(),
  fetched_at  timestamptz not null default now(),
  row_count   int not null,
  status      text not null check (status in ('ok','suspect')),
  notes       text
);
create index pc_imports_status_fetched_idx on pc_imports (status, fetched_at desc);

create table pc_products (
  pc_id         text primary key,
  console_name  text not null,
  product_name  text not null,
  card_number   text,
  sales_volume  int,
  prices_usd    jsonb not null,
  import_id     uuid not null references pc_imports(id)
);
create index pc_products_console_idx on pc_products (console_name);
create index pc_products_import_idx on pc_products (import_id);

create table pc_set_map (
  set_id        text primary key references sets(id),
  console_name  text not null,
  era_override  text check (era_override in ('vintage','mid','modern'))
);

create table pc_product_links (
  pc_id          text primary key references pc_products(pc_id) on delete cascade,
  state          text not null check (state in ('linked','needs_review','rejected')),
  product_id     text references products(id),
  review_reason  text,
  is_override    boolean not null default false,
  updated_at     timestamptz not null default now()
);
create index pc_product_links_state_idx on pc_product_links (state);
create index pc_product_links_product_idx on pc_product_links (product_id) where state = 'linked';

create table price_estimates (
  product_id    text not null references products(id),
  grade_value   numeric not null,
  estimate_usd  numeric not null,
  pct           numeric not null check (pct >= 0.60 and pct <= 0.90),
  era           text not null check (era in ('vintage','mid','modern')),
  import_id     uuid not null references pc_imports(id),
  source_as_of  timestamptz not null,
  computed_at   timestamptz not null default now(),
  primary key (product_id, grade_value)
);

alter table pc_imports enable row level security;
alter table pc_products enable row level security;
alter table pc_set_map enable row level security;
alter table pc_product_links enable row level security;
alter table price_estimates enable row level security;
revoke all on pc_imports, pc_products, pc_set_map, pc_product_links, price_estimates from anon, authenticated;

create view public_price_estimates as
  select product_id, grade_value, estimate_usd, era, source_as_of from price_estimates;
-- Auto-updatable view with owner privileges: strip Supabase default grants so anon cannot write through it.
revoke all on public_price_estimates from public, anon, authenticated;
grant select on public_price_estimates to anon, authenticated;

-- Atomic replace: supabase-js has no client-side transactions.
create function replace_price_estimates(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from price_estimates where true;
  insert into price_estimates (product_id, grade_value, estimate_usd, pct, era, import_id, source_as_of)
  select r.product_id, r.grade_value, r.estimate_usd, r.pct, r.era, r.import_id, r.source_as_of
  from jsonb_to_recordset(rows) as r(product_id text, grade_value numeric, estimate_usd numeric, pct numeric, era text, import_id uuid, source_as_of timestamptz);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function replace_price_estimates(jsonb) from public, anon, authenticated;
