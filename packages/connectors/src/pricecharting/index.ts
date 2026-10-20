import { extractPcNumber, type PcGradeKey } from "@pcg/domain";
import { PausedError, politeFetch } from "../http";
import { parseCsv } from "./csv";
import { PRICECHARTING } from "./schema";

export { parseCsv } from "./csv";
export { PRICECHARTING } from "./schema";

export interface PcRow { pcId: string; consoleName: string; productName: string; cardNumber: string | null; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }

export function parseMoney(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[$,\s]/g, "");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

export function parsePcCsv(text: string): { rows: PcRow[]; missing: string[]; malformed: number } {
  const [header = [], ...body] = parseCsv(text.replace(/^\uFEFF/, ""));
  const col = new Map(header.map((h, i) => [h.trim(), i]));
  const missing = PRICECHARTING.required.filter((c) => !col.has(c));
  if (missing.length) return { rows: [], missing, malformed: 0 };
  const get = (r: string[], c: string) => { const i = col.get(c); return i == null ? undefined : r[i]; };
  const rows: PcRow[] = [];
  let malformed = 0;
  for (const r of body) {
    // A field count that differs from the header means a stray or unterminated quote; mapping by index would shift prices across grades.
    if (r.length !== header.length) { malformed++; continue; }
    const pcId = get(r, "id")?.trim(), consoleName = get(r, "console-name")?.trim(), productName = get(r, "product-name")?.trim();
    if (!pcId || !consoleName || !productName) continue;
    const pricesUsd: Partial<Record<PcGradeKey, number>> = {};
    for (const [k, c] of Object.entries(PRICECHARTING.gradeColumns) as [PcGradeKey, string][]) {
      const v = parseMoney(get(r, c));
      if (v != null) pricesUsd[k] = v;
    }
    const salesRaw = (get(r, "sales-volume") ?? "").replace(/,/g, "");
    const vol = Number(salesRaw);
    rows.push({ pcId, consoleName, productName, cardNumber: extractPcNumber(productName), salesVolume: salesRaw !== "" && Number.isFinite(vol) ? vol : null, pricesUsd });
  }
  return { rows, missing, malformed };
}

export function checkImport(rowCount: number, missing: string[], lastOkRowCount: number | null, malformed = 0): { ok: true } | { ok: false; reason: string } {
  if (missing.length) return { ok: false, reason: `missing columns: ${missing.join(", ")}` };
  if (rowCount === 0) return { ok: false, reason: "empty file" };
  if (malformed > 0.01 * (rowCount + malformed)) return { ok: false, reason: `malformed rows: ${malformed}` };
  if (lastOkRowCount != null && rowCount < PRICECHARTING.minRowRatio * lastOkRowCount) return { ok: false, reason: `row count dropped to ${rowCount} from ${lastOkRowCount}` };
  return { ok: true };
}

/** Replaces the raw and URL-encoded token so it never reaches an error message. */
function redact(s: string, token: string): string {
  let out = s;
  for (const t of [token, encodeURIComponent(token)]) if (t) out = out.split(t).join("[redacted]");
  return out;
}

export async function downloadPcCsv(token: string): Promise<string> {
  const url = process.env.PRICECHARTING_CSV_URL || PRICECHARTING.csvUrl(token);
  let res: Response;
  try {
    res = await politeFetch(url, { minIntervalMs: 0 });
  } catch (e) {
    if (e instanceof PausedError) throw new PausedError(e.status, redact(url, token));
    throw new Error(redact(e instanceof Error ? e.message : String(e), token));
  }
  if (!res.ok) throw new Error(`PriceCharting CSV download failed: HTTP ${res.status}`);
  return res.text();
}
