// apps/ingest/src/jobs/pricecharting-link.ts
import type { Job } from "../run";
import type { Db } from "@pcg/db";
import { loadSetMap, loadPcProductsForConsoles, loadLinkCandidates, loadOverriddenPcIds, upsertPcLinks, loadAllConsoleCounts, deleteUnmappedAutoLinks } from "@pcg/db";
import { linkPcProduct, type LinkCandidate } from "@pcg/domain";

export async function linkMapped(db: Db, log: (m: string) => void): Promise<{ linked: number; review: number }> {
  const map = await loadSetMap(db);
  const setsByConsole = new Map<string, string[]>();
  for (const m of map) setsByConsole.set(m.consoleName, [...(setsByConsole.get(m.consoleName) ?? []), m.setId]);
  for (const [c, ids] of setsByConsole) if (ids.length > 1) log(`console "${c}" is mapped to several sets: ${ids.join(", ")}; matching against all of them`);
  const [pcRows, candidates, overridden] = await Promise.all([
    loadPcProductsForConsoles(db, [...setsByConsole.keys()]), loadLinkCandidates(db, map.map((m) => m.setId)), loadOverriddenPcIds(db)]);
  const bySet = new Map<string, LinkCandidate[]>();
  for (const c of candidates) bySet.set(c.setId, [...(bySet.get(c.setId) ?? []), c]);
  const rows: { pc_id: string; state: "linked" | "needs_review"; product_id: string | null; review_reason: string | null }[] = [];
  const perSet = new Map<string, { linked: number; total: number }>();
  for (const r of pcRows) {
    if (overridden.has(r.pcId)) continue;
    const setIds = setsByConsole.get(r.consoleName) ?? [];
    const res = linkPcProduct(r, setIds.flatMap((id) => bySet.get(id) ?? []));
    // attribute to the linked product's set, or to the console's sets for review rows
    const setId = res.state === "linked" ? (candidates.find((c) => c.id === res.productId)?.setId ?? setIds.join("+")) : setIds.join("+");
    rows.push(res.state === "linked"
      ? { pc_id: r.pcId, state: "linked", product_id: res.productId, review_reason: null }
      : { pc_id: r.pcId, state: "needs_review", product_id: null, review_reason: res.reason });
    const s = perSet.get(setId) ?? { linked: 0, total: 0 };
    s.total++; if (res.state === "linked") s.linked++;
    perSet.set(setId, s);
  }
  await upsertPcLinks(db, rows);
  // Links for PriceCharting rows whose console is no longer mapped would otherwise linger and keep feeding estimates.
  const deleted = await deleteUnmappedAutoLinks(db, pcRows.map((r) => r.pcId));
  if (deleted) log(`deleted ${deleted} auto links for PriceCharting rows on consoles that are no longer mapped`);
  for (const [setId, s] of perSet) log(`${setId}: linked ${s.linked}/${s.total}${s.linked < s.total * 0.5 ? "  ← under 50% linked, check the console-name mapping" : ""}`);
  const counts = await loadAllConsoleCounts(db);
  const unmapped = [...counts.entries()].filter(([c]) => !setsByConsole.has(c)).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (unmapped.length) log(`largest unmapped console names: ${unmapped.map(([c, n]) => `${c} (${n})`).join("; ")}`);
  const linked = rows.filter((r) => r.state === "linked").length;
  return { linked, review: rows.length - linked };
}

export const pricechartingLinkJob: Job = async ({ db, log }) => {
  const { linked, review } = await linkMapped(db, log);
  return { items_seen: linked + review, items_new: linked, items_updated: review };
};
