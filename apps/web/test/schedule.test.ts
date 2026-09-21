import { describe, it, expect } from "vitest";
import { nextRun } from "../lib/schedule";
describe("nextRun", () => {
  const now = new Date("2026-09-21T06:20:00Z");
  it("every 6 hours at :05", () => { expect(nextRun("5 */6 * * *", now).toISOString()).toBe("2026-09-21T12:05:00.000Z"); });
  it("daily at 03:35", () => { expect(nextRun("35 3 * * *", now).toISOString()).toBe("2026-09-22T03:35:00.000Z"); });
  it("weekly on Monday 03:50 (21 Sept 2026 is a Monday)", () => { expect(nextRun("50 3 * * 1", now).toISOString()).toBe("2026-09-28T03:50:00.000Z"); });
});
