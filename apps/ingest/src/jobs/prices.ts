import type { Job } from "../run";
import { loadMatchedSales, replacePricePoints } from "@pcg/db";
import { computePricePoints } from "@pcg/domain";

export const pricesJob: Job = async ({ db, log }) => {
  const sales = await loadMatchedSales(db);
  const points = computePricePoints(sales, new Date());
  await replacePricePoints(db, points);
  log(`${sales.length} sales → ${points.length} price points`);
  return { items_seen: sales.length, items_new: points.length, items_updated: 0 };
};
