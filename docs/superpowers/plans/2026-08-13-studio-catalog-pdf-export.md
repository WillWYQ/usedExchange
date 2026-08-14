# Studio Catalog PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Seller Studio action that generates a single combined PDF catalog (cover page, table of contents, per-category sections, one page per public-visible item) and downloads it in the browser.

**Architecture:** A standalone print-optimized HTML template (`scripts/lib/pdfCatalog/template.ts`) is rendered to PDF bytes by headless Chromium via Playwright (`scripts/lib/pdfCatalog/generate.ts`), written to a temp file, and streamed back through a new `POST /api/export-pdf` Studio route using the existing `FileResponse` file-streaming plumbing. The Studio SPA gets a new header button + dialog (`ExportPdfDialog.tsx`) that calls the endpoint and downloads the returned `Blob`.

**Tech Stack:** TypeScript, Playwright (`chromium`), Vitest, React (Studio SPA), Node `fs/promises`/`os`/`path`.

**Spec:** `docs/superpowers/specs/2026-08-13-studio-catalog-pdf-export-design.md`

## Global Constraints

- Never write anywhere except `os.tmpdir()` for the generated PDF — no writes to `content/`, `exports/`, or any git-tracked path (spec §2, §7).
- The item-rendering template must never read `item.reserved_for` — its input type has no field for it, so this is structural, not conventional (spec §3, §7; project Iron Rule 4).
- Only `status` in `{available, pending, reserved}` items are eligible (spec §3).
- Price display goes through `resolveItemPrice` from `lib/utils/pricing.ts`, called with `{ source: "fallback" }` (no buyer geolocation exists for a static PDF) — same function the live item page uses for its server-rendered initial price (`app/[category]/[item]/page.tsx:135`).
- No external network font/CSS requests during generation — system font stack only (spec §6).
- New Studio API routes must go through the existing `checkStudioCsrf` guard (already applied to every non-GET/HEAD request in `studio/vite.config.ts`) — the client must send `content-type: application/json`.
- Category order in the PDF follows `loadCategories()`'s existing sort order (already `sort_order` ascending, then alphabetical) — do not re-sort categories.
- Bilingual doc sync (project Iron Rule 2): any doc update touches both the English file and its `_zh` counterpart in the same commit.

---

### Task 1: Print template (`scripts/lib/pdfCatalog/template.ts`)

**Files:**
- Create: `scripts/lib/pdfCatalog/template.ts`
- Test: `scripts/lib/pdfCatalog/template.test.ts`

**Interfaces:**
- Consumes: `Condition`, `Price`, `PriceTier`, `Dimensions`, `Weight` from `../../../lib/content/types`; `resolveItemPrice` from `../../../lib/utils/pricing`.
- Produces (used by Task 2's `generate.ts`):
  - `type ItemPdfView` — narrowed item shape with no `reserved_for` field.
  - `type CategoryGroup = { slug: string; displayName: string; description: string; items: ItemPdfView[] }`
  - `type SiteBranding = { name: string; tagline: string; logo: string; baseUrl: string }`
  - `function buildFullCatalogHtml(branding: SiteBranding, groups: CategoryGroup[], generatedAt: string): string`
  - `function escapeHtml(value: string): string` (re-exported for Task 2's footer template)

- [ ] **Step 1: Write the failing tests for price rendering**

```ts
// scripts/lib/pdfCatalog/template.test.ts
import { describe, expect, it } from "vitest";
import {
  buildCoverHtml,
  buildTocHtml,
  buildCategorySectionHtml,
  buildItemHtml,
  buildFullCatalogHtml,
  buildPriceHtml,
  type ItemPdfView,
  type CategoryGroup,
  type SiteBranding,
} from "./template";

function makeItem(overrides: Partial<ItemPdfView> = {}): ItemPdfView {
  return {
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    nameZh: "",
    description: "A bright desk lamp.",
    condition: "good",
    status: "available",
    price: { currency: "USD", tiers: [{ label: "Pickup", amount: 20 }], negotiable: false, show_tiers: false },
    brand: "IKEA",
    model: "",
    ageYears: 2,
    dimensions: null,
    weight: null,
    color: "black",
    tags: ["lighting"],
    images: ["https://cdn.example.com/lamp-1.jpg"],
    coverImage: "https://cdn.example.com/lamp-1.jpg",
    ...overrides,
  };
}

describe("buildPriceHtml", () => {
  it("shows a single resolved amount when show_tiers is false", () => {
    const html = buildPriceHtml({
      currency: "USD",
      tiers: [{ label: "Pickup", amount: 20 }],
      negotiable: false,
      show_tiers: false,
    });
    expect(html).toContain("$20");
    expect(html).not.toContain("tier-table");
  });

  it("shows the full tier table when show_tiers is true with multiple tiers", () => {
    const html = buildPriceHtml({
      currency: "USD",
      tiers: [
        { label: "Pickup", amount: 20, miles_max: 10 },
        { label: "Shipping", amount: 35 },
      ],
      negotiable: false,
      show_tiers: true,
    });
    expect(html).toContain("tier-table");
    expect(html).toContain("Pickup");
    expect(html).toContain("Shipping");
    // Shipping has no miles_max (open-ended), so resolveItemPrice's fallback
    // path picks it over Pickup — that row gets the "tier-default" class.
    expect(html).toMatch(/tier-default[^]*Shipping|Shipping[^]*tier-default/);
  });

  it("shows Contact for price when there are no tiers", () => {
    const html = buildPriceHtml({ currency: "USD", tiers: [], negotiable: false, show_tiers: false });
    expect(html).toContain("Contact for price");
  });
});

describe("buildItemHtml", () => {
  it("includes the item name, anchor id, and live link", () => {
    const html = buildItemHtml(makeItem(), "https://example.com");
    expect(html).toContain('id="item-electronics-desk-lamp"');
    expect(html).toContain("Desk Lamp");
    expect(html).toContain("https://example.com/electronics/desk-lamp");
  });

  it("never renders a reserved_for value even if smuggled onto the object", () => {
    const poisoned = { ...makeItem(), reserved_for: "Jane Buyer" } as unknown as ItemPdfView;
    const html = buildItemHtml(poisoned, "https://example.com");
    expect(html).not.toContain("Jane Buyer");
  });

  it("omits the image grid when there are no images", () => {
    const html = buildItemHtml(makeItem({ images: [], coverImage: null }), "https://example.com");
    expect(html).not.toContain("item-images");
  });
});

describe("buildTocHtml", () => {
  it("links each entry to its matching item anchor", () => {
    const groups: CategoryGroup[] = [
      {
        slug: "electronics",
        displayName: "Electronics",
        description: "",
        items: [makeItem()],
      },
    ];
    const toc = buildTocHtml(groups);
    expect(toc).toContain('href="#item-electronics-desk-lamp"');
  });
});

describe("buildCoverHtml", () => {
  it("shows item and category counts and the site name", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "Quality stuff.", logo: "", baseUrl: "https://example.com" };
    const html = buildCoverHtml(branding, 12, 3, "2026-08-13");
    expect(html).toContain("UsedExchange");
    expect(html).toContain("12");
    expect(html).toContain("3");
    expect(html).toContain("2026-08-13");
  });
});

describe("buildFullCatalogHtml", () => {
  it("assembles cover, toc, category divider, and item sections in order", () => {
    const branding: SiteBranding = { name: "UsedExchange", tagline: "", logo: "", baseUrl: "https://example.com" };
    const groups: CategoryGroup[] = [
      { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
    ];
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13");
    const coverIdx = html.indexOf("Full Listing Catalog");
    const tocIdx = html.indexOf("Table of Contents");
    const dividerIdx = html.indexOf('class="category-divider"');
    const itemIdx = html.indexOf('id="item-electronics-desk-lamp"');
    expect(coverIdx).toBeGreaterThanOrEqual(0);
    expect(coverIdx).toBeLessThan(tocIdx);
    expect(tocIdx).toBeLessThan(dividerIdx);
    expect(dividerIdx).toBeLessThan(itemIdx);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: FAIL — `Cannot find module './template'` (file does not exist yet).

- [ ] **Step 3: Implement `template.ts`**

```ts
// scripts/lib/pdfCatalog/template.ts
import type { Condition, Price, Status } from "../../../lib/content/types";
import { resolveItemPrice } from "../../../lib/utils/pricing";

export type ItemPdfView = {
  categorySlug: string;
  itemSlug: string;
  name: string;
  nameZh: string;
  description: string;
  condition: Condition;
  status: Status;
  price: Price;
  brand: string;
  model: string;
  ageYears: number | null;
  dimensions: { length: number; width: number; height: number; unit: "cm" | "in" } | null;
  weight: { value: number; unit: "kg" | "lb" } | null;
  color: string;
  tags: string[];
  images: string[];
  coverImage: string | null;
};

export type CategoryGroup = {
  slug: string;
  displayName: string;
  description: string;
  items: ItemPdfView[];
};

export type SiteBranding = {
  name: string;
  tagline: string;
  /** Already an absolute URL (or "" for none) — callers resolve it against baseUrl before passing it in. */
  logo: string;
  baseUrl: string;
};

const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  "like-new": "Like New",
  good: "Good",
  fair: "Fair",
  "for-parts": "For Parts",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(currency: string, amount: number): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

export function buildPriceHtml(price: Price): string {
  if (price.tiers.length === 0) {
    return `<p class="price price-contact">Contact for price</p>`;
  }
  const resolved = resolveItemPrice(price, { source: "fallback" });
  const negotiable = price.negotiable ? `<span class="price-obo">OBO</span>` : "";

  if (!price.show_tiers || price.tiers.length === 1) {
    if (resolved === null) {
      return `<p class="price price-contact">Contact for price</p>`;
    }
    const label = resolved.label
      ? `<span class="price-label">(${escapeHtml(resolved.label)})</span>`
      : "";
    return `<p class="price"><span class="price-amount">${formatAmount(price.currency, resolved.amount)}</span>${negotiable}${label}</p>`;
  }

  const rows = price.tiers
    .map((t) => {
      const isResolved = resolved !== null && t.label === resolved.label && t.amount === resolved.amount;
      const range =
        t.miles_max === undefined ? `${t.miles_min ?? 0}+ mi` : `${t.miles_min ?? 0}–${t.miles_max} mi`;
      return `<tr class="${isResolved ? "tier-default" : ""}"><td>${escapeHtml(t.label)}</td><td>${range}</td><td>${formatAmount(price.currency, t.amount)}</td></tr>`;
    })
    .join("");
  return `<div class="price">${negotiable}<table class="tier-table"><thead><tr><th>Option</th><th>Distance</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildSpecsHtml(item: ItemPdfView): string {
  const rows: Array<[string, string]> = [];
  if (item.brand) rows.push(["Brand", item.brand]);
  if (item.model) rows.push(["Model", item.model]);
  if (item.color) rows.push(["Color", item.color]);
  if (item.ageYears !== null) rows.push(["Age", `${item.ageYears} yr${item.ageYears === 1 ? "" : "s"}`]);
  if (item.dimensions) {
    const d = item.dimensions;
    rows.push(["Dimensions", `${d.length} × ${d.width} × ${d.height} ${d.unit}`]);
  }
  if (item.weight) {
    rows.push(["Weight", `${item.weight.value} ${item.weight.unit}`]);
  }
  rows.push(["Condition", CONDITION_LABELS[item.condition]]);
  const trs = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return `<table class="specs">${trs}</table>`;
}

export function buildCoverHtml(
  branding: SiteBranding,
  itemCount: number,
  categoryCount: number,
  generatedAt: string,
): string {
  const logoHtml = branding.logo
    ? `<img class="cover-logo" src="${escapeHtml(branding.logo)}" alt="" onerror="this.remove()" />`
    : "";
  return `
    <section class="cover">
      ${logoHtml}
      <h1>${escapeHtml(branding.name)}</h1>
      <p class="cover-tagline">${escapeHtml(branding.tagline)}</p>
      <p class="cover-heading">Full Listing Catalog</p>
      <p class="cover-meta">${itemCount} items across ${categoryCount} categories</p>
      <p class="cover-meta">Generated ${escapeHtml(generatedAt)}</p>
    </section>`;
}

export function buildTocHtml(groups: CategoryGroup[]): string {
  const sections = groups
    .map((group) => {
      const items = group.items
        .map(
          (item) =>
            `<li><a href="#item-${escapeHtml(item.categorySlug)}-${escapeHtml(item.itemSlug)}">${escapeHtml(item.name)}</a></li>`,
        )
        .join("");
      return `<div class="toc-group"><h3>${escapeHtml(group.displayName)}</h3><ul>${items}</ul></div>`;
    })
    .join("");
  return `<section class="toc"><h1>Table of Contents</h1>${sections}</section>`;
}

export function buildCategorySectionHtml(group: CategoryGroup): string {
  const description = group.description
    ? `<p class="category-description">${escapeHtml(group.description)}</p>`
    : "";
  return `
    <section class="category-divider">
      <h1>${escapeHtml(group.displayName)}</h1>
      ${description}
    </section>`;
}

export function buildItemHtml(item: ItemPdfView, baseUrl: string): string {
  const anchor = `item-${item.categorySlug}-${item.itemSlug}`;
  const liveUrl = `${baseUrl}/${item.categorySlug}/${item.itemSlug}`;
  const images = [item.coverImage, ...item.images.filter((src) => src !== item.coverImage)]
    .filter((src): src is string => src !== null)
    .slice(0, 4);
  const imageGrid =
    images.length === 0
      ? ""
      : `<div class="item-images">${images
          .map((src) => `<img src="${escapeHtml(src)}" loading="lazy" alt="" onerror="this.remove()" />`)
          .join("")}</div>`;
  const statusBadge =
    item.status === "available" ? "" : `<span class="status-badge status-${item.status}">${item.status}</span>`;
  const tagsHtml =
    item.tags.length === 0
      ? ""
      : `<p class="item-tags">${item.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</p>`;

  return `
    <section class="item-page" id="${escapeHtml(anchor)}">
      <h2 class="item-title">${escapeHtml(item.name)} ${statusBadge}</h2>
      ${imageGrid}
      ${buildPriceHtml(item.price)}
      <p class="item-description">${escapeHtml(item.description)}</p>
      ${buildSpecsHtml(item)}
      ${tagsHtml}
      <p class="item-link">
        <a class="live-link" href="${escapeHtml(liveUrl)}">View Live Listing ↗</a>
        <br /><span class="live-url-text">${escapeHtml(liveUrl)}</span>
      </p>
    </section>`;
}

const CATALOG_CSS = `
:root { --ink: #2b2621; --paper: #faf6ef; --accent: #b5651d; --muted: #8a7f6f; --line: #ddd3c2; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: var(--ink); background: var(--paper); }
h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; margin: 0 0 0.3em; }
.cover { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
.cover-logo { max-height: 64px; margin-bottom: 16px; }
.cover h1 { font-size: 42px; }
.cover-tagline { color: var(--muted); font-size: 16px; }
.cover-heading { font-size: 22px; margin-top: 40px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.cover-meta { color: var(--muted); font-size: 13px; }
.toc { page-break-after: always; padding: 24px 8px; }
.toc h1 { font-size: 26px; border-bottom: 2px solid var(--accent); padding-bottom: 8px; }
.toc-group h3 { color: var(--accent); margin-top: 20px; font-size: 16px; }
.toc-group ul { list-style: none; margin: 4px 0; padding: 0; }
.toc-group li { padding: 2px 0; }
.toc-group a { color: var(--ink); text-decoration: none; }
.category-divider { page-break-before: always; padding: 60px 8px 24px; border-bottom: 1px solid var(--line); }
.category-divider h1 { font-size: 30px; color: var(--accent); }
.category-description { color: var(--muted); }
.item-page { page-break-before: always; padding: 24px 8px; }
.item-title { font-size: 24px; display: flex; align-items: center; gap: 10px; }
.status-badge { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 10px; background: var(--line); color: var(--ink); }
.item-images { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
.item-images img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); }
.price { margin: 12px 0; }
.price-amount { font-size: 26px; font-weight: bold; }
.price-obo, .price-label { font-size: 13px; color: var(--muted); margin-left: 6px; }
.price-contact { color: var(--muted); font-style: italic; }
.tier-table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 13px; }
.tier-table th, .tier-table td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; }
.tier-table tr.tier-default { background: #f1e6d3; font-weight: bold; }
.item-description { line-height: 1.5; white-space: pre-wrap; }
.specs { border-collapse: collapse; margin: 12px 0; font-size: 13px; }
.specs th { text-align: left; color: var(--muted); padding: 3px 12px 3px 0; font-weight: normal; }
.specs td { padding: 3px 0; }
.item-tags { margin: 8px 0; }
.tag { display: inline-block; background: var(--line); border-radius: 10px; padding: 2px 10px; font-size: 11px; margin: 0 4px 4px 0; }
.item-link { margin-top: 16px; }
.live-link { color: var(--accent); font-weight: bold; text-decoration: none; }
.live-url-text { color: var(--muted); font-size: 11px; }
`;

export function buildFullCatalogHtml(branding: SiteBranding, groups: CategoryGroup[], generatedAt: string): string {
  const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  const body = [
    buildCoverHtml(branding, itemCount, groups.length, generatedAt),
    buildTocHtml(groups),
    ...groups.flatMap((group) => [
      buildCategorySectionHtml(group),
      ...group.items.map((item) => buildItemHtml(item, branding.baseUrl)),
    ]),
  ].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${CATALOG_CSS}</style></head><body>${body}</body></html>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: PASS (all `describe` blocks green).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pdfCatalog/template.ts scripts/lib/pdfCatalog/template.test.ts
git commit -m "feat(studio): add print template for catalog PDF export"
```

---

### Task 2: PDF generation (`scripts/lib/pdfCatalog/generate.ts`)

**Files:**
- Create: `scripts/lib/pdfCatalog/generate.ts`
- Test: `scripts/lib/pdfCatalog/generate.test.ts`
- Modify: `package.json` (add `playwright` devDependency)

**Interfaces:**
- Consumes: `buildFullCatalogHtml`, `escapeHtml`, `type CategoryGroup`, `type ItemPdfView`, `type SiteBranding` from `./template` (Task 1); `loadAllItemsRaw`, `loadCategories` from `../../../lib/content/loader`; `type Item`, `type Category` from `../../../lib/content/types`; `siteConfig` from `../../../content/config`.
- Produces (used by Task 3):
  - `function groupEligibleItems(items: Item[], categories: Category[]): CategoryGroup[]`
  - `function generateCatalogPdf(): Promise<{ file: string } | { error: string }>`

- [ ] **Step 1: Install the `playwright` devDependency**

```bash
pnpm add -D playwright
npx playwright install chromium
```

- [ ] **Step 2: Write the failing tests for the pure grouping logic**

```ts
// scripts/lib/pdfCatalog/generate.test.ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: FAIL — `Cannot find module './generate'`.

- [ ] **Step 4: Implement `generate.ts`**

```ts
// scripts/lib/pdfCatalog/generate.ts
import fs from "fs/promises";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import { loadAllItemsRaw, loadCategories } from "../../../lib/content/loader";
import type { Category, Item } from "../../../lib/content/types";
import { siteConfig } from "../../../content/config";
import { buildFullCatalogHtml, escapeHtml, type CategoryGroup, type ItemPdfView } from "./template";

const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

function toItemPdfView(item: Item): ItemPdfView {
  return {
    categorySlug: item.categorySlug,
    itemSlug: item.itemSlug,
    name: item.name,
    nameZh: item.nameZh,
    description: item.description,
    condition: item.condition,
    status: item.status,
    price: item.price,
    brand: item.brand,
    model: item.model,
    ageYears: item.ageYears,
    dimensions: item.dimensions,
    weight: item.weight,
    color: item.color,
    tags: item.tags,
    images: item.images,
    coverImage: item.coverImage,
  };
}

// Exported for unit testing without touching Playwright/Chromium at all.
export function groupEligibleItems(items: Item[], categories: Category[]): CategoryGroup[] {
  const eligible = items.filter((i) => EXPORTABLE_STATUSES.has(i.status));

  const byCategory = new Map<string, Item[]>();
  for (const item of eligible) {
    const list = byCategory.get(item.categorySlug) ?? [];
    list.push(item);
    byCategory.set(item.categorySlug, list);
  }

  // categories is already in display order (sort_order asc, then alpha —
  // see lib/content/loader.ts); .filter() below preserves that order.
  return categories
    .filter((c) => byCategory.has(c.slug))
    .map((c) => {
      const catItems = [...(byCategory.get(c.slug) ?? [])].sort((a, b) => {
        if (a.listedDate !== b.listedDate) return b.listedDate.localeCompare(a.listedDate);
        return a.name.localeCompare(b.name);
      });
      return {
        slug: c.slug,
        displayName: c.displayName,
        description: c.description,
        items: catItems.map(toItemPdfView),
      };
    });
}

export async function generateCatalogPdf(): Promise<{ file: string } | { error: string }> {
  const [items, categories] = await Promise.all([loadAllItemsRaw(), loadCategories()]);
  const groups = groupEligibleItems(items, categories);
  if (groups.length === 0) {
    return { error: "No public-visible items to export." };
  }

  // Logo is a public/ path (e.g. "/logo.svg") the live site serves at its own
  // origin — page.setContent() has no origin of its own, so it must be made
  // absolute here or the <img> in the cover page would 404 silently.
  const logo = siteConfig.logo ? `${siteConfig.baseUrl}${siteConfig.logo}` : "";
  const html = buildFullCatalogHtml(
    { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl },
    groups,
    new Date().toISOString().slice(0, 10),
  );

  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    const file = path.join(os.tmpdir(), `usedexchange-catalog-${Date.now()}.pdf`);
    await fs.writeFile(file, pdfBytes);
    return { file };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: PASS. If Chromium isn't installed locally, the second `generateCatalogPdf` test prints the "Skipping" warning and passes trivially — that is expected, not a failure.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/pdfCatalog/generate.ts scripts/lib/pdfCatalog/generate.test.ts package.json pnpm-lock.yaml
git commit -m "feat(studio): generate catalog PDFs via headless Chromium"
```

---

### Task 3: Studio API route (`POST /api/export-pdf`)

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `generateCatalogPdf` from `./pdfCatalog/generate` (Task 2); existing `StudioResponse`, `StudioRequest`, `isFileResponse` from the same file.
- Produces (used by Task 4): `POST /api/export-pdf` — `200` `FileResponse` with `contentType: "application/pdf"` on success; `400` `JsonResponse` `{ error: string }` when there are no eligible items or Chromium isn't installed.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/studioApi.test.ts` (near the other route `describe` blocks; it already imports `* as loaderModule from "@/lib/content/loader"` and `isFileResponse`/`asJson`):

```ts
describe("POST /api/export-pdf", () => {
  it("returns 400 with a clear message when there are no eligible items", async () => {
    // Each spy is captured and explicitly restored in `finally` — this file has
    // no global afterEach mock reset, so a leaked mock would leak into whichever
    // test runs next (see the existing loadAllItemsRaw spies above for the pattern).
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([]);

    try {
      const res = await handleStudioRequest({
        method: "POST",
        url: "/api/export-pdf",
        body: Buffer.from("{}"),
        projectRoot: PROJECT_ROOT,
      });

      expect(res.status).toBe(400);
      expect(asJson(res).body).toEqual({ error: "No public-visible items to export." });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });

  it("returns a PDF file response for the real local catalog", async () => {
    const { chromium } = await import("playwright");
    let chromiumAvailable = true;
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

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/export-pdf",
      body: Buffer.from("{}"),
      projectRoot: PROJECT_ROOT,
    });

    expect(res.status).toBe(200);
    expect(isFileResponse(res)).toBe(true);
    if (isFileResponse(res)) {
      expect(res.contentType).toBe("application/pdf");
      expect(res.file.endsWith(".pdf")).toBe(true);
    }
  });

  it("rejects non-POST methods", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/export-pdf",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "export-pdf"`
Expected: FAIL — `no route for /api/export-pdf` (404), not the expected statuses.

- [ ] **Step 3: Add the route**

In `scripts/lib/studioApi.ts`, add the import near the other local imports (after `import { buildReadinessReport } from "./siteReadiness";`):

```ts
import { generateCatalogPdf } from "./pdfCatalog/generate";
```

Add a handler function near the other `handleXxx` functions (e.g. next to `handlePublish`):

```ts
async function handleExportPdf(): Promise<StudioResponse> {
  const result = await generateCatalogPdf();
  if ("error" in result) {
    return { status: 400, body: { error: result.error } };
  }
  return { status: 200, file: result.file, contentType: "application/pdf" };
}
```

Add the route branch in `handleStudioRequest`, right after the `/api/publish` block:

```ts
    if (pathname === "/api/export-pdf") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handleExportPdf();
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "export-pdf"`
Expected: PASS (the "real local catalog" test may print the Chromium-skip warning and pass trivially, same as Task 2).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat(studio): add POST /api/export-pdf route"
```

---

### Task 4: Studio API client (`studio/src/api.ts`)

**Files:**
- Modify: `studio/src/api.ts`
- Modify: `studio/src/api.test.ts`

**Interfaces:**
- Consumes: the `POST /api/export-pdf` contract from Task 3 (200 → PDF bytes, non-2xx → `{ error: string }` JSON).
- Produces (used by Task 5): `function exportCatalogPdf(): Promise<Blob>`

- [ ] **Step 1: Write the failing tests**

Add to `studio/src/api.test.ts`:

```ts
import { exportCatalogPdf } from "./api";

describe("exportCatalogPdf", () => {
  it("returns the response body as a Blob on success", async () => {
    const fakeBlob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        blob: async () => fakeBlob,
      })) as unknown as typeof fetch,
    );
    const result = await exportCatalogPdf();
    expect(result).toBe(fakeBlob);
    vi.unstubAllGlobals();
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "No public-visible items to export." }),
      })) as unknown as typeof fetch,
    );
    await expect(exportCatalogPdf()).rejects.toThrow("No public-visible items to export.");
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run studio/src/api.test.ts -t "exportCatalogPdf"`
Expected: FAIL — `exportCatalogPdf is not a function` / import error.

- [ ] **Step 3: Add `exportCatalogPdf` to `studio/src/api.ts`**

Add near `publish()`:

```ts
export async function exportCatalogPdf(): Promise<Blob> {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `PDF export failed with ${res.status} ${res.statusText}`));
  }
  return res.blob();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run studio/src/api.test.ts -t "exportCatalogPdf"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add studio/src/api.ts studio/src/api.test.ts
git commit -m "feat(studio): add exportCatalogPdf client function"
```

---

### Task 5: Export dialog + header wiring

**Files:**
- Create: `studio/src/panes/ExportPdfDialog.tsx`
- Create: `studio/src/panes/ExportPdfDialog.test.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`
- Modify: `studio/src/App.tsx`

**Interfaces:**
- Consumes: `exportCatalogPdf` from `../api` (Task 4); `Button` from `../components/Button`; `useDialogBehavior` from `../components/useDialogBehavior`; `useStudioT` from `../i18n/StudioI18n`; `StudioItem` (already imported in `App.tsx`).
- Produces: `<ExportPdfDialog items={items} onClose={() => void} />` React component, wired into `App.tsx` behind a new header button.

- [ ] **Step 1: Add i18n keys**

In `studio/src/i18n/strings.en.ts`, add to the "Header buttons" section:

```ts
  "header.exportPdf": "Export PDF",
```

Add a new section (after the header buttons block):

```ts
  // ── Export PDF dialog ────────────────────────────────────────────
  "exportPdf.title": "Export catalog PDF",
  "exportPdf.summary": "{itemCount} items across {categoryCount} categories will be included.",
  "exportPdf.summaryEmpty": "No public-visible items to export yet.",
  "exportPdf.generate": "Generate & Download",
  "exportPdf.generating": "Generating…",
  "exportPdf.done": "Downloaded {filename}",
  "exportPdf.close": "Close",
```

In `studio/src/i18n/strings.zh.ts`, add the matching keys to the `ZH` object:

```ts
  "header.exportPdf": "导出 PDF",

  "exportPdf.title": "导出目录 PDF",
  "exportPdf.summary": "共 {itemCount} 件商品、{categoryCount} 个分类将被包含。",
  "exportPdf.summaryEmpty": "目前没有可导出的公开商品。",
  "exportPdf.generate": "生成并下载",
  "exportPdf.generating": "正在生成…",
  "exportPdf.done": "已下载 {filename}",
  "exportPdf.close": "关闭",
```

- [ ] **Step 2: Write the failing component test**

```tsx
// studio/src/panes/ExportPdfDialog.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { ExportPdfDialog } from "./ExportPdfDialog";
import type { StudioItem } from "../api";
import * as api from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeItem(overrides: Partial<StudioItem> = {}): StudioItem {
  return {
    id: "electronics/desk-lamp",
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    status: "available",
    currency: "USD",
    lowestTierAmount: 20,
    imageCount: 1,
    coverImage: null,
    localizedNames: { en: "Desk Lamp" },
    tags: [],
    listedDate: "2026-01-01",
    ...overrides,
  };
}

// The dialog resolves its copy through useStudioT, so it must mount inside a
// StudioI18nProvider — same pattern DefaultsPane.test.tsx uses.
function renderDialog(items: StudioItem[], onClose = vi.fn()) {
  return renderWithStudioI18n(<ExportPdfDialog items={items} onClose={onClose} />);
}

describe("ExportPdfDialog", () => {
  it("shows the eligible item and category count", () => {
    renderDialog([
      makeItem({ id: "a", categorySlug: "electronics", status: "available" }),
      makeItem({ id: "b", categorySlug: "books", status: "sold" }),
    ]);
    expect(screen.getByText(/1 items across 1 categories/)).toBeInTheDocument();
  });

  it("disables the generate button while busy and re-enables after success", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    vi.spyOn(api, "exportCatalogPdf").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(blob), 10)),
    );
    // jsdom has no real download machinery; createObjectURL/revokeObjectURL are stubbed
    // so the click-triggered download path does not throw.
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });

    renderDialog([makeItem()]);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: /Generate & Download/ });
    await user.click(button);
    expect(button).toBeDisabled();
    await screen.findByText(/Downloaded/);
  });

  it("shows the server's error message on failure", async () => {
    vi.spyOn(api, "exportCatalogPdf").mockRejectedValue(new Error("No public-visible items to export."));
    renderDialog([makeItem()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Generate & Download/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No public-visible items to export.");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run studio/src/panes/ExportPdfDialog.test.tsx`
Expected: FAIL — `Cannot find module './ExportPdfDialog'`.

- [ ] **Step 4: Implement `ExportPdfDialog.tsx`**

```tsx
// studio/src/panes/ExportPdfDialog.tsx
import { useState } from "react";
import { exportCatalogPdf, type StudioItem } from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

export function ExportPdfDialog({ items, onClose }: { items: StudioItem[]; onClose: () => void }) {
  const { t } = useStudioT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);

  const dialogRef = useDialogBehavior(onClose);

  const eligible = items.filter((i) => EXPORTABLE_STATUSES.has(i.status));
  const categoryCount = new Set(eligible.map((i) => i.categorySlug)).size;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportCatalogPdf();
      const filename = `usedexchange-catalog-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadedFilename(filename);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("exportPdf.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t("exportPdf.title")}</h2>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        <p>
          {eligible.length === 0
            ? t("exportPdf.summaryEmpty")
            : t("exportPdf.summary", { itemCount: eligible.length, categoryCount })}
        </p>
        {downloadedFilename !== null && <p>{t("exportPdf.done", { filename: downloadedFilename })}</p>}
        <div className="dialog-actions">
          <Button
            variant="primary"
            disabled={busy || eligible.length === 0}
            onClick={() => void generate()}
          >
            {busy ? t("exportPdf.generating") : t("exportPdf.generate")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("exportPdf.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run studio/src/panes/ExportPdfDialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the header button into `App.tsx`**

Add state alongside the other dialog flags (near `const [showConfig, setShowConfig] = useState(false);`):

```ts
  const [showExportPdf, setShowExportPdf] = useState(false);
```

Add the import at the top with the other pane imports:

```ts
import { ExportPdfDialog } from "./panes/ExportPdfDialog";
```

Add the header button, alongside the other header actions (before the primary "New item" button):

```tsx
          <Button onClick={() => setShowExportPdf(true)}>
            {t("header.exportPdf")}
          </Button>
```

Add the dialog render, alongside the other conditional dialogs (near `{showConfig && <ConfigPane onClose={() => setShowConfig(false)} />}`):

```tsx
      {showExportPdf && <ExportPdfDialog items={items} onClose={() => setShowExportPdf(false)} />}
```

- [ ] **Step 7: Manual check**

Run: `pnpm studio`
Open the local Studio URL, click "Export PDF" in the header, confirm the dialog shows the correct eligible item/category count, click "Generate & Download", confirm a PDF downloads and opens with a cover page, table of contents, category sections, and item pages whose "View Live Listing" links work.

- [ ] **Step 8: Commit**

```bash
git add studio/src/panes/ExportPdfDialog.tsx studio/src/panes/ExportPdfDialog.test.tsx studio/src/i18n/strings.en.ts studio/src/i18n/strings.zh.ts studio/src/App.tsx
git commit -m "feat(studio): add Export PDF dialog and header button"
```

---

### Task 6: Documentation (EN + `_zh`)

**Files:**
- Modify: `docs/DESIGN.md`, `docs/DESIGN_zh.md`
- Modify: `docs/CURRENT_FUNCTIONALITY.md`, `docs/CURRENT_FUNCTIONALITY_zh.md`
- Modify: `docs/TECH_REQUIREMENTS.md`, `docs/TECH_REQUIREMENTS_zh.md`
- Modify: `docs/SCRIPTS.md`, `docs/SCRIPTS_zh.md`

**Interfaces:**
- Consumes: nothing (pure documentation, describing Tasks 1–5's shipped behavior).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: `docs/DESIGN.md` §22 (Seller Studio) — add a "Catalog PDF export" subsection**

Add after the existing Seller Studio feature list in §22:

```markdown
#### Catalog PDF export

The header's **Export PDF** button opens a dialog that generates a single combined PDF catalog of every public-visible item (`available`/`pending`/`reserved`; `sold`/`draft` excluded): a cover page, a clickable table of contents grouped by category, a divider per category, and one page per item with its resolved price, photos, specs, and a link back to its live page. Rendered via headless Chromium (Playwright) from a standalone print template — no `next dev` server required. Table-of-contents entries are clickable in-PDF jump links; they do not show literal page numbers next to each title (Chromium's print-to-PDF does not support CSS `target-counter()`), though every page's footer does show a real "Page N of M". Requires a one-time `npx playwright install chromium`.
```

- [ ] **Step 2: `docs/DESIGN_zh.md` §22 — mirror the addition**

Add the corresponding Chinese subsection at the same location:

```markdown
#### 目录 PDF 导出

顶部的 **导出 PDF** 按钮会打开一个对话框，生成一份合并的 PDF 目录，涵盖所有公开可见的商品（`available`/`pending`/`reserved`；不含 `sold`/`draft`）：封面页、按分类分组的可点击目录、每个分类的分隔页，以及每件商品单独一页（含已解析价格、照片、规格，以及指向该商品在线页面的链接）。通过 Headless Chromium（Playwright）基于独立的打印模板渲染，无需运行 `next dev` 服务器。目录中的条目是可点击的 PDF 内部跳转链接，条目旁不会显示具体页码（Chromium 的打印为 PDF 功能不支持 CSS 的 `target-counter()`），但每页页脚都会显示真实的"第 N 页，共 M 页"。首次使用需要执行一次 `npx playwright install chromium`。
```

- [ ] **Step 3: `docs/CURRENT_FUNCTIONALITY.md` — add to the feature list**

Add a bullet in the Seller Studio feature list:

```markdown
- **Catalog PDF export** — generate and download a single combined PDF catalog of all public-visible items (cover page, table of contents, per-category sections, one page per item with a live link) directly from Studio.
```

- [ ] **Step 4: `docs/CURRENT_FUNCTIONALITY_zh.md` — mirror the addition**

```markdown
- **目录 PDF 导出** —— 直接在 Studio 中生成并下载一份合并的 PDF 目录，涵盖所有公开可见商品（封面页、目录、按分类分节、每件商品一页并附带在线链接）。
```

- [ ] **Step 5: `docs/TECH_REQUIREMENTS.md` §30 — add the endpoint row**

Add a row to the existing Studio endpoint table (same table that lists `POST /api/items/bulk-status`):

```markdown
| `POST /api/export-pdf` | Generates the combined catalog PDF via headless Chromium and streams it back as `application/pdf`; `400` with `{ error }` when there are no eligible items or Chromium isn't installed. |
```

- [ ] **Step 6: `docs/TECH_REQUIREMENTS_zh.md` §30 — mirror the addition**

```markdown
| `POST /api/export-pdf` | 通过 headless Chromium 生成合并目录 PDF 并以 `application/pdf` 形式返回；当没有可导出商品或未安装 Chromium 时返回 `400` 及 `{ error }`。 |
```

- [ ] **Step 7: `docs/SCRIPTS.md` — note the one-time Playwright setup step**

Add a short note near the Studio section:

```markdown
> **Catalog PDF export** (Seller Studio's "Export PDF" button) renders via headless Chromium. One-time setup: `npx playwright install chromium`.
```

- [ ] **Step 8: `docs/SCRIPTS_zh.md` — mirror the addition**

```markdown
> **目录 PDF 导出**（Seller Studio 中的"导出 PDF"按钮）通过 headless Chromium 渲染。首次使用需要执行一次：`npx playwright install chromium`。
```

- [ ] **Step 9: Commit**

```bash
git add docs/DESIGN.md docs/DESIGN_zh.md docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md docs/TECH_REQUIREMENTS.md docs/TECH_REQUIREMENTS_zh.md docs/SCRIPTS.md docs/SCRIPTS_zh.md
git commit -m "docs: document catalog PDF export (EN + zh)"
```
