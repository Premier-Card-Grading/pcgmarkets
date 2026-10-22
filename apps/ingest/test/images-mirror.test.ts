import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PausedError } from "@pcg/connectors";

const set: { id: string; url: string; origin: string }[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadRemoteImageWork: vi.fn(async () => [
    { id: "sv10-229", set_id: "sv10", language: "en", image_url: "https://assets.tcgdex.net/en/sv/sv10/229/high.webp" },
    { id: "30th-c-005", set_id: "30th-c", language: "en", image_url: "https://images.scrydex.com/pokemon/me55c-5/small" },
    { id: "sv10-999", set_id: "sv10", language: "en", image_url: "https://assets.tcgdex.net/en/sv/sv10/999/high.webp" },
  ]),
  setMirroredImage: vi.fn(async (_db: unknown, id: string, url: string, origin: string) => { set.push({ id, url, origin }); }),
}));

const img = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
beforeEach(() => { set.length = 0; });

describe("images:mirror", () => {
  it("copies third-party images into our files and points the cards at them, skipping missing ones", async () => {
    const { imagesMirror } = await import("../src/jobs/images-mirror");
    const dir = mkdtempSync(join(tmpdir(), "mirror-"));
    const fetchImpl = vi.fn(async (url: string) => (url.includes("/999/") ? new Response("nope", { status: 404 }) : img())) as unknown as typeof fetch;
    const stats = await imagesMirror({ publicDir: dir, fetchImpl, toWebp: async (b) => b, concurrency: 1 })({ db: {} as never, log: () => {} });
    expect(set).toEqual([
      { id: "sv10-229", url: "/card-images/en/sv10/sv10-229.webp", origin: "https://assets.tcgdex.net/en/sv/sv10/229/high.webp" },
      { id: "30th-c-005", url: "/card-images/en/30th-c/30th-c-005.webp", origin: "https://images.scrydex.com/pokemon/me55c-5/small" },
    ]);
    expect([...readFileSync(join(dir, "card-images/en/sv10/sv10-229.webp"))]).toEqual([1, 2, 3]);
    expect(existsSync(join(dir, "card-images/en/sv10/sv10-999.webp"))).toBe(false);
    expect(stats).toMatchObject({ items_seen: 3, items_new: 2 });
  });

  it("does not fetch an image whose copy is already on disk", async () => {
    const { imagesMirror } = await import("../src/jobs/images-mirror");
    const dir = mkdtempSync(join(tmpdir(), "mirror-"));
    for (const p of ["en/sv10/sv10-229.webp", "en/30th-c/30th-c-005.webp", "en/sv10/sv10-999.webp"]) { mkdirSync(join(dir, "card-images", p, ".."), { recursive: true }); writeFileSync(join(dir, "card-images", p), "x"); }
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await imagesMirror({ publicDir: dir, fetchImpl, toWebp: async (b) => b })({ db: {} as never, log: () => {} });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(set).toHaveLength(3);
  });

  it("stops when a host rate-limits", async () => {
    const { imagesMirror } = await import("../src/jobs/images-mirror");
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    await expect(imagesMirror({ publicDir: mkdtempSync(join(tmpdir(), "mirror-")), fetchImpl, toWebp: async (b) => b, concurrency: 1 })({ db: {} as never, log: () => {} })).rejects.toBeInstanceOf(PausedError);
  });
});
