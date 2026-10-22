-- packages/db/migrations/0007_pc_price_history.sql
-- Our own PriceCharting price history. Their CSV holds today's values only and old files cannot be fetched,
-- so each ok import keeps a dated copy of the prices of cards in mapped sets (pc_set_map).
-- A row is written only when a card's prices or volume change: its price on day D is its latest row with as_of <= D.
-- No foreign key to pc_products, so history outlives a card leaving the CSV. Service-role only, like the other pc_* tables.
-- PriceCharting's terms require all their data to be purged when the subscription ends: that includes this table.

begin;

create table pc_price_history (
  pc_id         text not null,
  as_of         date not null,
  sales_volume  int,
  prices_usd    jsonb not null,
  import_id     uuid not null references pc_imports(id),
  primary key (pc_id, as_of)
);

alter table pc_price_history enable row level security;
revoke all on pc_price_history from anon, authenticated;

-- Runs in the database: one statement over every mapped card, instead of reading the history back into the worker.
create function snapshot_pc_prices(p_import uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into pc_price_history (pc_id, as_of, sales_volume, prices_usd, import_id)
  select p.pc_id, (i.fetched_at at time zone 'utc')::date, p.sales_volume, p.prices_usd, p_import
  from pc_products p
  join pc_imports i on i.id = p_import
  where p.import_id = p_import
    and p.console_name in (select console_name from pc_set_map)
    and not exists (
      select 1 from (
        select h.sales_volume, h.prices_usd from pc_price_history h
        where h.pc_id = p.pc_id order by h.as_of desc limit 1
      ) last
      where last.prices_usd = p.prices_usd and last.sales_volume is not distinct from p.sales_volume
    )
  on conflict (pc_id, as_of) do update
    set sales_volume = excluded.sales_volume, prices_usd = excluded.prices_usd, import_id = excluded.import_id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function snapshot_pc_prices(uuid) from public, anon, authenticated;

commit;
