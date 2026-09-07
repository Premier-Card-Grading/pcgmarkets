-- Anonymous readers get catalog, price points, and a sales view without description/raw/metadata.
create policy public_read_sets on sets for select to anon, authenticated using (true);
create policy public_read_products on products for select to anon, authenticated using (true);
create policy public_read_price_points on price_points for select to anon, authenticated using (true);
create policy public_read_fx on fx_rates for select to anon, authenticated using (true);

create view public_sales as
select rl.id, lm.product_id, lm.grade_value, lm.grade_label, rl.price, rl.currency, rl.sold_at, rl.source, rl.url, rl.is_best_offer,
       (rl.price * fx.rate)::numeric(12,2) as price_usd
from listing_matches lm
join raw_listings rl on rl.id = lm.raw_listing_id
left join lateral (
  select rate from fx_rates f
  where f.base = rl.currency and f.quote = 'USD' and f.date <= coalesce(rl.sold_at, now())::date
  order by f.date desc limit 1
) fx on true
where lm.state = 'matched' and rl.kind = 'sold';

grant select on public_sales to anon, authenticated;
grant select on product_sale_counts to anon, authenticated;
grant execute on function search_products_by_number(int, int, text, int) to anon, authenticated;
grant execute on function search_products_by_name(text, int) to anon, authenticated;
