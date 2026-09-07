import { describe, it, expect, vi } from "vitest";
import { fetchRates } from "../src/fx";

describe("fetchRates", () => {
  it("maps frankfurter and adds USD identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      expect(u).toContain("/v1/2026-09-04?base=JPY&symbols=USD");
      return new Response(JSON.stringify({ amount: 1, base: "JPY", date: "2026-09-04", rates: { USD: 0.0064 } }), { status: 200 });
    }));
    const rows = await fetchRates("2026-09-04", ["JPY", "USD"]);
    expect(rows).toEqual([
      { date: "2026-09-04", base: "USD", quote: "USD", rate: 1 },
      { date: "2026-09-04", base: "JPY", quote: "USD", rate: 0.0064 },
    ]);
    vi.unstubAllGlobals();
  });
});
