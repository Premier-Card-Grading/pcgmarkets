/**
 * Re-checks every matched SoldComps sale against PCG and the photo, independently of the matcher:
 * every cert behind the sale names the same card, and the catalogue product has that cert's number,
 * set, language and name. usage: tsx scripts/audit-soldcomps.ts [out.json]
 */
import "dotenv/config";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createServiceClient, selectAll } from "@pcg/db";
import { PRINTED_TOTALS, normText, similarity, type EbayMetadata, type PcgCert } from "@pcg/domain";

type Row = { raw_listing_id: string; product_id: string; grade_value: number; grade_label: string | null; cert_id: string | null;
  raw_listings: { source_item_id: string; metadata: EbayMetadata };
  products: { number_printed: string; number_num: number | null; number_denom: number | null; name_en: string | null; language: string;
    sets: { id: string; name_en: string | null; card_count: number | null } } };

const db = createServiceClient();
const rows = await selectAll<Row>((f, t) => db.from("listing_matches")
  .select("raw_listing_id,product_id,grade_value,grade_label,cert_id,raw_listings!inner(source,source_item_id,metadata),products(number_printed,number_num,number_denom,name_en,language,sets(id,name_en,card_count))")
  .eq("state", "matched").eq("raw_listings.source", "soldcomps").order("raw_listing_id").range(f, t));

const parse = (n: string) => { const m = /^\D*0*(\d+)\s*\/\s*0*(\d+)\s*$/.exec(n) ?? /^\D*0*(\d+)/.exec(n); return m ? { num: +m[1]!, denom: m[2] ? +m[2] : null } : null; };
const bareName = (n: string | null) => normText((n ?? "").replace(/\s*\([^)]*\)\s*$/, "").replace(/['’]/g, "").replace(/\s*δ/g, "").replace(/-/g, " "));
const card = (c: PcgCert) => `${bareName(c.name)}|${normText(c.set)}|${c.num}|${c.lang ?? ""}`;
const out: { item: string; product: string; problems: string[]; cert: string; catalogue: string; photo: string | null }[] = [];

for (const r of rows) {
  const p = r.products, f = r.raw_listings.metadata.pcg!, c = f.certs[0]!;
  const problems: string[] = [];
  if (new Set(f.certs.map(card)).size > 1) problems.push(`certs name ${new Set(f.certs.map(card)).size} different cards`);
  // Japanese vintage cards print no number (PCG records the Pokédex number): name and set are the check.
  const vintage = /^(No\.?\s*|#)\d+$/i.test(c.num ?? "");
  // Subset numbers: "SV119/SV122" is our "SV119", "H4/H32" our "H04".
  const sub = /^([A-Za-z]{1,3})0*(\d+)\s*\//.exec(c.num ?? "");
  const cn = vintage ? null : parse(c.num ?? ""), pn = parse(p.number_printed);
  if (sub) { const m = /^([A-Za-z]{1,3})0*(\d+)$/.exec(p.number_printed); if (!m || m[1]!.toUpperCase() !== sub[1]!.toUpperCase() || m[2] !== sub[2]) problems.push("number differs"); }
  else if (vintage) { if (p.language !== "ja" || similarity(p.sets.name_en?.replace(/[().]/g, " "), c.set) < 0.5 && !/expansion pack/i.test(c.set)) problems.push("set differs (vintage)"); }
  else if (!cn || !pn || cn.num !== pn.num) problems.push("number differs");
  const printed = PRINTED_TOTALS[p.sets.id];
  const setTotal = printed === undefined ? p.sets.card_count : typeof printed === "number" ? printed : null;
  if (cn?.denom != null && cn.denom !== (pn?.denom ?? setTotal)) problems.push("set total differs");
  // Promo numbers carry no total: both sides must be that era's promo set.
  if (cn?.denom == null && sub) {
    const ours = normText(p.sets.name_en), theirs = normText(c.set.replace(/^[^:]*:\s*/, ""));
    if (similarity(ours, theirs) < 0.85 && !ours.startsWith(theirs)) problems.push("set differs (subset)");
  } else if (cn?.denom == null && !vintage) {
    const era = (s: string) => /wizards|^basep/i.test(s) ? "wotc" : /nintendo|^np /i.test(s) ? "nintendo" : /mega|^me/i.test(s) ? "mega" : /s&v|scarlet|^sv/i.test(s) ? "sv" : /sword|swsh|^s&s/i.test(s) ? "swsh" : /s&m|sun|^sm/i.test(s) ? "sm" : /^xy/i.test(s) ? "xy" : s;
    const promo = (s: string | null) => /promo/i.test(s ?? "");
    if (!promo(c.set) || !promo(p.sets.name_en) || era(c.set) !== era(`${p.sets.id} ${p.sets.name_en}`.replace(/^\S+ /, (m) => m.toLowerCase() === "mep " ? "mega " : m))) problems.push("set differs (promo)");
  }
  const lang = /japan/i.test(c.lang ?? "") ? "ja" : "en"; // PCG leaves some English promos blank
  if (lang !== p.language) problems.push("language differs");
  if (bareName(c.name) !== bareName(p.name_en)) problems.push("name differs");
  if (r.grade_value !== c.fin) problems.push("grade differs");
  // The number printed on the card in the photo, where the OCR read one.
  const ocrPath = `.cache/slabs/${r.raw_listings.source_item_id}.json`;
  const lines: string[] = existsSync(ocrPath) ? JSON.parse(readFileSync(ocrPath, "utf8")) : [];
  // A transcription by the vision step is read over the OCR's, which slips digits (053 for 153).
  const visionPath = `.cache/slabs/${r.raw_listings.source_item_id}.vision.json`;
  const visionNumber: string | null = existsSync(visionPath) ? JSON.parse(readFileSync(visionPath, "utf8")).cardNumber ?? null : null;
  const seen = visionNumber ? [visionNumber] : lines.join(" ").match(/\b\d{1,3}\s*\/\s*\d{2,3}\b/g) ?? [];
  const photo = seen.find((s) => parse(s)?.denom === cn?.denom) ?? seen[0] ?? null;
  if (photo && cn?.denom != null && parse(photo)!.denom === cn.denom && parse(photo)!.num !== cn.num) problems.push("photo shows another number");
  out.push({ item: r.raw_listings.source_item_id, product: r.product_id, problems,
    cert: `${c.name} · ${c.set} · ${c.num} · ${c.lang} · ${c.fin} ${c.grade ?? ""} (${f.certs.length} cert${f.certs.length > 1 ? "s" : ""})`,
    catalogue: `${p.name_en} · ${p.sets.name_en} [${p.sets.id}] · ${p.number_printed} · ${p.language}`, photo });
}
const bad = out.filter((o) => o.problems.length);
console.log(`matched soldcomps sales: ${out.length}; with a problem: ${bad.length}; photo number read: ${out.filter((o) => o.photo).length}`);
for (const o of bad) console.log(`- ${o.item} ${o.problems.join(", ")}\n    cert:      ${o.cert}\n    catalogue: ${o.catalogue}\n    photo:     ${o.photo}`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
