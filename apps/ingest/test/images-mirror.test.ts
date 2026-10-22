import { describe, it, expect, vi, beforeEach } from "vitest";
import { PausedError } from "@pcg/connectors";

const set: { id: string; url: string; origin: string }[] = [];
const uploads: string[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadRemoteImageWork: vi.fn(async () => [
    { id: "sv10-229", set_id: "sv10", language: "en", image_url: "https://assets.tcgdex.net/en/sv/sv10/229/high.webp" },
    { id: "30th-c-005", set_id: "30th-c", language: "en", image_url: "https://images.scrydex.com/pokemon/me55c-5/small" },
    { id: "sv10-999", set_id: "sv10", language: "en", image_url: "https://assets.tcgdex.net/en/sv/sv10/999/high.webp" },
  ]),
  uploadPublic: vi.fn(async (_db: unknown, bucket: string, path: string) => { uploads.push(`${bucket}/${path}`); return `https://store/${bucket}/${path}`; }),
  setMirroredImage: vi.fn(async (_db: unknown, id: string, url: string, origin: string) => { set.push({ id, url, origin }); }),
}));

const img = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
beforeEach(() => { set.length = 0; uploads.length = 0; });

describe("images:mirror", () => {
  it("copies third-party images into our storage and points the cards at them, skipping missing ones", async () => {
    const { imagesMirror } = await import("../src/jobs/images-mirror");
    const fetchImpl = vi.fn(async (url: string) => (url.includes("/999/") ? new Response("nope", { status: 404 }) : img())) as unknown as typeof fetch;
    const stats = await imagesMirror({ fetchImpl, toWebp: async (b) => b, concurrency: 1 })({ db: {} as never, log: () => {} });
    expect(uploads).toEqual(["card-images/en/sv10/sv10-229.webp", "card-images/en/30th-c/30th-c-005.webp"]);
    expect(set).toEqual([
      { id: "sv10-229", url: "https://store/card-images/en/sv10/sv10-229.webp?v=sm", origin: "https://assets.tcgdex.net/en/sv/sv10/229/high.webp" },
      { id: "30th-c-005", url: "https://store/card-images/en/30th-c/30th-c-005.webp?v=sm", origin: "https://images.scrydex.com/pokemon/me55c-5/small" },
    ]);
    expect(stats).toMatchObject({ items_seen: 3, items_new: 2 });
  });

  it("stops when a host rate-limits", async () => {
    const { imagesMirror } = await import("../src/jobs/images-mirror");
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    await expect(imagesMirror({ fetchImpl, toWebp: async (b) => b, concurrency: 1 })({ db: {} as never, log: () => {} })).rejects.toBeInstanceOf(PausedError);
  });
});
