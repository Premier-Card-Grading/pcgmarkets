-- 0010_product_image_origin.sql: card images copied off third-party hosts (TCGdex, pokemontcg.io/scrydex) are served
-- from our own files; image_origin_url keeps where each copy came from, so the copies can be moved (e.g. to R2) or redone.
begin;
alter table products add column image_origin_url text;
commit;
