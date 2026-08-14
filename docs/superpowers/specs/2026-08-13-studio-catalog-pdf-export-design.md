# Seller Studio: Catalog PDF Export

**Date:** 2026-08-13
**Status:** Approved design, pending implementation plan
**Approach:** Standalone print-optimized HTML template rendered to PDF via headless Chromium (Playwright), served through Studio's existing `FileResponse` plumbing.

## 1. Problem

The seller has no way to hand someone (or print for themselves) a single polished document covering the whole active listing. `pnpm fb-export` produces a CSV for Facebook Marketplace, not a human-readable document, and is CLI-only — not reachable from Studio. There is no PDF generation anywhere in the codebase today.

Key findings from exploration:

- Studio (`scripts/lib/studioApi.ts`) is a single dispatcher function driven from `studio/vite.config.ts`; all routes are `if (pathname === "/api/...")` branches. It intentionally never touches an HTTP object — handlers return `JsonResponse | FileResponse | SseResponse`, and `FileResponse = { status, file: string, contentType: string }` **names a file on disk**; `vite.config.ts:87` streams it via `createReadStream(result.file)` with no path-containment check, so a generated temp file works exactly like a photo file does today.
- `resolveItemPrice` (`lib/utils/pricing.ts:7`) is the single source of truth for price display (tiers, negotiable, reduced-price) and has no `"use client"`, so it is directly importable from a Node script.
- `loadAllItemsRaw()` and `loadCategories()` (`lib/content/loader.ts:481`, `:421`) give everything needed: items with `categorySlug`/`itemSlug`/`images`/`coverImage`, and categories with `displayName`/`sortOrder`.
- `EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"])` (`scripts/export-facebook.ts:36`) is the existing precedent for "public-visible" filtering; this feature reimplements the same set rather than importing it (small, module-local constant — importing from `export-facebook.ts` would couple a Studio server route to a CLI script's `main()`-executing module).
- No PDF library exists in the repo. Studio already binds to `127.0.0.1` only, so adding a devDependency with a large local browser binary is consistent with its existing local-only footprint.
- The CSRF guard (`studio/csrfGuard.ts`) requires `content-type: application/json` on every non-GET/HEAD request; the new endpoint is a POST and must be called with a JSON body (an empty `{}` is enough).

## 2. Scope

### In scope

1. One Studio action that generates a single combined PDF catalog of all public-visible items: cover page → table of contents (grouped by category, clickable) → category divider + one page per item.
2. Each item page links to its live page (`${siteConfig.baseUrl}/${categorySlug}/${itemSlug}`) as a real clickable link plus the literal URL printed as text.
3. Client-side download of the generated PDF (browser `Blob`, no server-side write into any git-tracked directory).

### Out of scope (YAGNI)

- Per-item standalone PDF export (single-item ad). Not requested once the combined-catalog scope was confirmed; the template functions are still decomposed per-item so this could be added later without a rewrite, but no per-item entry point ships now.
- Page numbers *inside* the table of contents (`target-counter()` is unsupported by Chromium's print-to-PDF). Running "Page X of Y" footers on every page still ship, via Playwright's built-in footer template.
- QR codes on item pages. The clickable link + printed URL satisfies "link to the item on the web"; a QR code is a plausible future enhancement, not built now.
- Progress streaming (SSE) for the generation step. A single POST/response is adequate for the expected catalog size; `SyncBar`'s SSE pattern is noted as the thing to reach for if generation time becomes a problem later.
- Any `SiteConfig`/`UIConfig` field additions (no new seller-configurable knobs — colors/fonts are fixed in the template's CSS).
- Writing the PDF into `exports/` or any tracked directory. It is a downloaded artifact, not repo content.

## 3. Semantics

- **Eligible items:** `status` in `{available, pending, reserved}`. `sold` and `draft` are excluded. If zero items are eligible, the endpoint returns an error (`400`) with a clear message instead of producing an empty PDF.
- **Grouping and order:** categories in `loadCategories()` order (which already applies `sort_order` ascending, then alphabetical for unordered categories — `lib/content/loader.ts:379-384`). Within a category, items sorted newest-first by `listed_date` (fallback to `name` alphabetical if `listed_date` is absent, for parity with items that predate the field).
- **`reserved_for` is never read.** The item-rendering function receives only the fields it needs to lay out a page (name, price, condition, brand, model, dimensions, weight, color, ageYears, description, tags, images, coverImage, categorySlug, itemSlug, status) — never the full `Item` object — so there is no code path through which the field could leak into the template, matching Iron Rule 4 structurally rather than by convention alone.
- **Price display** goes through `resolveItemPrice`, so tier lists, "negotiable", and reduced-price strike-through match the live site's rules exactly.
- **Images:** CDN URLs from `item.images` (same URLs the live site serves). `coverImage` first, then up to 3 more. Each `<img>` gets an inline `onerror` fallback (hide the broken-image icon, collapse its grid cell) so one missing/un-uploaded photo cannot break the whole page's layout — expected for any item exported before `pnpm upload-images` has run for it.
- **TOC navigation:** each item title in the TOC is an `<a href="#item-<categorySlug>-<itemSlug>">`; each item page carries that anchor `id`. Chromium preserves in-document fragment links as working internal navigation in the exported PDF. No literal page numbers next to TOC entries (see Out of scope).
- **Footer:** every page gets `<site name> · Page <n> of <N>` via Playwright's `footerTemplate`/`headerTemplate` mechanism (`<span class="pageNumber">`/`<span class="totalPages">`), independent of the TOC limitation above.

## 4. Architecture

```
Browser (Studio SPA)                          Server (scripts/lib/studioApi.ts)
─────────────────────                         ──────────────────────────────────
components/…
panes/ExportPdfDialog.tsx   (new)
  header button "Export PDF" → dialog
api.ts
  + exportCatalogPdf()
        │  POST /api/export-pdf  (new, JSON body {})
        └────────────────────────────►  handleExportPdf
                                           │
                                           ▼
                                 scripts/lib/pdfCatalog/generate.ts
                                   loadAllItemsRaw() + loadCategories()
                                   → filter/group/sort
                                   → template.ts: buildFullCatalogHtml()
                                   → playwright.chromium: setContent → page.pdf()
                                   → write bytes to os.tmpdir()/…-<uuid>.pdf
                                           │
                                 returns FileResponse{file, contentType}
        ◄──────────────────────────────────
   studio/vite.config.ts (unchanged) streams the temp file, client
   downloads it as a Blob, triggers save-as via a temporary <a download>.
```

No writes to `content/` or any git-tracked path occur. This is a read-only-over-content, generate-a-throwaway-temp-file feature — the narrowest possible relationship to Iron Rule 1.

## 5. Component details

### 5.1 `scripts/lib/pdfCatalog/template.ts` (new file)

Pure functions building one HTML string, no I/O:

- `buildCoverHtml(siteConfig, itemCount, categoryCount, generatedAt)` — site name/tagline/logo from `content/config.ts`, "Full Listing Catalog", item/category counts, generation date.
- `buildTocHtml(groupedItems)` — one section per category (bold header), item titles indented beneath as anchor links.
- `buildCategorySectionHtml(category)` — a `page-break-before: always` divider: `displayName` + `description`.
- `buildItemHtml(itemView)` — takes a narrowed `ItemPdfView` type (see §3), not the full `Item`; renders title, resolved price, image grid, description, specs table, status badge (only for pending/reserved), "View Live Listing" link + printed URL. Anchor `id="item-<categorySlug>-<itemSlug>"`.
- `buildFullCatalogHtml(...)` — concatenates the above plus one `<style>` block (system font stack only — no external font/CSS requests, so generation never depends on network availability beyond the CDN item images themselves).

### 5.2 `scripts/lib/pdfCatalog/generate.ts` (new file)

`generateCatalogPdf(projectRoot: string): Promise<{ file: string } | { error: string }>`:

1. `loadAllItemsRaw()` + `loadCategories()`.
2. Filter to `EXPORTABLE_STATUSES`; if empty, return `{ error: "No public-visible items to export." }`.
3. Group by category (skip categories with zero eligible items), sort per §3.
4. Narrow each `Item` to `ItemPdfView` before handing to the template layer (enforces the `reserved_for` exclusion structurally).
5. `buildFullCatalogHtml(...)`.
6. Launch `playwright.chromium.launch()`; on launch failure (Chromium not installed), catch and return `{ error: "PDF renderer not installed. Run: npx playwright install chromium" }` rather than throwing.
7. `page.setContent(html, { waitUntil: "networkidle" })`, then `page.pdf({ format: "Letter", printBackground: true, displayHeaderFooter: true, footerTemplate, margin: {...} })`.
8. Write bytes to `path.join(os.tmpdir(), \`usedexchange-catalog-${Date.now()}.pdf\`)`; close the browser; return `{ file }`.

### 5.3 Studio API — `POST /api/export-pdf`

New branch in `scripts/lib/studioApi.ts`, modeled on the existing route dispatch:

- No request body fields needed (client sends `{}` to satisfy the CSRF content-type check).
- Calls `generateCatalogPdf(projectRoot)`.
- Success → `{ status: 200, file, contentType: "application/pdf" }` (a `FileResponse`, streamed by the unchanged `vite.config.ts:87` path).
- Failure → `JsonResponse` `{ status: 400, body: { error } }` for "no eligible items" / "Chromium not installed"; `{ status: 500, ... }` for unexpected render failures.

### 5.4 Studio frontend

- `studio/src/api.ts`: `exportCatalogPdf(): Promise<Blob>` — POST with `Content-Type: application/json`, body `"{}"`; throws with the server's `error` message on non-2xx (mirrors the existing `publish()`/`bulkStatus()` error-surfacing pattern).
- `studio/src/panes/ExportPdfDialog.tsx` (new), modeled on `NewItemDialog.tsx`'s dialog shell and `PublishPane.tsx`'s busy/success/error state machine:
  - Opened via a new header button (`t("header.exportPdf")`) next to the existing Config/Setup/Defaults buttons in `App.tsx`.
  - On open, shows the eligible item/category count (computed client-side from the already-loaded `items` list using the same status filter, so opening the dialog costs no extra request).
  - "Generate & Download" button → `busy` → `exportCatalogPdf()` → on success, `URL.createObjectURL(blob)` + a temporary `<a download="usedexchange-catalog-YYYY-MM-DD.pdf">` click, then revoke the object URL; dialog shows a success message and a "Done" close button.
  - On error, shows the server's message inline (e.g. the Chromium-not-installed instruction), matching `PublishPane`'s `publishError` rendering.

### 5.5 New dependency

`playwright` as a devDependency. Document the one-time `npx playwright install chromium` step in `docs/SCRIPTS.md`/`_zh` and surface the same instruction as the dialog's error message so a seller who hits it isn't stuck reading source.

## 6. Visual design

Editorial catalog style, fixed (no config knobs): cream/off-white background, charcoal body text, one accent color; a serif stack (`Georgia, "Times New Roman", serif`) for titles, system sans (`-apple-system, "Segoe UI", sans-serif`) for body — both are OS-installed fonts, so no network fetch is needed during `setContent()`. Page size Letter (matches the SF/US context already in `content/config.ts`). Item pages: title, resolved price, image grid (cover + up to 3), description, a compact specs table (condition/brand/model/dimensions/color/age), status badge when not `available`, and the live-link block.

## 7. Iron-rule compliance

- **Rule 1 (`content/` only):** the feature never writes anywhere; it only reads `content/` via existing loaders and writes a temp file under `os.tmpdir()`, which is outside the repo entirely. New source files are Studio app code, permitted because the seller explicitly requested this feature (Rule 3).
- **Rule 2 (bilingual docs):** doc updates in §9 apply to English and `_zh` in the same commit.
- **Rule 4 (`reserved_for`):** enforced structurally — the template layer's input type (`ItemPdfView`) has no field for it, so no render path can access it even by accident.
- **Rule 5/6:** not applicable (no `image-manifest.json` or `pricing.ts` changes — `resolveItemPrice` is consumed, not modified).
- **Rule 8 (config compat):** no `SiteConfig`/`UIConfig` fields added.

## 8. Testing

1. **Template unit tests** (`scripts/lib/pdfCatalog/template.test.ts`): fixture items across statuses — asserts `sold`/`draft` excluded from grouped input before it ever reaches the template (tested at the `generate.ts` filtering step) and asserts the rendered HTML never contains a `reserved_for` value even when a fixture item carries one (defense-in-depth check on top of the structural type guarantee); asserts TOC anchor hrefs match item page anchor ids one-for-one; asserts category ordering follows `sort_order`.
2. **Generate integration test** (`scripts/lib/pdfCatalog/generate.test.ts`): runs `generateCatalogPdf()` against 1-2 fixture items with real (or stubbed) image URLs, asserts the returned file's first bytes are `%PDF`; skipped with a console notice if Chromium isn't installed locally (detect via a cheap `chromium.launch()` try/catch), so it never breaks CI or another dev's first run before they've run the install step.
3. **Studio API test** (`scripts/lib/studioApi.test.ts`): `/api/export-pdf` returns a `FileResponse` on success (mirrors the existing image-serving `isFileResponse` assertions at `studioApi.test.ts:705-706`); returns `400` with the right message when zero items are eligible.
4. **`ExportPdfDialog` test:** renders eligible count from a fixture item list; button disabled while busy; error message rendered on a rejected fetch.
5. **Manual pass (`pnpm studio`):** generate against the real local catalog, open the resulting PDF, confirm: TOC links jump correctly, item links open the live site, footer page numbers are correct, no broken-image layout when an item lacks CDN photos.

## 9. Doc updates (same commit, EN + `_zh`)

- `docs/DESIGN.md` / `docs/DESIGN_zh.md` §22 (Seller Studio): new "Catalog PDF export" subsection describing the feature and its TOC/page-number limitation.
- `docs/CURRENT_FUNCTIONALITY.md` / `_zh`: feature list addition.
- `docs/TECH_REQUIREMENTS.md` / `_zh` §30: add `POST /api/export-pdf` to the Studio endpoint table.
- `docs/SCRIPTS.md` / `_zh`: note the one-time `npx playwright install chromium` setup step.
