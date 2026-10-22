-- 0008_set_cards_top_grade.sql: the set grid showed only a PCG 10 price, so a card sold only at 9.5 (or lower) read
-- "No comps yet" while its card page had prices. Add the grade the card page opens on when there is no 10:
-- the 90-day grade with the most sales, the higher grade on a tie. Columns are appended, so the view is replaced in place.
begin;

create or replace view public_set_cards as
select p.set_id, p.id, p.number_printed, p.number_num, p.number_denom, p.number_suffix,
       p.name_en, p.name_ja, p.rarity, p.image_url,
       pp.median_usd as pcg10_median_usd, pp.n_sales as pcg10_n_sales,
       e.estimate_usd as est10_usd, e.source_as_of as est10_as_of,
       coalesce(c.sale_count, 0)::int as sale_count,
       t.grade_value as top_grade, t.median_usd as top_median_usd, t.n_sales as top_n_sales
from products p
left join price_points pp on pp.product_id = p.id and pp.grade_value = 10 and pp.grade_label = 'any' and pp."window" = '90d'
left join price_estimates e on e.product_id = p.id and e.grade_value = 10
left join product_sale_counts c on c.product_id = p.id
left join lateral (
  select x.grade_value, x.median_usd, x.n_sales from price_points x
  where x.product_id = p.id and x.grade_value < 10 and x.grade_label = 'any' and x."window" = '90d' and x.n_sales > 0
  order by x.n_sales desc, x.grade_value desc limit 1
) t on true;
-- Owner-privileged view: strip default grants so anon cannot write through it.
revoke all on public_set_cards from public, anon, authenticated;
grant select on public_set_cards to anon, authenticated;

commit;
