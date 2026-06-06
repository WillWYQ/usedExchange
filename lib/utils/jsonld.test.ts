import { describe, it, expect } from "vitest";
import { buildProductJsonLd, buildBreadcrumbJsonLd } from "./jsonld";
import type { Item } from "@/lib/content/types";

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** Minimal valid Item for JSON-LD tests.  Cast through unknown so tests can
 *  omit irrelevant fields without satisfying the full Item interface. */
function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    categorySlug: "electronics",
    itemSlug: "iphone-14-pro",
    name: "iPhone 14 Pro",
    description: "Great condition, minimal use.",
    metaDescription: "Great condition, minimal use.",
    condition: "like-new",
    status: "available",
    price: {
      currency: "USD",
      tiers: [{ label: "Pickup", amount: 800 }],
      negotiable: false,
    },
    noLowball: false,
    priceReduced: false,
    previousLowestPrice: null,
    minAcceptableOffer: null,
    brand: "Apple",
    model: "iPhone 14 Pro",
    ageYears: 1,
    dimensions: null,
    weight: null,
    color: "Space Black",
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
    tags: ["phone", "apple"],
    categoryOverride: "",
    isbn: "",
    course: "",
    edition: "",
    semesterListed: "",
    nameZh: "",
    descriptionZh: "",
    images: ["https://cdn.example.com/iphone.jpg"],
    coverImage: "https://cdn.example.com/iphone.jpg",
    ...overrides,
  } as Item;
}

// ── buildProductJsonLd ────────────────────────────────────────────────────────

describe("buildProductJsonLd", () => {
  it("sets @context and @type correctly", () => {
    const ld = buildProductJsonLd(makeItem(), "https://example.com");
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Product");
  });

  it("constructs the canonical product URL", () => {
    const ld = buildProductJsonLd(makeItem(), "https://example.com");
    expect(ld["url"]).toBe("https://example.com/electronics/iphone-14-pro");
  });

  it("includes name and description", () => {
    const ld = buildProductJsonLd(makeItem(), "https://example.com");
    expect(ld["name"]).toBe("iPhone 14 Pro");
    expect(ld["description"]).toBe("Great condition, minimal use.");
  });

  it("falls back to description when metaDescription is empty", () => {
    const item = makeItem({ metaDescription: "", description: "Fallback text" });
    const ld = buildProductJsonLd(item, "https://example.com");
    expect(ld["description"]).toBe("Fallback text");
  });

  it("includes images array", () => {
    const ld = buildProductJsonLd(makeItem(), "https://example.com");
    expect(ld["image"]).toEqual(["https://cdn.example.com/iphone.jpg"]);
  });

  // ── brand ────────────────────────────────────────────────────────────────────

  it("includes brand object when brand is non-empty", () => {
    const ld = buildProductJsonLd(makeItem(), "https://example.com");
    const brand = ld["brand"] as Record<string, unknown>;
    expect(brand["@type"]).toBe("Brand");
    expect(brand["name"]).toBe("Apple");
  });

  it("omits brand entirely when brand is empty string", () => {
    const ld = buildProductJsonLd(makeItem({ brand: "" }), "https://example.com");
    expect(ld["brand"]).toBeUndefined();
  });

  // ── offers.price ─────────────────────────────────────────────────────────────

  it("uses the first tier amount as price in offers", () => {
    const ld = buildProductJsonLd(makeItem(), "https://example.com");
    const offers = ld["offers"] as Record<string, unknown>;
    expect(offers["price"]).toBe(800);
    expect(offers["priceCurrency"]).toBe("USD");
  });

  it("omits price from offers when tiers array is empty", () => {
    const item = makeItem({ price: { currency: "USD", tiers: [], negotiable: false } });
    const ld = buildProductJsonLd(item, "https://example.com");
    const offers = ld["offers"] as Record<string, unknown>;
    expect(offers["price"]).toBeUndefined();
  });

  // ── offers.availability ──────────────────────────────────────────────────────

  it.each([
    ["available", "https://schema.org/InStock"],
    ["pending", "https://schema.org/LimitedAvailability"],
    ["reserved", "https://schema.org/LimitedAvailability"],
    ["sold", "https://schema.org/SoldOut"],
    ["draft", "https://schema.org/OutOfStock"],
  ] as const)("maps status '%s' to %s", (status, expected) => {
    const ld = buildProductJsonLd(makeItem({ status }), "https://example.com");
    const offers = ld["offers"] as Record<string, unknown>;
    expect(offers["availability"]).toBe(expected);
  });

  it("falls back to OutOfStock for an unknown status", () => {
    // Cast: simulate a future status value not yet in the type
    const item = makeItem({ status: "unknown" as Item["status"] });
    const ld = buildProductJsonLd(item, "https://example.com");
    const offers = ld["offers"] as Record<string, unknown>;
    expect(offers["availability"]).toBe("https://schema.org/OutOfStock");
  });

  // ── offers.itemCondition ─────────────────────────────────────────────────────

  it.each([
    ["new", "https://schema.org/NewCondition"],
    ["like-new", "https://schema.org/LikeNewCondition"],
    ["good", "https://schema.org/UsedCondition"],
    ["fair", "https://schema.org/UsedCondition"],
    ["for-parts", "https://schema.org/DamagedCondition"],
  ] as const)("maps condition '%s' to %s", (condition, expected) => {
    const ld = buildProductJsonLd(makeItem({ condition }), "https://example.com");
    const offers = ld["offers"] as Record<string, unknown>;
    expect(offers["itemCondition"]).toBe(expected);
  });

  it("falls back to UsedCondition for an unknown condition", () => {
    const item = makeItem({ condition: "unknown" as Item["condition"] });
    const ld = buildProductJsonLd(item, "https://example.com");
    const offers = ld["offers"] as Record<string, unknown>;
    expect(offers["itemCondition"]).toBe("https://schema.org/UsedCondition");
  });
});

// ── buildBreadcrumbJsonLd ─────────────────────────────────────────────────────

describe("buildBreadcrumbJsonLd", () => {
  it("outputs correct @context and @type", () => {
    const ld = buildBreadcrumbJsonLd(
      [{ name: "Home", href: "/" }],
      "https://example.com",
    );
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("BreadcrumbList");
  });

  it("produces one ListItem per crumb with correct 1-based position", () => {
    const crumbs = [
      { name: "Home", href: "/" },
      { name: "Electronics", href: "/electronics" },
      { name: "iPhone 14 Pro", href: "/electronics/iphone-14-pro" },
    ];
    const ld = buildBreadcrumbJsonLd(crumbs, "https://example.com");
    const items = ld["itemListElement"] as Record<string, unknown>[];

    expect(items).toHaveLength(3);
    expect(items[0]?.["position"]).toBe(1);
    expect(items[1]?.["position"]).toBe(2);
    expect(items[2]?.["position"]).toBe(3);
  });

  it("concatenates baseUrl + href for each item URL", () => {
    const crumbs = [
      { name: "Home", href: "/" },
      { name: "Electronics", href: "/electronics" },
    ];
    const ld = buildBreadcrumbJsonLd(crumbs, "https://example.com");
    const items = ld["itemListElement"] as Record<string, unknown>[];

    expect(items[0]?.["item"]).toBe("https://example.com/");
    expect(items[1]?.["item"]).toBe("https://example.com/electronics");
  });

  it("returns an empty itemListElement for an empty crumbs array", () => {
    const ld = buildBreadcrumbJsonLd([], "https://example.com");
    expect(ld["itemListElement"]).toEqual([]);
  });

  it("preserves crumb names in the output", () => {
    const crumbs = [{ name: "Used Exchange", href: "/" }];
    const ld = buildBreadcrumbJsonLd(crumbs, "https://example.com");
    const items = ld["itemListElement"] as Record<string, unknown>[];
    expect(items[0]?.["name"]).toBe("Used Exchange");
  });
});
