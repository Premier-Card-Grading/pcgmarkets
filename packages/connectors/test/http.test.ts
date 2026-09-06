import { describe, it, expect, vi } from "vitest";
import { politeFetch, PausedError, _resetForTests } from "../src/http";

describe("politeFetch", () => {
  it("enforces per-host interval and sets UA", async () => {
    _resetForTests();
    process.env.CONTACT_EMAIL = "ops@example.com";
    const calls: number[] = [];
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      calls.push(Date.now());
      expect((init!.headers as Record<string, string>)["User-Agent"]).toContain("ops@example.com");
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await politeFetch("https://h.test/a", { minIntervalMs: 120 });
    await politeFetch("https://h.test/b", { minIntervalMs: 120 });
    expect(calls[1]! - calls[0]!).toBeGreaterThanOrEqual(110);
    vi.unstubAllGlobals();
  });
  it("throws PausedError on 429/403", async () => {
    _resetForTests();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(politeFetch("https://h2.test/x", { minIntervalMs: 0 })).rejects.toBeInstanceOf(PausedError);
    vi.unstubAllGlobals();
  });
});
