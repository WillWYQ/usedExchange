import { describe, expect, it, vi } from "vitest";
import * as loaderModule from "@/lib/content/loader";
import type { Category, Item } from "@/lib/content/types";
import { groupEligibleItems, generateCatalogPdf } from "./generate";

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

describe("groupEligibleItems", () => {
  it("excludes sold and draft items", () => {
    const items = [
      makeItem({ itemSlug: "a", status: "available" }),
      makeItem({ itemSlug: "b", status: "sold" }),
      makeItem({ itemSlug: "c", status: "draft" }),
      makeItem({ itemSlug: "d", status: "pending" }),
      makeItem({ itemSlug: "e", status: "reserved" }),
    ];
    const groups = groupEligibleItems(items, [makeCategory()]);
    const slugs = groups.flatMap((g) => g.items.map((i) => i.itemSlug));
    expect(slugs.sort()).toEqual(["a", "d", "e"]);
  });

  it("drops categories with zero eligible items and preserves the given category order otherwise", () => {
    const items = [makeItem({ categorySlug: "books", itemSlug: "novel" })];
    const categories = [
      makeCategory({ slug: "electronics", displayName: "Electronics" }),
      makeCategory({ slug: "books", displayName: "Books" }),
    ];
    const groups = groupEligibleItems(items, categories);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.slug).toBe("books");
  });

  it("sorts items within a category newest-first, falling back to name", () => {
    const items = [
      makeItem({ itemSlug: "old", name: "Zeta", listedDate: "2026-01-01" }),
      makeItem({ itemSlug: "new", name: "Alpha", listedDate: "2026-06-01" }),
      makeItem({ itemSlug: "tie-b", name: "Bravo", listedDate: "2026-06-01" }),
    ];
    const groups = groupEligibleItems(items, [makeCategory()]);
    expect(groups[0]?.items.map((i) => i.itemSlug)).toEqual(["new", "tie-b", "old"]);
  });
});

describe("generateCatalogPdf", () => {
  it("returns an error when there are no eligible items", async () => {
    // Spies are captured and explicitly restored in `finally` (no global mock
    // reset is configured) so they cannot leak into a later test in this file.
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([makeItem({ status: "sold" })]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);

    try {
      const result = await generateCatalogPdf();
      expect(result).toEqual({ error: "No public-visible items to export." });
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

      const result = await generateCatalogPdf();
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
