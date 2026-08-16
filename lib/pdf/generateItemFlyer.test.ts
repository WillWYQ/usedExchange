// @vitest-environment jsdom
// jsdom is required here (not the repo's default node environment) because
// generateItemFlyer.ts uses the browser FileReader API to convert fetched
// image blobs to data URLs — FileReader has no Node.js global equivalent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageAsDataUrl, generateItemFlyerPdf } from "./generateItemFlyer";
import type { FlyerItemView } from "./flyerContent";

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
