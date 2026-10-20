-- packages/db/seed/pc-set-map.sql
-- The "list of sets" that get PSA-based estimates: our set id → PriceCharting console-name, exactly as it appears
-- in the CSV's console-name column. Find candidate names after an import with:
--   supabase db query --linked "select console_name, count(*) from pc_products group by 1 order by 2 desc limit 100"
-- (the `pricecharting:link` job also logs the largest unmapped console names).
-- era_override is required only when sets.release_date is null.
-- Apply with: supabase db query --linked -f packages/db/seed/pc-set-map.sql   (safe to re-run)
insert into pc_set_map (set_id, console_name, era_override) values
  ('sv03.5', 'Pokemon Scarlet & Violet 151', null)
on conflict (set_id) do update set console_name = excluded.console_name, era_override = excluded.era_override;
