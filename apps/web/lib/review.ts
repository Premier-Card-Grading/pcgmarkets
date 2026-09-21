import { fmtDateShort } from "./format";

const LABELS: Record<string, string> = {
  no_card_number: "No card number",
  ambiguous_set: "Ambiguous set",
  no_grade: "No grade",
  lot: "Possible lot",
  grader_missing: "Grader unclear",
  ambiguous_grader: "Grader unclear",
  no_set_code: "No set code",
  no_metadata: "No metadata",
};
export const reasonLabel = (r: string | null | undefined) => (r && LABELS[r]) || "Other";
export const reasonFilterKey = (r: string | null | undefined) => (r && LABELS[r] ? r : "other");

// Keys the matcher actually writes into `extracted` (packages/domain/src/match-ebay.ts,
// match-ebay-title.ts, match-jp.ts): grader, grade, set, setCode, cardNumber, language,
// tierHint, certRaw. `set` (eBay metadata) and `setCode` (title-parsed paths) are mutually
// exclusive depending on match path, so Set falls back from setCode to set.
export function extractedRows(x: Record<string, unknown>): { label: string; value: string | null; missing?: string }[] {
  const row = (label: string, v: unknown, missing: string) =>
    v == null || v === "" ? { label, value: null, missing } : { label, value: String(v) };
  return [
    row("Grader", x.grader, "not stated"),
    row("Grade", x.grade, "not stated"),
    row("Tier", x.tierHint, "not stated"),
    row("Set", x.setCode ?? x.set, "not stated"),
    row("Number", x.cardNumber, "none found"),
    row("Language", x.language, "not stated"),
  ];
}

const SRC: Record<string, string> = { thecardapi: "eBay", soldcomps: "eBay", yahoo_auc: "Yahoo! Auctions" };
export const sourceLine = (source: string, at: string | null, verb: "sold" | "ended") =>
  `${SRC[source] ?? source}${at ? ` · ${verb} ${fmtDateShort(at)}` : ""}`;

export interface ReviewItemData {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  priceUsd: number | null;
  url: string;
  imageUrls: string[];
  reason: string | null;
  extracted: Record<string, unknown>;
  source: string;
  at: string | null;
  kind: "sold" | "ended";
}
