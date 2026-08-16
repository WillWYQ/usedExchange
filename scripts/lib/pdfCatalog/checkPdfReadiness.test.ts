import { describe, expect, it } from "vitest";
import { checkPdfReadiness } from "./checkPdfReadiness";
import type { StudioItem } from "../../scripts/lib/studioApi";

function makeItem(overrides: Partial<StudioItem> = {}): StudioItem {
  return {
    id: "electronics/desk-lamp",
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    status: "available",
    currency: "USD",
    lowestTierAmount: 20,
    imageCount: 1,
    coverImage: null,
    localizedNames: { en: "Desk Lamp" },
    tags: [],
    listedDate: "2026-01-01",
    description: "A nice lamp",
    ...overrides,
  };
}

describe("checkPdfReadiness", () => {
  it("returns no warnings for a complete item", () => {
    expect(checkPdfReadiness([makeItem()])).toEqual([]);
  });

  it("flags missing photos", () => {
    const warnings = checkPdfReadiness([makeItem({ imageCount: 0 })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].missing).toContain("photos");
  });

  it("flags missing description", () => {
    const warnings = checkPdfReadiness([makeItem({ description: "" })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].missing).toContain("description");
  });

  it("flags missing price", () => {
    const warnings = checkPdfReadiness([makeItem({ lowestTierAmount: null })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].missing).toContain("price");
  });

  it("combines flags for one item", () => {
    const warnings = checkPdfReadiness([
      makeItem({ imageCount: 0, description: "", lowestTierAmount: null }),
    ]);
    expect(warnings[0].missing).toEqual(["photos", "description", "price"]);
  });
});
