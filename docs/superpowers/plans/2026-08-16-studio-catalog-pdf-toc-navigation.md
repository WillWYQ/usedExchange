# Studio Catalog PDF: Real TOC Page Numbers, Full-Page Dividers, Back-to-TOC Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Seller Studio catalog PDF export real TOC page numbers (item rows and category rows), a full-page category divider matching the cover page's visual weight, and a "back to Table of Contents" link on every item page and category divider.

**Architecture:** `generateCatalogPdf` becomes a two-pass render sharing one Chromium instance: pass 1 renders the catalog with empty (but width-reserved) TOC page-number slots and is discarded; a new `resolveAnchorPageNumbers()` (`pdf-lib`) reads the real page each HTML anchor landed on from pass-1's PDF `/Dests` dictionary; pass 2 re-renders with those numbers baked into the TOC and is the file the seller downloads. Category dividers get `id`s and a `.cover`-style full-height CSS treatment; item pages and dividers get a back-to-TOC link.

**Tech Stack:** TypeScript, Playwright (headless Chromium), `pdf-lib` (new devDependency), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-studio-catalog-pdf-toc-navigation-design.md`

## Global Constraints

- `pdf-lib` must be imported **dynamically**, never statically, in any module reachable from `generate.ts` — `generate.ts` is imported at Studio module-load time by `studioApi.ts`, so a static import of a devDependency crashes Studio boot on a site that skipped `pnpm install` (same rationale as the existing dynamic `playwright` import).
- Pass-1 and pass-2 `pdfOptions` (format/margins/header/footer template) passed to `page.pdf()` must be byte-identical — the width-reservation technique that keeps pagination stable between passes depends on it.
- `reserved_for` must never be threaded through any new parameter — every new parameter added in this plan (`t`, `showBackToToc`, `pageNumbers`) is presentational only; `ItemPdfView` gains no new fields.
- No `SiteConfig`/`UIConfig` fields are added. The one new UIStrings key (`pdfCategoryItemCount`) follows the existing i18n-key pattern (added to the `UIStrings` type + `EN_FALLBACK`, no `content/config.ts` migration needed — `getTranslationsForLocale` already merges per-locale partial overrides against `EN_FALLBACK`).
- Every doc change ships to both the English file and its `_zh` counterpart in the same task (Iron Rule 2).

---

### Task 1: `resolveAnchorPageNumbers` — resolve a PDF's internal page-number destinations

**Files:**
- Create: `scripts/lib/pdfCatalog/resolvePageNumbers.ts`
- Test: `scripts/lib/pdfCatalog/resolvePageNumbers.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (commit the already-locally-added `pdf-lib` devDependency)

**Interfaces:**
- Produces: `resolveAnchorPageNumbers(pdfBytes: Buffer, anchorIds: string[]): Promise<Map<string, number>>` — 1-based page index per resolvable anchor id; ids not found in the PDF's destinations are simply absent from the returned map (never throws for a partial miss).

- [ ] **Step 1: Confirm the `pdf-lib` devDependency is present**

Run: `grep '"pdf-lib"' package.json`
Expected: a line like `"pdf-lib": "^1.17.1",` under `devDependencies`. If absent, run `pnpm add -D pdf-lib` first.

- [ ] **Step 2: Write the failing test**

Create `scripts/lib/pdfCatalog/resolvePageNumbers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveAnchorPageNumbers } from "./resolvePageNumbers";

async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

// Three-page fixture: page 1 has anchor "first", page 2 has anchor "second",
// page 3 has no anchor at all.
const FIXTURE_HTML = `
<!doctype html><html><body>
<section id="first" style="page-break-after: always;">First page</section>
<section id="second" style="page-break-after: always;">Second page</section>
<section>Third page, no anchor</section>
</body></html>`;

describe("resolveAnchorPageNumbers", () => {
  it("resolves known anchor ids to their 1-based page index, and omits unknown ids", async () => {
    if (!(await chromiumAvailable())) {
      console.warn("Skipping: Chromium not installed. Run `npx playwright install chromium`.");
      return;
    }
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(FIXTURE_HTML, { waitUntil: "networkidle" });
      const pdfBytes = await page.pdf({ format: "Letter" });
      await page.close();

      const result = await resolveAnchorPageNumbers(pdfBytes, ["first", "second", "missing"]);
      expect(result.get("first")).toBe(1);
      expect(result.get("second")).toBe(2);
      expect(result.has("missing")).toBe(false);
    } finally {
      await browser.close();
    }
  });

  it("returns an empty map when the PDF has no destinations at all", async () => {
    if (!(await chromiumAvailable())) {
      console.warn("Skipping: Chromium not installed. Run `npx playwright install chromium`.");
      return;
    }
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent("<html><body><p>No anchors here.</p></body></html>", { waitUntil: "networkidle" });
      const pdfBytes = await page.pdf({ format: "Letter" });
      await page.close();

      const result = await resolveAnchorPageNumbers(pdfBytes, ["anything"]);
      expect(result.size).toBe(0);
    } finally {
      await browser.close();
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/lib/pdfCatalog/resolvePageNumbers.test.ts`
Expected: FAIL — `resolvePageNumbers.ts` does not exist yet (module not found).

- [ ] **Step 4: Write the implementation**

Create `scripts/lib/pdfCatalog/resolvePageNumbers.ts`:

```ts
import type * as PdfLib from "pdf-lib";

// Resolves the physical PDF page each HTML anchor id landed on, by reading
// the rendered PDF's own internal destinations rather than re-implementing
// Chromium's print pagination. Chromium's print-to-PDF registers every HTML
// anchor `id` as a named PDF destination in the document catalog's /Dests
// dictionary (confirmed via a throwaway spike, flat-dict form, up to 30
// anchors) — this is a direct lookup, not annotation/link-order matching.
//
// pdf-lib is imported dynamically for the same reason playwright is
// dynamically imported in generate.ts: this module is reachable from
// generate.ts, which studioApi.ts imports at Studio module-load time, so a
// static import of a devDependency would crash Studio boot on a site that
// skipped `pnpm install`.
export async function resolveAnchorPageNumbers(
  pdfBytes: Buffer,
  anchorIds: string[],
): Promise<Map<string, number>> {
  const pdfLib = await import("pdf-lib");
  const doc = await pdfLib.PDFDocument.load(pdfBytes);

  const pages = doc.getPages();
  const pageRefToIndex = new Map<string, number>();
  pages.forEach((page, index) => pageRefToIndex.set(page.ref.toString(), index));

  const destsDict = resolveDestsDict(pdfLib, doc);
  const result = new Map<string, number>();
  if (destsDict === undefined) return result;

  for (const id of anchorIds) {
    const entry = doc.context.lookup(destsDict.get(pdfLib.PDFName.of(id)));
    const destArray = extractDestArray(pdfLib, doc, entry);
    if (destArray === undefined) continue;
    const pageRef = destArray.get(0);
    const pageIndex = pageRefToIndex.get(pageRef.toString());
    if (pageIndex !== undefined) result.set(id, pageIndex + 1);
  }
  return result;
}

// Handles both PDF destination forms this feature might encounter: a flat
// /Root/Dests dictionary (the form Chromium's output used in spike testing,
// confirmed at 30 anchors) and the tree-based /Root/Names/Dests name-tree
// form the PDF spec also allows (not observed in testing, but cheap
// defensive coverage against a future Chromium version or a much larger
// catalog).
function resolveDestsDict(pdfLib: typeof PdfLib, doc: PdfLib.PDFDocument): PdfLib.PDFDict | undefined {
  const { PDFDict, PDFName } = pdfLib;
  const catalog = doc.catalog;

  const flatDests = doc.context.lookup(catalog.get(PDFName.of("Dests")));
  if (flatDests instanceof PDFDict) return flatDests;

  const namesDict = doc.context.lookup(catalog.get(PDFName.of("Names")));
  if (!(namesDict instanceof PDFDict)) return undefined;
  const destsTree = doc.context.lookup(namesDict.get(PDFName.of("Dests")));
  if (!(destsTree instanceof PDFDict)) return undefined;
  return flattenNameTree(pdfLib, doc, destsTree);
}

// A /Names/Dests name tree is a recursive /Kids (child nodes) and/or /Names
// (flat [name1, dest1, name2, dest2, ...] leaf pairs) structure per PDF spec
// §7.9.6. Flattened here into one dict keyed the same way a flat /Dests
// dictionary already is, so the caller's lookup loop doesn't need to know
// which form the source PDF used.
function flattenNameTree(pdfLib: typeof PdfLib, doc: PdfLib.PDFDocument, node: PdfLib.PDFDict): PdfLib.PDFDict {
  const { PDFDict, PDFArray, PDFName } = pdfLib;
  const flat = doc.context.obj({}) as PdfLib.PDFDict;

  const names = doc.context.lookup(node.get(PDFName.of("Names")));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const nameKey = names.get(i);
      if (nameKey instanceof PDFName) flat.set(nameKey, names.get(i + 1));
    }
  }

  const kids = doc.context.lookup(node.get(PDFName.of("Kids")));
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = doc.context.lookup(kids.get(i));
      if (kid instanceof PDFDict) {
        const childFlat = flattenNameTree(pdfLib, doc, kid);
        for (const key of childFlat.keys()) flat.set(key, childFlat.get(key));
      }
    }
  }

  return flat;
}

// A destination value is either a direct [pageRef, /XYZ, x, y, zoom] array
// (the form Chromium's output used in spike testing) or an indirect
// { D: [pageRef, ...] } action-style wrapper (also PDF-spec-valid, cheap to
// also support).
function extractDestArray(
  pdfLib: typeof PdfLib,
  doc: PdfLib.PDFDocument,
  entry: PdfLib.PDFObject | undefined,
): PdfLib.PDFArray | undefined {
  const { PDFArray, PDFDict, PDFName } = pdfLib;
  if (entry instanceof PDFArray) return entry;
  if (entry instanceof PDFDict) {
    const inner = doc.context.lookup(entry.get(PDFName.of("D")));
    if (inner instanceof PDFArray) return inner;
  }
  return undefined;
}
```

Note: the flat-`/Dests` path is the one confirmed by the design spike (validated up to 30 anchors); the `/Names/Dests` tree-walk path is defensive per the PDF spec but not independently exercised by a test in this task (Chromium did not produce that form in testing, so there's no way to force it for a unit test) — call this out explicitly if reviewing this task, it's accepted per the design spec's own "cheap insurance" framing.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/pdfCatalog/resolvePageNumbers.test.ts`
Expected: PASS (or both tests print the Chromium-not-installed skip warning and pass trivially — either is a valid green state, matching the existing skip-guard convention in `generate.test.ts`).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/pdfCatalog/resolvePageNumbers.ts scripts/lib/pdfCatalog/resolvePageNumbers.test.ts package.json pnpm-lock.yaml
git commit -m "feat(pdf-catalog): resolve anchor page numbers from a rendered PDF's /Dests"
```

---

### Task 2: Real page numbers in `buildTocHtml`, for items and category headers

**Files:**
- Modify: `scripts/lib/pdfCatalog/template.ts`
- Modify: `scripts/lib/pdfCatalog/generate.ts` (one call-site line)
- Test: `scripts/lib/pdfCatalog/template.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 yet (wiring happens in Task 7).
- Produces: `buildTocHtml(groups: CategoryGroup[], t: UIStrings, pageNumbers: Map<string, number> | null): string`. `buildFullCatalogHtml` gains a new required trailing parameter `pageNumbers: Map<string, number> | null`, threaded straight into `buildTocHtml`. Later tasks (3, 4) will add further required parameters to `buildFullCatalogHtml`'s other callees — this task establishes the pattern.

- [ ] **Step 1: Write the failing tests**

In `scripts/lib/pdfCatalog/template.test.ts`, replace the existing `describe("buildTocHtml", ...)` block with:

```ts
describe("buildTocHtml", () => {
  const groups: CategoryGroup[] = [
    { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
  ];

  it("links each entry to its matching item anchor and localizes the heading", () => {
    const toc = buildTocHtml(groups, T_ZH, null);
    expect(toc).toContain('href="#item-electronics-desk-lamp"');
    expect(toc).toContain("目錄");
  });

  it("links the category header to its own anchor", () => {
    const toc = buildTocHtml(groups, T_EN, null);
    expect(toc).toContain('href="#cat-electronics"');
  });

  it("renders empty page-number placeholders when pageNumbers is null", () => {
    const toc = buildTocHtml(groups, T_EN, null);
    expect(toc).toContain('<span class="toc-page-num"></span>');
  });

  it("renders real page numbers for both items and category headers when provided", () => {
    const pageNumbers = new Map([
      ["cat-electronics", 3],
      ["item-electronics-desk-lamp", 5],
    ]);
    const toc = buildTocHtml(groups, T_EN, pageNumbers);
    expect(toc).toContain('<span class="toc-page-num">3</span>');
    expect(toc).toContain('<span class="toc-page-num">5</span>');
  });

  it("renders an empty placeholder for an anchor missing from a non-null map", () => {
    const pageNumbers = new Map([["cat-electronics", 3]]); // item entry deliberately omitted
    const toc = buildTocHtml(groups, T_EN, pageNumbers);
    expect(toc).toContain('<span class="toc-page-num">3</span>');
    expect(toc).toContain('<span class="toc-page-num"></span>');
  });
});
```

Also update the existing `describe("buildFullCatalogHtml", ...)` test's call site (it will fail to compile otherwise): change

```ts
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest");
```

to

```ts
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", null);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: FAIL — `buildTocHtml`/`buildFullCatalogHtml` don't accept a 3rd/6th argument yet (TypeScript compile error, surfaced as a test failure).

- [ ] **Step 3: Implement the change**

In `scripts/lib/pdfCatalog/template.ts`, replace `buildTocHtml` with:

```ts
function tocPageNumHtml(pageNumbers: Map<string, number> | null, anchorId: string): string {
  const value = pageNumbers?.get(anchorId);
  return `<span class="toc-page-num">${value !== undefined ? value : ""}</span>`;
}

export function buildTocHtml(groups: CategoryGroup[], t: UIStrings, pageNumbers: Map<string, number> | null): string {
  const sections = groups
    .map((group) => {
      const catAnchor = `cat-${group.slug}`;
      const items = group.items
        .map((item) => {
          const itemAnchor = `item-${item.categorySlug}-${item.itemSlug}`;
          return `<li><a href="#${escapeHtml(itemAnchor)}">${escapeHtml(item.name)}</a>${tocPageNumHtml(pageNumbers, itemAnchor)}</li>`;
        })
        .join("");
      return `<div class="toc-group"><h3><a href="#${escapeHtml(catAnchor)}">${escapeHtml(group.displayName)}</a>${tocPageNumHtml(pageNumbers, catAnchor)}</h3><ul>${items}</ul></div>`;
    })
    .join("");
  return `<section class="toc"><h1>${escapeHtml(t.pdfTocHeading)}</h1>${sections}</section>`;
}
```

Replace the `CATALOG_CSS` block's TOC rules (`.toc-group h3`, `.toc-group ul`, `.toc-group li`, `.toc-group a`) with:

```css
.toc-group h3 { color: var(--accent); margin-top: 20px; font-size: 16px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.toc-group ul { list-style: none; margin: 4px 0; padding: 0; }
.toc-group li { padding: 2px 0; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.toc-group a { color: var(--ink); text-decoration: none; }
.toc-page-num { display: inline-block; min-width: 2.4em; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; flex-shrink: 0; }
```

Replace `buildFullCatalogHtml`'s signature and body:

```ts
export function buildFullCatalogHtml(
  branding: SiteBranding,
  groups: CategoryGroup[],
  generatedAt: string,
  t: UIStrings,
  strategy: PriceStrategy,
  pageNumbers: Map<string, number> | null,
): string {
  const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  const body = [
    buildCoverHtml(branding, itemCount, groups.length, generatedAt, t),
    buildTocHtml(groups, t, pageNumbers),
    ...groups.flatMap((group) => [
      buildCategorySectionHtml(group),
      ...group.items.map((item) => buildItemHtml(item, branding.baseUrl, strategy, t)),
    ]),
  ].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${CATALOG_CSS}</style></head><body>${body}</body></html>`;
}
```

(The `buildCategorySectionHtml(group)` and `buildItemHtml(item, ...)` calls inside are unchanged here — Tasks 3 and 4 will update their signatures and these call sites again.)

In `scripts/lib/pdfCatalog/generate.ts`, update `generateCatalogPdf`'s `buildFullCatalogHtml` call to pass a 6th argument:

```ts
  const html = buildFullCatalogHtml(
    { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl },
    groups,
    new Date().toISOString().slice(0, 10),
    t,
    options.priceStrategy,
    null,
  );
```

(This `null` is temporary — Task 7 replaces this whole region with the real two-pass orchestration.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors (confirms `generate.ts`'s call site compiles too).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/pdfCatalog/template.ts scripts/lib/pdfCatalog/template.test.ts scripts/lib/pdfCatalog/generate.ts
git commit -m "feat(pdf-catalog): thread real TOC page numbers through buildTocHtml"
```

---

### Task 3: Full-page category divider

**Files:**
- Modify: `scripts/lib/pdfCatalog/template.ts`
- Modify: `lib/config/types.ts` (new UIStrings key)
- Modify: `lib/i18n/translations.ts` (new EN_FALLBACK entry)
- Test: `scripts/lib/pdfCatalog/template.test.ts`

**Interfaces:**
- Produces: `buildCategorySectionHtml(group: CategoryGroup, t: UIStrings): string` — gains a required `t` param, gets `id="cat-<slug>"`, and now shows an item-count line.

- [ ] **Step 1: Add the new UIStrings key**

In `lib/config/types.ts`, find the `pdf*` key block (currently ending with `pdfAveragePriceLabel: string;`, in the "Catalog PDF export chrome" comment section) and add a new line directly after it:

```ts
  pdfCategoryItemCount: string;
```

In `lib/i18n/translations.ts`, find the `EN_FALLBACK` object's `pdf*` keys (the same block that includes `pdfTocHeading: "Table of Contents",`) and add:

```ts
  pdfCategoryItemCount: "{count} items in this category",
```

- [ ] **Step 2: Write the failing tests**

In `scripts/lib/pdfCatalog/template.test.ts`, add a new `describe` block (place it near the existing `buildTocHtml`/`buildCoverHtml` blocks):

```ts
describe("buildCategorySectionHtml", () => {
  const group: CategoryGroup = {
    slug: "electronics",
    displayName: "Electronics",
    description: "Gadgets and gear.",
    items: [makeItem(), makeItem({ itemSlug: "second-item" })],
  };

  it("gets an id matching the TOC's category anchor", () => {
    const html = buildCategorySectionHtml(group, T_EN);
    expect(html).toContain('id="cat-electronics"');
  });

  it("shows the category name, description, and item count", () => {
    const html = buildCategorySectionHtml(group, T_EN);
    expect(html).toContain("Electronics");
    expect(html).toContain("Gadgets and gear.");
    expect(html).toContain("2 items in this category");
  });

  it("localizes the item-count line", () => {
    const html = buildCategorySectionHtml(group, T_ZH);
    // T_ZH in this file only overrides a few keys (see the top of this file);
    // pdfCategoryItemCount falls back to EN_FALLBACK's English wording, which
    // is still the correct assertion for an untranslated key.
    expect(html).toContain("2 items in this category");
  });
});
```

Update the import list at the top of `template.test.ts` to include `buildCategorySectionHtml`:

```ts
import {
  buildCoverHtml,
  buildTocHtml,
  buildCategorySectionHtml,
  buildItemHtml,
  buildFullCatalogHtml,
  buildFlyerHtml,
  buildPriceHtml,
  type ItemPdfView,
  type CategoryGroup,
  type SiteBranding,
} from "./template";
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: FAIL — `buildCategorySectionHtml` doesn't accept a `t` param yet, and doesn't render an id or item count.

- [ ] **Step 4: Implement the change**

In `scripts/lib/pdfCatalog/template.ts`, replace `buildCategorySectionHtml`:

```ts
export function buildCategorySectionHtml(group: CategoryGroup, t: UIStrings): string {
  const description = group.description
    ? `<p class="category-description">${escapeHtml(group.description)}</p>`
    : "";
  const anchor = `cat-${group.slug}`;
  return `
    <section class="category-divider" id="${escapeHtml(anchor)}">
      <h1>${escapeHtml(group.displayName)}</h1>
      ${description}
      <p class="category-divider-count">${escapeHtml(fmt(t.pdfCategoryItemCount, { count: group.items.length }))}</p>
    </section>`;
}
```

Replace the `CATALOG_CSS` block's `.category-divider`/`.category-divider h1`/`.category-description` rules with:

```css
.category-divider { page-break-before: always; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 40px; position: relative; }
.category-divider h1 { font-size: 42px; color: var(--accent); }
.category-description { color: var(--muted); font-size: 16px; max-width: 32em; margin-top: 16px; }
.category-divider-count { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 16px; }
```

In `buildFullCatalogHtml`, update the call site:

```ts
      buildCategorySectionHtml(group, t),
```

(replacing `buildCategorySectionHtml(group)`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/pdfCatalog/template.ts scripts/lib/pdfCatalog/template.test.ts lib/config/types.ts lib/i18n/translations.ts
git commit -m "feat(pdf-catalog): full-page category divider matching the cover page's visual weight"
```

---

### Task 4: Back-to-Table-of-Contents navigation links

**Files:**
- Modify: `scripts/lib/pdfCatalog/template.ts`
- Test: `scripts/lib/pdfCatalog/template.test.ts`

**Interfaces:**
- Produces: `buildItemHtml(item: ItemPdfView, baseUrl: string, strategy: PriceStrategy, t: UIStrings, showBackToToc: boolean): string` — gains a required trailing `showBackToToc` param. `buildTocHtml`'s output section gains `id="toc"` (no signature change). `buildCategorySectionHtml`'s output gains a back-to-TOC link (no signature change, already has `t` from Task 3).

- [ ] **Step 1: Write the failing tests**

In `scripts/lib/pdfCatalog/template.test.ts`, add to the existing `describe("buildItemHtml", ...)` block:

```ts
  it("shows a back-to-TOC link when showBackToToc is true, and omits it when false", () => {
    const withLink = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN, true);
    expect(withLink).toContain('href="#toc"');

    const withoutLink = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN, false);
    expect(withoutLink).not.toContain('href="#toc"');
  });
```

Update every other existing call to `buildItemHtml` in this file (there are several across `describe("buildItemHtml", ...)`) to pass a 5th argument — `true` is fine for all of them since none are asserting its absence:

```ts
    const html = buildItemHtml(makeItem(), "https://example.com", "lowest", T_EN, true);
```

(apply the same trailing `, true` to each of the other `buildItemHtml(...)` calls already in that `describe` block: "never renders a reserved_for value...", "omits the image grid...", and the two calls inside "localizes the status badge...".)

Add to `describe("buildCategorySectionHtml", ...)` (created in Task 3):

```ts
  it("includes a back-to-TOC link", () => {
    const html = buildCategorySectionHtml(group, T_EN);
    expect(html).toContain('href="#toc"');
  });
```

Add to `describe("buildTocHtml", ...)`:

```ts
  it("has an id matching the back-to-TOC links' target", () => {
    const toc = buildTocHtml(groups, T_EN, null);
    expect(toc).toContain('<section class="toc" id="toc">');
  });
```

Update `describe("buildFlyerHtml", ...)`'s existing "has no TOC and does not reuse the catalog's cover/TOC markup" test to also assert no back-link:

```ts
  it("has no TOC and does not reuse the catalog's cover/TOC markup", () => {
    const html = buildFlyerHtml(makeItem(), branding, "lowest", T_EN);
    expect(html).not.toContain("Table of Contents");
    expect(html).not.toContain('class="cover"');
    expect(html).not.toContain('class="toc"');
    expect(html).not.toContain('href="#toc"');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: FAIL — `buildItemHtml` doesn't accept a 5th argument yet; `buildTocHtml`'s section has no `id`; `buildCategorySectionHtml` has no back-link.

- [ ] **Step 3: Implement the change**

In `scripts/lib/pdfCatalog/template.ts`, replace `buildItemHtml`'s signature and return statement:

```ts
export function buildItemHtml(
  item: ItemPdfView,
  baseUrl: string,
  strategy: PriceStrategy,
  t: UIStrings,
  showBackToToc: boolean,
): string {
  const anchor = `item-${item.categorySlug}-${item.itemSlug}`;
  const liveUrl = `${baseUrl}/${item.categorySlug}/${item.itemSlug}`;
  const images = [item.coverImage, ...item.images.filter((src) => src !== item.coverImage)]
    .filter((src): src is string => src !== null)
    .slice(0, 4);
  const imageGrid =
    images.length === 0
      ? ""
      : `<div class="item-images">${images
          .map((src) => `<img src="${escapeHtml(src)}" alt="" onerror="this.remove()" />`)
          .join("")}</div>`;
  const statusBadge =
    item.status === "available"
      ? ""
      : `<span class="status-badge status-${item.status}">${escapeHtml(statusLabel(item.status, t))}</span>`;
  const tagsHtml =
    item.tags.length === 0
      ? ""
      : `<p class="item-tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</p>`;
  const backToToc = showBackToToc ? `<a class="back-to-toc" href="#toc">← ${escapeHtml(t.pdfTocHeading)}</a>` : "";

  return `
    <section class="item-page" id="${escapeHtml(anchor)}">
      ${backToToc}
      <h2 class="item-title">${escapeHtml(item.name)} ${statusBadge}</h2>
      ${imageGrid}
      ${buildPriceHtml(item.price, strategy, t)}
      <p class="item-description">${escapeHtml(item.description)}</p>
      ${buildSpecsHtml(item, t)}
      ${tagsHtml}
      <p class="item-link">
        <a class="live-link" href="${escapeHtml(liveUrl)}">${escapeHtml(t.pdfViewLiveListing)} ↗</a>
        <br /><span class="live-url-text">${escapeHtml(liveUrl)}</span>
      </p>
    </section>`;
}
```

Replace `buildCategorySectionHtml`'s return statement to add the back-link:

```ts
  return `
    <section class="category-divider" id="${escapeHtml(anchor)}">
      <a class="back-to-toc" href="#toc">← ${escapeHtml(t.pdfTocHeading)}</a>
      <h1>${escapeHtml(group.displayName)}</h1>
      ${description}
      <p class="category-divider-count">${escapeHtml(fmt(t.pdfCategoryItemCount, { count: group.items.length }))}</p>
    </section>`;
```

In `buildTocHtml`'s return statement, add the `id`:

```ts
  return `<section class="toc" id="toc"><h1>${escapeHtml(t.pdfTocHeading)}</h1>${sections}</section>`;
```

Add `position: relative` to `.item-page` and a new shared `.back-to-toc` rule in `CATALOG_CSS`:

```css
.item-page { page-break-before: always; padding: 24px 8px; position: relative; }
```

```css
.back-to-toc { position: absolute; top: 8px; left: 8px; font-size: 11px; color: var(--accent); text-decoration: none; }
```

In `buildFullCatalogHtml`, update the item-mapping call site:

```ts
      ...group.items.map((item) => buildItemHtml(item, branding.baseUrl, strategy, t, true)),
```

In `buildFlyerHtml`, update its internal call:

```ts
        ${buildItemHtml(item, branding.baseUrl, strategy, t, false)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/pdfCatalog/template.ts scripts/lib/pdfCatalog/template.test.ts
git commit -m "feat(pdf-catalog): back-to-Table-of-Contents links on item and category-divider pages"
```

---

### Task 5: End-to-end template assembly test

**Files:**
- Test only: `scripts/lib/pdfCatalog/template.test.ts`

**Interfaces:**
- Consumes: `buildFullCatalogHtml` as finalized by Tasks 2-4 (all six params).
- Produces: nothing new — this task only adds test coverage proving the pieces built in Tasks 2-4 compose correctly end-to-end.

- [ ] **Step 1: Write the new tests**

In `scripts/lib/pdfCatalog/template.test.ts`, extend the `describe("buildFullCatalogHtml", ...)` block (keep the existing "assembles cover, toc, category divider, and item sections in order" test as-is) by adding:

```ts
  it("embeds resolved page numbers into the TOC when a pageNumbers map is provided", () => {
    const pageNumbers = new Map([
      ["cat-electronics", 2],
      ["item-electronics-desk-lamp", 3],
    ]);
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", pageNumbers);
    expect(html).toContain('<span class="toc-page-num">2</span>');
    expect(html).toContain('<span class="toc-page-num">3</span>');
  });

  it("gives every item page and category divider a back-to-TOC link, and the TOC section a matching id", () => {
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", null);
    expect(html).toContain('id="toc"');
    const backLinkCount = html.split('href="#toc"').length - 1;
    expect(backLinkCount).toBe(2); // one category divider + one item page
  });

  it("shows the category's item count on its divider", () => {
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", null);
    expect(html).toContain("1 items in this category");
  });
```

Note: `branding` and `groups` are already defined as local `const`s at the top of the existing "assembles cover, toc, category divider, and item sections in order" test — hoist them to the `describe` block's own scope (shared by all four `it`s) rather than redeclaring them per-test:

```ts
describe("buildFullCatalogHtml", () => {
  const branding: SiteBranding = { name: "UsedExchange", tagline: "", logo: "", baseUrl: "https://example.com" };
  const groups: CategoryGroup[] = [
    { slug: "electronics", displayName: "Electronics", description: "", items: [makeItem()] },
  ];

  it("assembles cover, toc, category divider, and item sections in order", () => {
    const html = buildFullCatalogHtml(branding, groups, "2026-08-13", T_EN, "lowest", null);
    // ... unchanged assertions ...
  });

  // ... the three new it()s above ...
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: PASS (all `buildFullCatalogHtml` tests, plus every test added in Tasks 2-4).

- [ ] **Step 3: Run the full template test file once more as a final check**

Run: `npx vitest run scripts/lib/pdfCatalog/template.test.ts`
Expected: PASS, full file.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/pdfCatalog/template.test.ts
git commit -m "test(pdf-catalog): end-to-end assembly coverage for TOC numbers, dividers, and back-links"
```

---

### Task 6: Refactor `generate.ts`'s render pipeline to share one browser across multiple renders

**Files:**
- Modify: `scripts/lib/pdfCatalog/generate.ts`

**Interfaces:**
- Produces: `launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }>` (exported), `renderHtmlToPdfBytes(browser: Browser, html: string, opts: { pdfOptions: Parameters<Page["pdf"]>[0]; renderErrorMessage: string }): Promise<{ bytes: Buffer } | { error: string }>` (exported), and a thin `renderHtmlToPdf(browser: Browser, html: string, opts: { filenamePrefix: string; pdfOptions: Parameters<Page["pdf"]>[0]; renderErrorMessage: string }): Promise<{ file: string } | { error: string }>` (module-private, unchanged visibility from before). This is a behavior-preserving refactor — no new test is written; instead, the existing Chromium-gated test suite is run before and after to confirm identical results.

- [ ] **Step 1: Record the current test baseline**

Run: `npx vitest run scripts/lib/pdfCatalog/generate.test.ts`
Record the pass/skip counts shown in the output (e.g. "X passed" or a mix of passed and skip-warning-logged-but-passed tests) — this is the baseline Step 4 must match exactly.

- [ ] **Step 2: Refactor `renderHtmlToPdf` into three functions**

In `scripts/lib/pdfCatalog/generate.ts`, change the existing type-only import line from

```ts
import type { Page } from "playwright";
```

to

```ts
import type { Page, Browser } from "playwright";
```

Then replace the existing `renderHtmlToPdf` function entirely with:

```ts
// Dynamic import, not a static one — see the module-level comment further up
// this file (generate.ts is imported at Studio module-load time; a static
// import of a devDependency would crash Studio boot on a site that skipped
// `pnpm install`). Missing *package* and missing Chromium *binary* both land
// in this same catch and produce the same friendly typed error. Exported so
// a caller that needs to render multiple documents (e.g. the two-pass
// catalog render in generateCatalogPdf) can launch once and reuse the
// browser, instead of every render call launching (and closing) its own.
export async function launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }> {
  try {
    const { chromium } = await import("playwright");
    return { browser: await chromium.launch() };
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }
}

/**
 * Renders `html` to PDF bytes on an already-launched `browser` — prefetch,
 * render, and page cleanup, but no file write and no browser lifecycle (the
 * caller owns both). Exported for the same multi-render-sharing reason as
 * launchChromiumOrError, and so generate.test.ts can exercise it directly
 * for the pass-1/pass-2 page-count parity check (see generateCatalogPdf's
 * tests).
 */
export async function renderHtmlToPdfBytes(
  browser: Browser,
  html: string,
  opts: { pdfOptions: Parameters<Page["pdf"]>[0]; renderErrorMessage: string },
): Promise<{ bytes: Buffer } | { error: string }> {
  // Pull every remote image to a local temp dir before Chromium sees the
  // HTML. Live CDN fetches from headless Chromium are slow and flaky —
  // pre-fetching turns render-time network stalls into local file reads.
  // On total prefetch failure (e.g. mkdtemp throws), fall back to rendering
  // the original HTML with its original remote URLs.
  let tempDir: string | undefined;
  let prefetchResult: Awaited<ReturnType<typeof prefetchImages>> | undefined;
  try {
    prefetchResult = await prefetchImages(html);
    tempDir = prefetchResult.tempDir;
  } catch {
    // Prefetch failed entirely — fall back to remote URLs.
  }

  try {
    const page = await browser.newPage();
    try {
      if (prefetchResult !== undefined) {
        // Chromium refuses to load a file:// subresource from a document
        // that has no origin of its own — see the original comment history
        // on this file for the full explanation. The (possibly
        // prefetch-rewritten) HTML is written into the same tempDir the
        // downloaded images already live in, and loaded via a real file://
        // URL instead.
        const htmlFilePath = path.join(prefetchResult.tempDir, "page.html");
        await fs.writeFile(htmlFilePath, prefetchResult.html, "utf-8");
        await page.goto(pathToFileURL(htmlFilePath).href, {
          waitUntil: "networkidle",
          timeout: RENDER_TIMEOUT_MS,
        });
      } else {
        await page.setContent(html, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
      }
      const pdfBytes = await withTimeout(
        page.pdf(opts.pdfOptions),
        RENDER_TIMEOUT_MS,
        `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
      );
      return { bytes: pdfBytes };
    } catch {
      // A raw Playwright error (e.g. "Timeout 60000ms exceeded") is not
      // actionable for a seller. Surface a typed error with real guidance
      // instead.
      return { error: opts.renderErrorMessage };
    } finally {
      try {
        await page.close();
      } catch {
        // A page.close() failure must not mask an earlier error (or a
        // successful render) — swallow it.
      }
    }
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Thin file-writing wrapper around renderHtmlToPdfBytes — the shape every
 * existing caller (generateFlyerPdf, and the catalog's final pass-2 render)
 * actually wants: a file on disk under os.tmpdir(), ready to hand back as a
 * FileResponse.
 */
async function renderHtmlToPdf(
  browser: Browser,
  html: string,
  opts: {
    filenamePrefix: string;
    pdfOptions: Parameters<Page["pdf"]>[0];
    renderErrorMessage: string;
  },
): Promise<{ file: string } | { error: string }> {
  const result = await renderHtmlToPdfBytes(browser, html, opts);
  if ("error" in result) return result;
  const file = path.join(os.tmpdir(), `${opts.filenamePrefix}-${Date.now()}.pdf`);
  await fs.writeFile(file, result.bytes);
  return { file };
}
```

- [ ] **Step 3: Update `generateFlyerPdf` and `generateCatalogPdf` to the new launch/render/close shape**

In `generateFlyerPdf`, replace the trailing `return renderHtmlToPdf(html, {...})` call with:

```ts
  const launch = await launchChromiumOrError();
  if ("error" in launch) return launch;
  const { browser } = launch;
  try {
    return await renderHtmlToPdf(browser, html, {
      filenamePrefix: `usedexchange-flyer-${itemId.replace(/\//g, "-")}`,
      pdfOptions: {
        format: "Letter",
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
      },
      renderErrorMessage: "PDF rendering timed out or failed. Try again, or retry after trimming a few item photos.",
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
```

In `generateCatalogPdf`, replace the trailing `return renderHtmlToPdf(html, {...})` call (this is still a single-pass render at this point in the plan — Task 7 replaces this whole region with the real two-pass flow) with:

```ts
  const launch = await launchChromiumOrError();
  if ("error" in launch) return launch;
  const { browser } = launch;
  try {
    return await renderHtmlToPdf(browser, html, {
      filenamePrefix: "usedexchange-catalog",
      pdfOptions: {
        format: "Letter",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · ${escapeHtml(t.pdfFooterPage)} <span class="pageNumber"></span> ${escapeHtml(t.pdfFooterOf)} <span class="totalPages"></span></div>`,
        margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
      },
      renderErrorMessage:
        "PDF rendering timed out or failed — the catalog may be too large (many items or photos). Try again, or retry after trimming a few item photos.",
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
```

- [ ] **Step 4: Re-run the test baseline and confirm no regression**

Run: `npx vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: identical pass/skip results to Step 1's baseline — this is a pure refactor, no behavior changed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/pdfCatalog/generate.ts
git commit -m "refactor(pdf-catalog): split renderHtmlToPdf so a browser can render multiple documents"
```

---

### Task 7: Two-pass `generateCatalogPdf` — resolve and bake in real TOC page numbers

**Files:**
- Modify: `scripts/lib/pdfCatalog/generate.ts`
- Test: `scripts/lib/pdfCatalog/generate.test.ts`

**Interfaces:**
- Consumes: `resolveAnchorPageNumbers` (Task 1), `buildFullCatalogHtml`'s `pageNumbers` param (Task 2), `launchChromiumOrError`/`renderHtmlToPdfBytes`/`renderHtmlToPdf` (Task 6).
- Produces: `generateCatalogPdf`'s public signature is unchanged (`(options: PdfExportOptions) => Promise<{ file: string } | { error: string }>`) — only its internal implementation changes to the two-pass flow.

- [ ] **Step 1: Write the failing tests**

In `scripts/lib/pdfCatalog/generate.test.ts`, add `import { PDFDocument } from "pdf-lib";`, `import { buildFullCatalogHtml } from "./template";`, `import { getTranslationsForLocale } from "@/lib/i18n/getTranslations";`, and `resolveAnchorPageNumbers` from `"./resolvePageNumbers"` (import at the top with the other imports), and add `launchChromiumOrError, renderHtmlToPdfBytes` to the existing `from "./generate"` import list. Then add two new `describe` blocks after the existing `describe("generateCatalogPdf embeds prefetched images", ...)` block:

```ts
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

// Regression guard for the width-reservation technique buildTocHtml relies
// on (see the design spec, §4): pass-1 (empty TOC number slots) and pass-2
// (real numbers) must lay out to the same total page count, or the numbers
// baked into pass-2's TOC would point at the wrong pages.
describe("generateCatalogPdf pass-1/pass-2 page count parity", () => {
  it("produces the same total page count whether or not the TOC shows real numbers", async () => {
    const item = makeItem();
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([item]);
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
        [item],
        [makeCategory()],
        baseOptions().statuses,
        baseOptions().categories,
        "en",
      );
      const pass1Html = buildFullCatalogHtml(
        { name: "x", tagline: "", logo: "", baseUrl: "https://example.com" },
        groups,
        "2026-08-16",
        getTranslationsForLocale("en"),
        "lowest",
        null,
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: FAIL on the two new `describe` blocks — `generateCatalogPdf` doesn't register category anchors or resolve real page numbers yet (still single-pass with `pageNumbers: null` from Task 6).

- [ ] **Step 3: Implement the two-pass orchestration**

In `scripts/lib/pdfCatalog/generate.ts`, add the import: `import { resolveAnchorPageNumbers } from "./resolvePageNumbers";`

Replace `generateCatalogPdf`'s body (everything from `const t = getTranslationsForLocale(...)` through the end of the function) with:

```ts
  const t = getTranslationsForLocale(options.locale);

  // Logo is a public/ path (e.g. "/logo.svg") the live site serves at its own
  // origin — page.setContent() has no origin of its own, so it must be made
  // absolute here or the <img> in the cover page would 404 silently.
  const logo = siteConfig.logo ? `${siteConfig.baseUrl}${siteConfig.logo}` : "";
  const branding = { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl };
  const generatedAt = new Date().toISOString().slice(0, 10);

  // Shared between both passes — the width-reservation technique
  // buildTocHtml uses to keep pass-1/pass-2 pagination identical (see
  // resolvePageNumbers.ts and the design spec, §4) depends on the page box
  // being laid out identically in both renders, so this object must not
  // differ between them.
  const pdfOptions = {
    format: "Letter" as const,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · ${escapeHtml(t.pdfFooterPage)} <span class="pageNumber"></span> ${escapeHtml(t.pdfFooterOf)} <span class="totalPages"></span></div>`,
    margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
  };
  const renderErrorMessage =
    "PDF rendering timed out or failed — the catalog may be too large (many items or photos). Try again, or retry after trimming a few item photos.";

  const launch = await launchChromiumOrError();
  if ("error" in launch) return launch;
  const { browser } = launch;
  try {
    // Pass 1: TOC renders empty (but width-reserved) page-number slots — this
    // PDF exists only to discover real pagination, and is discarded.
    const pass1Html = buildFullCatalogHtml(branding, groups, generatedAt, t, options.priceStrategy, null);
    const pass1 = await renderHtmlToPdfBytes(browser, pass1Html, { pdfOptions, renderErrorMessage });
    if ("error" in pass1) return pass1;

    const anchorIds = groups.flatMap((group) => [
      `cat-${group.slug}`,
      ...group.items.map((item) => `item-${item.categorySlug}-${item.itemSlug}`),
    ]);
    const pageNumbers = await resolveAnchorPageNumbers(pass1.bytes, anchorIds);

    // Pass 2: the real download, with resolved numbers baked into the TOC.
    const pass2Html = buildFullCatalogHtml(branding, groups, generatedAt, t, options.priceStrategy, pageNumbers);
    return await renderHtmlToPdf(browser, pass2Html, {
      filenamePrefix: "usedexchange-catalog",
      pdfOptions,
      renderErrorMessage,
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run scripts/lib/pdfCatalog/generate.test.ts`
Expected: PASS, including all pre-existing tests in this file (re-confirms no regression from Task 6's refactor plus this task's rewrite).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full project test suite**

Run: `npx vitest run`
Expected: PASS (or Chromium-gated-skip, per the existing convention) across the whole repo — confirms nothing outside `scripts/lib/pdfCatalog/` broke.

- [ ] **Step 7: Manual verification (`pnpm studio`)**

Run: `pnpm studio`, open the Studio UI, open **Export PDF**, generate a full catalog against the real local content. Open the resulting PDF and confirm:
- Every TOC entry (item rows and category rows) shows a page number.
- Clicking a TOC entry jumps to the page whose visible page number matches.
- Category dividers are full-page, cover-like section titles with an item count.
- Clicking "← Table of Contents" from an item page and from a category divider jumps back to the TOC.
- The footer's "Page N of M" is unaffected.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/pdfCatalog/generate.ts scripts/lib/pdfCatalog/generate.test.ts
git commit -m "feat(pdf-catalog): two-pass render resolves and bakes in real TOC page numbers"
```

---

### Task 8: Documentation updates (English + Chinese, same task)

**Files:**
- Modify: `docs/DESIGN.md`, `docs/DESIGN_zh.md`
- Modify: `docs/CURRENT_FUNCTIONALITY.md`, `docs/CURRENT_FUNCTIONALITY_zh.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `docs/DESIGN.md` §22**

Find this sentence (around line 2399, inside the Catalog PDF export paragraph):

```
Table-of-contents entries are clickable in-PDF jump links; they do not show literal page numbers next to each title (Chromium's print-to-PDF does not support CSS `target-counter()`), though every page's footer does show a real "Page N of M".
```

Replace it with:

```
Table-of-contents entries are clickable in-PDF jump links and show a real resolved page number next to each title — recovered via a two-pass render (Playwright renders once, `pdf-lib` reads the physical page each anchor landed on from the PDF's own `/Dests` destinations, then a second render bakes those numbers into the TOC), not CSS `target-counter()` (which Chromium's print-to-PDF doesn't support). Category dividers are full-page section titles — large title, description, item count — matching the cover page's visual weight, and every item page and category divider carries a "← Table of Contents" link back to the top. Every page's footer also shows a real "Page N of M".
```

- [ ] **Step 2: Mirror the change into `docs/DESIGN_zh.md`**

Find this sentence (around line 2165, inside the same paragraph translated into Chinese):

```
目录中的条目是可点击的 PDF 内部跳转链接，条目旁不会显示具体页码（Chromium 的打印为 PDF 功能不支持 CSS 的 `target-counter()`），但每页页脚都会显示真实的"第 N 页，共 M 页"。
```

Replace it with:

```
目录中的条目是可点击的 PDF 内部跳转链接，条目旁会显示真实解析出的页码——通过两阶段渲染获得（Playwright 先渲染一次，`pdf-lib` 从 PDF 自身的 `/Dests` 目标中读出每个锚点落在哪一实际页，再进行第二次渲染，把页码写入目录），而非 CSS 的 `target-counter()`（Chromium 的打印为 PDF 功能不支持该特性）。分类分隔页现为整页的分节标题页——大标题、描述文字、商品数量——视觉分量与封面页一致；每个商品页与分类分隔页都带有"← 返回目录"链接。每页页脚仍会显示真实的"第 N 页，共 M 页"。
```

- [ ] **Step 3: Update `docs/CURRENT_FUNCTIONALITY.md`**

Find the "Catalog PDF export" feature-list row (around line 382):

```
| Catalog PDF export | Generate and download a combined PDF catalog directly from Studio (cover page, table of contents, per-category sections, one page per item with a live link), with seller-chosen language, highlighted-price strategy (lowest/highest/pickup/shipping/average), and category/status filters (all 5 statuses selectable, not just the 3 public-visible ones); an advisory readiness check flags items missing photos, a description, or a price before you generate |
```

Replace it with:

```
| Catalog PDF export | Generate and download a combined PDF catalog directly from Studio (cover page, a table of contents with real page numbers for every item and category, a full-page section-title divider per category, one page per item with a live link and a back-to-Table-of-Contents link), with seller-chosen language, highlighted-price strategy (lowest/highest/pickup/shipping/average), and category/status filters (all 5 statuses selectable, not just the 3 public-visible ones); an advisory readiness check flags items missing photos, a description, or a price before you generate |
```

- [ ] **Step 4: Mirror the change into `docs/CURRENT_FUNCTIONALITY_zh.md`**

Find the corresponding row (around line 382):

```
| 目录 PDF 导出 | 直接在 Studio 中生成并下载一份合并的 PDF 目录（封面页、目录、按分类分节、每件商品一页并附带在线链接），可由卖家选择语言、高亮价格策略（最低价/最高价/自取价/邮寄价/平均价），以及分类与状态筛选（全部 5 种状态皆可勾选，不再只是原本公开可见的 3 种）；生成前会给出提示性就绪检查，标出缺少照片、描述或价格的商品 |
```

Replace it with:

```
| 目录 PDF 导出 | 直接在 Studio 中生成并下载一份合并的 PDF 目录（封面页、带有真实页码的目录（每件商品与每个分类均有页码）、按分类的整页分节标题页、每件商品一页并附带在线链接与"返回目录"链接），可由卖家选择语言、高亮价格策略（最低价/最高价/自取价/邮寄价/平均价），以及分类与状态筛选（全部 5 种状态皆可勾选，不再只是原本公开可见的 3 种）；生成前会给出提示性就绪检查，标出缺少照片、描述或价格的商品 |
```

- [ ] **Step 5: Verify `docs/TECH_REQUIREMENTS.md` §30 needs no change**

Run: `grep -n "export-pdf" docs/TECH_REQUIREMENTS.md`
Confirm the `POST /api/export-pdf` row describes only the request/response contract (body shape, status codes), not TOC content or render-pass count — per the design spec, this should need no edit. If it does describe render internals at a level this plan invalidates, update it and its `_zh` counterpart too.

- [ ] **Step 6: Commit**

```bash
git add docs/DESIGN.md docs/DESIGN_zh.md docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md
git commit -m "docs: describe real TOC page numbers, full-page dividers, and back-to-TOC nav (EN+ZH)"
```

---

## Self-Review Notes

**Spec coverage:** §2 item 1 (real page numbers, items + categories) → Tasks 2, 5, 7. §2 item 2 (full-page divider) → Task 3. §2 item 3 (back-to-TOC links, catalog-only) → Task 4. §5.1 (template.ts changes) → Tasks 2-4. §5.2 (resolvePageNumbers.ts) → Task 1. §5.3 (generate.ts changes) → Tasks 6-7. §7 Iron Rule 8 (new UIStrings key pattern) → Task 3. §8 all four testing items → Tasks 1, 2/3/4/5, 7 respectively. §9 doc updates → Task 8.

**Type consistency check:** `buildTocHtml(groups, t, pageNumbers)` (Task 2) is called identically in `buildFullCatalogHtml` (Task 2) and never renamed. `buildCategorySectionHtml(group, t)` (Task 3) gains its back-link in Task 4 without a further signature change — confirmed the Task 3 and Task 4 code blocks show the same parameter list. `buildItemHtml(item, baseUrl, strategy, t, showBackToToc)` (Task 4) matches its two call sites (`buildFullCatalogHtml` passing `true`, `buildFlyerHtml` passing `false`) in the same task. `resolveAnchorPageNumbers(pdfBytes, anchorIds)` (Task 1) is called with the same signature in Task 7. `launchChromiumOrError`/`renderHtmlToPdfBytes` (Task 6, exported) are imported and used with matching signatures in Task 7's test.

**Placeholder scan:** no TBD/TODO; every step has literal code or an exact grep/run command; no step says "similar to Task N" without repeating the actual code.
