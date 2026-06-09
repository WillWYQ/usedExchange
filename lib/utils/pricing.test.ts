import { describe, it, expect } from "vitest";
import { resolveItemPrice } from "./pricing";
import type { Price, PriceTier } from "@/lib/content/types";

const tier = (
  label: string,
  amount: number,
  miles_min?: number,
  miles_max?: number,
): PriceTier => ({ label, amount, miles_min, miles_max });

const price = (tiers: PriceTier[]): Price => ({
  currency: "USD",
  tiers,
  negotiable: false,
  show_tiers: false,
});

describe("resolveItemPrice", () => {
  it("returns null for empty tiers", () => {
    expect(resolveItemPrice(price([]), { source: "fallback" })).toBeNull();
    expect(
      resolveItemPrice(price([]), { source: "detected", miles: 5 }),
    ).toBeNull();
  });

  describe("fallback (no location)", () => {
    it("returns the open-ended tier (miles_max absent)", () => {
      const tiers = [
        tier("Pickup", 15, undefined, 5),
        tier("Shipping", 35), // open-ended
      ];
      expect(resolveItemPrice(price(tiers), { source: "fallback" })).toEqual(
        tiers[1],
      );
    });

    it("returns first open-ended when multiple exist", () => {
      const tiers = [
        tier("A", 20), // open-ended
        tier("B", 30), // open-ended
      ];
      expect(resolveItemPrice(price(tiers), { source: "fallback" })).toEqual(
        tiers[0],
      );
    });

    it("returns highest-amount tier when no open-ended exists", () => {
      const tiers = [
        tier("Pickup", 15, undefined, 5),
        tier("Mid", 25, 5, 15),
        tier("Far", 40, 15, 30),
      ];
      expect(resolveItemPrice(price(tiers), { source: "fallback" })).toEqual(
        tiers[2],
      );
    });

    it("tie on highest amount: first in array order wins", () => {
      const tiers = [
        tier("A", 40, undefined, 10),
        tier("B", 40, 10, 20),
      ];
      expect(resolveItemPrice(price(tiers), { source: "fallback" })).toEqual(
        tiers[0],
      );
    });
  });

  describe("detected / manual distance", () => {
    const tiers = [
      tier("Pickup / ≤5 mi", 15, undefined, 5),
      tier("6–15 mi", 20, 5, 15),
      tier("16–30 mi", 25, 15, 30),
      tier("Shipping", 35, 30), // open-ended
    ];
    const p = price(tiers);

    it("exact match at lower boundary", () => {
      expect(resolveItemPrice(p, { source: "detected", miles: 0 })).toEqual(
        tiers[0],
      );
    });

    it("exact match at upper boundary", () => {
      expect(resolveItemPrice(p, { source: "detected", miles: 5 })).toEqual(
        tiers[0],
      );
    });

    it("middle of a tier", () => {
      expect(resolveItemPrice(p, { source: "detected", miles: 10 })).toEqual(
        tiers[1],
      );
    });

    it("open-ended tier matches large distance", () => {
      expect(resolveItemPrice(p, { source: "manual", miles: 100 })).toEqual(
        tiers[3],
      );
    });

    it("gap between tiers: use closest miles_max from below", () => {
      // Gap tiers: [0-5 at $10], [10-20 at $20]
      const gapTiers = [
        tier("Near", 10, undefined, 5),
        tier("Far", 20, 10, 20),
      ];
      // D=7 falls in the gap; closest miles_max from below is 5 (tier 0)
      expect(
        resolveItemPrice(price(gapTiers), { source: "detected", miles: 7 }),
      ).toEqual(gapTiers[0]);
    });

    it("D below all tier lower bounds: return first tier", () => {
      // Only tier starts at miles_min=10
      const highTiers = [tier("Far", 30, 10, 50)];
      expect(
        resolveItemPrice(price(highTiers), { source: "detected", miles: 2 }),
      ).toEqual(highTiers[0]);
    });

    it("D below all lower bounds: returns nearest tier regardless of author order (FIX L4)", () => {
      // Tiers authored out of order — the far tier is listed first.
      const outOfOrder = [
        tier("Far", 30, 20, 50),
        tier("Near", 10, 5, 15),
      ];
      // D=2 is below both lower bounds; nearest (smallest miles_min) is "Near".
      expect(
        resolveItemPrice(price(outOfOrder), { source: "detected", miles: 2 }),
      ).toEqual(outOfOrder[1]);
    });

    it("single open-ended tier covers any finite distance", () => {
      const singleTier = [tier("Flat", 20)];
      expect(
        resolveItemPrice(price(singleTier), { source: "detected", miles: 50 }),
      ).toEqual(singleTier[0]);
    });
  });
});
