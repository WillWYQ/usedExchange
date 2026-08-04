# Seller Studio List Search & Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Studio item table a status tab strip (default view excludes sold), fuzzy search over name/category/tags, a category dropdown, and sorting — all computed in the browser.

**Architecture:** The server adds two read-only fields (`tags`, `listedDate`) to each item it already returns. A new pure module `studio/src/filtering.ts` runs a fixed four-step pipeline (status → category → fuzzy search → sort) over the in-memory list; `App.tsx` owns the filter state and passes the filtered array to `ItemList`, so bulk actions operate on exactly what is visible. A new `FilterBar` component renders the controls using Studio's existing tab and token vocabulary.

**Tech Stack:** React 19 + Vite (studio SPA), fuse.js 7 (already a dependency), Vitest, plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-04-studio-list-filtering-design.md`

## Global Constraints

Copied from the spec and `.claude/CLAUDE.md`. Every task inherits these:

- Iron Rule 2: any doc edit ships with its `_zh` counterpart in the same commit (Task 5 handles all docs).
- Iron Rule 4: `reserved_for` is never read, written, or surfaced. The two new fields are `tags` and `listedDate` only.
- Iron Rule 7: Phase 21 is recorded in `IMPLEMENTATION_PLAN.md` / `_zh` with all tasks `[x]` and ✅ (Task 5, after verification).
- No new dependencies: fuse.js is already in `package.json`.
- No server-side filtering API. `GET /api/items` gains no query parameters; the two new fields are the only server change.
- Filter state is never persisted — every Studio start begins at the `active` tab, empty query, all categories, default sort.
- Styling consumes existing tokens and the existing `.tab` / `.tab-active` classes; no second tab style, no new color literals.
- Gates: `pnpm type-check`, `pnpm lint` (zero warnings), `pnpm test` — all clean before every commit. The repo suite is 619 tests before this work; Task 1 and Task 2 add to that count.
- Commits use repo prefixes and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Branch: `feat/studio-list-filtering` (already created off develop, which contains PR #4 and PR #5).
- Repo conventions: 2-space indent, double quotes.

---

### Task 1: Server sends `tags` and `listedDate`

**Files:**
- Modify: `scripts/lib/studioApi.ts` (the `StudioItem` type near line 85; the mapped object inside `listStudioItems` near line 160)
- Modify: `scripts/lib/studioApi.test.ts` (add one test to the existing `describe("handleStudioRequest")` area — place it after the "returns items for GET /api/items" test)

**Interfaces:**
- Consumes: the loader's `Item`, which already carries `tags: string[]` (schema default `[]`, `lib/content/schema.ts:166`) and `listed_date: string | null` (`lib/content/schema.ts:154`).
- Produces: `StudioItem` gains `tags: string[]` and `listedDate: string | null`. Every later task and the studio client rely on these exact names.

- [ ] **Step 1: Write the failing test**

Add to `scripts/lib/studioApi.test.ts`, inside `describe("listStudioItems resilience to invalid slugs")`'s sibling scope — put it directly after the existing `it("returns items for GET /api/items", …)` block in `describe("handleStudioRequest")`:

```typescript
  it("includes tags and listedDate on every item", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(200);
    const body = asJson(res).body as { items: Array<Record<string, unknown>> };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(Array.isArray(item.tags)).toBe(true);
      // listedDate is a YYYY-MM-DD string or null — never undefined, so the
      // client can sort on it without a presence check.
      expect(item.listedDate === null || typeof item.listedDate === "string").toBe(true);
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test scripts/lib/studioApi.test.ts -t "includes tags and listedDate"`
Expected: FAIL — `Array.isArray(item.tags)` is false because the field is absent.

- [ ] **Step 3: Add the fields**

In `scripts/lib/studioApi.ts`, extend the `StudioItem` type:

```typescript
export type StudioItem = {
  id: string;
  categorySlug: string;
  itemSlug: string;
  name: string;
  status: string;
  currency: string;
  lowestTierAmount: number | null;
  imageCount: number;
  /** Seller-authored tags, used by studio's client-side search. */
  tags: string[];
  /** YYYY-MM-DD, or null when the item never had a listed_date. Sorting only. */
  listedDate: string | null;
};
```

In `listStudioItems`, extend the returned object (keep the existing keys and their order, append these two before the closing brace):

```typescript
        imageCount,
        // Defensive: the loader's schema defaults tags to [], but a hand-edited
        // file that parsed oddly must not hand the client a non-array to iterate.
        tags: Array.isArray(item.tags) ? item.tags : [],
        listedDate: typeof item.listed_date === "string" ? item.listed_date : null,
      } satisfies StudioItem;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test scripts/lib/studioApi.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Full gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: studio item list carries tags and listedDate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `studio/src/filtering.ts` — the filter pipeline (TDD)

**Files:**
- Create: `studio/src/filtering.ts`
- Test: `studio/src/filtering.test.ts`

**Interfaces:**
- Consumes: `StudioItem` (type-only import from `./api`, which re-exports the server type — Task 1 added `tags` and `listedDate`); `fuse.js`.
- Produces:
  - `export type StatusFilter = "active" | "all" | "available" | "reserved" | "pending" | "sold" | "draft"`
  - `export type SortKey = "relevance" | "name-asc" | "price-asc" | "price-desc" | "date-desc" | "date-asc"`
  - `export type Filters = { query: string; status: StatusFilter; category: string; sort: SortKey }`
  - `export const DEFAULT_FILTERS: Filters`
  - `export function applyFilters(items: StudioItem[], filters: Filters): StudioItem[]`
  - `export function countByStatus(items: StudioItem[]): Record<StatusFilter, number>`

- [ ] **Step 1: Write the failing test**

Create `studio/src/filtering.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { StudioItem } from "../../scripts/lib/studioApi";
import { applyFilters, countByStatus, DEFAULT_FILTERS, type Filters } from "./filtering";

function item(over: Partial<StudioItem> & { id: string }): StudioItem {
  return {
    categorySlug: "electronics",
    itemSlug: over.id,
    name: "Item",
    status: "available",
    currency: "USD",
    lowestTierAmount: 10,
    imageCount: 0,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test studio/src/filtering.test.ts`
Expected: FAIL — cannot resolve `./filtering` (the module does not exist yet).

- [ ] **Step 3: Write the module**

Create `studio/src/filtering.ts`:

```typescript
// Client-side search, filtering and sorting for the item table.
//
// Studio loads every item into memory at startup, so all four dimensions are
// array work — no request per keystroke and no filtering API to keep in sync
// with this file. Everything here is pure: App owns the state, this module
// owns the rules, and the table renders whatever comes back.

import Fuse from "fuse.js";
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
const FUSE_OPTIONS = {
  keys: [
    { name: "name", weight: 0.6 },
    { name: "categorySlug", weight: 0.2 },
    { name: "tags", weight: 0.2 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
} as const;

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test studio/src/filtering.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Full gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add studio/src/filtering.ts studio/src/filtering.test.ts
git commit -m "feat: client-side filter pipeline for the studio item list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `FilterBar` component and its styles

**Files:**
- Create: `studio/src/panes/FilterBar.tsx`
- Modify: `studio/src/tokens.css` (append a filter-bar section at the end)

**Interfaces:**
- Consumes: `Filters`, `StatusFilter`, `SortKey` from `../filtering` (Task 2); the existing `.tab` / `.tab-active` classes and design tokens.
- Produces: `export function FilterBar({ filters, counts, categories, resultCount, onChange }: { filters: Filters; counts: Record<StatusFilter, number>; categories: string[]; resultCount: number; onChange: (next: Filters) => void })`.

- [ ] **Step 1: Create `studio/src/panes/FilterBar.tsx`**

```tsx
import type { Filters, SortKey, StatusFilter } from "../filtering";

// Order matters: the working set first, then the individual states in the
// order an item moves through them, with the archive and the escape hatch last.
const TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "available", label: "Available" },
  { key: "reserved", label: "Reserved" },
  { key: "pending", label: "Pending" },
  { key: "draft", label: "Draft" },
  { key: "sold", label: "Sold" },
  { key: "all", label: "All" },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "name-asc", label: "Name A–Z" },
  { key: "price-asc", label: "Price low–high" },
  { key: "price-desc", label: "Price high–low" },
  { key: "date-desc", label: "Newest" },
  { key: "date-asc", label: "Oldest" },
];

export function FilterBar({
  filters,
  counts,
  categories,
  resultCount,
  onChange,
}: {
  filters: Filters;
  counts: Record<StatusFilter, number>;
  categories: string[];
  resultCount: number;
  onChange: (next: Filters) => void;
}) {
  const searching = filters.query.trim() !== "";

  return (
    <section className="filter-bar" aria-label="Filter items">
      <div className="filter-tabs" role="tablist" aria-label="Item status">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={filters.status === tab.key}
            className={filters.status === tab.key ? "tab tab-active" : "tab"}
            onClick={() => onChange({ ...filters, status: tab.key })}
          >
            {tab.label} <span className="tab-count">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      <div className="filter-controls">
        <input
          type="search"
          className="filter-search"
          value={filters.query}
          aria-label="Search items by name, category, or tag"
          placeholder="Search name, category, tags"
          onChange={(e) => {
            const query = e.target.value;
            // "Best match" only means something while a query is running, so
            // typing switches to it and clearing the box switches away — but
            // only when the seller had not picked a sort of their own, which
            // must survive the search that follows it.
            let sort: SortKey = filters.sort;
            if (query.trim() !== "" && filters.sort === "relevance") sort = "relevance";
            if (query.trim() === "" && filters.sort === "relevance") sort = "date-desc";
            onChange({ ...filters, query, sort });
          }}
        />

        <label className="filter-field">
          <span className="filter-label">Category</span>
          <select
            value={filters.category}
            onChange={(e) => onChange({ ...filters, category: e.target.value })}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span className="filter-label">Sort</span>
          <select
            value={filters.sort}
            onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}
          >
            {searching && <option value="relevance">Best match</option>}
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <span className="filter-count" role="status">
          {resultCount} {resultCount === 1 ? "item" : "items"}
        </span>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Append the styles to `studio/src/tokens.css`**

```css
/* ── Filter bar ─────────────────────────────────────────────────────────
   Sits between the header and the table. The status tabs reuse the drawer's
   underline .tab vocabulary rather than introducing a second tab style; the
   controls row is a plain flex line so the search box takes the slack. */

.filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  padding: var(--gap) 1rem;
  border-bottom: 1px solid var(--border);
}

.filter-tabs {
  display: flex;
  gap: var(--gap-lg);
  overflow-x: auto;
}

.tab-count {
  margin-left: 0.25rem;
  font-family: var(--font-data);
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: var(--gap);
}

.filter-search {
  flex: 1;
  min-width: 0;
  padding: 0.45rem 0.6rem;
  font-family: var(--font-ui);
  font-size: var(--step-0);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition:
    border-color var(--speed) ease,
    box-shadow var(--speed) ease;
}

.filter-search:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.filter-field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.filter-label {
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.filter-field select {
  padding: 0.4rem 0.5rem;
  font-family: var(--font-ui);
  font-size: var(--step-0);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.filter-count {
  font-family: var(--font-data);
  font-size: 0.75rem;
  color: var(--ink-soft);
  white-space: nowrap;
}

/* Narrow screens: the controls stack under the tabs, same breakpoint the
   item table uses to fold into cards. */
@media (max-width: 40rem) {
  .filter-controls {
    flex-wrap: wrap;
  }

  .filter-search {
    flex: 1 0 100%;
  }
}
```

- [ ] **Step 3: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean. (`FilterBar` is not rendered yet — Task 4 wires it — so this step only proves it compiles and lints.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/panes/FilterBar.tsx studio/src/tokens.css
git commit -m "feat: filter bar component with status tabs, search, category and sort

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire filtering into `App`

**Files:**
- Modify: `studio/src/App.tsx`

**Interfaces:**
- Consumes: `applyFilters`, `countByStatus`, `DEFAULT_FILTERS`, type `Filters` from `./filtering` (Task 2); `FilterBar` from `./panes/FilterBar` (Task 3).
- Produces: no new exports. `ItemList` receives `visibleItems`; bulk actions and select-all operate on that same array.

- [ ] **Step 1: Add the imports**

At the top of `studio/src/App.tsx`, change the React import and add two more:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { bulkStatus, fetchItems, type StudioItem } from "./api";
import { applyFilters, countByStatus, DEFAULT_FILTERS, type Filters } from "./filtering";
import { FilterBar } from "./panes/FilterBar";
```

(Keep every other existing import untouched.)

- [ ] **Step 2: Add filter state and the derived values**

After the `const [showDefaults, setShowDefaults] = useState(false);` line, add:

```tsx
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Rows the seller just acted on stay visible even when the change filters
  // them out (marking sold in the Active view). Otherwise the row vanishes
  // mid-animation and the only feedback for the action disappears with it.
  const [exemptIds, setExemptIds] = useState<Set<string>>(new Set());
```

After the `refresh` callback, add the derived values:

```tsx
  const counts = useMemo(() => countByStatus(items), [items]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.categorySlug))].sort(),
    [items],
  );

  const visibleItems = useMemo(() => {
    const filtered = applyFilters(items, filters);
    if (exemptIds.size === 0) return filtered;
    // Re-insert exempt rows in their original list position so a just-stamped
    // row does not jump to the end of the table.
    const shown = new Set(filtered.map((i) => i.id));
    return items.filter((i) => shown.has(i.id) || exemptIds.has(i.id));
  }, [items, filters, exemptIds]);
```

- [ ] **Step 3: Make filter changes clear the selection and the exemptions**

Add this callback next to `toggle` / `toggleAll`:

```tsx
  // Changing what is on screen invalidates a selection made against the old
  // view: a bulk action must never reach a row the seller can no longer see.
  const changeFilters = useCallback((next: Filters) => {
    setFilters(next);
    setSelectedIds(new Set());
    setExemptIds(new Set());
    setFailedIds(new Set());
  }, []);
```

- [ ] **Step 4: Point select-all at the visible rows**

Replace the existing `toggleAll` with:

```tsx
  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(visibleItems.map((i) => i.id)) : new Set());
    },
    [visibleItems],
  );
```

- [ ] **Step 5: Record exemptions when a bulk action changes status**

Inside `apply(status)`, immediately after the existing `setJustStampedIds(…)` call, add:

```tsx
      // Every row that actually changed keeps its place in the table until the
      // next filter change, whatever the new status is.
      setExemptIds(new Set(ids.filter((id) => !failed.has(id))));
```

- [ ] **Step 6: Render the FilterBar and the filtered table**

Replace the block that runs from `{error === null && items.length === 0 && (` through the `{items.length > 0 && ( <ItemList … /> )}` closing brace with:

```tsx
      {error === null && items.length === 0 && (
        <div className="empty-state">
          <p>No items yet.</p>
          <p>
            Use <strong>New item</strong> in the header to create your first listing.
          </p>
        </div>
      )}
      {items.length > 0 && (
        <FilterBar
          filters={filters}
          counts={counts}
          categories={categories}
          resultCount={visibleItems.length}
          onChange={changeFilters}
        />
      )}
      {items.length > 0 && visibleItems.length === 0 && (
        <div className="empty-state">
          <p>No items match your filters.</p>
          <Button onClick={() => changeFilters(DEFAULT_FILTERS)}>Clear filters</Button>
        </div>
      )}
      {visibleItems.length > 0 && (
        <ItemList
          items={visibleItems}
          selectedIds={selectedIds}
          failedIds={failedIds}
          justStampedIds={justStampedIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onOpen={setOpenItemId}
        />
      )}
```

- [ ] **Step 7: Reuse the derived category list in the two dialogs**

In the `NewItemDialog` render, replace `categories={[...new Set(items.map((i) => i.categorySlug))].sort()}` with `categories={categories}`. Do the same for the `DefaultsPane` render. (Both now share the memoised list computed in Step 2.)

- [ ] **Step 8: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add studio/src/App.tsx
git commit -m "feat: filter the studio table and scope bulk actions to visible rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation (bilingual, one commit)

Every edit ships in both the English file and its `_zh` counterpart (Iron Rule 2). Find each anchor by structure; the `_zh` files are parallel translations.

**Files:**
- Modify: `docs/CURRENT_FUNCTIONALITY.md` + `docs/CURRENT_FUNCTIONALITY_zh.md`
- Modify: `docs/ARCHITECTURE.md` + `docs/ARCHITECTURE_zh.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md` + `docs/IMPLEMENTATION_PLAN_zh.md`

- [ ] **Step 1: CURRENT_FUNCTIONALITY — operations table and a paragraph**

In the Seller Studio operations table (the one whose rows are Create / Defaults / Photos / Bulk status / Edit form / Publish), add a row after the Create row:

```markdown
| Search & filter | Status tabs (Active hides sold by default), fuzzy search over name, category and tags, a category dropdown, and sorting by name, price or listed date — all instant, computed in the browser |
```

Chinese row for `_zh` (same position):

```markdown
| 搜索与筛选 | 状态页签（Active 默认隐藏已售出）、按名称/分类/标签的模糊搜索、分类下拉、按名称/价格/上架日期排序 —— 全部在浏览器内即时计算 |
```

Also update the sentence that counts the operations: change "Six operations, all from one page:" to "Seven operations, all from one page:" (and the parallel Chinese count sentence, which reads 「一个页面，六种操作：」 → 「一个页面，七种操作：」).

Then append this paragraph directly after that table (English file):

```markdown
**The default view hides sold items.** Studio opens on the **Active** tab, which shows everything except `sold` — the working set a seller acts on day to day. Sold listings are one click away on their own tab, and **All** shows everything. Bulk actions apply to exactly the rows currently visible: selecting all with a filter applied selects only that filtered set, and changing any filter clears the selection so an action can never reach a row that scrolled out of view. A row whose status you just changed stays put until the next filter change, so the SOLD stamp is not swept away by the very filter it triggers.
```

Chinese counterpart (same position in `_zh`):

```markdown
**默认视图不显示已售出商品。** Studio 打开时停在 **Active** 页签，显示除 `sold` 之外的全部商品 —— 也就是卖家日常真正要处理的那批。已售出的商品在自己的页签里，**All** 则显示全部。批量操作只作用于当前可见的行：带着筛选条件全选，选中的就只是筛选后的那些；切换任一筛选条件会清空选择，避免操作波及已经看不见的行。刚被改过状态的行会留在原位直到下次切换筛选，这样 SOLD 印章不会被它自己触发的筛选立刻扫走。
```

- [ ] **Step 2: ARCHITECTURE — studio structure**

In the Seller Studio section that enumerates `studio/src/`, add the filtering module to the same enumeration that lists `components/` (added by the previous phase). English:

```markdown
- `studio/src/filtering.ts` — pure client-side filter pipeline (status → category → fuzzy search via fuse.js → sort) plus `countByStatus` for the tab counts; `studio/src/panes/FilterBar.tsx` renders the controls
```

Chinese:

```markdown
- `studio/src/filtering.ts` — 纯客户端筛选流水线（状态 → 分类 → fuse.js 模糊搜索 → 排序），外加给页签计数用的 `countByStatus`；控件由 `studio/src/panes/FilterBar.tsx` 渲染
```

Also add `filtering.ts` to the top-of-file studio tree line (the one listing `App.tsx, api.ts, fields.ts, panes/ (…), components/ (…)`), in both languages.

- [ ] **Step 3: IMPLEMENTATION_PLAN — Phase 21**

Append after the Phase 20 section (English):

```markdown
## Phase 21 — Seller Studio List Search & Filtering ✅

- [x] `listStudioItems` carries `tags` and `listedDate` (read-only additions; no new API parameters)
- [x] `studio/src/filtering.ts`: status → category → fuzzy search (fuse.js, name/category/tags) → sort pipeline, with nulls sinking last in both price and date directions; `countByStatus` for tab counts
- [x] `studio/src/panes/FilterBar.tsx`: status tabs with counts (Active hides sold), search box, category dropdown, sort dropdown, live result count
- [x] `App` owns the filter state; select-all and bulk actions operate on the visible rows only; changing a filter clears the selection; just-changed rows stay visible until the next filter change
- [x] Filtered-empty state distinct from the no-items state, with a clear-filters action
- [x] Unit tests for the filter pipeline (`studio/src/filtering.test.ts`) — the first studio front-end logic tests
- [x] Docs sync (CURRENT_FUNCTIONALITY, ARCHITECTURE, this plan) — both languages
```

Chinese (after the Chinese Phase 20 section):

```markdown
## Phase 21 — Seller Studio 列表搜索与筛选 ✅

- [x] `listStudioItems` 补充 `tags` 与 `listedDate`（只读新增，不新增 API 参数）
- [x] `studio/src/filtering.ts`：状态 → 分类 → 模糊搜索（fuse.js，名称/分类/标签）→ 排序的流水线，价格与日期排序中空值恒沉底；页签计数用 `countByStatus`
- [x] `studio/src/panes/FilterBar.tsx`：带计数的状态页签（Active 隐藏已售出）、搜索框、分类下拉、排序下拉、实时结果计数
- [x] 筛选状态由 `App` 持有；全选与批量操作只作用于可见行；切换筛选即清空选择；刚改过状态的行保留到下次切换筛选
- [x] 筛选无结果的空状态与"完全没有商品"的空状态区分，并提供清除筛选按钮
- [x] 筛选流水线的单元测试（`studio/src/filtering.test.ts`）—— studio 前端逻辑的首批测试
- [x] 文档同步（CURRENT_FUNCTIONALITY、ARCHITECTURE、本计划），中英双语
```

- [ ] **Step 4: Commit**

```bash
git add docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md \
        docs/ARCHITECTURE.md docs/ARCHITECTURE_zh.md \
        docs/IMPLEMENTATION_PLAN.md docs/IMPLEMENTATION_PLAN_zh.md
git commit -m "docs: studio list search and filtering (Phase 21) in three doc pairs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

Verification only — no code changes, no commits (a required fix gets its own `fix:` commit).

- [ ] **Step 1: Automated gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean. The suite should now be 619 + the new tests (1 from Task 1, ~20 from Task 2).

- [ ] **Step 2: Serve check**

```bash
pnpm studio --port 5199 &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5199/
curl -s http://127.0.0.1:5199/api/items | head -c 400
```

Expected: `200`, and the items JSON visibly contains `"tags"` and `"listedDate"` keys. Then kill the background server and confirm the port is free.

- [ ] **Step 3: Confirm the tree is clean**

Run: `git status --porcelain`
Expected: empty (the pre-existing untracked iCloud " 2" duplicate files are outside this work; if they appear, note them in the report and leave them alone).

- [ ] **Step 4: Record the human-only checklist in the report**

1. Studio opens on the **Active** tab; sold items are absent; tab counts match the item states.
2. Typing in the search box narrows the table live; a small typo still finds the item; clearing the box restores the list.
3. The sort dropdown shows **Best match** only while a query is present, and selecting each sort reorders correctly; items with no price or no date sit at the bottom.
4. The category dropdown lists every category present, and picking one narrows the table.
5. With a filter applied, select-all ticks only the visible rows; changing any filter clears the selection.
6. Marking an item sold from the Active tab leaves the row in place with its SOLD stamp; switching tabs then removes it.
7. Filtering to something with no matches shows "No items match your filters" and the Clear filters button restores the default view.
8. At 320px and 768px the filter bar stacks and the tabs scroll horizontally without overlap.
9. Both light and dark themes render the filter bar with readable contrast.

- [ ] **Step 5: Write the report**

Write gate results, serve-check evidence, tree status, and the checklist to the workspace report file.

---

## Self-Review Notes (done at plan-writing time)

- Spec coverage: data layer → Task 1; filter pipeline incl. null-sinking and fuse config → Task 2; FilterBar UI, tabs, counts, result status → Task 3; state ownership, visible-set bulk semantics, selection clearing, exemptions, both empty states → Task 4; tests → Tasks 1-2; docs incl. Phase 21 → Task 5; verification incl. widths and themes → Task 6. Every spec section maps to a task.
- No placeholders: every step carries exact code or exact commands.
- Type/name consistency across tasks: `StatusFilter`, `SortKey`, `Filters`, `DEFAULT_FILTERS`, `applyFilters`, `countByStatus`, `FilterBar`, `visibleItems`, `exemptIds`, `changeFilters`, and the CSS class names `.filter-bar` `.filter-tabs` `.tab-count` `.filter-controls` `.filter-search` `.filter-field` `.filter-label` `.filter-count` are spelled identically wherever they appear.
- Ordering check: Task 2's types are imported by Task 3's component and Task 4's wiring; Task 3's component is rendered only in Task 4, so no task leaves a half-wired UI; Task 5's docs run after the behaviour exists; Task 6 verifies before the docs claim completion (Phase 21 checkboxes are written in Task 5 but the branch is verified in Task 6 — if Task 6 finds a defect, its fix lands before the branch is offered for merge).
