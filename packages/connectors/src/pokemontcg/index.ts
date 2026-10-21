import { politeFetch } from "../http";
import { PTCG_SET_MAP } from "./set-map";
export { PTCG_SET_MAP } from "./set-map";

export interface PtcgCard { number: string; small: string }
export const ptcgSetId = (ourId: string) => PTCG_SET_MAP[ourId] ?? ourId;
const norm = (s: string) => s.split("/")[0]!.trim().toUpperCase().replace(/^0+(?=\d)/, "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * pokemontcg.io answers the same query with a 500 one minute and a 200 the next, for longer than politeFetch's own
 * short retries cover, so each page gets a few more attempts with longer pauses before the set is given up for this run.
 */
export async function listCards(ptcgSet: string, opts: { attempts?: number; retryDelayMs?: number; minIntervalMs?: number; fetcher?: (url: string) => Promise<Response> } = {}): Promise<PtcgCard[]> {
  const { attempts = 6, retryDelayMs = 15_000, minIntervalMs = 1000 } = opts;
  const fetcher = opts.fetcher ?? ((url: string) => politeFetch(url, { minIntervalMs, signal: AbortSignal.timeout(120_000) }));
  const out: PtcgCard[] = [];
  for (let page = 1; ; page += 1) {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(ptcgSet)}&select=number,images&pageSize=250&page=${page}`;
    let res = await fetcher(url);
    for (let a = 1; res.status >= 500 && a < attempts; a += 1) { await sleep(retryDelayMs * a); res = await fetcher(url); }
    if (!res.ok) throw new Error(`pokemontcg ${ptcgSet}: ${res.status}`);
    const body = (await res.json()) as { data: { number: string; images: { small: string } }[]; totalCount: number };
    out.push(...body.data.map((c) => ({ number: c.number, small: c.images.small })));
    if (out.length >= body.totalCount || body.data.length === 0) return out;
  }
}

export function matchImages(ours: { id: string; number_printed: string; number_num: number | null }[], theirs: PtcgCard[]) {
  // A number listed twice in one set is ambiguous: skip it rather than guess (wrong card is worse than none).
  const byNum = new Map<string, string | null>();
  for (const c of theirs) {
    const k = norm(c.number);
    byNum.set(k, byNum.has(k) ? null : c.small);
  }
  const out: { id: string; url: string }[] = [];
  for (const p of ours) {
    const keys = [p.number_num != null ? String(p.number_num) : norm(p.number_printed), norm(p.number_printed)];
    const key = keys.find((k) => byNum.has(k));
    const url = key === undefined ? null : byNum.get(key) ?? null;
    if (url) out.push({ id: p.id, url });
  }
  return out;
}
