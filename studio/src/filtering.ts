// Client-side search, filtering and sorting for the item table.
//
// Studio loads every item into memory at startup, so all four dimensions are
// array work — no request per keystroke and no filtering API to keep in sync
// with this file. Everything here is pure: App owns the state, this module
// owns the rules, and the table renders whatever comes back.

import Fuse, { type IFuseOptions } from "fuse.js";
import type { StudioItem } from "./api";

export type StatusFilter =
  | "active"
  | "all"
  | "available"
  | "reserved"
  | "pending"
  | "sold"
  | "draft";

export type SortKey =
  | "relevance"
  | "name-asc"
  | "price-asc"
  | "price-desc"
  | "date-desc"
  | "date-asc";

export type Filters = {
  query: string;
  status: StatusFilter;
  category: string;
  sort: SortKey;
};

/** Every session starts here: sold hidden, nothing searched, nothing narrowed. */
export const DEFAULT_FILTERS: Filters = {
  query: "",
  status: "active",
  category: "all",
  sort: "relevance",
};

// Weighted so a name hit outranks a category or tag hit for the same score;
// 0.35 is loose enough to survive a transposed letter and tight enough that
// an unrelated item does not surface.
const FUSE_OPTIONS: IFuseOptions<StudioItem> = {
  keys: [
    { name: "name", weight: 0.6 },
    { name: "categorySlug", weight: 0.2 },
    { name: "tags", weight: 0.2 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
};

function matchesStatus(item: StudioItem, status: StatusFilter): boolean {
  if (status === "all") return true;
  // "active" is the working set: everything the seller might still act on.
  if (status === "active") return item.status !== "sold";
  return item.status === status;
}

/**
 * Compares two values where null means "no data". Nulls sort last in BOTH
 * directions: an unpriced item is not the cheapest, and an undated one is
 * neither newest nor oldest — showing them first would read as a real value.
 */
function compareNullable<T extends number | string>(
  a: T | null,
  b: T | null,
  direction: 1 | -1,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a < b) return -1 * direction;
  if (a > b) return 1 * direction;
  return 0;
}

function sortItems(items: StudioItem[], sort: SortKey): StudioItem[] {
  // relevance keeps whatever order arrived: fuse's ranking when a query ran,
  // the loader's order when it did not.
  if (sort === "relevance") return items;

  const sorted = [...items];
  switch (sort) {
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      break;
    case "price-asc":
      sorted.sort((a, b) => compareNullable(a.lowestTierAmount, b.lowestTierAmount, 1));
      break;
    case "price-desc":
      sorted.sort((a, b) => compareNullable(a.lowestTierAmount, b.lowestTierAmount, -1));
      break;
    case "date-desc":
      sorted.sort((a, b) => compareNullable(a.listedDate, b.listedDate, -1));
      break;
    case "date-asc":
      sorted.sort((a, b) => compareNullable(a.listedDate, b.listedDate, 1));
      break;
  }
  return sorted;
}

export function applyFilters(items: StudioItem[], filters: Filters): StudioItem[] {
  let result = items.filter((item) => matchesStatus(item, filters.status));

  if (filters.category !== "all") {
    result = result.filter((item) => item.categorySlug === filters.category);
  }

  const query = filters.query.trim();
  if (query !== "") {
    // Built after the cheap filters so the index only covers rows that can
    // still match — and rebuilt per call, which is affordable because App
    // memoises this whole computation on [items, filters].
    result = new Fuse(result, FUSE_OPTIONS).search(query).map((hit) => hit.item);
  }

  return sortItems(result, filters.sort);
}

const COUNTED_STATUSES: StatusFilter[] = [
  "active",
  "all",
  "available",
  "reserved",
  "pending",
  "sold",
  "draft",
];

/** Per-tab counts for the filter bar. Ignores query and category: a tab's
 * number answers "how many items are in this state", not "how many would I
 * see if I clicked it" — a count that moved while typing would read as items
 * disappearing. */
export function countByStatus(items: StudioItem[]): Record<StatusFilter, number> {
  const counts = Object.fromEntries(COUNTED_STATUSES.map((s) => [s, 0])) as Record<
    StatusFilter,
    number
  >;
  for (const item of items) {
    counts.all += 1;
    if (item.status !== "sold") counts.active += 1;
    if (item.status in counts && item.status !== "all" && item.status !== "active") {
      counts[item.status as StatusFilter] += 1;
    }
  }
  return counts;
}
