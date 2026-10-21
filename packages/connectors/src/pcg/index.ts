import type { CertRecord, PcgCert } from "@pcg/domain";

const BASE = "https://app.premiercardgrading.com/public/api/v1/gradings";

export async function lookupCert(input: string, opts: { timeoutMs?: number } = {}): Promise<CertRecord | null> {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  const gradedId = digits.padStart(9, "0");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3000);
  try {
    const res = await fetch(`${BASE}?gradedId=${gradedId}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const rec = (Array.isArray(body) ? body[0] : (body as { data?: unknown[] })?.data?.[0]) as Record<string, unknown> | undefined;
    if (!rec || rec.gradedId !== gradedId) return null;
    const info = (rec.cardInfo ?? {}) as Record<string, unknown>;
    return {
      gradedId, setName: String(rec.setName ?? ""), cardNumber: String(rec.cardNumber ?? info.number ?? ""),
      language: String(info.language ?? ""), finalGrade: typeof rec.finalGrade === "number" ? rec.finalGrade : null, grade: String(rec.grade ?? ""),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown) => (typeof v === "number" ? v : null);
const text = (v: unknown) => (v == null || v === "" ? null : String(v));

/** One API record -> the fields slab identification needs. */
export function toPcgCert(d: Record<string, unknown>): PcgCert {
  const info = (d.cardInfo ?? {}) as Record<string, unknown>;
  return {
    id: String(d.gradedId), name: String(d.cardName ?? ""), set: String(d.setName ?? ""), num: text(d.cardNumber) ?? text(info.number),
    lang: text(info.language), rarity: text(info.rarity), fin: num(d.finalGrade), c: num(d.centeringGrade), co: num(d.cornersGrade),
    e: num(d.edgesGrade), s: num(d.surfaceGrade), grade: text(d.grade), done: text(d.completedOn),
  };
}

/**
 * Every cert matching one filter (`setName`, `cardName` or `gradedId`), optionally ANDed with a
 * final grade. (The API ORs setName with cardName, so they are never combined.) Throws rather than
 * return a list cut short: a missing cert could make the wrong one look certain.
 */
export async function searchCerts(param: "setName" | "cardName" | "gradedId", value: string, finalGrade?: number,
  opts: { fetcher?: (url: string) => Promise<Response>; pauseMs?: number; maxRecords?: number } = {}): Promise<PcgCert[]> {
  const fetcher = opts.fetcher ?? ((url: string) => fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) }));
  const out: PcgCert[] = [];
  let total = 0;
  for (let offset = 0; offset < (opts.maxRecords ?? 20_000); offset += 200) {
    const url = `${BASE}?${param}=${encodeURIComponent(value)}${finalGrade != null ? `&finalGrade=${finalGrade}` : ""}&limit=200&offset=${offset}`;
    type Body = { data?: Record<string, unknown>[]; totalElements?: number };
    const get = async (): Promise<Body | null> => {
      for (let a = 0; a < 4; a++) {
        try { const r = await fetcher(url); if (r.ok) return (await r.json()) as Body; } catch { /* retried */ }
        await sleep(2000 * (a + 1));
      }
      return null;
    };
    const body = await get();
    if (!body) throw new Error(`pcg ${param}=${value}: no response`);
    await sleep(opts.pauseMs ?? 300);
    const data = body.data ?? [];
    out.push(...data.map(toPcgCert));
    total = body.totalElements ?? out.length;
    if (data.length < 200 || out.length >= total) break;
  }
  if (out.length < total) throw new Error(`pcg ${param}=${value}: got ${out.length} of ${total}`);
  return out;
}
