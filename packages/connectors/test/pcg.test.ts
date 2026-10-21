import { describe, it, expect, vi } from "vitest";
import { lookupCert, searchCerts } from "../src/pcg";

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

describe("searchCerts", () => {
  const rec = (i: number) => ({ gradedId: String(i).padStart(9, "0"), cardName: "Lycanroc", setName: "MEGA: 30th Celebration", cardNumber: "138/128", finalGrade: 10, centeringGrade: 9.5, cornersGrade: 10, edgesGrade: 10, surfaceGrade: 9.5, grade: "Gem Mint", completedOn: "2026-10-09T14:37:06.000Z", cardInfo: { language: "English", rarity: "Illustration Rare" } });
  const page = (from: number, n: number, total: number) => new Response(JSON.stringify({ totalElements: total, data: Array.from({ length: n }, (_, k) => rec(from + k)) }), { status: 200 });

  it("pages through every result, ANDing the final grade, and maps each cert", async () => {
    const urls: string[] = [];
    const fetcher = async (u: string) => { urls.push(u); const off = Number(new URL(u).searchParams.get("offset")); return page(off, off === 0 ? 200 : 50, 250); };
    const certs = await searchCerts("setName", "MEGA: 30th Celebration", 10, { fetcher, pauseMs: 0 });
    expect(certs).toHaveLength(250);
    expect(certs[0]).toEqual({ id: "000000000", name: "Lycanroc", set: "MEGA: 30th Celebration", num: "138/128", lang: "English", rarity: "Illustration Rare", fin: 10, c: 9.5, co: 10, e: 10, s: 9.5, grade: "Gem Mint", done: "2026-10-09T14:37:06.000Z" });
    expect(new URL(urls[0]!).searchParams.get("finalGrade")).toBe("10");
    expect(urls).toHaveLength(2);
  });

  it("throws rather than return a list cut short", async () => {
    const fetcher = async (u: string) => page(Number(new URL(u).searchParams.get("offset")), 200, 5000);
    await expect(searchCerts("cardName", "Pikachu", undefined, { fetcher, pauseMs: 0, maxRecords: 400 })).rejects.toThrow(/got 400 of 5000/);
  });
});
