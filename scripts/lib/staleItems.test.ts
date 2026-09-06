import { describe, it, expect } from "vitest";
import { findStaleItems, DEFAULT_STALE_DAYS, parseStaleDaysArg } from "./staleItems";
import type { Item } from "@/lib/content/types";

describe("parseStaleDaysArg", () => {
  it("returns null for an empty string rather than treating it as 0 days", () => {
    // Number("") === 0 — an unset/empty $VAR interpolated into
    // `--days "$VAR"` must not silently make every available item "stale".
    expect(parseStaleDaysArg("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(parseStaleDaysArg("   ")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseStaleDaysArg("abc")).toBeNull();
  });

  it("returns null for a negative number", () => {
    expect(parseStaleDaysArg("-1")).toBeNull();
  });

  it("accepts a genuine, explicit zero", () => {
    expect(parseStaleDaysArg("0")).toBe(0);
  });

  it("accepts a normal positive number", () => {
    expect(parseStaleDaysArg("90")).toBe(90);
  });
});

// ── Fixture helper (same shape as lib/utils/jsonld.test.ts's makeItem) ────────
function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    categorySlug: "electronics",
    itemSlug: "old-lamp",
    name: "Old Lamp",
    description: "",
    metaDescription: "",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [{ label: "Pickup", amount: 10 }], negotiable: false, show_tiers: false },
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
    isbn: "",
    course: "",
    edition: "",
    semesterListed: "",
    nameZh: "",
    descriptionZh: "",
    images: [],
    coverImage: null,
    ...overrides,
  } as Item;
}

describe("findStaleItems", () => {
  const now = new Date("2026-06-14T00:00:00Z"); // ~164 days after 2026-01-01

  it("defaults the threshold to 60 days", () => {
    expect(DEFAULT_STALE_DAYS).toBe(60);
  });

  it("includes an available item listed well past the threshold", () => {
    const items = [makeItem({ itemSlug: "stale-1", listedDate: "2026-01-01" })];
    const result = findStaleItems(items, 60, now);
    expect(result).toHaveLength(1);
    expect(result[0]?.item.itemSlug).toBe("stale-1");
    expect(result[0]?.days).toBeGreaterThan(60);
  });

  it("excludes items at or under the threshold", () => {
    const items = [makeItem({ itemSlug: "fresh", listedDate: "2026-06-01" })]; // 13 days
    expect(findStaleItems(items, 60, now)).toHaveLength(0);
  });

  it("excludes non-available items regardless of age", () => {
    const items = [
      makeItem({ itemSlug: "sold-old", status: "sold", listedDate: "2026-01-01" }),
      makeItem({ itemSlug: "draft-old", status: "draft", listedDate: "2026-01-01" }),
      makeItem({ itemSlug: "pending-old", status: "pending", listedDate: "2026-01-01" }),
    ];
    expect(findStaleItems(items, 60, now)).toHaveLength(0);
  });

  it("sorts longest-listed first", () => {
    const items = [
      makeItem({ itemSlug: "less-stale", listedDate: "2026-03-01" }),
      makeItem({ itemSlug: "most-stale", listedDate: "2025-12-01" }),
    ];
    const result = findStaleItems(items, 60, now);
    expect(result.map((r) => r.item.itemSlug)).toEqual(["most-stale", "less-stale"]);
  });

  it("respects a custom threshold", () => {
    const items = [makeItem({ itemSlug: "medium", listedDate: "2026-05-01" })]; // ~44 days
    expect(findStaleItems(items, 60, now)).toHaveLength(0);
    expect(findStaleItems(items, 30, now)).toHaveLength(1);
  });
});
