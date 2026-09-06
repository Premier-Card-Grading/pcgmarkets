import { describe, it, expect, vi } from "vitest";
import { searchProducts } from "../lib/search";

function db(rpcResult: unknown[], products: unknown[], points: unknown[] = []) {
  return {
    rpc: vi.fn(async () => ({ data: rpcResult, error: null })),
    from: vi.fn((t: string) => ({
      select: () => ({
        in: async () => ({ data: t === "products" ? products : points, error: null }),
        eq: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: points, error: null }) }) }) }),
      }),
    })),
  } as never;
}

describe("searchProducts", () => {
  it("number-shaped input calls search_products_by_number and hydrates", async () => {
    const d = db([{ id: "SV1a-073", sale_count: 4 }], [{ id: "SV1a-073", name_en: null, name_ja: "デカヌチャン", number_printed: "073/073", language: "ja", image_url: null, sets: { name_en: null, name_ja: "トリプレットビート" } }], [{ product_id: "SV1a-073", median_usd: 42 }]);
    const r = await searchProducts(d, "080/090".replace("080/090", "073/073"));
    expect(r).toEqual({ results: [{ id: "SV1a-073", nameEn: null, nameJa: "デカヌチャン", setName: "トリプレットビート", numberPrinted: "073/073", language: "ja", imageUrl: null, pcg10Median: 42, saleCount: 4 }] });
    expect((d as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("search_products_by_number", { p_num: 73, p_denom: 73, p_suffix: null, lim: 30 });
  });
  it("name input calls search_products_by_name", async () => {
    const d = db([], []);
    await searchProducts(d, "Charizard");
    expect((d as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("search_products_by_name", { q: "Charizard", lim: 30 });
  });
});
