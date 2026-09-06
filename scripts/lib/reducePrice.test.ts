import { describe, it, expect } from "vitest";
import { parse as parseJsonc } from "jsonc-parser";
import { findLowestTierIndex, applyReducePrice, parseReduceAmount } from "./reducePrice";
import type { PriceTier } from "@/lib/content/types";

describe("parseReduceAmount", () => {
  it("rejects an empty string rather than treating it as $0", () => {
    // Number("") === 0 — pressing Enter with no input must not silently
    // zero out the item's price.
    expect(parseReduceAmount("")).toBeNull();
  });

  it("rejects whitespace-only input the same way", () => {
    expect(parseReduceAmount("   ")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseReduceAmount("abc")).toBeNull();
  });

  it("rejects a negative amount", () => {
    expect(parseReduceAmount("-5")).toBeNull();
  });

  it("accepts a genuine, explicit zero", () => {
    // A seller giving an item away for free is a deliberate choice, distinct
    // from empty input — only the empty-string case above should be rejected.
    expect(parseReduceAmount("0")).toBe(0);
  });

  it("accepts a normal positive amount", () => {
    expect(parseReduceAmount("45")).toBe(45);
  });
});

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
