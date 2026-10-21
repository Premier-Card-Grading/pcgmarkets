import { describe, it, expect } from "vitest";
import type { PcgCert } from "@pcg/domain";
import { identifySlab, type CertSearch } from "../src/jobs/slabs";

const LYCANROC = ["PCG", "Lycanroc", "MEGA: 30th Celebration | Alternate Art Illustration Rare", "9.5", "CENTERING", "10", "CORNERS", "10", "EDGES", "9.5", "SURFACE", "Gem Mint", "10", "J 30CEi)138/128"];
const cert = (o: Partial<PcgCert>): PcgCert => ({ id: "000361156", name: "Lycanroc", set: "MEGA: 30th Celebration", num: "138/128", lang: "English", rarity: "Illustration Rare", fin: 10, c: 9.5, co: 10, e: 10, s: 9.5, grade: "Gem Mint", done: "2026-10-09T00:00:00Z", ...o });
const SOLD = new Date("2026-10-20T23:59:59Z");

describe("identifySlab", () => {
  it("searches the label's set once per grade shown, and finds the cert", async () => {
    const calls: string[] = [];
    const search: CertSearch = async (p, v, g) => { calls.push(`${p}=${v}&${g}`); return p === "setName" && g === 10 ? [cert({})] : []; };
    expect(await identifySlab(LYCANROC, SOLD, search)).toMatchObject({ status: "cert", certs: [{ id: "000361156" }] });
    expect(calls.sort()).toEqual(["setName=MEGA: 30th Celebration&10", "setName=MEGA: 30th Celebration&9.5"]);
  });
  it("falls back to the card name when the OCR'd set name finds nothing", async () => {
    const search: CertSearch = async (p) => (p === "cardName" ? [cert({})] : []);
    expect((await identifySlab(LYCANROC, SOLD, search)).status).toBe("cert");
  });
  it("records a failed lookup instead of guessing", async () => {
    const search: CertSearch = async () => { throw new Error("pcg cardName=Pikachu: got 3000 of 11476"); };
    expect((await identifySlab(LYCANROC, SOLD, search)).status).toBe("pcg_lookup_failed");
  });
  it("makes no lookups for the Chinese 'PCG' slab", async () => {
    const search: CertSearch = async () => { throw new Error("should not search"); };
    expect((await identifySlab(["PPCG", "PROFESSIONAL CARD GRADING", "2024 POKEMON CHN.", "MEW", "049/132", "10875237"], SOLD, search)).status).toBe("chinese_pcg");
  });
});
