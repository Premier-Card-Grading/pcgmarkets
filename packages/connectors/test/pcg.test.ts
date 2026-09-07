import { describe, it, expect, vi } from "vitest";
import { lookupCert } from "../src/pcg";

const sample = [{ gradedId: "000009973", game: "Pokémon", setName: "S&S: Darkness Ablaze", cardName: "Mew V (69/189)", cardNumber: "69/189",
  finish: "Holo", finalGrade: 9.5, grade: "Gem Mint", cardInfo: { language: "English" } }];

describe("lookupCert", () => {
  it("returns a CertRecord for a hit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })));
    expect(await lookupCert("9973")).toEqual({ gradedId: "000009973", setName: "S&S: Darkness Ablaze", cardNumber: "69/189", language: "English", finalGrade: 9.5, grade: "Gem Mint" });
    vi.unstubAllGlobals();
  });
  it("returns null on miss, error, or timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await lookupCert("000000100")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => setTimeout(() => r(new Response("[]")), 200))));
    expect(await lookupCert("000000100", { timeoutMs: 20 })).toBeNull();
    vi.unstubAllGlobals();
  });
  it("rejects non-numeric input without a network call", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await lookupCert("abc")).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
