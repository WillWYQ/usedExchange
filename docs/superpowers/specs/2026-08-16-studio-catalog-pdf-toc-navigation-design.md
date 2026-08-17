# Seller Studio: Catalog PDF — Real TOC Page Numbers, Full-Page Dividers, Back-to-TOC Navigation

**Date:** 2026-08-16
**Status:** Approved design, pending implementation plan
**Approach:** Two-pass render (Playwright) with `pdf-lib`-based page-number resolution between passes; CSS/template redesign of category dividers; back-to-TOC anchor links threaded through item/divider pages.

## 1. Problem

v1 (PR #11, `docs/superpowers/specs/2026-08-13-studio-catalog-pdf-export-design.md`) shipped without real TOC page numbers because Chromium's print-to-PDF doesn't support CSS `target-counter()`. Category dividers are a small heading in the top-left of an otherwise mostly-empty page rather than a full editorial section-title page, and there is no way to jump back to the table of contents from deep inside the document.

Findings from re-exploration (this branch, `feat/studio-pdf-export-improvements`):

- **Group A already landed on `develop`** (PR #12, merged via `f32ed83`): the language/price-strategy/category/status export pickers are live. `generateCatalogPdf` already takes a `PdfExportOptions` object (`locale`, `priceStrategy`, `categories`, `statuses`). This design builds directly on that current state, not v1's original shape.
- **Group C (contact/QR quick-links) has not landed.** Nothing in this design depends on it; the one integration point it should follow later is noted in §2.
- A throwaway spike (not kept) confirmed the key technical unlock: Chromium's print-to-PDF registers every HTML anchor `id` as a **named PDF destination** in the output's `/Dests` catalog dictionary, keyed by the literal id string (e.g. `/item-electronics-desk-lamp → [pageRef, /XYZ, x, y, zoom]`). This is resolvable via a direct `pdf-lib` dictionary lookup — no TOC-link-annotation walking or document-order matching required. Confirmed as a flat dictionary (not the more complex `/Names/Dests` name-tree form) at 30 anchors, and confirmed that an item's page count when rendered in isolation exactly matches its page count when rendered in-context in the full catalog (tested with a deliberately overflowing multi-page item), which is what makes a two-pass approach viable at all.

## 2. Scope

### In scope

1. Real page numbers in the table of contents, for every item row **and** every category header row (category dividers currently have no anchor `id` at all — they get one).
2. Full-page category divider: large serif title, description, and an item-count line — the same visual weight as the existing cover page (`height: 100vh`, vertically centered), replacing v1's top-padded small-heading treatment.
3. A "← Table of Contents" link on every item page and every category divider page. Absent from single-item flyers (`buildFlyerHtml`), which have no TOC to link back to.

### Out of scope (YAGNI)

- Sharing one image-prefetch pass across pass-1/pass-2. Each pass prefetches independently — simpler, and the duplicate-download cost is a one-time, bounded add to a Studio action a seller triggers occasionally, not a hot path. Revisit only if generation time becomes a real complaint (same "add SSE progress later if needed" precedent already established in the v1 spec).
- Dot-leader TOC formatting (`<toc entry> ..... <page>`). A `flex; justify-content: space-between` layout reads as a real table of contents without it, and Chromium's print engine doesn't support CSS `leader()`.
- Any Group C content (contact/QR). Not built here, not blocked on here.
- An iterative fixed-point pagination reconciliation loop. The fixed-width placeholder technique (§4) makes pass-1 and pass-2 page counts match by construction, so no "re-render until stable" loop is needed.
- Sharing/reusing a single browser page instance across the N sub-renders of an alternative chunk-summation approach — moot, since the chosen approach (§4) doesn't do per-chunk rendering at all.

## 3. Semantics

- **Page numbers are 1-based physical PDF page indices**, resolved once against pass-1's render and baked directly into pass-2's TOC — not re-resolved against pass-2's own output. This is valid *by construction*: the fixed-width placeholder technique (§4) guarantees pass-1 and pass-2 have structurally identical pagination, so a page-2 pagination re-resolution would be redundant. (`generate.test.ts` still asserts pass-1 and pass-2 total page counts match, as a drift regression guard — see §8.)
- **Every TOC row gets a number**: item rows (as before) and, newly, category header rows (`cat-<slug>` anchor, added to `buildCategorySectionHtml`).
- **Missing resolution degrades gracefully per-row.** If `resolveAnchorPageNumbers` can't resolve a given anchor id (a defensive case — e.g. an unexpected `/Dests` structural variant), that one TOC row renders with a blank page-number slot, identical to pass-1's placeholder appearance. It never fails the whole export.
- **`reserved_for` exposure is unaffected** — the new parameters threaded through (`t: UIStrings`, `showBackToToc: boolean`, `pageNumbers: Map<string, number> | null`) are all presentational; `ItemPdfView` gains no new fields.
- **Flyers are unaffected** except that `buildFlyerHtml`'s internal call to `buildItemHtml` now explicitly passes `showBackToToc: false`.

## 4. Architecture — two-pass render pipeline

```
generateCatalogPdf(options)
  │
  ├─ loadAllItemsRaw() + loadCategories() → groupEligibleItems(...)   (unchanged)
  │
  ├─ launchChromiumOrError()                          (NEW — one browser, reused for both passes)
  │     └─ on failure: same friendly "PDF renderer not installed" error as today
  │
  ├─ PASS 1 — discover pagination, discard the PDF
  │     buildFullCatalogHtml(..., pageNumbers: null)     TOC renders fixed-width empty number slots
  │     renderHtmlToPdfBytes(browser, html, opts)         (NEW — same render pipeline, returns bytes not a file)
  │     resolveAnchorPageNumbers(bytes, anchorIds)        (NEW, scripts/lib/pdfCatalog/resolvePageNumbers.ts)
  │       → Map<string, number>  (anchor id → 1-based page)
  │
  ├─ PASS 2 — the real download
  │     buildFullCatalogHtml(..., pageNumbers: <resolved map>)   TOC renders real numbers
  │     renderHtmlToPdf(browser, html, opts)              (existing file-writing path, unchanged pdfOptions)
  │
  └─ browser.close()
```

`anchorIds` = `groups.flatMap(g => ["cat-" + g.slug, ...g.items.map(i => "item-" + i.categorySlug + "-" + i.itemSlug)])`.

**pdfOptions (format/margins/header/footer template) must be byte-identical between pass-1 and pass-2** — this is a hard requirement, not a nicety: the width-reservation guarantee in §5.1 depends on both passes laying out the page box identically.

## 5. Component details

### 5.1 `scripts/lib/pdfCatalog/template.ts` (modified)

- `buildTocHtml(groups: CategoryGroup[], t: UIStrings, pageNumbers: Map<string, number> | null)` — each item `<li>` and each category `<h3>` becomes a flex row: link text on the left, a `.toc-page-num` span on the right. That span is `display: inline-block; min-width: <N>ch; text-align: right; font-variant-numeric: tabular-nums`, sized generously (3 digits) for any plausible catalog size for a single-seller site. Left **empty** when `pageNumbers` is `null` (pass-1) or when a specific anchor id is absent from a non-null map (graceful degradation); filled with the resolved number otherwise. Because the span's box width comes from CSS `min-width`, not from its text content, pass-1's empty span and pass-2's real-number span occupy **exactly** the same layout width — this is what keeps the TOC's own page count from drifting between passes, without needing to guess or iterate.
- `buildCategorySectionHtml(group: CategoryGroup, t: UIStrings)` — signature gains `t`. Redesigned to the `.cover`-style full-page treatment: `height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;` with a large serif `<h1>`, the category `description`, and a new muted item-count line (`t.pdfCategoryItemCount`, `{count}`-templated). Gains `id="cat-<slug>"` and the back-to-TOC link (absolute-positioned to the section's top corner — see below).
- `buildItemHtml(item, baseUrl, strategy, t, showBackToToc: boolean)` — new trailing param. When `true`, renders the back-to-TOC link, absolute-positioned to the section's top corner (`.item-page`/`.category-divider` both get `position: relative` so the link's `position: absolute` anchors to the individual page's section, not the document — necessary because a document-level `position: fixed` element does not repeat per physical page under Playwright's print pagination the way `headerTemplate`/`footerTemplate` do; it would only appear once, wherever it happened to land).
- `buildFullCatalogHtml(branding, groups, generatedAt, t, strategy, pageNumbers: Map<string, number> | null)` — new trailing param, threaded into `buildTocHtml`; also now passes `t` into every `buildCategorySectionHtml` call and `true` for `showBackToToc` on every `buildItemHtml` call.
- `buildFlyerHtml` — signature unchanged; its internal `buildItemHtml` call now explicitly passes `showBackToToc: false`.
- Back-to-TOC link text reuses the existing `t.pdfTocHeading` string with a static `←` prefix — matches the existing static-arrow-decoration convention already used for the live-link's `↗` suffix, so no new UIStrings key is needed for it.
- New UIStrings key: `pdfCategoryItemCount` (English default: `"{count} items in this category"`), consumed via the existing `fmt()` helper — same fixed-word-order, no-pluralization limitation already documented and accepted for every other composed PDF-chrome string in this file.
- New CSS: full-height `.category-divider` (mirrors `.cover`), `.category-divider-count`, `.back-to-toc` (absolute-positioned, accent-colored, small), `.toc-page-num` (fixed-width span), `.toc-group li`/`.toc-group h3` switched to `display: flex; justify-content: space-between; align-items: baseline`.

### 5.2 `scripts/lib/pdfCatalog/resolvePageNumbers.ts` (new file)

```
resolveAnchorPageNumbers(pdfBytes: Buffer, anchorIds: string[]): Promise<Map<string, number>>
```

- Dynamically imports `pdf-lib` (matches the existing dynamic `playwright` import in `generate.ts` — same rationale: `generate.ts` is imported at Studio module-load time, so a static import of a devDependency would crash Studio boot on any site that skipped `pnpm install`, e.g. via `pnpm update-site --skip-verify`).
- Loads the PDF via `PDFDocument.load`, builds a page-ref → 1-based-index map from `doc.getPages()`.
- Resolves the destinations dictionary: reads `/Root/Dests` directly if present (confirmed flat-dict form, up to 30 anchors); falls back to walking the tree-based `/Root/Names/Dests` name-tree form if `/Dests` is absent (defensive — both are valid per the PDF spec; not exercised by the spike, cheap insurance against a future Chromium change or a much larger catalog).
- For each requested id present in the resolved map, extracts the destination's page reference — handling both a direct `[pageRef, ...]` array (the form Chromium's output used in testing) and an indirect `{D: [pageRef, ...]}` action-wrapper form (also spec-valid, cheap to also support) — and maps it to a 1-based page index.
- Ids not found in `/Dests` (or whose page ref doesn't resolve to a known page) are simply **absent** from the returned Map. Never throws for a partial miss — only a hard failure to load/parse the PDF at all propagates as an error, caught by the caller.

### 5.3 `scripts/lib/pdfCatalog/generate.ts` (modified)

- `renderHtmlToPdf(html, opts)` is split into three pieces:
  - `launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }>` — the existing dynamic-import-and-launch logic, unchanged behavior/error message, just extracted so a caller can launch once and reuse the browser across multiple renders.
  - `renderHtmlToPdfBytes(browser, html, opts: { pdfOptions; renderErrorMessage }): Promise<{ bytes: Buffer } | { error: string }>` — the existing prefetch/goto-or-setContent/timeout/page-cleanup logic, minus the final file write.
  - `renderHtmlToPdf(browser, html, opts: { filenamePrefix; pdfOptions; renderErrorMessage })` — thin wrapper: calls `renderHtmlToPdfBytes`, writes the result to `os.tmpdir()` on success. Existing callers (`generateFlyerPdf`, and pass-2 of `generateCatalogPdf`) use this unchanged aside from now receiving an already-launched `browser`.
- `generateFlyerPdf` updated to the new launch-once-then-render-then-close shape (still a single render — no behavior change).
- `generateCatalogPdf` orchestrates the two-pass flow from §4: launch once, pass-1 via `renderHtmlToPdfBytes` (discarded after resolution), `resolveAnchorPageNumbers`, pass-2 via `renderHtmlToPdf` (the real output), close once. A pass-1 render failure returns immediately with the existing friendly error, skipping pass-2 entirely.

## 6. Visual design

Category dividers now match the cover page's editorial weight exactly: full page height, vertically centered, large serif title in the accent color, muted description below, and a new muted uppercase item-count line — visually a section title page in a printed catalog, not a running-header afterthought. The back-to-TOC link is small and unobtrusive (matches the live-link's accent-colored, non-bold-but-legible treatment), tucked into whichever top corner reads cleanest against the existing margin (implementation detail, not a re-litigated question — left corner, matching the TOC's own left-aligned category headers, is the natural default). TOC rows gain a right-aligned page number in a muted, tabular-numeral style that doesn't compete visually with the item/category name.

## 7. Iron-rule compliance

- **Rule 1** (`content/` only): unaffected — no new reads/writes outside the existing `loadAllItemsRaw()`/`loadCategories()` + `os.tmpdir()` pattern.
- **Rule 2** (bilingual docs): doc updates in §9 apply to English and `_zh` in the same commit.
- **Rule 4** (`reserved_for`): unaffected — enforced the same way it was in v1 (`ItemPdfView` has no such field); every new parameter threaded through this design is presentational only.
- **Rule 5/6**: not applicable.
- **Rule 8** (config compat): no `SiteConfig`/`UIConfig` fields added. The new `pdfCategoryItemCount` UIStrings key follows the existing, already-established i18n-key pattern — `getTranslationsForLocale` merges per-locale partial overrides against `EN_FALLBACK` (`lib/i18n/getTranslations.ts`), so a new UIStrings key needs no downstream `content/config.ts` migration, unlike a `SiteConfig`/`UIConfig` field. This is the same mechanism every existing `pdf*` key already relies on.

## 8. Testing

1. **`resolvePageNumbers.test.ts`** (new): renders a small real fixture through Playwright (same Chromium-availability skip-guard pattern already used in `generate.test.ts`), asserts `resolveAnchorPageNumbers` returns correct 1-based page indices for known anchors, and returns a map that simply omits an unknown/unrequested id rather than throwing.
2. **`template.test.ts`** (extended): `buildTocHtml` — a populated `pageNumbers` map renders real numbers in `.toc-page-num` spans; `null` renders empty (but width-reserving) spans; category headers are now links (`href="#cat-..."`) with their own number slot. `buildCategorySectionHtml` — asserts the `id="cat-..."` anchor, the item-count line, and the back-to-TOC link are present. `buildItemHtml` — asserts the back-to-TOC link appears when `showBackToToc` is `true` and is absent when `false`. `buildFlyerHtml` — extends the existing "has no TOC and does not reuse cover/TOC markup" regression test to also assert the output does **not** contain `href="#toc"`.
3. **`generate.test.ts`** (extended): the existing Chromium-gated `generateCatalogPdf` integration test is extended to assert pass-1 and pass-2 produce PDFs with the **same total page count** (via `pdf-lib`'s `getPageCount()`) — a drift regression guard proving the fixed-width placeholder technique held. Correctness of the actual resolved numbers is covered at the `resolvePageNumbers` unit level (item 1 above) and the `buildTocHtml` HTML-embedding level (item 2), rather than attempting to extract rendered text from the final PDF's content streams (would need a new text-extraction dependency for marginal additional coverage).
4. **Manual pass (`pnpm studio`)**: generate against the real local catalog; open the PDF; click every TOC entry (both item rows and category rows) and confirm the page landed on visually matches the number shown next to it; click "back to TOC" from an item page and from a category divider page and confirm it jumps correctly; confirm dividers read at the same visual weight as the cover page.

## 9. Doc updates (same commit, EN + `_zh`)

- `docs/DESIGN.md` / `docs/DESIGN_zh.md` (§22, the Catalog PDF export paragraph at `docs/DESIGN.md:2399`): remove the "table-of-contents entries ... do not show literal page numbers ... Chromium's print-to-PDF does not support CSS `target-counter()`" sentence (no longer true) and describe the two-pass render, the full-page category divider, and the back-to-TOC navigation links instead.
- `docs/CURRENT_FUNCTIONALITY.md` / `_zh` (`docs/CURRENT_FUNCTIONALITY.md:382`, the "Catalog PDF export" feature-list row): update to mention real TOC page numbers, full-page category dividers, and back-to-TOC links.
- `docs/TECH_REQUIREMENTS.md` / `_zh` §30: no change expected — the `POST /api/export-pdf` request/response contract is unchanged (only internal generation time and TOC content change); confirm during implementation that nothing there describes the render pipeline at a level of detail this would invalidate.
