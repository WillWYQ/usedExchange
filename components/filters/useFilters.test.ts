// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useFilters } from "./useFilters";
import type { Item } from "@/lib/content/types";

// Vitest doesn't auto-register RTL's cleanup without `test.globals: true`;
// renderHook mounts to the DOM, so without this, hooks from prior tests
// keep their effects/timers attached across tests in this file.
afterEach(cleanup);

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<Item> & { categorySlug: string; itemSlug: string; name: string },
): Item {
  return {
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
    description: "",
    ...overrides,
  };
}

const ITEM_A = makeItem({
  categorySlug: "electronics",
  itemSlug: "laptop",
  name: "Laptop",
  condition: "like-new",
  price: {
    currency: "USD",
    tiers: [
      { label: "Pickup", amount: 100, miles_max: 5 },
      { label: "Far", amount: 200 }, // open-ended
    ],
    negotiable: false,
    show_tiers: false,
  },
  listedDate: "2026-06-01",
});

const ITEM_B = makeItem({
  categorySlug: "electronics",
  itemSlug: "phone",
  name: "Phone",
  condition: "good",
  price: {
    currency: "USD",
    tiers: [
      { label: "Pickup", amount: 50, miles_max: 5 },
      { label: "Far", amount: 120 }, // open-ended
    ],
    negotiable: false,
    show_tiers: false,
  },
  listedDate: "2026-05-01",
});

const ITEM_SOLD = makeItem({
  categorySlug: "electronics",
  itemSlug: "tablet",
  name: "Tablet",
  status: "sold",
  condition: "fair",
  price: { currency: "USD", tiers: [], negotiable: false, show_tiers: false },
  listedDate: "2026-04-01",
});

const ITEMS = [ITEM_A, ITEM_B, ITEM_SOLD];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useFilters", () => {
  describe("initial state", () => {
    it("excludes sold items by default", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      expect(result.current.filteredItems.map((i) => i.itemSlug)).not.toContain("tablet");
    });

    it("shows sold items when toggled on", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      act(() => result.current.toggleShowSold());
      expect(result.current.filteredItems.map((i) => i.itemSlug)).toContain("tablet");
    });

    it("default sort is date-desc (newest first)", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      const slugs = result.current.filteredItems.map((i) => i.itemSlug);
      expect(slugs).toEqual(["laptop", "phone"]); // 2026-06-01 before 2026-05-01
    });
  });

  describe("condition filter", () => {
    it("filters to active conditions only", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      act(() => result.current.toggleCondition("like-new"));
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0]?.itemSlug).toBe("laptop");
    });

    it("multi-condition: shows items matching any active condition", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      act(() => result.current.toggleCondition("like-new"));
      act(() => result.current.toggleCondition("good"));
      expect(result.current.filteredItems).toHaveLength(2);
    });

    it("deactivating a condition restores items", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      act(() => result.current.toggleCondition("like-new"));
      act(() => result.current.toggleCondition("like-new")); // toggle off
      expect(result.current.filteredItems).toHaveLength(2);
    });

    it("availableConditions is sorted best-to-worst and de-duplicated", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      // ITEM_A=like-new, ITEM_B=good, ITEM_SOLD=fair (sold, but still "present" in the set)
      expect(result.current.availableConditions).toEqual(["like-new", "good", "fair"]);
    });
  });

  describe("price bounds", () => {
    it("computes correct bounds at fallback distance (Infinity → highest tier)", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      // fallback → open-ended tier: ITEM_A→200, ITEM_B→120
      expect(result.current.priceBounds).toEqual([120, 200]);
    });

    it("computes correct bounds at close distance (pickup tier)", () => {
      // 3 mi → pickup tier: ITEM_A→100, ITEM_B→50
      const { result } = renderHook(() => useFilters(ITEMS, 3));
      expect(result.current.priceBounds).toEqual([50, 100]);
    });

    it("returns null when no item in the set has price tiers", () => {
      const noTierItems = [makeItem({ categorySlug: "c", itemSlug: "i", name: "N" })];
      const { result } = renderHook(() => useFilters(noTierItems, Infinity));
      expect(result.current.priceBounds).toBeNull();
    });

    it("initialises priceRange to the full bounds on first render", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      expect(result.current.priceRange).toEqual([120, 200]);
    });

    it("resets priceRange to the new bounds when distance changes", () => {
      const { result, rerender } = renderHook(
        ({ dist }: { dist: number }) => useFilters(ITEMS, dist),
        { initialProps: { dist: Infinity } },
      );

      // Manually narrow the range — simulates a buyer dragging the slider
      act(() => result.current.setPriceRange([150, 200]));
      expect(result.current.priceRange).toEqual([150, 200]);

      // Distance changes → bounds change → range resets to the new full bounds,
      // discarding the buyer's manual narrowing (by design — see useFilters.ts).
      rerender({ dist: 3 });
      expect(result.current.priceRange).toEqual([50, 100]);
    });
  });

  describe("price range filter", () => {
    it("excludes items outside the selected price range", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      // bounds are [120, 200]; narrow to [180, 200] to exclude ITEM_B (120)
      act(() => result.current.setPriceRange([180, 200]));
      const slugs = result.current.filteredItems.map((i) => i.itemSlug);
      expect(slugs).toContain("laptop");
      expect(slugs).not.toContain("phone");
    });

    it("always includes items with no tiers regardless of the slider position", () => {
      const noTierItem = makeItem({ categorySlug: "c", itemSlug: "n", name: "N" });
      const { result } = renderHook(() => useFilters([ITEM_A, noTierItem], Infinity));
      // Narrow the range away from ITEM_A's resolved price (200)
      act(() => result.current.setPriceRange([1, 50]));
      const slugs = result.current.filteredItems.map((i) => i.itemSlug);
      expect(slugs).toContain("n"); // null tier → "Contact for price" → always visible
      expect(slugs).not.toContain("laptop");
    });
  });

  describe("sort", () => {
    it("price-asc: lowest resolved price first", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      act(() => result.current.setSortKey("price-asc"));
      expect(result.current.filteredItems.map((i) => i.itemSlug)).toEqual(["phone", "laptop"]);
    });

    it("price-desc: highest resolved price first", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      act(() => result.current.setSortKey("price-desc"));
      expect(result.current.filteredItems.map((i) => i.itemSlug)).toEqual(["laptop", "phone"]);
    });

    it("condition-asc: best condition first", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      act(() => result.current.setSortKey("condition-asc"));
      expect(result.current.filteredItems[0]?.itemSlug).toBe("laptop"); // like-new beats good
    });
  });

  describe("resolvedPrices", () => {
    it("exposes the resolved tier for every item, keyed by categorySlug/itemSlug", () => {
      const { result } = renderHook(() => useFilters(ITEMS, Infinity));
      expect(result.current.resolvedPrices.get("electronics/laptop")?.amount).toBe(200);
      expect(result.current.resolvedPrices.get("electronics/phone")?.amount).toBe(120);
      expect(result.current.resolvedPrices.get("electronics/tablet")).toBeNull(); // no tiers
    });

    it("re-resolves prices when the distance changes", () => {
      const { result, rerender } = renderHook(
        ({ dist }: { dist: number }) => useFilters(ITEMS, dist),
        { initialProps: { dist: Infinity } },
      );
      expect(result.current.resolvedPrices.get("electronics/laptop")?.amount).toBe(200);

      rerender({ dist: 3 });
      expect(result.current.resolvedPrices.get("electronics/laptop")?.amount).toBe(100);
    });
  });
});
