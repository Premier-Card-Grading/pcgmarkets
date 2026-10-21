import { PausedError } from "@pcg/connectors";
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = { logo: [] as string[], card: [] as string[], uploads: [] as string[] };
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadJaImageWork: vi.fn(async () => ({
    sets: [{ id: "SV11B", code: "SV11B" }, { id: "XX", code: "XX" }],
    cards: [{ id: "SV11B-001", set_id: "SV11B", code: "SV11B", number: "1" }, { id: "SV11B-002", set_id: "SV11B", code: "SV11B", number: "2" }],
  })),
  uploadPublic: vi.fn(async (_db: unknown, bucket: string, path: string) => { calls.uploads.push(`${bucket}/${path}`); return `https://store/${bucket}/${path}`; }),
  setLogoUrl: vi.fn(async (_db: unknown, id: string) => { calls.logo.push(id); }),
  setCardImage: vi.fn(async (_db: unknown, id: string) => { calls.card.push(id); }),
}));
vi.mock("@pcg/connectors", async (orig) => ({ ...(await orig<typeof import("@pcg/connectors")>()), _resetForTests: () => {} }));

const png = new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
beforeEach(() => { calls.logo = []; calls.card = []; calls.uploads = []; });

describe("images:ja", () => {
  it("uploads logos and small WebP card images, skipping 404s and non-images", async () => {
    const { imagesJa, cardImageUrl } = await import("../src/jobs/images-ja");
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/XX.png")) return new Response("nope", { status: 404 });
      if (url.includes("SV11B_2_")) return new Response("<html>", { headers: { "content-type": "text/html" } });
      return png.clone();
    }) as unknown as typeof fetch;
    const stats = await imagesJa({ size: "SM", fetchImpl, toWebp: async (b) => b, sleep: async () => {} })({ db: {} as never, log: () => {} });
    expect(cardImageUrl("SV11B", "1", "SM")).toBe("https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV11B/SV11B_1_R_JP_SM.png");
    expect(calls.logo).toEqual(["SV11B"]);
    expect(calls.card).toEqual(["SV11B-001"]);
    expect(calls.uploads).toEqual(["set-logos/ja/SV11B.png", "card-images/ja/SV11B/SV11B-001.webp"]);
    expect(stats).toMatchObject({ items_seen: 4, items_new: 2 });
  });

  it("stops both workers when a card returns 429", async () => {
    const { imagesJa } = await import("../src/jobs/images-ja");
    const db = await import("@pcg/db");
    vi.mocked(db.loadJaImageWork).mockResolvedValueOnce({
      sets: [],
      cards: [1, 2, 3, 4, 5, 6].map((n) => ({ id: `SV11B-00${n}`, set_id: "SV11B", code: "SV11B", number: String(n) })),
    });
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("SV11B_1_")) return new Response("no", { status: 429 });
      return png.clone();
    }) as unknown as typeof fetch;
    await expect(imagesJa({ size: "SM", fetchImpl, toWebp: async (b) => b, sleep: async () => {} })({ db: {} as never, log: () => {} })).rejects.toBeInstanceOf(PausedError);
    expect(urls.length).toBeLessThanOrEqual(2);
  });

  it("skips a card whose conversion throws and keeps going", async () => {
    const { imagesJa } = await import("../src/jobs/images-ja");
    const logs: string[] = [];
    const fetchImpl = vi.fn(async () => png.clone()) as unknown as typeof fetch;
    let n = 0;
    const toWebp = async (b: Buffer) => { n += 1; if (n === 1) throw new Error("corrupt"); return b; };
    const stats = await imagesJa({ size: "LG", fetchImpl, toWebp, sleep: async () => {} })({ db: {} as never, log: (m) => logs.push(m) });
    expect(calls.logo).toEqual(["SV11B", "XX"]);
    expect(calls.card).toHaveLength(1);
    expect(logs.some((m) => m.includes("corrupt"))).toBe(true);
    expect(stats).toMatchObject({ items_seen: 4, items_new: 3 });
  });

  it("treats 403 as missing for a logo and a card and carries on", async () => {
    const { imagesJa } = await import("../src/jobs/images-ja");
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/XX.png")) return new Response("", { status: 403 });
      if (url.includes("SV11B_2_")) return new Response("", { status: 403 });
      return png.clone();
    }) as unknown as typeof fetch;
    const stats = await imagesJa({ size: "SM", fetchImpl, toWebp: async (b) => b, sleep: async () => {} })({ db: {} as never, log: () => {} });
    expect(calls.logo).toEqual(["SV11B"]);
    expect(calls.card).toEqual(["SV11B-001"]);
    expect(stats).toMatchObject({ items_seen: 4, items_new: 2 });
  });

  const manyCards = async () => {
    const db = await import("@pcg/db");
    vi.mocked(db.loadJaImageWork).mockResolvedValueOnce({
      sets: [],
      cards: Array.from({ length: 30 }, (_, i) => ({ id: `SV11B-${i + 1}`, set_id: "SV11B", code: "SV11B", number: String(i + 1) })),
    });
  };

  it("pauses after 20 consecutive 403s when the probe is also 403", async () => {
    const { imagesJa } = await import("../src/jobs/images-ja");
    await manyCards();
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(imagesJa({ size: "SM", fetchImpl, toWebp: async (b) => b, sleep: async () => {} })({ db: {} as never, log: () => {} })).rejects.toBeInstanceOf(PausedError);
  });

  it("continues after 20 consecutive 403s when the probe is 200", async () => {
    const { imagesJa } = await import("../src/jobs/images-ja");
    await manyCards();
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith("/SV11B.png") ? png.clone() : new Response("", { status: 403 }))) as unknown as typeof fetch;
    const stats = await imagesJa({ size: "SM", fetchImpl, toWebp: async (b) => b, sleep: async () => {} })({ db: {} as never, log: () => {} });
    expect(stats).toMatchObject({ items_seen: 30, items_new: 0 });
  });
});
