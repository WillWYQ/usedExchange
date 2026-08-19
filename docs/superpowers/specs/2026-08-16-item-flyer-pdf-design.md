# Public Site: Single-Item Flyer PDF

**Date:** 2026-08-16
**Status:** Approved design, pending implementation plan
**Approach:** Client-side, lazy-loaded jsPDF flyer built from item data + fetched CDN photos — no headless-browser rendering, no server round trip.

## 1. Problem

A visitor on an item detail page (`app/[category]/[item]/page.tsx`) has no way to save or hand someone a portable, printable summary of the listing — only the live web page. This is a separate, new, public-site feature: it does not touch or reuse the existing Seller Studio catalog PDF export (`scripts/lib/pdfCatalog/**`), which is a local-only, seller-facing, multi-item Playwright/Chromium export. That code path is out of scope here and is not modified.

## 2. Scope

### In scope

1. A "Download Flyer" button on the item detail page (public site, all visitors) that generates a one-page PDF for that single item: name, price, description, photos, specs, and a link to the live listing.
2. Lazy-loaded PDF library — not present in the initial/main JS bundle; loaded only when the button is clicked.
3. Graceful degradation: library-load failure, generation failure, or an unsupported browser must never crash the page — the button shows an inline error state instead.

### Out of scope (YAGNI)

- Any change to `scripts/lib/pdfCatalog/**` or the Seller Studio "Export PDF" feature — separate feature, separate audience (seller-only, local `pnpm studio`), explicitly excluded by the task.
- Matching the Studio catalog PDF's visual style. This flyer has its own minimal layout.
- Multi-item / catalog flyers. One item, one page (photos may overflow to a second page if there are several — see §3 — but there is no table of contents or per-category grouping).
- Server-side rendering of the PDF (no Playwright/Chromium on the public static site — there is no server at all; this is a GitHub Pages static export).
- A shared toast/notification system. The repo has no toast library; `ShareButton.tsx` and `ExportPdfDialog.tsx` (Studio) both use local component state for busy/success/error — the flyer button follows the same convention.

## 3. Key decisions

### 3.1 Library choice: jsPDF only, no html2canvas / html2pdf.js

`html2pdf.js` and raw `html2canvas` work by rasterizing a DOM subtree onto a `<canvas>`. This site's styling is Tailwind v4, whose default theme and opacity-modifier utilities (`bg-accent-soft/20`, etc. — used throughout `app/[category]/[item]/page.tsx`) compile to `oklch()`/`color-mix()` CSS colors. `html2canvas` (the rasterizer underneath both `html2pdf.js` and a manual html2canvas+jsPDF pairing) does not parse those color functions and silently drops or mis-renders them — a well-documented incompatibility, not a hypothetical one. Screenshotting the real item page would produce a visually broken flyer.

Decision: draw the flyer with jsPDF's own primitives (text, rect, image, link) from item **data**, not from the rendered DOM. This sidesteps the CSS-parsing problem entirely and gives full control over pagination (photos overflow to a second page instead of being clipped). `jsPDF` (`^4`, MIT license) is the only new dependency.

### 3.2 Lazy loading

`jsPDF` (~200 KB min) must not enter the initial bundle (project instruction; also consistent with `components/ui-adapters/*` and `components/search/SearchBarClient.tsx`, which already lazy-load heavy/optional pieces via `next/dynamic`). Because the PDF generation code is a plain async function, not a React component, `next/dynamic` (built for components) is the wrong tool — a bare `await import("@/lib/pdf/generateItemFlyer")` inside the click handler is the standard pattern for lazy-loading non-component modules, and it code-splits identically (verified in §8: separate build check, not `next/dynamic`).

### 3.3 Image embedding — CORS

Photos are served from Cloudflare R2 (or the configured `imageStorage.provider`) at `item.images[]`. To embed a photo in a jsPDF document its bytes must be fetched client-side and converted to a data URL (`jsPDF.addImage` takes an image source, not a remote URL). `docs/setup_instruction.md` §Step 3 already documents R2 CORS configuration as **optional**, explicitly calling out that it is only needed "if you later fetch CDN images from JavaScript (e.g. canvas/WebGL)" — this feature is exactly that case, and CORS is *not* guaranteed to be enabled on any given seller's bucket.

Decision: fetch each image with `fetch(url, { mode: "cors" })` inside a `try/catch`; a failed fetch (CORS block, network error, 404) silently drops that one photo from the flyer rather than aborting the whole generation. The flyer always ships with whatever photos succeeded (possibly zero — the layout adapts, matching the pdfCatalog template's `onerror`-hide precedent for the same class of problem, reimplemented independently since fetch/jsPDF has no `onerror` DOM hook to reuse). `docs/setup_instruction.md` gets one line added noting the flyer feature as a second reason to enable CORS (§9).

### 3.4 Price shown

The flyer shows the price tier **currently resolved for this visitor** (same value `PricingSection` has on screen — including the geolocation-detected tier, a manual override, or the fallback tier), not a server-computed default. `FlyerButton` reads it the same way `PricingSection` does: `useDistancePricingContext()` + `resolveItemPrice(price, resolved)`, falling back to the server-computed `initialResolvedTier` prop. If `show_tiers` is true, all tiers are printed as a small table (mirrors `PricingTableToggle`'s data, laid out for print instead of HTML).

### 3.5 Where the button lives

Placed in the existing "Share + Recently Viewed" row (`app/[category]/[item]/page.tsx`, currently `<ShareButton />` alone in a flex row) as a sibling button, not a new page section — it is a peer utility action to sharing, and reuses that row's existing layout/spacing.

### 3.6 Failure / unsupported-browser states

`FlyerButton` is a local state machine (`idle | generating | success | error`), mirroring `ShareButton`'s `copied` boolean and Studio's `ExportPdfDialog` busy/error handling — no new shared UI primitive introduced. Conditions handled:

- Dynamic `import()` rejects (offline, chunk 404 after a redeploy) → error state, "Could not load the flyer generator. Check your connection and try again."
- `jsPDF` throws during generation (should not happen with valid data, but the call is still wrapped) → error state, generic message.
- `Blob`/`URL.createObjectURL` unsupported (extremely old browser) → detected via `typeof URL === "undefined" || !URL.createObjectURL` before attempting; button renders `disabled` with a title tooltip explaining why, rather than being clickable and failing.
- Success → brief inline confirmation (mirrors `ShareButton`'s 2 s "Copied!" state) then reverts to idle.

None of these states throw past the click handler — everything client-visible is `catch`-guarded.

## 4. Architecture

```
Browser (item detail page)
───────────────────────────
app/[category]/[item]/page.tsx (Server Component, unchanged data flow)
  passes: item (narrowed), initialResolvedTier, siteConfig.name/baseUrl
       │
       ▼
components/item/FlyerButton.tsx   (new, "use client")
  idle → click → dynamic import()
       │
       ▼
lib/pdf/generateItemFlyer.ts      (new — NOT imported at module scope by
                                    FlyerButton; only inside the click handler)
  import jsPDF from "jspdf"        ← the lazy chunk boundary
  fetch each item image → data URL (CORS-guarded, per-image try/catch)
  draw flyer via lib/pdf/flyerContent.ts's pure layout data
  return Blob
       │
       ▼
components/item/FlyerButton.tsx
  URL.createObjectURL(blob) → temporary <a download> click → revoke
  (same download pattern as Studio's ExportPdfDialog.tsx, reimplemented
   independently — that file is Studio-only code, not imported here)
```

`lib/pdf/flyerContent.ts` (pure, no jsPDF import) holds the testable logic: narrowing `Item` to `FlyerItemView`, formatting price lines/tier rows, building the specs row list, and building the live-listing URL/filename. `lib/pdf/generateItemFlyer.ts` imports both `jspdf` and `flyerContent.ts`, and is the only file that touches the network (`fetch`) or the DOM (`document`, implicitly via jsPDF's image handling) — this split keeps the pure formatting logic unit-testable without needing jsPDF or a DOM at all, and keeps the jsPDF import confined to the one file that is never eagerly imported.

## 5. Component details

### 5.1 `lib/pdf/flyerContent.ts` (new, pure)

```ts
type FlyerItemView = {
  name: string; description: string; condition: Condition; status: Status;
  price: Price; brand: string; model: string; ageYears: number | null;
  dimensions: Dimensions | null; weight: Weight | null; color: string;
  images: string[]; coverImage: string | null;
  categorySlug: string; itemSlug: string;
};
function toFlyerItemView(item: Item): FlyerItemView   // structural reserved_for exclusion, same pattern as pdfCatalog's ItemPdfView
function buildFlyerPriceLines(price: Price, resolvedTier: PriceTier | null): { headline: string; obo: boolean; tierRows: Array<{ label: string; amount: string; isDefault: boolean }> }
function buildFlyerSpecs(item: FlyerItemView, unitSystem: "metric" | "imperial"): Array<[string, string]>   // brand/model/age/color/dimensions/weight/condition — reuses formatDimensions/formatWeight from lib/utils/units
function buildLiveListingUrl(baseUrl: string, item: FlyerItemView): string
function buildFlyerFilename(item: FlyerItemView): string   // "<item-slug>-flyer.pdf"
```

### 5.2 `lib/pdf/generateItemFlyer.ts` (new)

```ts
async function fetchImageAsDataUrl(url: string): Promise<string | null>  // fetch → blob → FileReader; null on any failure (caught)
async function generateItemFlyerPdf(params: {
  item: FlyerItemView;
  resolvedTier: PriceTier | null;
  siteName: string;
  baseUrl: string;
}): Promise<Blob>
```

Layout (Letter, portrait, jsPDF default units = mm): site name (small, top-left) → item name (large heading) → price headline (+ OBO tag, + tier table when `show_tiers`) → photo grid (up to 4, 2×2, each fetched independently; grid collapses to however many succeeded, 0 photos = no grid, just more room for description) → specs table → description (wrapped with `doc.splitTextToSize`) → footer: live-listing URL as a real clickable link (`doc.textWithLink`) plus the literal URL text. If content exceeds one page (long description + full tier table + 4 photos), jsPDF's `addPage()` is used — this is a single-item flyer, not a strict one-pager at the cost of clipping content.

### 5.3 `components/item/FlyerButton.tsx` (new, "use client")

Props: `{ item: FlyerItemView; initialResolvedTier: PriceTier | null; siteName: string; baseUrl: string }`. Reads `useDistancePricingContext()` + `resolveItemPrice` exactly like `PricingSection` (§3.4). State machine per §3.6. Rendered next to `ShareButton` in the page's action row.

### 5.4 `app/[category]/[item]/page.tsx`

Add `import { FlyerButton } from "@/components/item/FlyerButton";` and `import { toFlyerItemView } from "@/lib/pdf/flyerContent";`, and add `<FlyerButton item={toFlyerItemView(itemData)} initialResolvedTier={initialResolvedTier} siteName={siteConfig.name} baseUrl={siteConfig.baseUrl} />` next to the existing `<ShareButton title={itemData.name} />` in the "Share + Recently Viewed" row. `initialResolvedTier` is already computed in this file (line ~135) — reused, not recomputed.

### 5.5 i18n

New `UIStrings` keys, added to `lib/config/types.ts` and `lib/i18n/translations.ts`'s `EN_FALLBACK` **only** — not to `scripts/lib/i18nRequiredKeys.ts`'s `REQUIRED_UI_STRING_KEYS`. Precedent: the `newlyListed*` keys (`lib/i18n/translations.ts:97-102`) already follow this exact pattern — present in `UIStrings`/`EN_FALLBACK`, absent from `REQUIRED_UI_STRING_KEYS` — because `i18n.translations` is typed `Record<string, Partial<UIStrings>>` (`lib/config/types.ts:127`), so any locale missing a key simply falls back to `EN_FALLBACK` through `useT()`'s merge order; nothing breaks type-checking or `check-config.ts`. Adding these keys to the *required* list would force every seller's `content/config.ts` (content/ — never touched by this task) to gain new required translation entries merely from a code deploy, which is exactly the backward-compatibility failure mode `ARCHITECTURE.md`'s "Key Invariants" table warns against for config fields. Keys: `downloadFlyer`, `generatingFlyer`, `flyerDownloaded`, `flyerLoadError`, `flyerGenerateError`, `flyerUnsupported`.

## 6. Iron-rule / invariant compliance

- Never touches `content/`. Reads `siteConfig.name`/`baseUrl` (already read elsewhere client-side, e.g. `MakeOfferButton`) and item data already loaded by the page.
- `reserved_for` never reaches the flyer: `FlyerItemView` has no such field (structural, same pattern as pdfCatalog's `ItemPdfView`), and `toFlyerItemView()` is the only place an `Item` is narrowed.
- `lib/utils/pricing.ts`/`resolveItemPrice` consumed unmodified, no `"use client"` added to it.
- Studio catalog PDF code (`scripts/lib/pdfCatalog/**`, `studio/src/panes/ExportPdfDialog.tsx`, `studio/src/api.ts`'s `exportCatalogPdf`) is not read, imported, or modified by any new file — verified no import path crosses from `lib/pdf/**` or `components/item/FlyerButton.tsx` into `scripts/lib/pdfCatalog/**` or `studio/**`.
- No `SiteConfig`/`UIConfig` field additions.

## 7. Testing

Test runner: Vitest (already configured, `pnpm test`), following existing conventions (`// @vitest-environment jsdom` header for component tests, e.g. `MakeOfferButton.test.tsx`; plain `node` environment for pure-logic tests, e.g. `scripts/lib/pdfCatalog/template.test.ts`).

1. **`lib/pdf/flyerContent.test.ts`** (node env, no jsPDF/DOM involved): `buildFlyerPriceLines` — single-tier headline, multi-tier table with the resolved row flagged, "Contact for price" when `tiers` is empty, OBO tag when `negotiable`; `buildFlyerSpecs` — omits blank fields, includes condition always; `buildLiveListingUrl`/`buildFlyerFilename` — correct slug composition; `toFlyerItemView` — never carries a `reserved_for` value even if smuggled onto the input object (same defense-in-depth pattern as the pdfCatalog test).
2. **`lib/pdf/generateItemFlyer.test.ts`** (node env, real `jspdf` since it is a real dependency, not mocked): fixture item with zero images (fetch never called — no network dependency in CI) → asserts the returned `Blob`'s bytes start with `%PDF`; a fetch-failure case (mocked `global.fetch` rejecting) → asserts generation still succeeds (photo silently dropped, not thrown).
3. **`components/item/FlyerButton.test.tsx`** (jsdom env): idle → click → `generateItemFlyerPdf` (mocked via `vi.mock("@/lib/pdf/generateItemFlyer", ...)`, since dynamic `import()` resolves through the same module registry Vitest sees) resolves → success message shown, then reverts to idle after its timeout; rejected import/generation → error message shown, button re-enabled (not stuck disabled); `URL.createObjectURL` unsupported → button renders `disabled`.
4. **Manual pass** (`pnpm build && pnpm dlx serve out`, or `pnpm dev`): open an item page, click the button, confirm a PDF downloads with the right name/photo/price/link; throttle network or block the R2 domain in devtools to confirm the "no photos" degraded path still produces a valid flyer instead of erroring.
5. **Bundle verification** (§8 of the plan): `pnpm build` then inspect `.next/` (or the Next.js build output's route/first-load-JS table plus a search for `"jspdf"` inside the emitted static chunks) to confirm `jspdf` is absent from the item page's initial JS and only appears in an on-demand chunk.
