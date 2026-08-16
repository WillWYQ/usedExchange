import { describe, expect, it } from "vitest";
import {
  buildFlyerFilename,
  buildFlyerPriceLines,
  buildFlyerSpecs,
  buildLiveListingUrl,
  toFlyerItemView,
  type FlyerItemView,
} from "./flyerContent";
import type { Item } from "@/lib/content/types";

function makeFlyerItem(overrides: Partial<FlyerItemView> = {}): FlyerItemView {
  return {
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    description: "A bright desk lamp.",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
    brand: "IKEA",
    model: "",
    ageYears: 2,
    dimensions: null,
    weight: null,
    color: "black",
    images: ["https://cdn.example.com/lamp-1.jpg"],
    coverImage: "https://cdn.example.com/lamp-1.jpg",
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    description: "A bright desk lamp.",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false },
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
    listedDate: "2026-01-01",
    soldDate: null,
    preferredPayment: [],
    contactNote: "",
    stripePaymentLink: "",
    venmoPaymentRequest: "",
    pickupWindows: [],
    youtubeLink: "",
    tags: [],
    categoryOverride: "",
    metaDescription: "",
    isbn: "",
    course: "",
    edition: "",
    semesterListed: "",
    nameZh: "",
    descriptionZh: "",
    images: [],
    coverImage: null,
    ...overrides,
  };
}

describe("buildFlyerPriceLines", () => {
  it("shows the resolved amount when show_tiers is false", () => {
    const result = buildFlyerPriceLines(
      { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
      { label: "Pickup", amount: 20 },
    );
    expect(result.headline).toBe("$20");
    expect(result.tierRows).toEqual([]);
    expect(result.obo).toBe(false);
  });

  it("flags negotiable items with obo", () => {
    const result = buildFlyerPriceLines(
      { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: true, show_tiers: false },
      { label: "Pickup", amount: 20 },
    );
    expect(result.obo).toBe(true);
  });

  it("builds a tier table and flags the resolved row when show_tiers is true with multiple tiers", () => {
    const price = {
      currency: "USD",
      tiers: [
        { label: "Pickup", amount: 20, miles_max: 10 },
        { label: "Shipping", amount: 35 },
      ],
      negotiable: false,
      show_tiers: true,
    };
    const result = buildFlyerPriceLines(price, { label: "Shipping", amount: 35 });
    expect(result.tierRows).toHaveLength(2);
    expect(result.tierRows.find((r) => r.label === "Shipping")?.isDefault).toBe(true);
    expect(result.tierRows.find((r) => r.label === "Pickup")?.isDefault).toBe(false);
    expect(result.headline).toBe("$35");
  });

  it("shows Contact for price when there are no tiers", () => {
    const result = buildFlyerPriceLines({ currency: "USD", tiers: [], negotiable: false, show_tiers: false }, null);
    expect(result.headline).toBe("Contact for price");
    expect(result.tierRows).toEqual([]);
  });

  it("shows Contact for price when resolvedTier is null even with tiers present", () => {
    const result = buildFlyerPriceLines(
      { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
      null,
    );
    expect(result.headline).toBe("Contact for price");
  });
});

describe("buildFlyerSpecs", () => {
  it("omits blank fields but always includes condition", () => {
    const specs = buildFlyerSpecs(makeFlyerItem({ brand: "", model: "", color: "", ageYears: null }), "metric");
    expect(specs).toEqual([["Condition", "Good"]]);
  });

  it("includes populated fields with correct labels", () => {
    const specs = buildFlyerSpecs(
      makeFlyerItem({
        brand: "IKEA",
        model: "Forsa",
        color: "black",
        ageYears: 1,
        dimensions: { length: 10, width: 5, height: 20, unit: "cm" },
        weight: { value: 1.5, unit: "kg" },
      }),
      "metric",
    );
    expect(specs).toEqual([
      ["Brand", "IKEA"],
      ["Model", "Forsa"],
      ["Color", "black"],
      ["Age", "~1 year"],
      ["Dimensions", "10 × 5 × 20 cm"],
      ["Weight", "1.5 kg"],
      ["Condition", "Good"],
    ]);
  });

  it("pluralizes age correctly", () => {
    const specs = buildFlyerSpecs(makeFlyerItem({ ageYears: 3 }), "metric");
    expect(specs.find(([label]) => label === "Age")?.[1]).toBe("~3 years");
  });
});

describe("buildLiveListingUrl / buildFlyerFilename", () => {
  it("composes the live listing URL from baseUrl and slugs", () => {
    expect(buildLiveListingUrl("https://example.com", makeFlyerItem())).toBe(
      "https://example.com/electronics/desk-lamp",
    );
  });

  it("composes a filename from the item slug", () => {
    expect(buildFlyerFilename(makeFlyerItem())).toBe("desk-lamp-flyer.pdf");
  });
});

describe("toFlyerItemView", () => {
  it("never carries a reserved_for value even if smuggled onto the input object", () => {
    const poisoned = { ...makeItem(), reserved_for: "Jane Buyer" } as unknown as Item;
    const view = toFlyerItemView(poisoned) as unknown as Record<string, unknown>;
    expect(view["reserved_for"]).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("Jane Buyer");
  });

  it("narrows only the fields the flyer needs", () => {
    const view = toFlyerItemView(makeItem({ name: "Desk Lamp", brand: "IKEA" }));
    expect(view.name).toBe("Desk Lamp");
    expect(view.brand).toBe("IKEA");
    expect(view.categorySlug).toBe("electronics");
  });
});
