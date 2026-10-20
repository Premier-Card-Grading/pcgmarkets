import { PausedError } from "@pcg/connectors";
import { describe, it, expect, vi, beforeEach } from "vitest";

const requested: string[] = [];
const written: string[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadEnMissingImages: vi.fn(async () => new Map([
    ["bad", [{ id: "bad-1", number_printed: "1", number_num: 1 }]],
    ["err", [{ id: "err-1", number_printed: "1", number_num: 1 }]],
    ["ok", [{ id: "ok-1", number_printed: "1", number_num: 1 }]],
    ["after", [{ id: "after-1", number_printed: "1", number_num: 1 }]],
  ])),
  setCardImageFrom: vi.fn(async (_db: unknown, id: string) => { written.push(id); }),
}));
vi.mock("@pcg/connectors", async (orig) => ({
  ...(await orig<typeof import("@pcg/connectors")>()),
  pokemontcg: {
    ptcgSetId: (id: string) => id,
    matchImages: (ours: { id: string }[], theirs: { small: string }[]) => ours.map((o) => ({ id: o.id, url: theirs[0]!.small })),
    listCards: vi.fn(async (set: string) => {
      requested.push(set);
      if (set === "bad") throw new PausedError(429, "https://api.pokemontcg.io/v2/cards");
      if (set === "err") throw new Error("boom");
      return [{ number: "1", small: `https://images.pokemontcg.io/${set}/1.png` }];
    }),
  },
}));

beforeEach(() => { requested.length = 0; written.length = 0; });

describe("images:en", () => {
  it("rethrows PausedError and stops requesting further sets", async () => {
    const { imagesEn } = await import("../src/jobs/images-en");
    await expect(imagesEn({ db: {} as never, log: () => {} })).rejects.toBeInstanceOf(PausedError);
    expect(requested).toEqual(["bad"]);
    expect(written).toEqual([]);
  });

  it("logs and skips an ordinary error for one set, continuing with the rest", async () => {
    const { imagesEn } = await import("../src/jobs/images-en");
    const db = await import("@pcg/db");
    vi.mocked(db.loadEnMissingImages).mockResolvedValueOnce(new Map([
      ["err", [{ id: "err-1", number_printed: "1", number_num: 1 }]],
      ["ok", [{ id: "ok-1", number_printed: "1", number_num: 1 }]],
    ]));
    const logs: string[] = [];
    const stats = await imagesEn({ db: {} as never, log: (m) => logs.push(m) });
    expect(requested).toEqual(["err", "ok"]);
    expect(written).toEqual(["ok-1"]);
    expect(logs).toContain("skip err: boom");
    expect(stats).toMatchObject({ items_seen: 2, items_new: 1 });
  });
});
