import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv, parseMoney, parsePcCsv, checkImport, downloadPcCsv } from "../src/pricecharting";
import { PausedError } from "../src/http";

const text = readFileSync(new URL("./fixtures/pricecharting-sample.csv", import.meta.url), "utf8");
const [headerLine = "", row5001 = ""] = text.split("\n");

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
  const { rows, missing, malformed } = parsePcCsv(text);
  it("reads every row and reports no missing columns or malformed rows", () => {
    expect(rows).toHaveLength(7);
    expect(missing).toEqual([]);
    expect(malformed).toBe(0);
  });
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
  it("keeps only whole non-negative sales volumes; anything else is null", () => {
    const cols = headerLine.split(",");
    const vi = cols.indexOf("sales-volume");
    const withVol = (v: string) => {
      const cells = row5001.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      cells[vi] = v;
      return parsePcCsv(`${headerLine}\n${cells.join(",")}\n`).rows[0]!.salesVolume;
    };
    expect(withVol('"1,234"')).toBe(1234);
    expect(withVol("0")).toBe(0);
    expect(withVol("")).toBeNull();
    expect(withVol("12.5")).toBeNull();
    expect(withVol("-3")).toBeNull();
    expect(withVol("Infinity")).toBeNull();
    expect(withVol("abc")).toBeNull();
    expect(withVol("3000000000")).toBeNull(); // over int4
    expect(withVol("1e400")).toBeNull();
  });
  it("strips a leading byte order mark before reading the header", () => {
    const withBom = parsePcCsv("\uFEFF" + text);
    expect(withBom.missing).toEqual([]);
    expect(withBom.rows).toHaveLength(7);
  });
  it("skips a row with an extra unquoted comma and counts it as malformed", () => {
    const extra = ["5009", "Pokemon Base Set", "Foo", " bar #9", ...Array(14).fill(""), "5", "1999-01-09"].join(",");
    const r = parsePcCsv([headerLine, row5001, extra].join("\n"));
    expect(r.rows.map((x) => x.pcId)).toEqual(["5001"]);
    expect(r.malformed).toBe(1);
  });
  it("skips a short row and counts it as malformed", () => {
    const short = ["5010", "Pokemon Base Set", "Short #10", "$1.00"].join(",");
    const r = parsePcCsv([headerLine, row5001, short].join("\n"));
    expect(r.rows.map((x) => x.pcId)).toEqual(["5001"]);
    expect(r.malformed).toBe(1);
  });
  it("does not mis-map rows around an unterminated quote", () => {
    const broken = '5011,Pokemon Base Set,"Broken #11,$1.00,,,,,,,,,,,,,,1,1999-01-09';
    const r = parsePcCsv([headerLine, row5001, broken, text.split("\n")[2]].join("\n"));
    expect(r.rows.map((x) => x.pcId)).toEqual(["5001"]);
    expect(r.rows[0]!.pricesUsd).toEqual({ "10": 1240, "9.5": 150.25, "9": 110, "8": 75.5, "7": 60, "6": 40 });
    expect(r.malformed).toBe(1);
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
  it("fails when more than 1% of rows are malformed", () => {
    expect(checkImport(100, [], null, 2)).toEqual({ ok: false, reason: "malformed rows: 2" });
    expect(checkImport(100, [], null, 1)).toEqual({ ok: true });
  });
});

describe("downloadPcCsv", () => {
  const TOKEN = "sec/ret tok";
  const ENCODED = encodeURIComponent(TOKEN);
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("does not leak the token when the response is 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    const err = await downloadPcCsv(TOKEN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PausedError);
    expect((err as PausedError).status).toBe(403);
    expect((err as Error).message).toContain("[redacted]");
    expect((err as Error).message).not.toContain(TOKEN);
    expect((err as Error).message).not.toContain(ENCODED);
  });

  it("does not leak the token when the response is 500", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const p = downloadPcCsv(TOKEN).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = (await p) as Error;
    expect(err.message).toBe("PriceCharting CSV download failed: HTTP 500");
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain(ENCODED);
  });

  it("does not leak the token when fetch itself throws with the URL in the message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { throw new Error(`socket hang up ${u}`); }));
    const p = downloadPcCsv(TOKEN).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = (await p) as Error;
    expect(err.message).toContain("[redacted]");
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain(ENCODED);
  });
});
