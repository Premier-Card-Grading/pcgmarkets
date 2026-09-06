import type { Db } from "../client";
import { must } from "../client";

export async function startRun(db: Db, job: string): Promise<string> {
  const row = must(await db.from("ingest_runs").insert({ job, status: "running" }).select("id").single()) as { id: string };
  return row.id;
}
export async function finishRun(db: Db, id: string, patch: { status: "ok" | "failed" | "suspect"; items_seen?: number; items_new?: number; items_updated?: number; errors?: unknown[] }) {
  must(await db.from("ingest_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id));
}
