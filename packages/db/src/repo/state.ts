import type { Db } from "../client";
import { must } from "../client";

export async function getCursor<T = unknown>(db: Db, connector: string): Promise<T | null> {
  const r = must(await db.from("connector_state").select("cursor").eq("connector", connector).maybeSingle()) as { cursor: T } | null;
  return r?.cursor ?? null;
}
export async function setCursor(db: Db, connector: string, cursor: unknown) {
  must(await db.from("connector_state").upsert({ connector, cursor, updated_at: new Date().toISOString() }, { onConflict: "connector" }));
}
