import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as loaderModule from "@/lib/content/loader";
import type { Category, Item } from "@/lib/content/types";
import { getTranslationsForLocale } from "@/lib/i18n/getTranslations";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Platform } from "@/lib/config/types";
import {
  buildContactPdfData,
  groupEligibleItems,
  generateCatalogPdf,
  generateFlyerPdf,
  prefetchImages,
  launchChromiumOrError,
  renderHtmlToPdfBytes,
  type PdfExportOptions,
} from "./generate";
import { buildFullCatalogHtml } from "./template";
import * as resolvePageNumbersModule from "./resolvePageNumbers";
import { resolveAnchorPageNumbers } from "./resolvePageNumbers";

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

describe("generateCatalogPdf renders real TOC page numbers", () => {
  it("resolves every item and category anchor to a real page in the final PDF", async () => {
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([
      makeItem({ itemSlug: "a", name: "Item A" }),
      makeItem({ itemSlug: "b", name: "Item B", categorySlug: "toys" }),
    ]);
    const mockLoadCategories = vi
      .spyOn(loaderModule, "loadCategories")
      .mockResolvedValue([makeCategory(), makeCategory({ slug: "toys", displayName: "Toys" })]);

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

      const result = await generateCatalogPdf(baseOptions({ categories: ["electronics", "toys"] }));
      expect("file" in result).toBe(true);
      if (!("file" in result)) return;

      const fs = await import("fs/promises");
      const bytes = await fs.readFile(result.file);
      const pageNumbers = await resolveAnchorPageNumbers(bytes, [
        "cat-electronics",
        "item-electronics-a",
        "cat-toys",
        "item-toys-b",
      ]);
      expect(pageNumbers.get("cat-electronics")).toBeGreaterThan(0);
      expect(pageNumbers.get("item-electronics-a")).toBeGreaterThan(pageNumbers.get("cat-electronics")!);
      expect(pageNumbers.get("cat-toys")).toBeGreaterThan(pageNumbers.get("item-electronics-a")!);
      expect(pageNumbers.get("item-toys-b")).toBeGreaterThan(pageNumbers.get("cat-toys")!);

      await fs.unlink(result.file);
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });
});

// Regression test for the 2026-08-16 final review's Important #1: real TOC
// page numbers are a nice-to-have layered on top of a working export, not a
// hard requirement of one — resolveAnchorPageNumbers() rejecting (malformed
// PDF, unexpected /Dests structure, etc.) must degrade to pass-1's blank
// page-number slots, not crash the whole catalog export into an opaque
// failure (design spec §3, §5.2).
describe("generateCatalogPdf degrades gracefully when page-number resolution fails", () => {
  it("still returns a real PDF file when resolveAnchorPageNumbers rejects", async () => {
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([makeItem()]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([makeCategory()]);
    const mockResolve = vi
      .spyOn(resolvePageNumbersModule, "resolveAnchorPageNumbers")
      .mockRejectedValue(new Error("simulated malformed /Dests structure"));

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
      mockResolve.mockRestore();
    }
  });
});

// Regression guard for the width-reservation technique buildTocHtml relies
// on (see the design spec, §4): pass-1 (empty TOC number slots) and pass-2
// (real numbers) must lay out to the same total page count, or the numbers
// baked into pass-2's TOC would point at the wrong pages.
//
// The fixture needs enough items that the TOC itself is close to a
// page-count boundary — a single-item catalog's TOC is one row on an
// otherwise-empty page, so pass-1 and pass-2 page counts would come out
// equal regardless of whether `.toc-page-num`'s digit-width reservation
// actually works (2026-08-16 final review, Important #2). 50 items push the
// TOC across enough of its own page(s) that reserving vs. not reserving
// digit width would plausibly shift the total page count.
describe("generateCatalogPdf pass-1/pass-2 page count parity", () => {
  it("produces the same total page count whether or not the TOC shows real numbers", async () => {
    // Short placeholder names (e.g. plain "Item 0") never exercise this
    // parity check at all: a `.toc-page-num` width difference only changes a
    // row's *height* (and thus a page boundary) if it's enough to tip that
    // row's text into wrapping onto a second line. Realistic, varying-length
    // item names are what make that possible — verified empirically against
    // this exact template/CSS by temporarily deleting `.toc-page-num`'s
    // min-width and confirming this fixture then produces a pass-1/pass-2
    // mismatch (RED), then restoring it (GREEN).
    const itemNameFiller = "Description Words Here Padding More Text ";
    const items = Array.from({ length: 50 }, (_, i) => {
      const targetLength = 80 + ((i * 7919) % 20); // spreads names across an 80-100 char band
      let name = `Item Number ${i} `;
      while (name.length < targetLength) name += itemNameFiller;
      name = name.slice(0, targetLength);
      return makeItem({ itemSlug: `item-${i}`, name });
    });
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue(items);
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
      if (!("file" in result)) return;

      const fs = await import("fs/promises");
      const finalBytes = await fs.readFile(result.file);
      const finalPageCount = (await PDFDocument.load(finalBytes)).getPageCount();

      const groups = groupEligibleItems(
        items,
        [makeCategory()],
        baseOptions().statuses,
        baseOptions().categories,
        "en",
      );
      // generateCatalogPdf's real pass 1 also carries contact data (see
      // generate.ts) — this manual reconstruction must match it exactly, or
      // it is not actually re-deriving pass 1, just a differently-shaped PDF
      // that happens to also render a TOC.
      const { seed: contactSeed, entries: contactEntries } = await buildContactPdfData();
      const pass1Html = buildFullCatalogHtml(
        { name: "x", tagline: "", logo: "", baseUrl: "https://example.com" },
        groups,
        "2026-08-16",
        getTranslationsForLocale("en"),
        "lowest",
        null,
        contactSeed,
        contactEntries,
      );
      const launch = await launchChromiumOrError();
      expect("browser" in launch).toBe(true);
      if (!("browser" in launch)) return;
      try {
        const pass1 = await renderHtmlToPdfBytes(launch.browser, pass1Html, {
          pdfOptions: {
            format: "Letter",
            displayHeaderFooter: true,
            headerTemplate: "<div></div>",
            footerTemplate: "<div></div>",
            margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
          },
          renderErrorMessage: "test render failed",
        });
        expect("bytes" in pass1).toBe(true);
        if (!("bytes" in pass1)) return;
        const pass1PageCount = (await PDFDocument.load(pass1.bytes)).getPageCount();
        expect(pass1PageCount).toBe(finalPageCount);
      } finally {
        await launch.browser.close().catch(() => {});
      }

      await fs.unlink(result.file);
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });
});

describe("buildContactPdfData", () => {
  const ONE_PX_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  it("returns a per-item seed and a QR entry per URL/handle platform, in order", async () => {
    const platforms: Platform[] = [
      { type: "email", value: "you@example.com" },
      { type: "instagram", value: "your_handle" },
      { type: "discord", value: "123456789012345678" },
    ];
    const { seed, entries } = await buildContactPdfData(platforms, os.tmpdir());
    expect(seed).toEqual({
      email: "you@example.com",
      discordUrl: "https://discord.com/users/123456789012345678",
    });
    expect(entries.map((e) => e.kind)).toEqual(["qr", "qr", "qr"]);
    expect(entries[0]).toMatchObject({ kind: "qr", label: "Email", target: "you@example.com" });
    expect((entries[0] as { svg: string }).svg.startsWith("<svg")).toBe(true);
    expect(entries[1]).toMatchObject({ label: "Instagram", target: "your_handle" });
  });

  it("embeds a present qr_image as a base64 data URI", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "contact-test-"));
    try {
      await fs.writeFile(path.join(dir, "wechat-qr.png"), ONE_PX_PNG);
      const { entries } = await buildContactPdfData(
        [{ type: "wechat", qr_image: "/contact/wechat-qr.png", label: "WeChat" }],
        dir,
      );
      expect(entries[0]).toMatchObject({ kind: "image", label: "WeChat" });
      expect((entries[0] as { dataUri: string }).dataUri.startsWith("data:image/png;base64,")).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("degrades a missing qr_image to a text entry rather than throwing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "contact-test-"));
    try {
      const { entries } = await buildContactPdfData(
        [{ type: "wechat", qr_image: "/contact/does-not-exist.png", label: "WeChat" }],
        dir,
      );
      expect(entries[0]).toEqual({ kind: "text", label: "WeChat", value: "WeChat" });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("strips a traversal attempt in qr_image down to its basename before reading", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "contact-test-"));
    try {
      // The file exists INSIDE the dir under its basename; a "../../" prefix in
      // the config value must resolve to that in-dir file, never escape it.
      await fs.writeFile(path.join(dir, "secret.png"), ONE_PX_PNG);
      const { entries } = await buildContactPdfData(
        [{ type: "wechat", qr_image: "/contact/../../secret.png", label: "WeChat" }],
        dir,
      );
      expect(entries[0]?.kind).toBe("image");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("renders a handle platform with no URL form (zelle) as text", async () => {
    const { entries } = await buildContactPdfData(
      [{ type: "zelle", value: "pay-me@bank.com" }],
      os.tmpdir(),
    );
    expect(entries[0]).toEqual({ kind: "text", label: "Zelle", value: "pay-me@bank.com" });
  });
});

describe("buildContactPdfData — failure isolation", () => {
  it("degrades to a text entry when QR encoding throws, instead of failing the whole export", async () => {
    // Far beyond QR byte-mode capacity (~2953 bytes) — QRCode.toString throws.
    const huge = "x".repeat(5000);
    const { entries } = await buildContactPdfData(
      [
        { type: "instagram", value: huge },
        { type: "email", value: "still@works.com" },
      ],
      os.tmpdir(),
    );
    // The oversized platform degrades...
    expect(entries[0]?.kind).toBe("text");
    // ...and the healthy platform beside it still renders its QR.
    expect(entries[1]?.kind).toBe("qr");
  });

  it("degrades rather than throwing on a value that breaks URI encoding", async () => {
    const loneSurrogate = "\uD800"; // encodeURIComponent raises URIError
    const { entries } = await buildContactPdfData(
      [{ type: "instagram", value: loneSurrogate }],
      os.tmpdir(),
    );
    expect(entries[0]?.kind).toBe("text");
  });
});
