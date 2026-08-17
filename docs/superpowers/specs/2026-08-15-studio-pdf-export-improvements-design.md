# Design: Seller Studio PDF export improvements

**Date:** 2026-08-15  
**Scope:** Three independent improvements to the existing "Export catalog PDF" feature in Seller Studio, to be implemented sequentially as separate tasks.  
**Out of scope:** Public visitor PDF generation (covered by a separate prompt).

## Background

The existing PDF pipeline lives in:

- `scripts/lib/pdfCatalog/template.ts` — HTML/CSS builders (`buildFullCatalogHtml`, `buildItemHtml`, `buildCoverHtml`, `buildTocHtml`, `buildCategorySectionHtml`).
- `scripts/lib/pdfCatalog/generate.ts` — Playwright/Chromium render orchestration (`generateCatalogPdf`).
- `scripts/lib/studioApi.ts` — `POST /api/export-pdf` handler.
- `studio/src/panes/ExportPdfDialog.tsx` — dialog UI.
- `studio/src/api.ts` — client-side `exportCatalogPdf()`.

Current behavior: the dialog exports one combined catalog PDF for all eligible items (`available`, `pending`, `reserved`). Chromium fetches every item photo live from CDN during `page.setContent(html, { waitUntil: "networkidle" })`, which is slow and flaky for large catalogs.

## Improvement 1 — Local image prefetch before rendering

### Goal
Remove live CDN fetches from the Playwright render path so large catalogs render faster and with fewer network failures.

### Approach
1. Before calling `page.setContent()`, extract every image URL referenced in the generated HTML:
   - Each item's photos (`<img src>` inside `buildItemHtml`).
   - The cover logo (`<img class="cover-logo" src>` in `buildCoverHtml`).
2. Download each URL in parallel using `fetch()`:
   - Per-image timeout: 10s.
   - Per-image size cap: 10MB.
   - Write successful downloads into a temp directory under `os.tmpdir()`, using a deterministic filename derived from a hash of the URL (e.g., `usedexchange-pdf-<hash>.<ext>`).
3. Rewrite the HTML so every successfully downloaded image points to `file://<tempPath>`.
4. Failed downloads are skipped silently; the rewritten HTML omits that image's `src`, matching the intent of the existing `onerror="this.remove()"` behavior.
5. Render the rewritten HTML with `page.setContent(html, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS })` as today.
6. Clean up the temp directory in a `finally` block after `browser.close()`, regardless of whether PDF generation succeeded.

### Fallback
If the prefetch step as a whole exceeds 30s, abort further downloads and fall back to the original HTML with remote URLs. This keeps the export working even on very slow connections.

### Files touched
- `scripts/lib/pdfCatalog/generate.ts` — add `prefetchImages()` helper; integrate into `generateCatalogPdf()`.
- `scripts/lib/pdfCatalog/generate.test.ts` — new unit tests for URL extraction, rewriting, and graceful failure (no Playwright).

### Error handling
- Individual image download failures: swallowed, image omitted.
- Total prefetch timeout: fallback to remote URLs.
- Temp directory cleanup failure: swallowed so it never masks the real result.

---

## Improvement 2 — Pre-export readiness check

### Goal
Show the seller which eligible items are missing key fields that would make their PDF page look sparse or broken, without blocking the export.

### Approach
1. Add a new module `scripts/lib/pdfCatalog/checkPdfReadiness.ts` exporting:

   ```ts
   export type PdfReadinessFlag = "photos" | "description" | "price";
   export type PdfReadinessWarning = {
     id: string;
     name: string;
     missing: PdfReadinessFlag[];
   };
   export function checkPdfReadiness(items: StudioItem[]): PdfReadinessWarning[];
   ```

2. A warning is emitted for each eligible item missing any of:
   - `photos`: `imageCount === 0`.
   - `description`: `description.trim() === ""`.
   - `price`: `lowestTierAmount === null` (which corresponds to `price.tiers.length === 0` in the current `StudioItem` shape).

3. Add `description: string` to the `StudioItem` type in `scripts/lib/studioApi.ts` so `listStudioItems()` returns it and the dialog can check client-side without an extra round trip.

4. `ExportPdfDialog.tsx` calls `checkPdfReadiness(eligible)` client-side and renders a collapsible warning panel when warnings exist.
4. The Generate button remains enabled; this is advisory only.
5. Add new i18n keys under `exportPdf.readiness.*` in both English and Chinese string files.

### Why not reuse `siteReadiness.ts`?
`siteReadiness.ts` judges site-launch readiness (identity, image storage, first item, git, contact, translations, shipping, Aceternity). It has no item-level content checks and its concerns are different from PDF page quality. A dedicated, lighter check keeps the two concepts independent.

### Files touched
- `scripts/lib/pdfCatalog/checkPdfReadiness.ts` — new module.
- `scripts/lib/pdfCatalog/checkPdfReadiness.test.ts` — new unit tests.
- `scripts/lib/studioApi.ts` — add `description` to `StudioItem` / `listStudioItems()`.
- `studio/src/panes/ExportPdfDialog.tsx` — render warnings.
- `studio/src/i18n/strings.en.ts` — new keys.
- `studio/src/i18n/strings.zh.ts` — new keys.
- `studio/src/panes/ExportPdfDialog.test.tsx` — add warning-panel tests.

### Error handling
If `checkPdfReadiness()` throws, the dialog hides the warning panel silently. Export is never blocked.

---

## Improvement 3 — Single-item flyer export

### Goal
Let the seller export a single item as its own standalone one-page flyer, without the multi-item cover, TOC, or category dividers.

### Decisions
- **Trigger:** both a per-item action and an option inside the existing dialog.
  - Per-item: an "Export flyer" button in the item drawer (`Drawer.tsx`).
  - Centralized: a mode switch inside `ExportPdfDialog` between "Full catalog" and "Single-item flyer".
- **TOC / page numbers:** none. A flyer is a single self-contained sheet.

### Approach
1. `scripts/lib/pdfCatalog/template.ts`:
   - Add `buildFlyerHtml(item: ItemPdfView, branding: SiteBranding): string`.
   - Header block: site logo + site name + tagline.
   - Body: reuse `buildItemHtml(item, branding.baseUrl)` for consistent item rendering.
   - No TOC, no category divider, empty header/footer templates.

2. `scripts/lib/pdfCatalog/generate.ts`:
   - Add `generateFlyerPdf(itemId: string)` mirroring `generateCatalogPdf()` but loading one item, building the flyer HTML, and rendering a single-page PDF.
   - Reuse the same local image prefetch helper from Improvement 1.

3. `scripts/lib/studioApi.ts`:
   - Add `POST /api/export-pdf/flyer` route with body `{ id: string }`.
   - Call `generateFlyerPdf(id)` and return a PDF file response.

4. `studio/src/api.ts`:
   - Add `exportItemFlyerPdf(id: string): Promise<Blob>`.

5. `studio/src/panes/Drawer.tsx`:
   - Add an "Export flyer" button in the drawer header.
   - Disable it when the item status is not exportable (`sold` or `draft`).

6. `studio/src/panes/ExportPdfDialog.tsx`:
   - Add a segmented mode switch at the top: "Full catalog" / "Single-item flyer".
   - In flyer mode, show a dropdown of eligible items.
   - Generate calls either `exportCatalogPdf()` or `exportItemFlyerPdf(selectedId)`.

7. Add new i18n keys under `exportPdf.flyer.*` and `drawer.exportFlyer` in both English and Chinese.

### Files touched
- `scripts/lib/pdfCatalog/template.ts` — `buildFlyerHtml()`.
- `scripts/lib/pdfCatalog/generate.ts` — `generateFlyerPdf()`.
- `scripts/lib/studioApi.ts` — new route handler.
- `studio/src/api.ts` — new client function.
- `studio/src/panes/Drawer.tsx` — drawer button.
- `studio/src/panes/ExportPdfDialog.tsx` — mode switch + dropdown.
- `studio/src/i18n/strings.en.ts` — new keys.
- `studio/src/i18n/strings.zh.ts` — new keys.
- Test files for the above.

### Error handling
- Invalid or non-existent `id`: return 400 with a friendly error message.
- Non-exportable status (`sold`, `draft`): same 400 shape.
- Drawer button disabled for non-exportable items.

---

## Implementation order

1. Improvement 1 — local image prefetch (foundational; Improvement 3 reuses it).
2. Improvement 2 — pre-export readiness check.
3. Improvement 3 — single-item flyer export.

Each is independent enough to be reviewed and merged separately, but Improvement 3 should ideally follow Improvement 1 so it can reuse the prefetch helper.

## Testing strategy

- Unit tests for `prefetchImages()`: URL extraction, rewriting, graceful omission on failure, size cap, cleanup.
- Unit tests for `checkPdfReadiness()`: all three warning flags and combinations.
- Unit tests for `buildFlyerHtml()`: contains item name, no TOC markup, no page-number footer.
- UI tests for `ExportPdfDialog`: warning panel renders, mode switch toggles, flyer dropdown filters eligible items, error states.
- Manual smoke test: generate a catalog PDF and a flyer PDF in Studio, verify images render and download works.
