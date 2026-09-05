import { describe, it, expect } from "vitest";
import { auditItem, auditListings, formatAuditReport } from "./auditListings";
import type { Item } from "@/lib/content/types";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    categorySlug: "electronics",
    itemSlug: "item",
    name: "Item",
    description: "A great item.",
    metaDescription: "",
    condition: "good",
    status: "available",
    // miles_max set => pickup-only tier, NOT the open-ended "ships anywhere"
    // shape — otherwise this "fully-filled" fixture would itself trip the
    // shipping/weight/dimensions check below.
    price: { currency: "USD", tiers: [{ label: "Pickup", miles_max: 5, amount: 20 }], negotiable: false, show_tiers: false },
    noLowball: false,
    priceReduced: false,
    previousLowestPrice: null,
    minAcceptableOffer: null,
    brand: "",
    model: "",
    ageYears: null,
    dimensions: null,
    weight: null,
    color: "",
    quantity: 1,
    originalSource: "",
    originalLink: "",
    originalPrice: null,
    listedDate: "2026-06-01",
    soldDate: null,
    preferredPayment: [],
    contactNote: "",
    stripePaymentLink: "",
    venmoPaymentRequest: "",
    pickupWindows: [],
    youtubeLink: "",
    tags: ["tag1"],
    categoryOverride: "",
    isbn: "",
    course: "",
    edition: "",
    semesterListed: "",
    nameZh: "",
    descriptionZh: "",
    images: ["cover.jpg"],
    coverImage: "cover.jpg",
    ...overrides,
  } as Item;
}

describe("auditItem", () => {
  it("flags no issues on a fully-filled item", () => {
    expect(auditItem(makeItem())).toEqual([]);
  });

  it("flags zero photos", () => {
    expect(auditItem(makeItem({ images: [] }))).toContain("no photos");
  });

  it("flags an empty (or whitespace-only) description", () => {
    expect(auditItem(makeItem({ description: "" }))).toContain("empty description");
    expect(auditItem(makeItem({ description: "   " }))).toContain("empty description");
  });

  it("flags no tags", () => {
    expect(auditItem(makeItem({ tags: [] }))).toContain("no tags");
  });

  it("flags a shipping tier with no weight/dimensions", () => {
    const item = makeItem({
      price: { currency: "USD", tiers: [{ label: "Shipping", amount: 15 }], negotiable: false, show_tiers: false },
      weight: null,
      dimensions: null,
    });
    expect(auditItem(item)).toContain("has a shipping tier but missing weight/dimensions");
  });

  it("does not flag a shipping tier that DOES have weight and dimensions", () => {
    const item = makeItem({
      price: { currency: "USD", tiers: [{ label: "Shipping", amount: 15 }], negotiable: false, show_tiers: false },
      weight: { value: 1, unit: "kg" },
      dimensions: { length: 1, width: 1, height: 1, unit: "cm" },
    });
    expect(auditItem(item)).not.toContain("has a shipping tier but missing weight/dimensions");
  });

  it("does not flag missing weight/dimensions when every tier is pickup-only (miles_max set)", () => {
    const item = makeItem({
      price: { currency: "USD", tiers: [{ label: "Pickup", miles_max: 5, amount: 15 }], negotiable: false, show_tiers: false },
      weight: null,
      dimensions: null,
    });
    expect(auditItem(item)).not.toContain("has a shipping tier but missing weight/dimensions");
  });

  it("flags no price tiers", () => {
    expect(
      auditItem(makeItem({ price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false } })),
    ).toContain("no price tiers set");
  });
});

describe("auditListings", () => {
  it("skips sold items entirely", () => {
    const items = [makeItem({ status: "sold", images: [], description: "" })];
    expect(auditListings(items)).toEqual([]);
  });

  it("includes only items with at least one issue, sorted by slug", () => {
    const items = [
      makeItem({ categorySlug: "z", itemSlug: "clean", images: ["a.jpg"] }),
      makeItem({ categorySlug: "a", itemSlug: "messy", images: [], tags: [] }),
    ];
    const result = auditListings(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("a/messy");
    expect(result[0]?.issues).toEqual(["no photos", "no tags"]);
  });
});

describe("formatAuditReport", () => {
  it("reports a clean bill of health when there are no results", () => {
    expect(formatAuditReport([])).toContain("No issues found");
  });

  it("lists each flagged item and its issues", () => {
    const text = formatAuditReport([{ slug: "a/b", name: "Widget", issues: ["no photos", "no tags"] }]);
    expect(text).toContain("a/b");
    expect(text).toContain("Widget");
    expect(text).toContain("- no photos");
    expect(text).toContain("- no tags");
  });
});
