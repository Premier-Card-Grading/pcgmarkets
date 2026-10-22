/**
 * Identifies PSA slab sales from saved SoldComps pages by reading each photo's PSA label, and stores the matched ones
 * in psa_sales (private). Readings come from an agent transcription (<id>.vision.json) when present, else from OCR
 * (<id>.ocr.json, written by tools/psa-ocr.swift); only high-confidence readings are used.
 * usage: tsx scripts/psa-backfill.ts <pagesDir> <readingsDir> <report.json> [--write]
 */
import "dotenv/config";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient, loadCatalog, upsertPsaSales, type PsaSaleRow } from "@pcg/db";
import { matchPsaLabel, parsePsaOcr, type OcrRow, type PsaReading } from "@pcg/domain";

type Item = { itemId: string; url: string; endedAt: string | null; soldPrice: number | null; soldCurrency: string | null; bestOfferAccepted: boolean | null; itemLocation: string | null };
type Vision = PsaReading & { psa: boolean; confidence: "high" | "low"; gradeWords?: string | null };

const [pagesDir, readDir, reportPath] = process.argv.slice(2);
if (!pagesDir || !readDir || !reportPath) throw new Error("usage: psa-backfill.ts <pagesDir> <readingsDir> <report.json> [--write]");
const write = process.argv.includes("--write");

const items = new Map<string, Item>();
for (const f of readdirSync(pagesDir).filter((f) => f.endsWith(".json")).sort())
  for (const i of (JSON.parse(readFileSync(join(pagesDir, f), "utf8")) as { items: Item[] }).items) if (!items.has(i.itemId)) items.set(i.itemId, i);

const db = createServiceClient();
const catalog = await loadCatalog(db);
const report: Record<string, unknown>[] = [];
const rows: PsaSaleRow[] = [];
const tally: Record<string, number> = {};
for (const it of items.values()) {
  const vPath = join(readDir, `${it.itemId}.vision.json`), oPath = join(readDir, `${it.itemId}.ocr.json`);
  let reading: (PsaReading & { gradeWords?: string | null }) | null = null, read: "ocr" | "vision" = "ocr", status: string;
  if (existsSync(vPath)) {
    const v = JSON.parse(readFileSync(vPath, "utf8")) as Vision;
    read = "vision";
    if (v.psa && v.confidence === "high") reading = v;
  } else if (existsSync(oPath)) {
    const o = parsePsaOcr(JSON.parse(readFileSync(oPath, "utf8")) as OcrRow[]);
    if (o?.confidence === "high") reading = o;
  }
  const m = reading ? matchPsaLabel(reading, catalog) : null;
  status = !reading ? "no_reading" : reading.finalGrade == null ? "no_grade" : m!.status;
  tally[status] = (tally[status] ?? 0) + 1;
  report.push({ item: it.itemId, status, read, label: reading?.labelLeft, num: reading?.labelNumber, cardNumber: reading?.cardNumber, grade: reading?.finalGrade, product: m?.productId, evidence: m?.evidence, candidates: m?.candidates });
  if (status !== "matched" || !it.endedAt) continue;
  const boa = it.bestOfferAccepted === true;
  rows.push({
    source_item_id: it.itemId, source: "soldcomps", product_id: m!.productId!, grade_value: reading!.finalGrade!, grade_words: reading!.gradeWords ?? null,
    cert: reading!.cert, price_usd: !boa && it.soldCurrency === "USD" && it.soldPrice ? it.soldPrice : null, is_best_offer: boa,
    sold_at: it.endedAt, item_location: it.itemLocation, url: it.url, read, evidence: m!.evidence!,
  });
}
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(items.size, "sales", JSON.stringify(tally));
if (write) console.log("stored", await upsertPsaSales(db, rows));
