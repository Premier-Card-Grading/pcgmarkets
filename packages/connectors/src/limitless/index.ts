// packages/connectors/src/limitless/index.ts
import { politeFetch } from "../http";
import { parseSetIndex, parseSetList, mergeSetPages, type LimitlessSetSummary, type LimitlessSetPage } from "./parse";
export * from "./parse";

const BASE = "https://limitlesstcg.com/cards/jp";
const INTERVAL = 1000;

async function page(url: string): Promise<string> {
  const res = await politeFetch(url, { minIntervalMs: INTERVAL });
  if (!res.ok) throw new Error(`limitless ${url}: ${res.status}`);
  return res.text();
}

export async function listSets(): Promise<LimitlessSetSummary[]> {
  return parseSetIndex(await page(BASE));
}

export async function getSet(code: string): Promise<LimitlessSetPage> {
  const url = `${BASE}/${encodeURIComponent(code)}?display=list&show=all`;
  const ja = parseSetList(await page(url));
  const en = parseSetList(await page(`${url}&translate=en`));
  return mergeSetPages(code, ja, en);
}
