import { describe, expect, it } from "vitest";
import type { StudioItem } from "../../scripts/lib/studioApi";
import {
  applyFilters,
  applyFiltersWithExemptions,
  countByStatus,
  DEFAULT_FILTERS,
  type Filters,
} from "./filtering";

function item(over: Partial<StudioItem> & { id: string }): StudioItem {
  return {
    categorySlug: "electronics",
    itemSlug: over.id,
    name: "Item",
    status: "available",
    currency: "USD",
    lowestTierAmount: 10,
    imageCount: 0,
    coverImage: null,
    localizedNames: { en: "Item" },
    tags: [],
    listedDate: "2026-01-01",
    ...over,
  };
}

const filters = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });

const ids = (list: StudioItem[]): string[] => list.map((i) => i.id);

describe("status filtering", () => {
  const items = [
    item({ id: "a", status: "available" }),
    item({ id: "b", status: "sold" }),
    item({ id: "c", status: "draft" }),
    item({ id: "d", status: "reserved" }),
  ];

  it("excludes sold in the default active view", () => {
    expect(ids(applyFilters(items, filters({ status: "active" })))).toEqual(["a", "c", "d"]);
  });

  it("defaults to the active view", () => {
    expect(DEFAULT_FILTERS.status).toBe("active");
    expect(ids(applyFilters(items, DEFAULT_FILTERS))).toEqual(["a", "c", "d"]);
  });

  it("keeps everything in the all view", () => {
    expect(ids(applyFilters(items, filters({ status: "all" })))).toEqual(["a", "b", "c", "d"]);
  });

  it("matches one status exactly", () => {
    expect(ids(applyFilters(items, filters({ status: "sold" })))).toEqual(["b"]);
    expect(ids(applyFilters(items, filters({ status: "draft" })))).toEqual(["c"]);
  });
});

describe("category filtering", () => {
  const items = [
    item({ id: "a", categorySlug: "electronics" }),
    item({ id: "b", categorySlug: "houseware" }),
    item({ id: "c", categorySlug: "houseware", status: "sold" }),
  ];

  it("keeps all categories by default", () => {
    expect(ids(applyFilters(items, filters({ status: "all" })))).toEqual(["a", "b", "c"]);
  });

  it("matches one category exactly", () => {
    expect(ids(applyFilters(items, filters({ status: "all", category: "houseware" })))).toEqual([
      "b",
      "c",
    ]);
  });

  it("stacks with the status filter", () => {
    expect(ids(applyFilters(items, filters({ status: "active", category: "houseware" })))).toEqual([
      "b",
    ]);
  });
});

describe("search", () => {
  const items = [
    item({ id: "lamp", name: "IKEA desk lamp", tags: ["lighting"] }),
    item({ id: "chair", name: "Office chair", categorySlug: "furniture", tags: ["ergonomic"] }),
    item({ id: "cable", name: "USB-C cable", tags: ["lighting", "charger"] }),
  ];

  it("matches on name", () => {
    expect(ids(applyFilters(items, filters({ status: "all", query: "desk lamp" })))).toContain("lamp");
  });

  it("matches on category", () => {
    expect(ids(applyFilters(items, filters({ status: "all", query: "furniture" })))).toContain("chair");
  });

  it("matches on a tag", () => {
    const found = ids(applyFilters(items, filters({ status: "all", query: "lighting" })));
    expect(found).toContain("lamp");
    expect(found).toContain("cable");
  });

  it("tolerates a small typo", () => {
    expect(ids(applyFilters(items, filters({ status: "all", query: "ofice chair" })))).toContain(
      "chair",
    );
  });

  it("returns an empty array when nothing matches", () => {
    expect(applyFilters(items, filters({ status: "all", query: "zzzzzzz" }))).toEqual([]);
  });

  it("leaves order untouched when the query is blank", () => {
    expect(ids(applyFilters(items, filters({ status: "all", query: "   " })))).toEqual([
      "lamp",
      "chair",
      "cable",
    ]);
  });
});

describe("sorting", () => {
  const items = [
    item({ id: "b", name: "banana", lowestTierAmount: 30, listedDate: "2026-02-01" }),
    item({ id: "a", name: "Apple", lowestTierAmount: 10, listedDate: "2026-03-01" }),
    item({ id: "c", name: "cherry", lowestTierAmount: 20, listedDate: "2026-01-01" }),
  ];

  it("sorts by name, case-insensitively", () => {
    expect(ids(applyFilters(items, filters({ status: "all", sort: "name-asc" })))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("sorts by price ascending and descending", () => {
    expect(ids(applyFilters(items, filters({ status: "all", sort: "price-asc" })))).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(ids(applyFilters(items, filters({ status: "all", sort: "price-desc" })))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("sorts by date, newest and oldest first", () => {
    expect(ids(applyFilters(items, filters({ status: "all", sort: "date-desc" })))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(ids(applyFilters(items, filters({ status: "all", sort: "date-asc" })))).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("keeps the incoming order for relevance with no query", () => {
    expect(ids(applyFilters(items, filters({ status: "all", sort: "relevance" })))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

describe("null values sink in both sort directions", () => {
  const priced = [
    item({ id: "none", lowestTierAmount: null }),
    item({ id: "cheap", lowestTierAmount: 5 }),
    item({ id: "dear", lowestTierAmount: 50 }),
  ];
  const dated = [
    item({ id: "none", listedDate: null }),
    item({ id: "old", listedDate: "2026-01-01" }),
    item({ id: "new", listedDate: "2026-06-01" }),
  ];

  it("sinks a null price ascending and descending", () => {
    expect(ids(applyFilters(priced, filters({ status: "all", sort: "price-asc" })))).toEqual([
      "cheap",
      "dear",
      "none",
    ]);
    expect(ids(applyFilters(priced, filters({ status: "all", sort: "price-desc" })))).toEqual([
      "dear",
      "cheap",
      "none",
    ]);
  });

  it("sinks a null date newest-first and oldest-first", () => {
    expect(ids(applyFilters(dated, filters({ status: "all", sort: "date-desc" })))).toEqual([
      "new",
      "old",
      "none",
    ]);
    expect(ids(applyFilters(dated, filters({ status: "all", sort: "date-asc" })))).toEqual([
      "old",
      "new",
      "none",
    ]);
  });
});

describe("all four dimensions together", () => {
  const items = [
    item({ id: "keep", name: "desk lamp", categorySlug: "houseware", lowestTierAmount: 15 }),
    item({ id: "cheaper", name: "desk lamp mini", categorySlug: "houseware", lowestTierAmount: 5 }),
    item({ id: "sold-out", name: "desk lamp pro", categorySlug: "houseware", status: "sold" }),
    item({ id: "other-cat", name: "desk lamp xl", categorySlug: "electronics" }),
  ];

  it("applies status, category, search and sort", () => {
    const result = applyFilters(
      items,
      { query: "desk lamp", status: "active", category: "houseware", sort: "price-asc" },
    );
    expect(ids(result)).toEqual(["cheaper", "keep"]);
  });
});

describe("countByStatus", () => {
  const items = [
    item({ id: "a", status: "available" }),
    item({ id: "b", status: "sold" }),
    item({ id: "c", status: "sold" }),
    item({ id: "d", status: "draft" }),
  ];

  it("counts each status plus the active and all buckets", () => {
    const counts = countByStatus(items);
    expect(counts.all).toBe(4);
    expect(counts.active).toBe(2);
    expect(counts.sold).toBe(2);
    expect(counts.available).toBe(1);
    expect(counts.draft).toBe(1);
    expect(counts.reserved).toBe(0);
    expect(counts.pending).toBe(0);
  });

  it("returns all zeros for an empty list", () => {
    const counts = countByStatus([]);
    expect(counts.all).toBe(0);
    expect(counts.active).toBe(0);
    expect(counts.sold).toBe(0);
  });
});

describe("applyFiltersWithExemptions", () => {
  const items = [
    item({ id: "b", name: "banana", status: "sold", lowestTierAmount: 30 }),
    item({ id: "a", name: "apple", lowestTierAmount: 10 }),
    item({ id: "c", name: "cherry", lowestTierAmount: 20 }),
  ];

  it("returns the plain filtered list when nothing is exempt", () => {
    expect(
      ids(applyFiltersWithExemptions(items, filters({ sort: "price-asc" }), new Set())),
    ).toEqual(["a", "c"]);
  });

  it("keeps a chosen sort when an exempt row is re-inserted", () => {
    // "b" is sold, so the active filter drops it; exempting it must put it back
    // in PRICE order (30 is dearest, so last), not at the raw list's position.
    expect(
      ids(applyFiltersWithExemptions(items, filters({ sort: "price-asc" }), new Set(["b"]))),
    ).toEqual(["a", "c", "b"]);
  });

  it("does not duplicate a row that the filters already keep", () => {
    const result = ids(
      applyFiltersWithExemptions(items, filters({ sort: "price-asc" }), new Set(["a"])),
    );
    expect(result).toEqual(["a", "c"]);
  });

  it("appends exempt rows under relevance, preserving the incoming order", () => {
    expect(
      ids(applyFiltersWithExemptions(items, filters({ sort: "relevance" }), new Set(["b"]))),
    ).toEqual(["a", "c", "b"]);
  });
});
