import { describe, it, expect } from "vitest";
import { selectAll } from "../src/paginate";

describe("selectAll", () => {
  it("keeps paging until a short page, so results are not truncated at 1000", async () => {
    const data = Array.from({ length: 2500 }, (_, i) => i);
    const calls: [number, number][] = [];
    const out = await selectAll<number>(async (from, to) => { calls.push([from, to]); return { data: data.slice(from, to + 1), error: null }; });
    expect(out).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("throws on an error", async () => {
    await expect(selectAll(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
