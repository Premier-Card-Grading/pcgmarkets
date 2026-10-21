// packages/connectors/src/limitless/parse.ts
import * as cheerio from "cheerio";

export interface LimitlessSetSummary { code: string; nameEn: string; releaseDate: string | null; cardCount: number | null; series: string | null }
export interface LimitlessCard { number: string; nameJa: string | null; nameEn: string | null; type: string | null; rarity: string | null; imageXs: string | null }
export interface LimitlessSetPage { code: string; nameJa: string | null; nameEn: string | null; releaseDate: string | null; cards: LimitlessCard[] }
export interface ParsedSetList { nameJa: string | null; nameEn: string | null; releaseDate: string | null; rows: { number: string; name: string; type: string | null; rarity: string | null; imageXs: string | null }[] }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "16 Sep 26" (index) or "6th June 2025" (set page) -> ISO date. */
export function parseLimitlessDate(s: string): string | null {
  const m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{2}|\d{4})$/.exec(clean(s));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

export const imageUrl = (xs: string, size: "SM" | "LG") => xs.replace(/_XS\.png$/, `_${size}.png`);
export function bareJaSetName(s: string | null): string | null {
  if (s == null) return null;
  const m = /「([^」]*)」/.exec(s);
  return m ? m[1]! : s.trim();
}
export const logoUrl = (code: string) => `https://s3.limitlesstcg.com/sets/jp/${code}.png`;

export function parseSetIndex(html: string): LimitlessSetSummary[] {
  const $ = cheerio.load(html);
  const out: LimitlessSetSummary[] = [];
  let series: string | null = null;
  $("table.sets-table tr").each((_, tr) => {
    const sub = $(tr).find("th.sub-heading");
    if (sub.length) { series = clean(sub.text()) || null; return; }
    const tds = $(tr).find("td");
    if (tds.length < 2) return;
    const link = tds.eq(0).find("a").first();
    const code = clean(link.find(".code").text());
    if (!code) return;
    const nameEn = clean(link.clone().find(".code").remove().end().text());
    const count = Number.parseInt(clean(tds.eq(2).find("a").first().contents().first().text()), 10);
    out.push({ code, nameEn, releaseDate: parseLimitlessDate(tds.eq(1).text()), cardCount: Number.isFinite(count) ? count : null, series });
  });
  return out;
}

export function parseSetList(html: string): ParsedSetList {
  const $ = cheerio.load(html);
  const heading = clean($(".infobox-heading").first().text());
  const nameEn = heading.replace(/\s*\([^)]*\)\s*$/, "") || null;
  const dateText = clean($(".infobox-line").first().text()).split("•")[0] ?? "";
  const rows: ParsedSetList["rows"] = [];
  let nameJa: string | null = null;
  $("table.card-list tr[data-hover]").each((_, tr) => {
    const tds = $(tr).find("td");
    nameJa ??= $(tr).find(".card-set").attr("data-tooltip") ?? null;
    rows.push({
      number: clean(tds.eq(1).text()),
      name: clean(tds.eq(2).text()),
      type: clean(tds.eq(3).text()) || null,
      rarity: clean(tds.eq(4).text()) || null,
      imageXs: $(tr).attr("data-hover") ?? null,
    });
  });
  return { nameJa, nameEn, releaseDate: parseLimitlessDate(dateText), rows };
}

export function mergeSetPages(code: string, ja: ParsedSetList, en: ParsedSetList): LimitlessSetPage {
  // A number the EN page repeats is ambiguous: no English name rather than a guess.
  const enByNum = new Map<string, ParsedSetList["rows"][number] | null>();
  for (const r of en.rows) enByNum.set(r.number, enByNum.has(r.number) ? null : r);
  return {
    code, nameJa: ja.nameJa, nameEn: ja.nameEn ?? en.nameEn, releaseDate: ja.releaseDate ?? en.releaseDate,
    cards: ja.rows.map((r) => ({ number: r.number, nameJa: r.name || null, nameEn: enByNum.get(r.number)?.name || null, type: r.type, rarity: r.rarity, imageXs: r.imageXs })),
  };
}
