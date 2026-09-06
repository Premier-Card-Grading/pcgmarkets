-- Sales count per product (matched, sold, priced) for ranking search results.
create view product_sale_counts as
select lm.product_id, count(*)::int as sale_count
from listing_matches lm
join raw_listings rl on rl.id = lm.raw_listing_id
where lm.state = 'matched' and rl.kind = 'sold' and rl.is_best_offer = false and rl.price > 0
group by lm.product_id;

create or replace function search_products_by_number(p_num int, p_denom int, p_suffix text, lim int default 30)
returns table (id text, sale_count int)
language sql stable as $$
  select p.id, coalesce(c.sale_count, 0)
  from products p
  left join product_sale_counts c on c.product_id = p.id
  join sets s on s.id = p.set_id
  where p.number_num = p_num
    and (p_denom is null or p.number_denom = p_denom)
    and (p_suffix is null or upper(p.number_suffix) = upper(p_suffix))
  order by coalesce(c.sale_count, 0) desc, s.release_date desc nulls last
  limit lim;
$$;

create or replace function search_products_by_name(q text, lim int default 30)
returns table (id text, sale_count int, score real)
language sql stable as $$
  select p.id, coalesce(c.sale_count, 0),
         greatest(similarity(unaccent(coalesce(p.name_en, '')), unaccent(q)), similarity(coalesce(p.name_ja, ''), q)) as score
  from products p
  left join product_sale_counts c on c.product_id = p.id
  where unaccent(coalesce(p.name_en, '')) % unaccent(q) or coalesce(p.name_ja, '') % q
  order by score desc, coalesce(c.sale_count, 0) desc
  limit lim;
$$;
