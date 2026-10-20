-- 0006_sets_browse.sql: catalogue fields for the Sets pages, a public per-card view, and image buckets.
begin;

alter table sets add column logo_url text;
alter table sets add column series text;
alter table sets add column source text not null default 'tcgdex' check (source in ('tcgdex','limitless'));
alter table sets add column limitless_code text;
alter table products add column image_source text check (image_source in ('tcgdex','limitless','pokemontcg'));

-- One row per card with the public PCG 10 numbers the card page already shows.
create view public_set_cards as
select p.set_id, p.id, p.number_printed, p.number_num, p.number_denom, p.number_suffix,
       p.name_en, p.name_ja, p.rarity, p.image_url,
       pp.median_usd as pcg10_median_usd, pp.n_sales as pcg10_n_sales,
       e.estimate_usd as est10_usd, e.source_as_of as est10_as_of,
       coalesce(c.sale_count, 0)::int as sale_count
from products p
left join price_points pp on pp.product_id = p.id and pp.grade_value = 10 and pp.grade_label = 'any' and pp."window" = '90d'
left join price_estimates e on e.product_id = p.id and e.grade_value = 10
left join product_sale_counts c on c.product_id = p.id;
-- Owner-privileged view: strip default grants so anon cannot write through it.
revoke all on public_set_cards from public, anon, authenticated;
grant select on public_set_cards to anon, authenticated;

-- Public-read buckets; only the service role (which bypasses RLS) writes.
insert into storage.buckets (id, name, public) values ('set-logos', 'set-logos', true), ('card-images', 'card-images', true)
on conflict (id) do nothing;

commit;
