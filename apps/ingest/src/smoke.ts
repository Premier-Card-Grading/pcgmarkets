import "dotenv/config";
import { createServiceClient, upsertRawListings, upsertSets, upsertProducts, upsertFxRates } from "@pcg/db";
import { runJob } from "./run";
import { matchJob } from "./jobs/match";
import { pricesJob } from "./jobs/prices";
import type { RawListing } from "@pcg/domain";

if (!process.env.SUPABASE_URL?.includes("scratch") && process.env.SMOKE_CONFIRM !== "yes") { console.error("Refusing: point SUPABASE_URL at a scratch project or set SMOKE_CONFIRM=yes"); process.exit(2); }
const db = createServiceClient();
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const base = (o: Partial<RawListing> & Pick<RawListing, "source" | "sourceItemId" | "title" | "price" | "currency">): RawListing => ({
  url: `https://example.test/${o.sourceItemId}`, description: null, kind: "sold", soldAt: day(3), endedAt: day(3), isBestOffer: false, sellerCountry: null, externalItemId: null, imageUrls: [], metadata: {}, raw: {}, ...o,
});

await upsertSets(db, [{ id: "SMK1", printed_code: "SMK1", language: "ja", name_en: null, name_ja: "スモーク", release_date: "2026-01-01", card_count: 50, aliases: ["Smoke Set"] }]);
await upsertProducts(db, [{ id: "SMK1-010", set_id: "SMK1", number_printed: "010/050", number_num: 10, number_denom: 50, number_suffix: null, name_en: null, name_ja: "テスト", rarity: null, language: "ja", image_url: null }]);
await upsertFxRates(db, [{ date: day(3).slice(0, 10), base: "JPY", quote: "USD", rate: 0.0064 }, { date: day(3).slice(0, 10), base: "USD", quote: "USD", rate: 1 }]);
await upsertRawListings(db, [
  base({ source: "yahoo_auc", sourceItemId: "smk-a", title: "テスト SMK1 010/050 PCG10 鑑定品", price: 10000, currency: "JPY" }),
  base({ source: "yahoo_auc", sourceItemId: "smk-b", title: "テスト 010/050 PCG鑑定品 Gem Mint 10", price: 12500, currency: "JPY" }),
  base({ source: "yahoo_auc", sourceItemId: "smk-c", title: "テスト PCG10", price: 9000, currency: "JPY" }),
  base({ source: "yahoo_auc", sourceItemId: "smk-d", title: "テスト SMK1 010/050 PCG10", price: 5000, currency: "JPY", kind: "ended", soldAt: null }),
]);
await upsertRawListings(db, [
  base({ source: "thecardapi", sourceItemId: "smk-e", title: "Test PCG 10 Pristine", price: 80, currency: "USD", metadata: { grader: "Premier Card Grading (PCG)", grade: "10", set: "Smoke Set", cardNumber: "10", language: "Japanese" } }),
  base({ source: "thecardapi", sourceItemId: "smk-f", title: "Test PCG 10", price: 999, currency: "USD", isBestOffer: true, metadata: { grader: "Premier Card Grading (PCG)", grade: "10", set: "Smoke Set", cardNumber: "10" } }),
  base({ source: "thecardapi", sourceItemId: "smk-g", title: "Test PCG 10", price: 70, currency: "USD", metadata: { grader: "Other", grade: "10", set: "Smoke Set", cardNumber: "10" } }),
]);
await runJob("match", matchJob({ all: true }), { db });
await runJob("prices", pricesJob, { db });

const { data: pts } = await db.from("price_points").select("*").eq("product_id", "SMK1-010").eq("window", "90d");
const any = pts!.find((p) => p.grade_label === "any"), pristine = pts!.find((p) => p.grade_label === "Pristine");
const { data: review } = await db.from("listing_matches").select("raw_listing_id,review_reason,raw_listings(source_item_id)").eq("state", "needs_review");
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok:", m); };
assert(any?.n_sales === 3, `any-10 has 3 sales (a, b, e) — got ${any?.n_sales}`);              // c→review, d ended, f best-offer, g Other
assert(Math.abs(Number(any?.median_usd) - 80) < 0.01, `median is $80 (64, 80, 80) — got ${any?.median_usd}`);
assert(pristine?.n_sales === 1, `Pristine tier has 1 sale — got ${pristine?.n_sales}`);
const reasons = (review ?? []).map((r) => `${(r.raw_listings as unknown as { source_item_id: string }).source_item_id}:${r.review_reason}`).sort();
assert(JSON.stringify(reasons) === JSON.stringify(["smk-c:no_card_number", "smk-g:grader_missing"]), `review queue is exactly c and g — got ${reasons}`);
console.log("SMOKE PASSED");
