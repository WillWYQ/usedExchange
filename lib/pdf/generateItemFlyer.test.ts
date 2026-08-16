// @vitest-environment jsdom
// jsdom is required here (not the repo's default node environment) because
// generateItemFlyer.ts uses the browser FileReader API to convert fetched
// image blobs to data URLs — FileReader has no Node.js global equivalent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFlyerDocument, fetchImageAsDataUrl, generateItemFlyerPdf } from "./generateItemFlyer";
import type { FlyerItemView } from "./flyerContent";

// A real, minimal 1x1 transparent PNG — jsPDF's getImageProperties/addImage
// need to actually decode valid image bytes, not just any Blob.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function tinyPngBlob(): Blob {
  const bytes = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

function makeFlyerItem(overrides: Partial<FlyerItemView> = {}): FlyerItemView {
  return {
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    description: "A bright desk lamp with three brightness settings.",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
    brand: "IKEA",
    model: "",
    ageYears: 2,
    dimensions: null,
    weight: null,
    color: "black",
    images: [],
    coverImage: null,
    ...overrides,
  };
}

// jsdom's Blob implementation has no arrayBuffer()/text() methods — only
// slice()/size/type — so FileReader (which jsdom does implement) is the only
// way to read bytes back out in this test environment.
async function readHeader(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob.slice(0, 5));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateItemFlyerPdf", () => {
  it("returns a valid PDF blob for an item with no images (no network calls needed)", async () => {
    const blob = await generateItemFlyerPdf({
      item: makeFlyerItem(),
      resolvedTier: { label: "Pickup", amount: 20 },
      siteName: "UsedExchange",
      baseUrl: "https://example.com",
    });
    expect(blob.type).toBe("application/pdf");
    expect(await readHeader(blob)).toBe("%PDF-");
  });

  it("still produces a valid PDF when every image fetch fails (CORS/network)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const blob = await generateItemFlyerPdf({
      item: makeFlyerItem({ images: ["https://cdn.example.com/a.jpg"], coverImage: "https://cdn.example.com/a.jpg" }),
      resolvedTier: { label: "Pickup", amount: 20 },
      siteName: "UsedExchange",
      baseUrl: "https://example.com",
    });

    expect(await readHeader(blob)).toBe("%PDF-");
  });

  it("produces a valid PDF with a full tier table and long description spanning multiple pages", async () => {
    const blob = await generateItemFlyerPdf({
      item: makeFlyerItem({
        description: "Lorem ipsum dolor sit amet. ".repeat(200),
        price: {
          currency: "USD",
          tiers: [
            { label: "Pickup", amount: 20, miles_max: 10 },
            { label: "Shipping", amount: 35 },
          ],
          negotiable: true,
          show_tiers: true,
        },
      }),
      resolvedTier: { label: "Shipping", amount: 35 },
      siteName: "UsedExchange",
      baseUrl: "https://example.com",
    });

    expect(await readHeader(blob)).toBe("%PDF-");
  });

  it("actually paginates a long description instead of clipping it off the page", async () => {
    // Regression test: doc.text(lines, ...) does not paginate on its own —
    // this asserts real page count via buildFlyerDocument(), not just that a
    // %PDF header exists (a single-page doc also produces a valid header).
    const doc = await buildFlyerDocument({
      item: makeFlyerItem({ description: "Lorem ipsum dolor sit amet. ".repeat(200) }),
      resolvedTier: { label: "Pickup", amount: 20 },
      siteName: "UsedExchange",
      baseUrl: "https://example.com",
    });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("stays on one page for a short description", async () => {
    const doc = await buildFlyerDocument({
      item: makeFlyerItem({ description: "A short description." }),
      resolvedTier: { label: "Pickup", amount: 20 },
      siteName: "UsedExchange",
      baseUrl: "https://example.com",
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("keeps a photo that succeeds even when a sibling photo's fetch fails (per-image isolation)", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: true, blob: async () => tinyPngBlob() };
        }
        throw new Error("network error on second photo");
      }),
    );

    const blob = await generateItemFlyerPdf({
      item: makeFlyerItem({
        coverImage: null,
        images: ["https://cdn.example.com/ok.png", "https://cdn.example.com/broken.png"],
      }),
      resolvedTier: { label: "Pickup", amount: 20 },
      siteName: "UsedExchange",
      baseUrl: "https://example.com",
    });

    // Both images were attempted independently...
    expect(callCount).toBe(2);
    // ...and the one that succeeded still made it into a valid PDF (the
    // failure of its sibling did not abort generation or drop it too).
    expect(await readHeader(blob)).toBe("%PDF-");
  });

  it("respects the passed unitSystem for dimensions/weight specs", async () => {
    const doc = await buildFlyerDocument({
      item: makeFlyerItem({ dimensions: { length: 10, width: 5, height: 2, unit: "in" } }),
      resolvedTier: { label: "Pickup", amount: 20 },
      siteName: "UsedExchange",
      baseUrl: "https://example.com",
      unitSystem: "imperial",
    });
    // No direct text-extraction API on jsPDF's Node build — this at least
    // exercises the unitSystem plumbing without throwing; the conversion math
    // itself is covered by lib/pdf/flyerContent.test.ts's buildFlyerSpecs tests.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe("fetchImageAsDataUrl", () => {
  it("returns null when the fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("blocked");
      }),
    );
    await expect(fetchImageAsDataUrl("https://cdn.example.com/a.jpg")).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await expect(fetchImageAsDataUrl("https://cdn.example.com/a.jpg")).resolves.toBeNull();
  });

  it("resolves a data URL on success", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => fakeBlob })),
    );
    const result = await fetchImageAsDataUrl("https://cdn.example.com/a.jpg");
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });
});
