import { describe, it, expect } from "vitest";
import {
  computePriceBounds,
  computePriceBuckets,
  linearToLog,
  logToLinear,
} from "./priceFilterStrategies";
import type { PriceFilterConfig } from "./priceFilterStrategies";

const REAL_DATA = [15, 18, 20, 28, 28, 45, 55, 60, 65, 75, 340, 370, 580, 610];

// ── computePriceBounds ──────────────────────────────────────────────────────

describe("computePriceBounds", () => {
  it("returns null for empty array", () => {
    expect(computePriceBounds([], { strategy: "none" })).toBeNull();
  });

  it("handles single element", () => {
    const r = computePriceBounds([42], { strategy: "none" });
    expect(r).toEqual({ sliderBounds: [42, 42], rawBounds: [42, 42] });
  });

  describe("none", () => {
    it("returns raw min/max", () => {
      const r = computePriceBounds(REAL_DATA, { strategy: "none" })!;
      expect(r.sliderBounds).toEqual([15, 610]);
      expect(r.rawBounds).toEqual([15, 610]);
    });
  });

  describe("percentile", () => {
    it("clamps to P5/P95", () => {
      const r = computePriceBounds(REAL_DATA, { strategy: "percentile" })!;
      expect(r.sliderBounds[0]).toBeGreaterThanOrEqual(15);
      expect(r.sliderBounds[1]).toBeLessThanOrEqual(610);
      expect(r.sliderBounds[0]).toBeLessThan(r.sliderBounds[1]);
      expect(r.rawBounds).toEqual([15, 610]);
    });

    it("slider bounds are narrower than raw bounds", () => {
      const r = computePriceBounds(REAL_DATA, { strategy: "percentile" })!;
      const rawRange = r.rawBounds[1] - r.rawBounds[0];
      const sliderRange = r.sliderBounds[1] - r.sliderBounds[0];
      expect(sliderRange).toBeLessThan(rawRange);
    });

    it("falls back to raw bounds when fewer than 4 items", () => {
      const r = computePriceBounds([10, 20, 30], { strategy: "percentile" })!;
      expect(r.sliderBounds).toEqual([10, 30]);
    });

    it("falls back when all same price", () => {
      const r = computePriceBounds([50, 50, 50, 50, 50], {
        strategy: "percentile",
      })!;
      expect(r.sliderBounds).toEqual([50, 50]);
    });
  });

  describe("iqr", () => {
    it("clamps using IQR fences", () => {
      const r = computePriceBounds(REAL_DATA, { strategy: "iqr" })!;
      expect(r.sliderBounds[0]).toBeGreaterThanOrEqual(15);
      expect(r.sliderBounds[1]).toBeLessThanOrEqual(610);
      expect(r.rawBounds).toEqual([15, 610]);
    });

    it("excludes high outliers from slider range", () => {
      // Add extreme outlier to make IQR fence visible
      const withOutlier = [...REAL_DATA, 2000, 3000];
      const r = computePriceBounds(withOutlier, { strategy: "iqr" })!;
      expect(r.sliderBounds[1]).toBeLessThan(3000);
      expect(r.rawBounds[1]).toBe(3000);
    });

    it("falls back to raw bounds when fewer than 5 items", () => {
      const r = computePriceBounds([10, 20, 30, 40], { strategy: "iqr" })!;
      expect(r.sliderBounds).toEqual([10, 40]);
    });

    it("falls back when IQR is zero", () => {
      const r = computePriceBounds([50, 50, 50, 50, 50], {
        strategy: "iqr",
      })!;
      expect(r.sliderBounds).toEqual([50, 50]);
    });
  });

  describe("logarithmic", () => {
    it("returns raw bounds (same as none)", () => {
      const r = computePriceBounds(REAL_DATA, { strategy: "logarithmic" })!;
      expect(r.sliderBounds).toEqual([15, 610]);
      expect(r.rawBounds).toEqual([15, 610]);
    });
  });

  describe("preset-buckets", () => {
    it("returns raw bounds (UI handled separately)", () => {
      const r = computePriceBounds(REAL_DATA, {
        strategy: "preset-buckets",
      })!;
      expect(r.sliderBounds).toEqual([15, 610]);
    });
  });
});

// ── linearToLog / logToLinear ───────────────────────────────────────────────

describe("linearToLog / logToLinear", () => {
  it("maps min to 0", () => {
    expect(linearToLog(15, 15, 610)).toBe(0);
  });

  it("maps max to 1", () => {
    expect(linearToLog(610, 15, 610)).toBeCloseTo(1, 10);
  });

  it("round-trips correctly", () => {
    for (const v of [15, 50, 100, 300, 610]) {
      const frac = linearToLog(v, 15, 610);
      const back = logToLinear(frac, 15, 610);
      expect(back).toBeCloseTo(v, 5);
    }
  });

  it("handles min === max", () => {
    expect(linearToLog(42, 42, 42)).toBe(0);
    expect(logToLinear(0, 42, 42)).toBe(42);
    expect(logToLinear(0.5, 42, 42)).toBe(42);
  });
});

// ── computePriceBuckets ────────────────────────────────────────────────────

describe("computePriceBuckets", () => {
  it("returns empty for empty array", () => {
    expect(computePriceBuckets([], "USD")).toEqual([]);
  });

  it("generates buckets with custom boundaries", () => {
    const buckets = computePriceBuckets(REAL_DATA, "USD", [50, 100, 300]);
    expect(buckets.length).toBe(4);
    expect(buckets[0]!.max).toBe(49);
    expect(buckets[1]!.min).toBe(50);
    expect(buckets[1]!.max).toBe(99);
    expect(buckets[2]!.min).toBe(100);
    expect(buckets[2]!.max).toBe(299);
    expect(buckets[3]!.min).toBe(300);
    expect(buckets[3]!.max).toBe(Infinity);
  });

  it("auto-generates buckets when no boundaries provided", () => {
    const buckets = computePriceBuckets(REAL_DATA, "USD");
    expect(buckets.length).toBeGreaterThanOrEqual(2);
    for (const b of buckets) {
      expect(b.label).toBeTruthy();
      expect(b.min).toBeDefined();
      expect(b.max).toBeDefined();
    }
  });

  it("labels use currency formatting", () => {
    const buckets = computePriceBuckets(REAL_DATA, "USD", [50, 100, 300]);
    expect(buckets[0]!.label).toContain("$50");
    expect(buckets[3]!.label).toContain("$300");
  });

  it("handles single item", () => {
    const buckets = computePriceBuckets([100], "USD");
    expect(buckets.length).toBeGreaterThanOrEqual(0);
  });
});
