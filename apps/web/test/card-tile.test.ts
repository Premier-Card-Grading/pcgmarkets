import { describe, it, expect } from "vitest";
import { priceLine } from "../components/CardTile";

describe("priceLine", () => {
  it("shows PCG 10 with the sale count", () => { expect(priceLine({ kind: "pcg", usd: 1480, nSales: 6 })).toBe("$1,480 · PCG 10 · 6 sales"); });
  it("uses the singular for one sale", () => { expect(priceLine({ kind: "pcg", usd: 64, nSales: 1 })).toBe("$64 · PCG 10 · 1 sale"); });
  it("marks estimates", () => { expect(priceLine({ kind: "estimate", usd: 120 })).toBe("~$120 est."); });
  it("says when there are no comps", () => { expect(priceLine({ kind: "none" })).toBe("No comps yet"); });
});
