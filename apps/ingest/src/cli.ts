import "dotenv/config";
import { runJob } from "./run";
import { catalogTcgdex } from "./jobs/catalog-tcgdex";
import { fxDaily } from "./jobs/fx-daily";
import { ebaySold } from "./jobs/ebay-sold";
import { yahooAuctionsJob } from "./jobs/yahoo-auctions";
import { matchJob } from "./jobs/match";
import { pricesJob } from "./jobs/prices";

const [name, ...flags] = process.argv.slice(2);
const jobs = {
  "catalog:tcgdex": catalogTcgdex,
  "fx:daily": fxDaily,
  "ebay:sold": ebaySold,
  "yahoo:auctions": yahooAuctionsJob,
  match: matchJob({ all: flags.includes("--all") }),
  prices: pricesJob,
} as const;

const job = jobs[name as keyof typeof jobs];
if (!job) { console.error(`unknown job "${name}". one of: ${Object.keys(jobs).join(", ")}`); process.exit(2); }
const status = await runJob(name!, job);
process.exit(status === "failed" ? 1 : 0);
