import { describe, expect, it } from "vitest";
import {
  buildCoverHtml,
  buildTocHtml,
  buildItemHtml,
  buildFullCatalogHtml,
  buildPriceHtml,
  type ItemPdfView,
  type CategoryGroup,
  type SiteBranding,
} from "./template";
import type { UIStrings } from "../../../lib/config/types";
import { EN_FALLBACK } from "../../../lib/i18n/translations";

const T_EN: UIStrings = EN_FALLBACK;
const T_ZH: UIStrings = {
  ...EN_FALLBACK,
  pdfTocHeading: "目錄",
  statusAvailable: "在售",
  statusSold: "已售出",
  contactForPrice: "請聯繫賣家詢問價格。",
};

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
    const html = buildPriceHtml(
      { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
      "lowest",
      T_EN,
    );
    expect(html).toContain("$20");
    expect(html).not.toContain("tier-table");
  });

  it("shows the full tier table when show_tiers is true with multiple tiers, highlighting the strategy's tier", () => {
    const html = buildPriceHtml(
      {
        currency: "USD",
        tiers: [
          { label: "Pickup", amount: 20, miles_max: 10 },
          { label: "Shipping", amount: 35 },
        ],
        negotiable: false,
        show_tiers: true,
      },
      "shipping",
      T_EN,
    );
    expect(html).toContain("tier-table");
    expect(html).toContain("Pickup");
    expect(html).toContain("Shipping");
    expect(html).toMatch(/tier-default[^]*Shipping|Shipping[^]*tier-default/);
    expect(html).not.toContain("price-highlight");
  });

  it("shows a price-highlight banner and no highlighted row for the average strategy", () => {
    const html = buildPriceHtml(
      {
        currency: "USD",
        tiers: [
          { label: "Pickup", amount: 20, miles_max: 10 },
          { label: "Shipping", amount: 40 },
        ],
        negotiable: false,
        show_tiers: true,
      },
      "average",
      T_EN,
    );
    expect(html).toContain("price-highlight");
    expect(html).toContain("$30");
    expect(html).not.toContain("tier-default");
  });

  it("shows the localized contact-for-price message when there are no tiers", () => {
    const html = buildPriceHtml({ currency: "USD", tiers: [], negotiable: false, show_tiers: false }, "lowest", T_ZH);
    expect(html).toContain("請聯繫賣家詢問價格。");
  });
});

describe("buildItemHtml", () => {
  it("includes the item name, anchor id, and live link", () => {
    const html = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN);
    expect(html).toContain('id="item-electronics-desk-lamp"');
    expect(html).toContain("Desk Lamp");
    expect(html).toContain("https://example.com/electronics/desk-lamp");
  });

  it("never renders a reserved_for value even if smuggled onto the object", () => {
    const poisoned = { ...makeItem(), reserved_for: "Jane Buyer" } as unknown as ItemPdfView;
    const html = buildItemHtml(poisoned, "https://example.com", "lowest", T_EN);
    expect(html).not.toContain("Jane Buyer");
  });

  it("omits the image grid when there are no images", () => {
    const html = buildItemHtml(makeItem({ images: [], coverImage: null }), "https://example.com", "lowest", T_EN);
    expect(html).not.toContain("item-images");
  });

  it("localizes the status badge and the generic Condition specs label", () => {
    const html = buildItemHtml(makeItem({ status: "sold" }), "https://example.com", "lowest", T_ZH);
    expect(html).toContain("已售出");
    const enHtml = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN);
    expect(enHtml).toContain(">Condition<");
  });
});

describe("buildTocHtml", () => {
  it("links each entry to its matching item anchor and localizes the heading", () => {
    const groups: CategoryGroup[] = [
      { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
    ];
    const toc = buildTocHtml(groups, T_ZH);
    expect(toc).toContain('href="#item-electronics-desk-lamp"');
    expect(toc).toContain("目錄");
  });
});

describe("buildCoverHtml", () => {
  it("shows item and category counts, the site name, and localized chrome", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "Quality stuff.", logo: "", baseUrl: "https://example.com" };
    const html = buildCoverHtml(branding, 12, 3, "2026-08-13", T_EN);
    expect(html).toContain("UsedExchange");
    expect(html).toContain("12 items across 3 categories");
    expect(html).toContain("Generated 2026-08-13");
  });
});

describe("buildFullCatalogHtml", () => {
  it("assembles cover, toc, category divider, and item sections in order", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "", logo: "", baseUrl: "https://example.com" };
    const groups: CategoryGroup[] = [
      { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
    ];
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest");
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
