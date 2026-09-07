import { describe, it, expect } from "vitest";
import { stripSellerFields } from "../src/strip-seller";

describe("stripSellerFields", () => {
  it("removes seller identity keys at any depth, keeps country", () => {
    const raw = {
      itemId: "1", seller: { username: "bob", feedbackScore: 10, sellerCountry: "US" },
      sellerId: "x", seller_name: "bob", contact: { email: "a@b" }, nested: { sellerUsername: "bob", ok: 1 },
    };
    expect(stripSellerFields(raw)).toEqual({ itemId: "1", seller: { sellerCountry: "US" }, nested: { ok: 1 } });
  });
  it("passes primitives and arrays through", () => {
    expect(stripSellerFields([{ seller_id: 1, a: 2 }])).toEqual([{ a: 2 }]);
    expect(stripSellerFields("x")).toBe("x");
  });
});
