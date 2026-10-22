import type { Job } from "../run";
import { loadMatchedSales, loadSalesForPriceCheck, replacePricePoints, sendSalesToReview } from "@pcg/db";
import { computePricePoints, implausibleSales } from "@pcg/domain";

export const pricesJob: Job = async ({ db, log }) => {
  // First, sales whose price is not a market price (under $5, or far below the card's other sales) go to review.
  const flags = implausibleSales(await loadSalesForPriceCheck(db));
  if (flags.size) {
    await sendSalesToReview(db, flags);
    const n = (r: string) => [...flags.values()].filter((v) => v === r).length;
    log(`sent ${flags.size} sales to review: ${n("price_below_floor")} under $5, ${n("price_outlier")} far below the card's other sales`);
  }
  const sales = await loadMatchedSales(db);
  const points = computePricePoints(sales, new Date());
  await replacePricePoints(db, points);
  log(`${sales.length} sales → ${points.length} price points`);
  return { items_seen: sales.length, items_new: points.length, items_updated: flags.size };
};
