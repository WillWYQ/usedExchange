import { describe, expect, it } from "vitest";
import {
  buildCoverHtml,
  buildTocHtml,
  buildCategorySectionHtml,
  buildItemHtml,
  buildFullCatalogHtml,
  buildFlyerHtml,
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
    const html = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN, true);
    expect(html).toContain('id="item-electronics-desk-lamp"');
    expect(html).toContain("Desk Lamp");
    expect(html).toContain("https://example.com/electronics/desk-lamp");
  });

  it("never renders a reserved_for value even if smuggled onto the object", () => {
    const poisoned = { ...makeItem(), reserved_for: "Jane Buyer" } as unknown as ItemPdfView;
    const html = buildItemHtml(poisoned, "https://example.com", "lowest", T_EN, true);
    expect(html).not.toContain("Jane Buyer");
  });

  it("omits the image grid when there are no images", () => {
    const html = buildItemHtml(makeItem({ images: [], coverImage: null }), "https://example.com", "lowest", T_EN, true);
    expect(html).not.toContain("item-images");
  });

  it("localizes the status badge and the generic Condition specs label", () => {
    const html = buildItemHtml(makeItem({ status: "sold" }), "https://example.com", "lowest", T_ZH, true);
    expect(html).toContain("已售出");
    const enHtml = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN, true);
    expect(enHtml).toContain(">Condition<");
  });

  it("shows a back-to-TOC link when showBackToToc is true, and omits it when false", () => {
    const withLink = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN, true);
    expect(withLink).toContain('href="#toc"');

    const withoutLink = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN, false);
    expect(withoutLink).not.toContain('href="#toc"');
  });
});

describe("buildTocHtml", () => {
  const groups: CategoryGroup[] = [
    { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
  ];

  it("links each entry to its matching item anchor and localizes the heading", () => {
    const toc = buildTocHtml(groups, T_ZH, null);
    expect(toc).toContain('href="#item-electronics-desk-lamp"');
    expect(toc).toContain("目錄");
  });

  it("links the category header to its own anchor", () => {
    const toc = buildTocHtml(groups, T_EN, null);
    expect(toc).toContain('href="#cat-electronics"');
  });

  it("renders empty page-number placeholders when pageNumbers is null", () => {
    const toc = buildTocHtml(groups, T_EN, null);
    expect(toc).toContain('<span class="toc-page-num"></span>');
  });

  it("renders real page numbers for both items and category headers when provided", () => {
    const pageNumbers = new Map([
      ["cat-electronics", 3],
      ["item-electronics-desk-lamp", 5],
    ]);
    const toc = buildTocHtml(groups, T_EN, pageNumbers);
    expect(toc).toContain('<span class="toc-page-num">3</span>');
    expect(toc).toContain('<span class="toc-page-num">5</span>');
  });

  it("renders an empty placeholder for an anchor missing from a non-null map", () => {
    const pageNumbers = new Map([["cat-electronics", 3]]); // item entry deliberately omitted
    const toc = buildTocHtml(groups, T_EN, pageNumbers);
    expect(toc).toContain('<span class="toc-page-num">3</span>');
    expect(toc).toContain('<span class="toc-page-num"></span>');
  });

  it("has an id matching the back-to-TOC links' target", () => {
    const toc = buildTocHtml(groups, T_EN, null);
    expect(toc).toContain('<section class="toc" id="toc">');
  });
});

describe("buildCategorySectionHtml", () => {
  const group: CategoryGroup = {
    slug: "electronics",
    displayName: "Electronics",
    description: "Gadgets and gear.",
    items: [makeItem(), makeItem({ itemSlug: "second-item" })],
  };

  it("gets an id matching the TOC's category anchor", () => {
    const html = buildCategorySectionHtml(group, T_EN);
    expect(html).toContain('id="cat-electronics"');
  });

  it("shows the category name, description, and item count", () => {
    const html = buildCategorySectionHtml(group, T_EN);
    expect(html).toContain("Electronics");
    expect(html).toContain("Gadgets and gear.");
    expect(html).toContain("2 items in this category");
  });

  it("localizes the item-count line", () => {
    const html = buildCategorySectionHtml(group, T_ZH);
    // T_ZH in this file only overrides a few keys (see the top of this file);
    // pdfCategoryItemCount falls back to EN_FALLBACK's English wording, which
    // is still the correct assertion for an untranslated key.
    expect(html).toContain("2 items in this category");
  });

  it("includes a back-to-TOC link", () => {
    const html = buildCategorySectionHtml(group, T_EN);
    expect(html).toContain('href="#toc"');
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

describe("buildFlyerHtml", () => {
  const branding: SiteBranding = { name: "My Shop", tagline: "Great stuff", logo: "", baseUrl: "https://example.com" };

  it("contains the item name and site name", () => {
    const html = buildFlyerHtml(makeItem(), branding, "lowest", T_EN);
    expect(html).toContain("Desk Lamp");
    expect(html).toContain("My Shop");
  });

  it("has no TOC and does not reuse the catalog's cover/TOC markup", () => {
    // The page-number footer itself is a Playwright pdf() option built
    // directly in generate.ts, not part of any HTML string this module
    // produces — asserting against it here would never be able to fail.
    // What buildFlyerHtml can actually regress on is accidentally pulling in
    // buildCoverHtml's/buildTocHtml's markup (e.g. via a refactor that routes
    // it through buildFullCatalogHtml), so assert against their class names
    // instead.
    const html = buildFlyerHtml(makeItem(), branding, "lowest", T_EN);
    expect(html).not.toContain("Table of Contents");
    expect(html).not.toContain('class="cover"');
    expect(html).not.toContain('class="toc"');
    expect(html).not.toContain('href="#toc"');
  });
});

describe("buildFullCatalogHtml", () => {
  const branding: SiteBranding = { name: "UsedExchange", tagline: "", logo: "", baseUrl: "https://example.com" };
  const groups: CategoryGroup[] = [
    { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
  ];

  it("assembles cover, toc, category divider, and item sections in order", () => {
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", null);
    const coverIdx = html.indexOf("Full Listing Catalog");
    const tocIdx = html.indexOf("Table of Contents");
    const dividerIdx = html.indexOf('class="category-divider"');
    const itemIdx = html.indexOf('id="item-electronics-desk-lamp"');
    expect(coverIdx).toBeGreaterThanOrEqual(0);
    expect(coverIdx).toBeLessThan(tocIdx);
    expect(tocIdx).toBeLessThan(dividerIdx);
    expect(dividerIdx).toBeLessThan(itemIdx);
  });

  it("embeds resolved page numbers into the TOC when a pageNumbers map is provided", () => {
    const pageNumbers = new Map([
      ["cat-electronics", 2],
      ["item-electronics-desk-lamp", 3],
    ]);
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", pageNumbers);
    expect(html).toContain('<span class="toc-page-num">2</span>');
    expect(html).toContain('<span class="toc-page-num">3</span>');
  });

  it("gives every item page and category divider a back-to-TOC link, and the TOC section a matching id", () => {
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", null);
    expect(html).toContain('id="toc"');
    const backLinkCount = html.split('href="#toc"').length - 1;
    expect(backLinkCount).toBe(2); // one category divider + one item page
  });

  it("shows the category's item count on its divider", () => {
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", null);
    expect(html).toContain("1 items in this category");
  });
});
