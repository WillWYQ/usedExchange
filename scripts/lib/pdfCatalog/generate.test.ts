import { describe, expect, it, vi } from "vitest";
import * as loaderModule from "@/lib/content/loader";
import type { Category, Item } from "@/lib/content/types";
import { groupEligibleItems, generateCatalogPdf, type PdfExportOptions } from "./generate";

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

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    slug: "electronics",
    displayName: "Electronics",
    description: "Gadgets and gear.",
    icon: "",
    sortOrder: 0,
    availableItemCount: 0,
    coverImage: null,
    ...overrides,
  };
}

const ALL_STATUSES: Item["status"][] = ["available", "pending", "reserved", "sold", "draft"];

describe("groupEligibleItems", () => {
  it("filters to only the requested statuses", () => {
    const items = [
      makeItem({ itemSlug: "a", status: "available" }),
      makeItem({ itemSlug: "b", status: "sold" }),
      makeItem({ itemSlug: "c", status: "draft" }),
      makeItem({ itemSlug: "d", status: "pending" }),
      makeItem({ itemSlug: "e", status: "reserved" }),
    ];
    const groups = groupEligibleItems(items, [makeCategory()], ["available", "pending", "reserved"], ["electronics"], "en");
    const slugs = groups.flatMap((g) => g.items.map((i) => i.itemSlug));
    expect(slugs.sort()).toEqual(["a", "d", "e"]);
  });

  it("includes sold and draft items when those statuses are requested", () => {
    const items = [makeItem({ itemSlug: "a", status: "sold" }), makeItem({ itemSlug: "b", status: "draft" })];
    const groups = groupEligibleItems(items, [makeCategory()], ["sold", "draft"], ["electronics"], "en");
    const slugs = groups.flatMap((g) => g.items.map((i) => i.itemSlug));
    expect(slugs.sort()).toEqual(["a", "b"]);
  });

  it("filters to only the requested categories", () => {
    const items = [
      makeItem({ categorySlug: "books", itemSlug: "novel" }),
      makeItem({ categorySlug: "toys", itemSlug: "yo-yo" }),
    ];
    const categories = [makeCategory({ slug: "books" }), makeCategory({ slug: "toys" })];
    const groups = groupEligibleItems(items, categories, ALL_STATUSES, ["toys"], "en");
    expect(groups.map((g) => g.slug)).toEqual(["toys"]);
  });

  it("drops categories with zero eligible items and preserves the given category order otherwise", () => {
    const items = [
      makeItem({ categorySlug: "books", itemSlug: "novel" }),
      makeItem({ categorySlug: "toys", itemSlug: "yo-yo" }),
    ];
    const categories = [
      makeCategory({ slug: "electronics", displayName: "Electronics" }),
      makeCategory({ slug: "toys", displayName: "Toys" }),
      makeCategory({ slug: "books", displayName: "Books" }),
    ];
    const groups = groupEligibleItems(items, categories, ALL_STATUSES, ["electronics", "toys", "books"], "en");
    expect(groups.map((g) => g.slug)).toEqual(["toys", "books"]);
  });

  it("sorts items within a category newest-first, falling back to name", () => {
    const items = [
      makeItem({ itemSlug: "old", name: "Zeta", listedDate: "2026-01-01" }),
      makeItem({ itemSlug: "new", name: "Alpha", listedDate: "2026-06-01" }),
      makeItem({ itemSlug: "tie-b", name: "Bravo", listedDate: "2026-06-01" }),
    ];
    const groups = groupEligibleItems(items, [makeCategory()], ALL_STATUSES, ["electronics"], "en");
    expect(groups[0]?.items.map((i) => i.itemSlug)).toEqual(["new", "tie-b", "old"]);
  });

  it("resolves item name/description through the requested locale", () => {
    const items = [makeItem({ name: "Lamp", description: "English desc", nameZh: "灯", descriptionZh: "中文描述" })];
    const zhGroups = groupEligibleItems(items, [makeCategory()], ALL_STATUSES, ["electronics"], "zh");
    expect(zhGroups[0]?.items[0]?.name).toBe("灯");
    expect(zhGroups[0]?.items[0]?.description).toBe("中文描述");

    const enGroups = groupEligibleItems(items, [makeCategory()], ALL_STATUSES, ["electronics"], "en");
    expect(enGroups[0]?.items[0]?.name).toBe("Lamp");
  });
});

function baseOptions(overrides: Partial<PdfExportOptions> = {}): PdfExportOptions {
  return {
    locale: "en",
    priceStrategy: "lowest",
    categories: ["electronics"],
    statuses: ["available", "pending", "reserved"],
    ...overrides,
  };
}

describe("generateCatalogPdf", () => {
  it("returns an error when there are no eligible items", async () => {
    // Spies are captured and explicitly restored in `finally` (no global mock
    // reset is configured) so they cannot leak into a later test in this file.
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([makeItem({ status: "sold" })]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);

    try {
      const result = await generateCatalogPdf(baseOptions());
      expect(result).toEqual({ error: "No items match the selected filters." });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });

  it("returns an error when the requested categories/statuses match nothing, even with eligible items elsewhere", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([makeItem({ status: "available" })]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);

    try {
      const result = await generateCatalogPdf(baseOptions({ statuses: [] }));
      expect(result).toEqual({ error: "No items match the selected filters." });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });

  it("renders a real PDF file for fixture items", async () => {
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([makeItem()]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);

    try {
      let chromiumAvailable = true;
      const { chromium } = await import("playwright");
      try {
        const browser = await chromium.launch();
        await browser.close();
      } catch {
        chromiumAvailable = false;
      }
      if (!chromiumAvailable) {
        console.warn("Skipping: Chromium not installed. Run `npx playwright install chromium`.");
        return;
      }

      const result = await generateCatalogPdf(baseOptions());
      expect("file" in result).toBe(true);
      if ("file" in result) {
        const fs = await import("fs/promises");
        const bytes = await fs.readFile(result.file);
        expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
        await fs.unlink(result.file);
      }
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });
});
