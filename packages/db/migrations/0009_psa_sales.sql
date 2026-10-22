-- 0009_psa_sales.sql: PSA slab sales from SoldComps (eBay sold listings), for PSA price history and estimates.
-- Each sale is identified from its PSA label (packages/domain/src/psa-label.ts), never from the seller's title.
-- Raw PSA prices are internal: service role only, no anon/authenticated access, like the pc_* tables.
-- No seller usernames or other seller personal data are stored.

begin;

create table psa_sales (
  source_item_id  text primary key,
  source          text not null check (source in ('soldcomps')),
  product_id      text not null references products(id),
  grade_value     numeric not null check (grade_value >= 1 and grade_value <= 10),
  grade_words     text,
  cert            text,
  -- A Best Offer sale's accepted price is unknown unless fetched, so price_usd is null for those.
  price_usd       numeric check (price_usd > 0),
  is_best_offer   boolean not null,
  sold_at         timestamptz not null,
  item_location   text,
  url             text not null,
  read            text not null check (read in ('ocr','vision')),
  evidence        text[] not null,
  imported_at     timestamptz not null default now()
);
create index psa_sales_product_grade_idx on psa_sales (product_id, grade_value, sold_at desc);

alter table psa_sales enable row level security;
revoke all on psa_sales from anon, authenticated;

commit;
