import { describe, it, expect } from "vitest";
import { parse as parseJsonc } from "jsonc-parser";
import { findLowestTierIndex, applyReducePrice } from "./reducePrice";
import type { PriceTier } from "@/lib/content/types";

describe("findLowestTierIndex", () => {
  it("returns -1 for an empty tier list", () => {
    expect(findLowestTierIndex([])).toBe(-1);
  });

  it("finds the index of the smallest amount", () => {
    const tiers: PriceTier[] = [
      { label: "Shipping", amount: 25 },
      { label: "Pickup", amount: 10 },
      { label: "Local", amount: 15 },
    ];
    expect(findLowestTierIndex(tiers)).toBe(1);
  });
});

describe("applyReducePrice", () => {
  it("updates the lowest-amount tier's amount, preserving comments", () => {
    const text = `{
  // price options: see docs
  "price": {
    "currency": "USD",
    "tiers": [
      { "label": "Shipping", "amount": 25 },
      { "label": "Pickup", "amount": 10 }
    ]
  }
}`;
    const next = applyReducePrice(text, 5);
    expect(next).not.toBeNull();
    expect(next).toContain("// price options: see docs");

    const parsed = parseJsonc(next!) as { price: { tiers: PriceTier[] } };
    expect(parsed.price.tiers[1]?.amount).toBe(5);
    expect(parsed.price.tiers[0]?.amount).toBe(25); // untouched
  });

  it("returns null when there are no price tiers", () => {
    const text = `{"price": {"currency": "USD", "tiers": []}}`;
    expect(applyReducePrice(text, 5)).toBeNull();
  });

  it("returns null when price is entirely absent", () => {
    const text = `{"name": "Widget"}`;
    expect(applyReducePrice(text, 5)).toBeNull();
  });
});
