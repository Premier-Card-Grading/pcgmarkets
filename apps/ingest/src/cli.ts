import "dotenv/config";
import { runJob } from "./run";
import { catalogTcgdex } from "./jobs/catalog-tcgdex";
import { catalogLimitless } from "./jobs/catalog-limitless";
import { imagesJa } from "./jobs/images-ja";
import { imagesEn } from "./jobs/images-en";
import { fxDaily } from "./jobs/fx-daily";
import { ebaySold } from "./jobs/ebay-sold";
import { yahooAuctionsJob } from "./jobs/yahoo-auctions";
import { soldCompsJob } from "./jobs/soldcomps";
import { matchJob } from "./jobs/match";
import { pricesJob } from "./jobs/prices";
import { pricechartingCsvJob } from "./jobs/pricecharting-csv";
import { pricechartingLinkJob } from "./jobs/pricecharting-link";
import { estimatesJob } from "./jobs/estimates";

const [name, ...flags] = process.argv.slice(2);
const jobs = {
  "catalog:tcgdex": catalogTcgdex,
  "catalog:limitless": catalogLimitless,
  "images:ja": imagesJa({ size: flags.includes("--size") && flags[flags.indexOf("--size") + 1] === "lg" ? "LG" : "SM" }),
  "images:en": imagesEn,
  "fx:daily": fxDaily,
  "ebay:sold": ebaySold,
  "yahoo:auctions": yahooAuctionsJob,
  "ebay:sold-comps": soldCompsJob,
  match: matchJob({ all: flags.includes("--all") }),
  prices: pricesJob,
  "pricecharting:csv": pricechartingCsvJob(),
  "pricecharting:link": pricechartingLinkJob,
  estimates: estimatesJob,
} as const;

const job = jobs[name as keyof typeof jobs];
if (!job) { console.error(`unknown job "${name}". one of: ${Object.keys(jobs).join(", ")}`); process.exit(2); }
const status = await runJob(name!, job);
process.exit(status === "failed" ? 1 : 0);
