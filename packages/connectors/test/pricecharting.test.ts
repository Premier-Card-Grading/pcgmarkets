import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv, parseMoney, parsePcCsv, checkImport } from "../src/pricecharting";

const text = readFileSync(new URL("./fixtures/pricecharting-sample.csv", import.meta.url), "utf8");

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
});

describe("parseMoney", () => {
  it("parses dollars with separators, drops empty and zero", () => {
    expect(parseMoney("$1,240.00")).toBe(1240);
    expect(parseMoney("110.5")).toBe(110.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("$0.00")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe("parsePcCsv", () => {
  const { rows, missing } = parsePcCsv(text);
  it("reads every row and reports no missing columns", () => { expect(rows).toHaveLength(7); expect(missing).toEqual([]); });
  it("maps grade columns onto PCG-equivalent keys", () => {
    const b = rows.find((r) => r.pcId === "5001")!;
    expect(b).toMatchObject({ consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex #200", cardNumber: "200", salesVolume: 412 });
    expect(b.pricesUsd).toEqual({ "10": 1240, "9.5": 150.25, "9": 110, "8": 75.5, "7": 60, "6": 40 });
  });
  it("leaves out empty and zero prices and keeps quoted names", () => {
    const p = rows.find((r) => r.pcId === "5007")!;
    expect(p.productName).toBe('Pikachu "Red Cheeks" #58');
    expect(p.pricesUsd).toEqual({});
  });
  it("gives a null card number when the name has no #", () => expect(rows.find((r) => r.pcId === "5004")!.cardNumber).toBeNull());
  it("reports missing required columns", () => {
    expect(parsePcCsv("id,console-name,product-name\n1,a,b #1\n").missing).toEqual(["manual-only-price", "sales-volume"]);
  });
  it("strips a leading byte order mark before reading the header", () => {
    const withBom = parsePcCsv("\uFEFF" + text);
    expect(withBom.missing).toEqual([]);
    expect(withBom.rows).toHaveLength(7);
  });
});

describe("checkImport", () => {
  it("passes a normal import and the first ever import", () => {
    expect(checkImport(1000, [], 1100)).toEqual({ ok: true });
    expect(checkImport(10, [], null)).toEqual({ ok: true });
  });
  it("fails empty files, missing columns and a >20% drop", () => {
    expect(checkImport(0, [], null).ok).toBe(false);
    expect(checkImport(100, ["sales-volume"], 100).ok).toBe(false);
    expect(checkImport(79, [], 100).ok).toBe(false);
    expect(checkImport(80, [], 100).ok).toBe(true);
  });
});
