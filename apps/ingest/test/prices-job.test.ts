import { describe, it, expect, vi } from "vitest";

const sent: Map<string, string>[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadSalesForPriceCheck: vi.fn(async () => [
    { id: "penny", productId: "me02.5-219", gradeValue: 9, priceUsd: 1.25 },
    { id: "ok", productId: "me02.5-219", gradeValue: 9, priceUsd: 30 },
  ]),
  sendSalesToReview: vi.fn(async (_db: unknown, flags: Map<string, string>) => { sent.push(flags); }),
  loadMatchedSales: vi.fn(async () => [{ productId: "me02.5-219", gradeValue: 9, gradeLabel: null, priceUsd: 30, soldAt: new Date() }]),
  replacePricePoints: vi.fn(async () => {}),
}));

describe("prices", () => {
  it("sends implausible sales to review before computing prices", async () => {
    const { pricesJob } = await import("../src/jobs/prices");
    const db = await import("@pcg/db");
    const stats = await pricesJob({ db: {} as never, log: () => {} });
    expect(sent).toEqual([new Map([["penny", "price_below_floor"]])]);
    expect(vi.mocked(db.sendSalesToReview).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(db.loadMatchedSales).mock.invocationCallOrder[0]!);
    expect(stats).toMatchObject({ items_updated: 1 });
  });
});
