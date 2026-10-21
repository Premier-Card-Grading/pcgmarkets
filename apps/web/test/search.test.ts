import { describe, it, expect, vi } from "vitest";
import { searchProducts } from "../lib/search";

function db(rpcResult: unknown[], products: unknown[], points: unknown[] = []) {
  return {
    rpc: vi.fn(async () => ({ data: rpcResult, error: null })),
    from: vi.fn((t: string) => ({
      select: () => ({
        in: async () => ({ data: t === "products" ? products : points, error: null }),
        eq: () => ({ eq: () => ({ in: () => ({ in: async () => ({ data: points, error: null }) }) }) }),
      }),
    })),
  } as never;
}

describe("searchProducts", () => {
  it("number-shaped input calls search_products_by_number and hydrates per-grade medians", async () => {
    const d = db([{ id: "SV1a-073", sale_count: 4 }],
      [{ id: "SV1a-073", name_en: null, name_ja: "デカヌチャン", number_printed: "073/073", language: "ja", image_url: "https://x/SV1a-073.webp", sets: { name_en: null, name_ja: "トリプレットビート", printed_code: "SV1a" } }],
      [{ product_id: "SV1a-073", grade_value: 10, median_usd: 42, n_sales: 3 }, { product_id: "SV1a-073", grade_value: 9, median_usd: 12, n_sales: 1 }]);
    const r = await searchProducts(d, "073/073");
    expect(r).toEqual({ results: [{ id: "SV1a-073", nameEn: null, nameJa: "デカヌチャン", setName: "トリプレットビート", setCode: "SV1a", numberPrinted: "073/073", language: "ja", imageUrl: "https://x/SV1a-073.webp",
      grades: { g10: { medianUsd: 42, nSales: 3 }, g95: null, g9: { medianUsd: 12, nSales: 1 } }, saleCount: 4 }] });
    expect((d as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("search_products_by_number", { p_num: 73, p_denom: 73, p_suffix: null, lim: 30 });
  });
  it("leaves out cards without an image (hidden from the site)", async () => {
    const d = db([{ id: "PMCG1-001", sale_count: 0 }], [{ id: "PMCG1-001", name_en: "Bulbasaur", name_ja: "フシギダネ", number_printed: "001", language: "ja", image_url: null, sets: null }]);
    expect(await searchProducts(d, "001")).toEqual({ results: [] });
  });
  it("name input calls search_products_by_name", async () => {
    const d = db([], []);
    await searchProducts(d, "Charizard");
    expect((d as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("search_products_by_name", { q: "Charizard", lim: 30 });
  });
});
