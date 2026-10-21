import { describe, it, expect } from "vitest";
import { matchImages, ptcgSetId } from "../src/pokemontcg";

describe("pokemontcg", () => {
  it("maps set ids that differ", () => {
    expect(ptcgSetId("swsh4.5sv")).toBe("swsh45sv");
    expect(ptcgSetId("tk-ex-latia")).toBe("tk1a");
    expect(ptcgSetId("swshp")).toBe("swshp");
    expect(ptcgSetId("sm3.5")).toBe("sm35");
    expect(ptcgSetId("hgssp")).toBe("hsp");
  });
  it("matches by number, ignoring leading zeros and case", () => {
    const ours = [
      { id: "swshp-SWSH050", number_printed: "SWSH050", number_num: null },
      { id: "svp-001", number_printed: "001/SVP", number_num: 1 },
      { id: "svp-999", number_printed: "999", number_num: 999 },
    ];
    const theirs = [{ number: "SWSH050", small: "https://images.pokemontcg.io/swshp/SWSH050.png" }, { number: "1", small: "https://images.pokemontcg.io/svp/1.png" }];
    expect(matchImages(ours, theirs)).toEqual([
      { id: "swshp-SWSH050", url: "https://images.pokemontcg.io/swshp/SWSH050.png" },
      { id: "svp-001", url: "https://images.pokemontcg.io/svp/1.png" },
    ]);
  });
});

describe("pokemontcg ambiguous numbers", () => {
  it("skips a number listed twice in one set rather than picking one", () => {
    const ours = [{ id: "x-005", number_printed: "005", number_num: 5 }, { id: "x-006", number_printed: "006", number_num: 6 }];
    const theirs = [
      { number: "5", small: "https://images.pokemontcg.io/x/5a.png" },
      { number: "005", small: "https://images.pokemontcg.io/x/5b.png" },
      { number: "6", small: "https://images.pokemontcg.io/x/6.png" },
    ];
    expect(matchImages(ours, theirs)).toEqual([{ id: "x-006", url: "https://images.pokemontcg.io/x/6.png" }]);
  });
});

describe("pokemontcg listCards", () => {
  it("retries a request when the API answers with an intermittent 5xx", async () => {
    const { listCards } = await import("../src/pokemontcg");
    const calls: string[] = [];
    const ok = { data: [{ number: "1", images: { small: "https://images.pokemontcg.io/hsp/1.png" } }], totalCount: 1 };
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      return calls.length < 3 ? new Response("err", { status: 500 }) : new Response(JSON.stringify(ok), { status: 200 });
    }) as typeof fetch;
    try {
      expect(await listCards("hsp", { retryDelayMs: 1, fetcher: (u) => fetch(u) })).toEqual([{ number: "1", small: "https://images.pokemontcg.io/hsp/1.png" }]);
      expect(calls).toHaveLength(3);
    } finally { globalThis.fetch = real; }
  });
  it("gives up after the last attempt", async () => {
    const { listCards } = await import("../src/pokemontcg");
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response("err", { status: 502 })) as typeof fetch;
    try { await expect(listCards("hsp", { retryDelayMs: 1, fetcher: (u) => fetch(u) })).rejects.toThrow("pokemontcg hsp: 502"); }
    finally { globalThis.fetch = real; }
  });
});
