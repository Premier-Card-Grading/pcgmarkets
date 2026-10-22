-- 0011_estimate_sources.sql: estimates from two PSA price sources (spec: docs/superpowers/specs/2026-10-23-estimates-two-sources-design.md).
-- SoldComps PSA sales (psa_sales) come first; PriceCharting fills the rest. A SoldComps estimate has no PriceCharting
-- import and no era. The public views gain `source` so the site can apply each source's freshness rule; they still
-- expose no PSA price, pct or era.
begin;

alter table price_estimates add column source text not null default 'pricecharting' check (source in ('pricecharting','soldcomps'));
alter table price_estimates alter column source drop default;
alter table price_estimates alter column import_id drop not null;
alter table price_estimates alter column era drop not null;
alter table price_estimates add constraint price_estimates_pc_import check (source <> 'pricecharting' or import_id is not null);

create or replace view public_price_estimates as
  select product_id, grade_value, estimate_usd, source_as_of, source from price_estimates;
revoke all on public_price_estimates from public, anon, authenticated;
grant select on public_price_estimates to anon, authenticated;

create or replace function replace_price_estimates(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from price_estimates where true;
  insert into price_estimates (product_id, grade_value, estimate_usd, pct, era, import_id, source_as_of, source)
  select r.product_id, r.grade_value, r.estimate_usd, r.pct, r.era, r.import_id, r.source_as_of, r.source
  from jsonb_to_recordset(rows) as r(product_id text, grade_value numeric, estimate_usd numeric, pct numeric, era text, import_id uuid, source_as_of timestamptz, source text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function replace_price_estimates(jsonb) from public, anon, authenticated;

create or replace view public_set_cards as
select p.set_id, p.id, p.number_printed, p.number_num, p.number_denom, p.number_suffix,
       p.name_en, p.name_ja, p.rarity, p.image_url,
       pp.median_usd as pcg10_median_usd, pp.n_sales as pcg10_n_sales,
       e.estimate_usd as est10_usd, e.source_as_of as est10_as_of,
       coalesce(c.sale_count, 0)::int as sale_count,
       t.grade_value as top_grade, t.median_usd as top_median_usd, t.n_sales as top_n_sales,
       e.source as est10_source
from products p
left join price_points pp on pp.product_id = p.id and pp.grade_value = 10 and pp.grade_label = 'any' and pp."window" = '90d'
left join price_estimates e on e.product_id = p.id and e.grade_value = 10
left join product_sale_counts c on c.product_id = p.id
left join lateral (
  select x.grade_value, x.median_usd, x.n_sales from price_points x
  where x.product_id = p.id and x.grade_value < 10 and x.grade_label = 'any' and x."window" = '90d' and x.n_sales > 0
  order by x.n_sales desc, x.grade_value desc limit 1
) t on true;
revoke all on public_set_cards from public, anon, authenticated;
grant select on public_set_cards to anon, authenticated;

commit;
