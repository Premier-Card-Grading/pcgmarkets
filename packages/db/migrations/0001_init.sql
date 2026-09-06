create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table sets (
  id            text primary key,
  printed_code  text,
  language      text not null check (language in ('ja','en')),
  name_en       text,
  name_ja       text,
  release_date  date,
  card_count    int,
  aliases       text[] not null default '{}'
);
create index sets_language_card_count_idx on sets (language, card_count);

create table products (
  id             text primary key,
  set_id         text not null references sets(id),
  number_printed text not null,
  number_num     int,
  number_denom   int,
  number_suffix  text,
  name_en        text,
  name_ja        text,
  rarity         text,
  language       text not null check (language in ('ja','en')),
  image_url      text
);
create index products_num_denom_idx on products (number_num, number_denom);
create index products_num_suffix_idx on products (number_num, number_suffix);
create index products_set_num_idx on products (set_id, number_num);
create index products_name_en_trgm on products using gin (name_en gin_trgm_ops);
create index products_name_ja_trgm on products using gin (name_ja gin_trgm_ops);

create table raw_listings (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,
  source_item_id   text not null,
  url              text not null,
  title            text not null,
  description      text,
  price            numeric not null,
  currency         text not null,
  kind             text not null check (kind in ('sold','ended','active')),
  sold_at          timestamptz,
  listed_at        timestamptz,
  ended_at         timestamptz,
  is_best_offer    boolean not null default false,
  seller_country   text,
  external_item_id text,
  image_urls       text[] not null default '{}',
  metadata         jsonb not null default '{}'::jsonb,
  raw              jsonb not null,
  fetched_at       timestamptz not null default now(),
  unique (source, source_item_id)
);
create index raw_listings_kind_sold_at_idx on raw_listings (kind, sold_at desc);

create table listing_matches (
  raw_listing_id  uuid primary key references raw_listings(id) on delete cascade,
  state           text not null check (state in ('matched','needs_review','rejected')),
  product_id      text references products(id),
  grade_value     numeric,
  grade_label     text,
  cert_id         text,
  match_method    text,
  review_reason   text,
  extracted       jsonb not null default '{}'::jsonb,
  is_override     boolean not null default false,
  matcher_version text not null,
  resolved_by     text,
  resolved_at     timestamptz,
  updated_at      timestamptz not null default now()
);
create index listing_matches_state_idx on listing_matches (state);
create index listing_matches_product_grade_idx on listing_matches (product_id, grade_value) where state = 'matched';

create table price_points (
  product_id   text not null references products(id),
  grade_value  numeric not null,
  grade_label  text not null,
  "window"     text not null check ("window" in ('30d','90d','180d','all')),
  n_sales      int not null,
  median_usd   numeric not null,
  min_usd      numeric not null,
  max_usd      numeric not null,
  last_sold_at timestamptz not null,
  confidence   text not null check (confidence in ('high','med','low')),
  computed_at  timestamptz not null default now(),
  primary key (product_id, grade_value, grade_label, "window")
);

create table fx_rates (
  date  date not null,
  base  text not null,
  quote text not null default 'USD',
  rate  numeric not null,
  primary key (date, base, quote)
);

create table connector_state (
  connector  text primary key,
  cursor     jsonb,
  updated_at timestamptz not null default now()
);

create table ingest_runs (
  id            uuid primary key default gen_random_uuid(),
  job           text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null check (status in ('running','ok','failed','suspect')),
  items_seen    int not null default 0,
  items_new     int not null default 0,
  items_updated int not null default 0,
  errors        jsonb not null default '[]'::jsonb
);
create index ingest_runs_job_started_idx on ingest_runs (job, started_at desc);

create table admin_users (
  email text primary key
);

-- Lock everything down; public read access is granted per-object in 0003.
alter table sets enable row level security;
alter table products enable row level security;
alter table raw_listings enable row level security;
alter table listing_matches enable row level security;
alter table price_points enable row level security;
alter table fx_rates enable row level security;
alter table connector_state enable row level security;
alter table ingest_runs enable row level security;
alter table admin_users enable row level security;
