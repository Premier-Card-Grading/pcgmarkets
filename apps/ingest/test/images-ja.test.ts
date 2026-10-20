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
    const stats = await imagesJa({ size: "SM", fetchImpl, toWebp: async (b) => b })({ db: {} as never, log: () => {} });
    expect(cardImageUrl("SV11B", "1", "SM")).toBe("https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV11B/SV11B_1_R_JP_SM.png");
    expect(calls.logo).toEqual(["SV11B"]);
    expect(calls.card).toEqual(["SV11B-001"]);
    expect(calls.uploads).toEqual(["set-logos/ja/SV11B.png", "card-images/ja/SV11B/SV11B-001.webp"]);
    expect(stats).toMatchObject({ items_seen: 4, items_new: 2 });
  });
});
