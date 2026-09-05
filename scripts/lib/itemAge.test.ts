import { describe, it, expect } from "vitest";
import { daysListed } from "./itemAge";

describe("daysListed", () => {
  const now = new Date("2026-06-14T12:00:00Z");

  it("counts whole days between listedDate and now", () => {
    expect(daysListed("2026-06-01", now)).toBe(13);
  });

  it("returns 0 for today", () => {
    expect(daysListed("2026-06-14", now)).toBe(0);
  });

  it("returns 0 for an unparseable date", () => {
    expect(daysListed("not-a-date", now)).toBe(0);
  });

  it("returns 0 (not negative) for a future date", () => {
    expect(daysListed("2026-07-01", now)).toBe(0);
  });

  it("accepts an ISO timestamp prefix", () => {
    expect(daysListed("2026-06-01T00:00:00Z", now)).toBe(13);
  });
});
