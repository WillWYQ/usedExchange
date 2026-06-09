import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order in the results array", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("returns [] for empty input and never invokes fn", async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], 4, async () => {
      calls++;
      return 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("never exceeds the concurrency limit of in-flight tasks", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 4, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    });

    expect(peak).toBeLessThanOrEqual(4); // the cap is honoured
    expect(peak).toBeGreaterThan(1); // …and work really did run concurrently
  });

  it("treats a non-positive limit as a single worker (no deadlock)", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 0, async (n) => n);
    expect(out).toEqual([1, 2, 3]);
  });
});
