export type Language = "ja" | "en";
export type Source = "thecardapi" | "yahoo_auc";
export type ListingKind = "sold" | "ended";

/** Structured fields an eBay-derived source can provide. All optional; absent = seller left it blank. */
export interface EbayMetadata {
  grader?: string;        // "Premier Card Grading (PCG)" | "PSA" | "Other" | ...
  grade?: string;         // "10" | "9.5" | "Authentic"
  certNumber?: string;
  set?: string;           // "Obsidian Flames", "SV1a Triplet Beat"
  cardNumber?: string;    // "201/165" | "201"
  language?: string;      // "Japanese" | "English"
}

export interface RawListing {
  source: Source;
  sourceItemId: string;
  url: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;               // ISO 4217
  kind: ListingKind;
  soldAt: string | null;          // ISO timestamp
  endedAt: string | null;
  isBestOffer: boolean;
  sellerCountry: string | null;
  externalItemId: string | null;  // eBay item id when source is an aggregator
  imageUrls: string[];
  metadata: EbayMetadata | Record<string, never>;
  raw: unknown;                   // full payload, seller fields already stripped
}

/** What the PCG cert API returns, reduced to what matching needs. */
export interface CertRecord {
  gradedId: string;       // 9 digits
  setName: string;
  cardNumber: string;
  language: string;       // "Japanese" | "English"
  finalGrade: number | null;
  grade: string;          // "Gem Mint" | "Pristine" | "Flawless" | "Mint" ...
}

export type TierLabel = "Flawless" | "Pristine" | "Gem Mint";
export type MatchState = "matched" | "needs_review" | "rejected";
export type MatchMethod = "ebay_metadata" | "cert" | "jp_set_code" | "jp_number_denom" | "admin";
export type ReviewReason =
  | "no_card_number" | "no_set_code" | "ambiguous_set" | "no_grade" | "no_metadata"
  | "grader_missing" | "possible_pcg_set_code" | "possible_pcgs" | "lot" | "grader_not_pcg" | "other";

export interface MatchResult {
  state: MatchState;
  productId: string | null;
  gradeValue: number | null;      // null = Authentication or unknown
  gradeLabel: TierLabel | "Authentic" | null;
  certId: string | null;
  matchMethod: MatchMethod | null;
  reviewReason: ReviewReason | null;
  extracted: Record<string, unknown>;
}
