import { describe, expect, it } from "vitest";
import {
  buildCoverHtml,
  buildTocHtml,
  buildCategorySectionHtml,
  buildItemHtml,
  buildFullCatalogHtml,
  buildPriceHtml,
  type ItemPdfView,
  type CategoryGroup,
  type SiteBranding,
} from "./template";

function makeItem(overrides: Partial<ItemPdfView> = {}): ItemPdfView {
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
    tags: ["lighting"],
    images: ["https://cdn.example.com/lamp-1.jpg"],
    coverImage: "https://cdn.example.com/lamp-1.jpg",
    ...overrides,
  };
}

describe("buildPriceHtml", () => {
  it("shows a single resolved amount when show_tiers is false", () => {
    const html = buildPriceHtml({
      currency: "USD",
      tiers: [{ label: "Pickup", amount: 20 }],
      negotiable: false,
      show_tiers: false,
    });
    expect(html).toContain("$20");
    expect(html).not.toContain("tier-table");
  });

  it("shows the full tier table when show_tiers is true with multiple tiers", () => {
    const html = buildPriceHtml({
      currency: "USD",
      tiers: [
        { label: "Pickup", amount: 20, miles_max: 10 },
        { label: "Shipping", amount: 35 },
      ],
      negotiable: false,
      show_tiers: true,
    });
    expect(html).toContain("tier-table");
    expect(html).toContain("Pickup");
    expect(html).toContain("Shipping");
    // Shipping has no miles_max (open-ended), so resolveItemPrice's fallback
    // path picks it over Pickup — that row gets the "tier-default" class.
    expect(html).toMatch(/tier-default[^]*Shipping|Shipping[^]*tier-default/);
  });

  it("shows Contact for price when there are no tiers", () => {
    const html = buildPriceHtml({ currency: "USD", tiers: [], negotiable: false, show_tiers: false });
    expect(html).toContain("Contact for price");
  });
});

describe("buildItemHtml", () => {
  it("includes the item name, anchor id, and live link", () => {
    const html = buildItemHtml(makeItem(), "https://example.com");
    expect(html).toContain('id="item-electronics-desk-lamp"');
    expect(html).toContain("Desk Lamp");
    expect(html).toContain("https://example.com/electronics/desk-lamp");
  });

  it("never renders a reserved_for value even if smuggled onto the object", () => {
    const poisoned = { ...makeItem(), reserved_for: "Jane Buyer" } as unknown as ItemPdfView;
    const html = buildItemHtml(poisoned, "https://example.com");
    expect(html).not.toContain("Jane Buyer");
  });

  it("omits the image grid when there are no images", () => {
    const html = buildItemHtml(makeItem({ images: [], coverImage: null }), "https://example.com");
    expect(html).not.toContain("item-images");
  });
});

describe("buildTocHtml", () => {
  it("links each entry to its matching item anchor", () => {
    const groups: CategoryGroup[] = [
      {
        slug: "electronics",
        displayName: "Electronics",
        description: "",
        items: [makeItem()],
      },
    ];
    const toc = buildTocHtml(groups);
    expect(toc).toContain('href="#item-electronics-desk-lamp"');
  });
});

describe("buildCoverHtml", () => {
  it("shows item and category counts and the site name", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "Quality stuff.", logo: "", baseUrl: "https://example.com" };
    const html = buildCoverHtml(branding, 12, 3, "2026-08-13");
    expect(html).toContain("UsedExchange");
    expect(html).toContain("12");
    expect(html).toContain("3");
    expect(html).toContain("2026-08-13");
  });
});

describe("buildFullCatalogHtml", () => {
  it("assembles cover, toc, category divider, and item sections in order", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "", logo: "", baseUrl: "https://example.com" };
    const groups: CategoryGroup[] = [
      { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
    ];
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13");
    const coverIdx = html.indexOf("Full Listing Catalog");
    const tocIdx = html.indexOf("Table of Contents");
    const dividerIdx = html.indexOf('class="category-divider"');
    const itemIdx = html.indexOf('id="item-electronics-desk-lamp"');
    expect(coverIdx).toBeGreaterThanOrEqual(0);
    expect(coverIdx).toBeLessThan(tocIdx);
    expect(tocIdx).toBeLessThan(dividerIdx);
    expect(dividerIdx).toBeLessThan(itemIdx);
  });
});
