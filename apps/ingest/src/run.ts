import { createServiceClient, startRun, finishRun, type Db } from "@pcg/db";

export interface JobContext { db: Db; log: (m: string) => void }
export interface JobStats { items_seen: number; items_new: number; items_updated: number; suspect?: boolean }
export type Job = (ctx: JobContext) => Promise<JobStats>;

const KILL_SWITCH: Record<string, string> = { "yahoo:auctions": "CONNECTOR_YAHOO_AUC", "ebay:sold": "CONNECTOR_THECARDAPI", "ebay:sold-comps": "CONNECTOR_SOLDCOMPS", "pricecharting:csv": "CONNECTOR_PRICECHARTING" };

export async function runJob(name: string, job: Job, opts: { db?: Db; env?: NodeJS.ProcessEnv } = {}): Promise<"ok" | "failed" | "suspect" | "skipped"> {
  const env = opts.env ?? process.env;
  const sw = KILL_SWITCH[name];
  if (sw && env[sw] === "off") { console.log(`[${name}] skipped: ${sw}=off`); return "skipped"; }
  const log = (m: string) => console.log(`[${name}] ${m}`);

  let db: Db;
  try {
    db = opts.db ?? createServiceClient();
  } catch (e) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) };
    log(`failed: ${err.message}`);
    return "failed";
  }

  let runId: string;
  try {
    runId = await startRun(db, name);
  } catch (e) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) };
    log(`failed: ${err.message}`);
    return "failed";
  }

  try {
    const stats = await job({ db, log });
    const status = stats.suspect ? "suspect" : "ok";
    await finishRun(db, runId, { status, items_seen: stats.items_seen, items_new: stats.items_new, items_updated: stats.items_updated });
    log(`${status}: seen=${stats.items_seen} new=${stats.items_new} updated=${stats.items_updated}`);
    return status;
  } catch (e) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) };
    await finishRun(db, runId, { status: "failed", errors: [err] });
    log(`failed: ${err.message}`);
    return "failed";
  }
}
