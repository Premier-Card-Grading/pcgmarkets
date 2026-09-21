-- 0004_home.sql: read-only views for the home page (Just sold, Browse by set).
create view public_recent_sales as
select s.id, s.product_id, p.name_en, p.name_ja, p.number_printed, p.image_url,
       st.printed_code as set_code, st.name_en as set_name_en, st.name_ja as set_name_ja, p.language,
       s.grade_value, s.grade_label, s.price, s.currency, s.price_usd, s.sold_at, s.source
from public_sales s
join products p on p.id = s.product_id
join sets st on st.id = p.set_id
where s.is_best_offer = false and s.sold_at is not null and s.grade_value is not null;

create view set_sale_counts as
select st.id, st.name_en, st.name_ja, st.printed_code, st.language, sum(c.sale_count)::int as sale_count
from product_sale_counts c
join products p on p.id = c.product_id
join sets st on st.id = p.set_id
group by st.id, st.name_en, st.name_ja, st.printed_code, st.language;

grant select on public_recent_sales to anon, authenticated;
grant select on set_sale_counts to anon, authenticated;
