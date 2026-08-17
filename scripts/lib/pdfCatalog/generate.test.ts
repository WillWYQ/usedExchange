import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import * as loaderModule from "@/lib/content/loader";
import type { Category, Item } from "@/lib/content/types";
import {
  groupEligibleItems,
  generateCatalogPdf,
  generateFlyerPdf,
  prefetchImages,
  type PdfExportOptions,
} from "./generate";

// A minimal valid 1x1 transparent PNG — small enough to inline, but real
// enough bytes for Chromium to decode and embed as an actual image XObject
// in the rendered PDF (unlike the "imagebytes" placeholder the unit tests
// below use, which is never actually rendered by Chromium).
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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

describe("prefetchImages", () => {
  it("rewrites a single image src to a bare filename relative to tempDir", async () => {
    // Not a file:// URL: the HTML document this src lives in is itself
    // written into tempDir and loaded via page.goto() on a file:// URL (see
    // renderHtmlToPdf), so a same-directory relative filename is both
    // sufficient and — per Critical #1 of the 2026-08-15 final review —
    // required. An absolute file:// src here would only work again if
    // Chromium rendered via setContent(), which is exactly the path that
    // silently dropped every photo.
    const html = `<html><body><img src="https://example.com/photo.jpg" /></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("imagebytes"))));
    try {
      const { html: rewritten, tempDir } = await prefetchImages(html);
      expect(rewritten).not.toContain("file://");
      expect(rewritten).not.toContain("https://example.com/photo.jpg");
      expect(rewritten).toMatch(/src="usedexchange-pdf-[0-9a-f]{24}\.jpg"/);
      const fs = await import("fs/promises");
      await fs.rm(tempDir, { recursive: true, force: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the original remote src when a download fails, instead of stripping it", async () => {
    // Important #3 of the 2026-08-15 final review: a failed download must
    // fall back to the original (slower but working) remote URL, not strip
    // the src entirely — an <img> with no src at all is a silently vanished
    // photo, strictly worse than a live CDN fetch.
    const html = `<html><body><img src="https://example.com/missing.jpg" /></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    try {
      const { html: rewritten, tempDir } = await prefetchImages(html);
      expect(rewritten).toContain('src="https://example.com/missing.jpg"');
      const fs = await import("fs/promises");
      await fs.rm(tempDir, { recursive: true, force: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

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

describe("generateFlyerPdf", () => {
  it("returns an error when the item id is not found", async () => {
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([makeItem()]);
    try {
      const result = await generateFlyerPdf("electronics/no-such-item");
      expect(result).toEqual({ error: 'Item "electronics/no-such-item" not found.' });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("returns an error when the item is sold or draft", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([makeItem({ status: "sold" })]);
    try {
      const result = await generateFlyerPdf("electronics/desk-lamp");
      expect(result).toEqual({
        error: 'Item "electronics/desk-lamp" is not available, pending, or reserved.',
      });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("renders a real single-item PDF file for a fixture item", async () => {
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([makeItem()]);

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

      const result = await generateFlyerPdf("electronics/desk-lamp");
      expect("file" in result).toBe(true);
      if ("file" in result) {
        const fs = await import("fs/promises");
        const bytes = await fs.readFile(result.file);
        expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
        await fs.unlink(result.file);
      }
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });
});

// Regression test for the 2026-08-15 final review's Critical #1/#2: the
// prefetch layer that exists to make photos MORE reliable was actually
// deleting them from every catalog PDF. `%PDF` magic bytes (the only thing
// the two tests above check) survive that bug completely unaffected — a PDF
// with zero images still starts with `%PDF`. Only a real HTTP server, a real
// image, and a scan for an actual image XObject in the rendered bytes can
// catch this, which is exactly what caught it during review.
describe("generateCatalogPdf embeds prefetched images", () => {
  function startImageServer(): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(ONE_PIXEL_PNG);
      });
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          url: `http://127.0.0.1:${port}/test.png`,
          close: () => new Promise((res) => server.close(() => res())),
        });
      });
    });
  }

  it("survives into the rendered PDF as a real image XObject", async () => {
    const { url: imageUrl, close } = await startImageServer();
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([makeItem({ images: [imageUrl], coverImage: imageUrl })]);
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
        // A raw PDF byte scan for an /Image XObject is blunt but reliable —
        // this is literally the check the review used to catch the bug.
        expect(bytes.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
        await fs.unlink(result.file);
      }
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
      await close();
    }
  });
});
