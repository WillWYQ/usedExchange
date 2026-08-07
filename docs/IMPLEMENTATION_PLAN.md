# UsedExchange — Implementation Plan

**Version:** 1.7  
**Date:** 2026-08-02  
**Based on:** DESIGN.md v0.10.0 · TECH_REQUIREMENTS.md v0.10.0  
**Assumption:** Single developer; primary target = GitHub Pages + Cloudflare R2

---

## Summary

| Phase | Name | Est. Days | Depends On |
|---|---|---|---|
| 0 | Project Bootstrap | 1 | — |
| 1 | Aceternity UI Setup | 1 | 0 |
| 2 | Type System & Config | 1 | 0 |
| 3 | Content Schema & Loader | 2 | 2 |
| 4 | Image Pipeline | 2 | 2 |
| 5 | Common Components | 1 | 1, 3 |
| 6 | Home Page | 1.5 | 5 |
| 7 | Geolocation & Pricing System | 2 | 3 |
| 8 | Category Page + Browse All + Sold Archive | 2 | 6, 7 |
| 9 | Item Detail Page | 2 | 6, 7, 10 |
| 10 | Contact System | 1 | 5 |
| 11 | UI Slot Adapters (wiring) | 1 | 1, 8, 9 |
| 12 | Internationalisation Runtime | 2 | 5, 6, 9 |
| 13 | SEO, Search, A11y & Security Hardening | 1 | 11 |
| 14 | Deployment | 1 | 4, 13 |
| 15 | AI Skill Files (Setup Wizard + Item Generator + Item Translator) | 2 | 3 |
| 16 | Shipping Calculator Integration (Optional) | 2 | 7, 12 |
| 17 | Facebook Marketplace Smart Export | 1 | 3 |
| 18 | Seller Studio | 4 | 4, 15 |
| **Total** | | **~30.5 days** | |

**Critical path:** 0 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 13 → 14  
**Parallelisable:** Phase 1 ∥ Phase 2; Phase 4 ∥ Phase 3; Phase 10 ∥ Phase 7; Phase 12 (i18n) ∥ Phases 10, 11, 13; Phase 15 ∥ Phases 5–14

---

## Phase 0 — Project Bootstrap ✅
**Goal:** A clean, runnable Next.js 15 repo with all tooling configured. `pnpm dev` starts without errors (blank page is fine).

### Tasks
- [x] `pnpm create next-app@latest usedExchange --typescript --tailwind --app --use-pnpm`
- [x] Remove all Next.js boilerplate content from `app/`
- [x] Configure Tailwind v4: add `@import "tailwindcss"` and `@plugin "@tailwindcss/typography"` to `app/globals.css`; create `postcss.config.mjs` with `{ plugins: { "@tailwindcss/postcss": {} } }`; omit `tailwind.config.ts` unless theme customisation is needed. See TECH_REQUIREMENTS.md §22.2.
- [x] Configure `tsconfig.json` per TECH_REQUIREMENTS.md §5 (strict, noUncheckedIndexedAccess, `@/*` alias, correct include)
- [x] Configure `next.config.ts` skeleton (no Aceternity remotePatterns yet — added in Phase 1)
- [x] Configure ESLint per TECH_REQUIREMENTS.md §16 (including `scripts/` override for no-console)
- [x] Configure Prettier per TECH_REQUIREMENTS.md §16
- [x] Verify `.gitignore` matches TECH_REQUIREMENTS.md §18 (content/items images, public/items/, public/contact/, public/search-index.json, .image-cache/) — note: `lib/generated/image-manifest.json` is git-tracked and must NOT be gitignored
- [x] Install production deps: `next react react-dom zod react-markdown remark-gfm clsx tailwind-merge fuse.js @vercel/analytics @vercel/speed-insights framer-motion @tabler/icons-react`
  > `@vercel/analytics` and `@vercel/speed-insights` are no-ops outside Vercel; include them so the option is available without a reinstall.
- [x] Install dev deps: `typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss @tailwindcss/typography eslint eslint-config-next prettier prettier-plugin-tailwindcss tsx next-sitemap vitest @vitest/coverage-v8`
  > `vitest` + `@vitest/coverage-v8` are required by Phase 3a unit tests (TECH_REQUIREMENTS.md §25.2). Add `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"` to `package.json` scripts at the same time.
- [x] Create full directory skeleton (all folders from DESIGN.md §16, empty `.gitkeep` where needed)
- [x] Create `content/` folder with placeholder `config.ts` and sample `items/` structure
- [x] Verify `pnpm dev` starts without TypeScript or lint errors

### Acceptance Criteria
- `pnpm dev` → blank page, no console errors
- `pnpm type-check` → 0 errors
- `pnpm lint` → 0 warnings

---

## Phase 1 — Aceternity UI Setup ✅
**Goal:** All 27 supported Aceternity components installed in `components/ui/` and committed to git. Can be run in parallel with Phase 2.

### Tasks
- [x] Write `scripts/setup-ui.sh` with all 27 install commands (TECH_REQUIREMENTS.md §21)
- [x] Add `"setup-ui": "bash scripts/setup-ui.sh"` to `package.json`
- [x] Run `pnpm setup-ui` (requires internet, ~5 min)
- [x] Resolve any dependency conflicts from Aceternity installs (peer dep warnings)
- [x] Commit all generated `components/ui/*.tsx` files
- [x] Verify `pnpm type-check` still passes after installs

### Acceptance Criteria
- `components/ui/` contains all 27 component files (13 background + 3 grid + 4 gallery + 7 card)
- `pnpm type-check` → 0 errors
- No Aceternity import errors at build time

### Notes
- Run only once per machine; subsequent clones get these files from git
- Some Aceternity components may bring in additional peer dependencies (e.g. `three`, `d3`) — install only what the component requires, not the full peer list

---

## Phase 2 — Type System & Config ✅
**Goal:** All TypeScript types, `SiteConfig`, and `content/config.ts` defined. No implementation yet — just the type contracts every subsequent phase depends on.

### Tasks
- [x] Write `lib/ui/types.ts` — `BackgroundOption`, `ItemGridOption`, `GalleryOption`, `ItemCardOption`, `UIConfig` (TECH_REQUIREMENTS.md §21)
- [x] Write `lib/config/types.ts` — `SiteConfig` type (all fields from DESIGN.md §13; includes `UIConfig`)
- [x] Write `content/config.ts` — fully populated starter config with all fields, comments, sensible defaults (DESIGN.md §13)
- [x] Write `lib/content/types.ts` — `Item`, `Category`, `Price`, `PriceTier`, `Condition`, `Status`, `Dimensions`, `Weight`, `ResolvedDistance`, `GeolocationState` (TECH_REQUIREMENTS.md §8, §20)
- [x] Verify `pnpm type-check` passes (types self-consistent)

### Acceptance Criteria
- All types compile with 0 errors
- `content/config.ts` imports and exports `siteConfig` without errors
- No `any` types

---

## Phase 3 — Content Schema & Loader ✅
**Goal:** The data layer is complete. `loadCategories()`, `loadItemsByCategory()`, `loadItem()`, `loadAllItems()` all work against real `content/items/` folders. **This is the single most important phase — all pages depend on it.**

### Tasks

#### 3a — Zod Schema (`lib/content/schema.ts`)
- [x] Write `itemJsonSchema` — Zod schema for `item.json` with all defaults per TECH_REQUIREMENTS.md §6 (safe defaults, `.safeParse()` contract)
- [x] Write `categoryJsonSchema` — Zod schema for `_category.json`
- [x] Implement `withDefaults<T>()` helper per TECH_REQUIREMENTS.md §6.2
- [x] Unit-test edge cases: missing `name` (skip item), invalid enum (default to valid), null number (→ null), zero number (→ 0, not null), negative number (→ null), invalid ISO date (→ null)

#### 3b — Pure Utilities (`lib/utils/`)
- [x] Write `lib/utils/haversine.ts` — `haversineInMiles(lat1, lng1, lat2, lng2)` (TECH_REQUIREMENTS.md §20)
- [x] Write `lib/utils/pricing.ts` — `resolveItemPrice(price, resolved)` pure function (DESIGN.md §17; importable by server components)
- [x] Write `lib/utils/date.ts` — `formatRelativeDate(isoDate: string | null, now?: Date): string` → "Today" / "3 days ago" / "" (`now` defaults to `new Date()`; pass explicitly in tests only — TECH_REQUIREMENTS.md §22.11)
- [x] Write `lib/utils/jsonld.ts` — `buildProductJsonLd(item, baseUrl)` and `buildBreadcrumbJsonLd(crumbs)` (TECH_REQUIREMENTS.md §22.4)
- [x] Write `lib/utils/i18n.ts` — `getLocalizedField(item, field, locale)` and `t(key)` (TECH_REQUIREMENTS.md §22.8)
- [x] Test `haversineInMiles` against known coordinates
- [x] Test `resolveItemPrice` for all branches: Infinity, exact match, gap, empty tiers, open-ended tier
- [x] **(Added 2026-06-14)** Write `lib/utils/units.ts` — `convertLength`/`convertWeight`, `resolveMeasurementUnit(locale, config)` (resolves `siteConfig.i18n.localeMeasurementUnits?.[locale] ?? siteConfig.measurementUnit`), `formatDimensions`/`formatWeight` (convert an item's stored dimensions/weight to the resolved unit system for display, rounded to 2 decimals). No `"use client"` — used by `MetadataTable.tsx`

#### 3c — Loader (`lib/content/loader.ts`)
- [x] Implement `loadCategories()` — reads `content/items/`, parses `_category.json`, applies sort logic (DESIGN.md §6), excludes `_`-prefixed folders
- [x] Implement `loadItemsByCategory()` — reads item folders, applies visibility rules (draft excluded, sold+retention check), reads manifest for image URLs
- [x] Implement `loadItem()` — returns `null` if missing, never throws
- [x] Implement `loadAllItems()` — `available` status ONLY; sorted by `listedDate` desc; capped at `siteConfig.recentlyListedCount`. **Home page recently-listed strip only.** Do NOT use for the /all page (see Phase 8b).
- [x] Implement `loadSoldItems()` — returns ALL sold items regardless of `soldItemRetentionDays`; sorted by `soldDate` desc (falls back to `listedDate`); used by `/sold` archive page (TECH_REQUIREMENTS.md §8)
- [x] Write `lib/search/index.ts` — `buildSearchIndex()`: reads all non-draft, non-sold items (available/pending/reserved), returns `SearchIndexEntry[]` with fields: `categorySlug`, `itemSlug`, `name`, `description`, `brand`, `model`, `tags`, `course`, `isbn`, `edition`, `coverImage`. The function only returns the array; the caller (`scripts/build-search-index.ts`, run in `prebuild`) writes the result to `public/search-index.json` (NOT `lib/generated/`) so SearchBar can fetch it via HTTP (TECH_REQUIREMENTS.md §22.1 and §7)
- [x] Image URL resolution: `manifest[key] ?? "/items/{key}"` fallback (DESIGN.md §11)
- [x] Image sorting: `filenames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))` — explicit sort, never rely on `readdir` order (DESIGN.md §4)
- [x] Verify `reserved_for` field is never included in returned `Item` type
- [x] **(Added 2026-06-14)** `item.json`/`_category.json` parsed as JSONC via `jsonc-parser` (`readJsonc()` helper, `allowTrailingComma: true`) — `//` comments and trailing commas allowed; strict JSON still parses with zero errors, so existing files are unaffected

#### 3d — Seed Data & Content CLI Scripts
- [x] Create 2 sample categories (`content/items/houseware/`, `content/items/electronics/`)
- [x] Create 3–4 sample `item.json` files covering all status values and edge cases
- [x] Create `lib/generated/image-manifest.json` with `{}` (empty starter)
- [x] Write `scripts/mark-sold.ts` — reads `content/items/<cat>/<name>/item.json`, sets `status: "sold"` and `sold_date: today (ISO 8601)`, writes file in place; exits 1 with a clear error if the item path does not exist (TECH_REQUIREMENTS.md §22.3)
- [x] Write `scripts/create-item.ts` — creates `content/items/<category>/<name>/` folder and `item.json` from template; opens in `$EDITOR` if set; validates category exists (TECH_REQUIREMENTS.md §22.3)
- [x] Write `scripts/create-template.ts` — creates `content/items/<category>/_template.json` or global `content/items/_template.json` without an argument (TECH_REQUIREMENTS.md §22.3)
- [x] Extract `scripts/lib/itemTemplate.ts` (`buildItemTemplate()`) as the single source of truth for the scaffold, used by both `create-item.ts` and `create-template.ts` — covers all 36 scaffoldable fields from DESIGN.md §5 (`reserved_for` excluded), with `dimensions`/`weight` written as empty placeholder structures (`{ length: null, width: null, height: null, unit: "cm" }` / `{ value: null, unit: "kg" }`) that coerce to `null` via the existing Zod `.catch(null)` logic if left unfilled
- [x] Verify loader returns correct data for sample items
- [x] **(Added 2026-06-14)** `buildItemTemplate(name, listedDate, measurementUnit)` — `dimensions.unit`/`weight.unit` placeholders now default from `siteConfig.measurementUnit` ("metric" → cm/kg, "imperial" → in/lb) instead of being hardcoded
- [x] **(Added 2026-06-14)** `scripts/lib/itemTemplate.ts` — `renderItemTemplateJsonc()` writes the template as JSONC with `// options: ...` comments listing every valid value for `condition`, `status`, `dimensions.unit`, and `weight.unit`; `create-item.ts`/`create-template.ts` write this output
- [x] **(Added 2026-06-14)** `scripts/lib/markSold.ts` (`applyMarkSold()`) — `mark-sold` now edits `status`/`sold_date` via `jsonc-parser`'s `modify`/`applyEdits` (targeted token edits) instead of a full parse/stringify round trip, so `// options: ...` comments and seller formatting survive

### Acceptance Criteria
- All 4 loader functions return typed data from sample `content/items/`
- Missing `item.json` → `loadItem()` returns `null`, no throw
- Invalid field values → defaults applied, no crash
- `reserved_for` not present in any returned `Item` object
- All unit tests pass

### References
DESIGN.md §4, §5, §6, §8, §11 · TECH_REQUIREMENTS.md §6, §7, §8

---

## Phase 4 — Image Pipeline ✅
**Goal:** `pnpm dev` shows images from `content/items/`. `pnpm upload-images` successfully uploads to **Cloudflare R2** (the recommended/primary provider) and writes a manifest; the Vercel Blob path is implemented in parallel as the alternate. Can be developed in parallel with Phase 3.

### Tasks

#### 4a — Adapter Interface
- [x] Write `lib/images/adapter.ts` — `ImageStorageAdapter` interface (TECH_REQUIREMENTS.md §7)

#### 4b — Provider Implementations
- [x] Write `lib/images/local.ts` — copies to `public/items/`, returns `/items/{key}`, skips unchanged
- [x] Write `lib/images/cloudflare-r2.ts` (primary) — SHA-256 compare, `@aws-sdk/client-s3 PutObjectCommand`, returns CDN URL; clear error if `CF_R2_*` missing
- [x] Write `lib/images/vercel-blob.ts` (alternate) — SHA-256 compare, `@vercel/blob put()`, returns CDN URL; clear error if `BLOB_READ_WRITE_TOKEN` missing
- [x] Install provider devDeps: `pnpm add -D @aws-sdk/client-s3` (Cloudflare R2 — recommended). `@vercel/blob` code implemented; install separately when exercising that path.

#### 4c — Sync Script (`scripts/sync-images.ts`)
- [x] Implement `--mode upload`: scan, SHA-256, upload new/changed, purge stale manifest entries, copy contact/, write manifest, write checksum cache, print backup reminder (TECH_REQUIREMENTS.md §7)
- [x] Implement `--mode dev-sync`: copy to `public/items/`, copy contact/, graceful if `content/items/` missing
- [x] Implement `--mode build-check`: local provider → copy locally; cloud provider → verify manifest exists, warn if missing; always copy contact/
- [x] Update `next.config.ts` to add Vercel Blob / R2 remote patterns (TECH_REQUIREMENTS.md §4) — completed in Phase 0
- [x] Write `lib/images/stripMetadata.ts` (`sharp`, required devDependency) — strip EXIF/IPTC/XMP (incl. GPS) from new/changed JPEG/PNG/WebP before `--mode upload`; auto-rotate via `.rotate()` first so orientation is preserved; GIFs pass through unchanged. `--mode dev-sync`/`build-check` are unaffected (local copies keep original bytes).

#### 4d — Integration Test
- [x] `pnpm dev` → sample images appear at `/items/houseware/item/cover.jpg`
- [x] `pnpm upload-images` with `CF_R2_*` set → images uploaded to R2; manifest written with R2 CDN URLs (repeat with `BLOB_READ_WRITE_TOKEN` if validating the Vercel Blob path)
- [x] `pnpm build` in a CI-like environment (no local images) → manifest read in build-check mode, no upload attempted, build succeeds

### Acceptance Criteria
- Local dev: images served from `public/items/`
- Upload run: `lib/generated/image-manifest.json` written with valid CDN URLs
- Build-check with cloud provider: reads manifest, does not attempt upload
- Deleted item folder: manifest entry purged on next upload run
- Exit code 1 on any unrecoverable error

### References
DESIGN.md §3, §14 · TECH_REQUIREMENTS.md §7

---

## Phase 5 — Common Components ✅
**Goal:** All shared presentational components are ready. No pages yet.

### Tasks
- [x] `components/common/AdaptiveImage.tsx` — `next/image` vs `<img>` based on `deploymentMode` (TECH_REQUIREMENTS.md §9)
- [x] `components/layout/SiteHeader.tsx` — site name/logo, navigation placeholder
- [x] `components/layout/SiteFooter.tsx` — site name, last-build timestamp, ContactSection slot
- [x] `components/layout/Breadcrumb.tsx` — Home → Category → Item, correct hrefs
- [x] `components/item/StatusBadge.tsx` — colour-coded label, must not rely on colour alone (text label required)
- [x] `components/item/ConditionBadge.tsx` — same constraint
- [x] `components/item/MetadataTable.tsx` — renders brand, model, dimensions, weight, original source (linked), original price; hides any null/empty fields

### Acceptance Criteria
- All components render without runtime errors with real `Item` data
- `AdaptiveImage` uses `<Image>` in vercel mode; `<img>` in static mode
- All interactive elements have `focus-visible:ring` classes
- Badges display text label (not colour only)

---

## Phase 6 — Home Page ✅
**Goal:** `/` renders fully with hero, category grid, and recently listed section. Categories and items load from `content/`.

### Tasks
- [x] `components/category/CategoryCard.tsx` — icon, display name, available item count, cover image background
- [x] `components/category/CategoryGrid.tsx` — responsive grid of `CategoryCard`
- [x] `components/item/ItemCard.tsx` — cover photo, name, condition badge, status badge, price prop (receives resolved price from parent). Renders `item.name` directly for now; **Phase 12** converts it to a `"use client"` locale-consumer (localised title) — see DESIGN.md §12
- [x] `components/home/RecentlyListedSection.tsx` (client component) — owns `useGeolocation()` + `useDistancePricing()` state; renders item cards with resolved prices; no `LocationPriceBar` (prices update silently)
- [x] `app/layout.tsx` — root layout, `BackgroundEffect` wrapper, `SiteHeader`, `SiteFooter`, global font/metadata
- [x] `components/common/RecentlyViewed.tsx` (client) — reads `sessionStorage`; renders horizontal strip of last 5 viewed items; **hidden when empty** (returns `null`). Accepts optional `itemSlug?: string` prop — when provided, records that slug in `sessionStorage` on mount (used by the item detail page). Build here (Phase 6) since the component has no dependencies beyond `sessionStorage` + `Item` types; this avoids a Phase 9 → Phase 6 backward dependency.
- [x] `app/page.tsx` — hero, `CategoryGrid`, `RecentlyListedSection`, `RecentlyViewed` strip (hidden on first visit; appears after any item detail page is viewed in the same session)
- [x] OG metadata for home page (DESIGN.md §10.1: most recent available item's cover as og:image)

### Acceptance Criteria
- Home page renders with real content from `content/items/`
- Category cards show correct available item counts
- Recently Listed shows max `recentlyListedCount` items, `available` status only
- Zero available items → Recently Listed section hidden
- `RecentlyViewed` strip hidden on first visit (sessionStorage empty); visible after item pages are visited
- `pnpm type-check` → 0 errors

---

## Phase 7 — Geolocation & Pricing System ✅
**Goal:** The full geolocation + distance-pricing stack works in isolation. Tested with `pnpm dev` before wiring into pages.

### Tasks

#### 7a — Hooks
- [x] `components/pricing/useGeolocation.ts` — `idle → pending → granted/denied/unavailable`; `idle` treated same as `pending` in all rendering (DESIGN.md §17) *(implemented early in Phase 6 for RecentlyListedSection)*
- [x] `components/pricing/useDistancePricing.ts` — returns `{ source: "fallback" }` for `idle`/`pending`; exports `setManualMiles`; internally uses `resolveItemPrice` from `lib/utils/pricing.ts` (callers always import directly from that module — never re-exported from this hook) *(implemented early in Phase 6)*
- [x] Verify `useDistancePricing` with `{ source: "fallback" }` → calls `resolveItemPrice` with fallback → highest tier

#### 7b — LocationPriceBar
- [x] `components/pricing/LocationPriceBar.tsx` (client) — all 4 rendered states (idle/pending, granted-detected, manual, fallback); inline distance input; accessible (Enter/Space on toggle)
- [x] Test all states by temporarily forcing each `geoState` value in dev

#### 7c — PricingTable & Toggle
- [x] `components/item/PricingTable.tsx` — presentational; renders resolved tier row + `PricingTableToggle`; "Contact for price" if no tiers
- [x] `components/item/PricingTableToggle.tsx` (client) — expand/collapse; visually accents resolved tier row; keyboard accessible; state persists through distance changes

#### 7d — PricingSection & FilterBar
- [x] `components/item/PricingSection.tsx` (client) — owns geo+distance state for item detail; renders `LocationPriceBar` above `PricingTable`; accepts `initialResolvedTier` for SSG initial render
- [x] `components/filters/SortSelect.tsx` (client) — sort dropdown: Date listed (newest) · Price low→high · Price high→low · Condition (best first); child of `FilterBar`; separate component so it can hold its own dropdown state. **Must be created before `FilterBar`** (FilterBar renders SortSelect as a child).
- [x] `components/filters/useFilters.ts` — condition chips, price range slider (`[min, max]` on resolved prices), status toggle; slider hidden when no items have tiers; slider resets on distance change
- [x] `components/filters/FilterBar.tsx` (client) — renders useFilters controls (including `SortSelect`); receives `resolvedDistanceMi` prop; passes `Infinity` from parent when source = fallback

### Acceptance Criteria
- Permission granted → correct distance displayed; card prices update
- Permission denied → fallback prices shown; "Enter distance" link visible
- Manual distance entry → prices recalculate immediately
- `idle`/`pending` → fallback prices shown; no flash of missing content
- `resolveItemPrice` accessible from server component (no "use client" in `lib/utils/pricing.ts`)
- `PricingTableToggle` expand/collapse works; toggle state survives distance change

### References
DESIGN.md §17 · TECH_REQUIREMENTS.md §20

---

## Phase 8 — Category Page, Browse All & Sold Archive ✅
**Goal:** `/[category]`, `/all`, and `/sold` all render. Filter bar, item grid, and location-resolved prices complete.

### Tasks

#### 8a — Category Page
- [x] `components/item/ItemGrid.tsx` (client) — owns `resolvedDistance` state; renders `LocationPriceBar` + `FilterBar` (with `SortSelect`) + item cards; passes `resolvedDistanceMi={Infinity}` to FilterBar when fallback. Prop `browseAll?: boolean` — when `true`, each `ItemCard` receives `showCategoryChip: true` so an "Items in: {Category}" chip (linking to `/[category]`) appears on each card; omit or `false` on individual category pages.
- [x] `app/[category]/page.tsx` — `generateStaticParams` from `loadCategories()`; `generateMetadata` with OG; renders `ItemGrid` with items
- [x] Sold item overlay on item cards (status badge + dimming)
- [x] "Browse All" prominent link in the category page body — distinct from the header navigation link; points to `/all` (DESIGN.md §10.2)
- [x] Empty category (all sold/draft items or all expired sold) → renders empty grid with "No items currently available in this category" message; the route is still generated because `loadCategories()` does not filter by item visibility (DESIGN.md §10.2; §15 governs item-level visibility, not route generation)

#### 8b — Browse All Page (`/all`)
- [x] `app/all/page.tsx` — server component; calls `loadCategories()` then `loadItemsByCategory()` for each and flattens into a single `Item[]`; renders `<ItemGrid browseAll={true} ...>` (which adds the "Items in: {category}" chip to each card) without a category-level header (DESIGN.md §10.4)
- [x] Verify: `available` + `reserved`/`pending` all appear; sold items hidden by toggle (default) but visible when on; `draft` items never appear
- [x] Verify: filter bar condition chips, price slider, sort, status toggle all work

#### 8c — Sold Items Archive (`/sold`)
- [x] `app/sold/page.tsx` — server component; calls `loadSoldItems()`; renders a simple item grid (no filter bar, no pricing, no contact); sorted by `soldDate` desc; the grid renders at most `siteConfig.soldArchiveDisplayLimit` items (header shows the total sold count); shows cover image, name, condition badge, sold date, category chip (DESIGN.md §10.5)
- [x] Verify: `loadSoldItems()` returns all sold items regardless of `soldItemRetentionDays`; the `/sold` grid is capped at `siteConfig.soldArchiveDisplayLimit` items, with the header count reflecting the total
- [x] Verify no pricing shown; no contact section

### Acceptance Criteria
- All category routes statically generated at build time
- Filter bar: condition chips, price slider, status toggle all work independently
- Sold items show "SOLD" overlay but are present in grid (until retention expires)
- `draft` items never render
- `/all` page shows `reserved`/`pending` with badges; `loadAllItems()` is NOT used for this page
- `/sold` archive: `loadSoldItems()` applies no retention filter; the grid renders at most `soldArchiveDisplayLimit` items and the header shows the total count

---

## Phase 9 — Item Detail Page ✅
**Goal:** `/[category]/[item]` renders with gallery, SSG pricing, contact section, and all metadata.

> **⚠️ Ordering note:** Phase 9 depends on Phase 10 (Contact System). Despite appearing first in this document, Phase 10 must be completed before Phase 9 can be wired together. Complete Phase 10 first, then return here.

### Tasks

#### 9a — Supporting Components (build before wiring into page)
- [x] `components/item/FreshnessLabel.tsx` (`"use client"`) — uses `useState<string|null>(null)` + `useEffect(() => { setLabel(formatRelativeDate(listedDate)) }, [listedDate])` to compute the relative date against the visitor's live browser clock on mount. Renders `null` before hydration (no stale SSG date). (TECH_REQUIREMENTS.md §22.11)
- [x] `components/item/QuantityBadge.tsx` — renders "3 available" when `item.quantity > 1`; hidden otherwise
- [x] `components/item/TextbookBadge.tsx` — renders "For CS101 · 3rd Edition" badge + "Compare prices" link (`bookfinder.com/search/?isbn={isbn}`); only shown when `isbn` or `course` is present (DESIGN.md §10.3)
- [x] `components/item/MakeOfferButton.tsx` (client) — renders when `price.negotiable: true` AND `min_acceptable_offer` is set; inline offer form; pre-fills contact message on submit; client-side rejection below threshold (DESIGN.md §10.3)
- [x] `components/item/ConditionGuide.tsx` (client) — `?` icon next to `ConditionBadge`; opens tooltip/modal explaining each condition value; closes on Escape; keyboard accessible
- [x] `components/common/ShareButton.tsx` (client) — `navigator.share()` on mobile; `navigator.clipboard.writeText()` fallback on desktop; shows "Copied!" toast for 2s (TECH_REQUIREMENTS.md §22.10)
- [x] Wire `RecentlyViewed` (built in Phase 6) into the item detail page: pass `itemSlug={item.itemSlug}` so the component records the current item in `sessionStorage` on mount. This makes the strip populate on the home page and other detail pages after a first item view.
- [x] `components/common/JsonLd.tsx` — server component; renders `<script type="application/ld+json">{JSON.stringify(data)}</script>` (TECH_REQUIREMENTS.md §22.4)

#### 9b — Gallery
- [x] `components/item/ItemGallery.tsx` (client) — simple default: large main image + thumbnail strip; click to swap (used by `GalleryAdapter` for `"simple"` config)

#### 9c — Item Detail Page
- [x] `app/[category]/[item]/page.tsx`:
  - [x] `generateStaticParams` from `loadCategories()` + `loadItemsByCategory()`
  - [x] `generateMetadata` — title, description, og:image, og:title, Twitter card, Pinterest rich pin meta (TECH_REQUIREMENTS.md §22.5)
  - [x] Server-side: calls `resolveItemPrice(item.price, { source: "fallback" })` for `initialResolvedTier`
  - [x] Inject `<JsonLd data={buildProductJsonLd(item, siteConfig.baseUrl)} />` and `<JsonLd data={buildBreadcrumbJsonLd(crumbs)} />`
  - [x] Renders: `Breadcrumb`, gallery (`GalleryAdapter`), `FreshnessLabel`, status+condition badges (`ConditionGuide` attached to `ConditionBadge`), `QuantityBadge`, name + description (react-markdown; **Phase 12** wraps these two into `LocalizedItemContent` for runtime locale switching), `TextbookBadge`, `PricingSection` (with `MakeOfferButton`, "Pay Deposit" + "Pay with Venmo" buttons), `MetadataTable`, `ContactSection`, tags, `ShareButton`, `RecentlyViewed`
  - [x] Payment buttons (inline in `PricingSection`/page): render "Pay Deposit" when `stripe_payment_link` is set and "Pay with Venmo" when `venmo_payment_request` is set; each opens its URL in a new tab with `rel="noopener noreferrer"`; neither renders when its field is empty (DESIGN.md §10.3, TECH_REQUIREMENTS.md §22.9)
  - [x] Sold item: "SOLD" banner prominent; contact section CTA disabled; `sold_date` shown if present
- [x] `app/not-found.tsx` — site header, "Page not found" message, link to home

### Acceptance Criteria
- All item detail routes statically generated
- Static HTML shows highest tier price (no blank before JS)
- After JS hydration, geo-resolved tier shown
- Description renders Markdown correctly
- `reserved_for` never appears in rendered HTML (confirm via browser source inspection)
- `og:image` is the item's `coverImage` URL
- JSON-LD Product schema present in `<head>` (verify via Google Rich Results Test)
- `FreshnessLabel` shows correct relative date computed at visit time (not deploy time); renders nothing server-side
- `QuantityBadge`, `TextbookBadge` are hidden when their trigger condition is absent
- "Pay Deposit" / "Pay with Venmo" buttons render only when `stripe_payment_link` / `venmo_payment_request` are set; each opens in a new tab; hidden when empty
- `RecentlyViewed` strip hidden on first visit (sessionStorage empty); records current item slug on mount

---

## Phase 10 — Contact System ✅
**Goal:** Contact section renders correctly on item detail page and in footer. QR modal works.

### Tasks
- [x] `components/contact/PlatformButton.tsx` (client) — link-based: `<a>` with correct URL per platform table (DESIGN.md §7); QR-based: `<button>` triggering modal
- [x] `components/contact/QRModal.tsx` (client) — `<dialog>`; closes on backdrop click + Escape; focus trapped inside while open; restores focus on close
- [x] `components/contact/ContactSection.tsx` (client) — `reveal_behavior: "click"` toggle; renders platform buttons; hides `preferredPayment`/`contactNote` blocks when empty; footer usage: pass `preferredPayment={[]}` and `contactNote=""`
- [x] Wire into item detail page and `SiteFooter`

### Acceptance Criteria
- All link platforms open in new tab with `rel="noopener noreferrer"`
- WeChat/LINE QR modal opens, focuses, closes on Escape
- `reveal_behavior: "always"` shows platforms immediately
- `reveal_behavior: "click"` hides behind toggle
- Footer shows only platform buttons (no payment/note section)

---

## Phase 11 — UI Slot Adapters (Wiring) ✅
**Goal:** All 4 adapter files fully wired. `content/config.ts` `ui.*` values drive the correct Aceternity component everywhere.

### Dependencies: Phases 1, 8, 9 must be complete.

### Tasks
- [x] `components/ui-adapters/BackgroundEffect.tsx` — all 13 background options pre-imported, full `COMPONENTS` map, `⚠️ DO NOT EDIT` header
- [x] `components/ui-adapters/ItemGridAdapter.tsx` — all 3 grid options + `"simple"` fallback, render prop interface, data normalisation per TECH_REQUIREMENTS.md §21
- [x] `components/ui-adapters/GalleryAdapter.tsx` — all 4 gallery options + `"simple"` fallback, data normalisation
- [x] `components/ui-adapters/ItemCardAdapter.tsx` — all 7 card options + `"simple"` fallback, children pass-through, data normalisation (direction-aware-hover note)
- [x] Wire `BackgroundEffect` into `app/layout.tsx`
- [x] Wire `ItemGridAdapter` into `components/item/ItemGrid.tsx` (replaces raw grid div)
- [x] Wire `GalleryAdapter` into item detail page (replaces `ItemGallery` directly)
- [x] Wire `ItemCardAdapter` into `ItemCard.tsx` as outermost wrapper
- [x] Test each slot by cycling through 2–3 values in `content/config.ts` and verifying no crashes

### Acceptance Criteria
- Changing `ui.background` in `content/config.ts` → correct Aceternity background renders after rebuild
- Unknown config value → silent fallback to `"simple"`/`"none"` (no crash, no TypeScript error)
- All adapter files begin with `⚠️ DO NOT EDIT` comment
- `pnpm type-check` → 0 errors across all adapter files

---

## Phase 12 — Internationalisation Runtime ✅
**Goal:** Visitors switch language at runtime via a `LocaleSwitcher` in the header. Item names (cards + detail) and the detail-page Markdown description re-render in the selected locale with no reload; the selection persists across pages and refreshes. SSG still emits `defaultLocale` content. When `availableLocales.length === 1` the switcher is hidden and behaviour is identical to a single-locale build.

### Dependencies
- Phase 3b (`lib/utils/i18n.ts` — `getLocalizedField`, `t`) must be done
- Phase 5 (SiteHeader — hosts `LocaleSwitcher`), Phase 6 (`ItemCard`, `app/layout.tsx`), Phase 9 (item detail page — hosts `LocalizedItemContent`)

**Can be developed in parallel with Phases 10, 11, and 13.**

### Tasks

#### 12a — i18n Runtime Components
- [x] `components/i18n/LocaleProvider.tsx` (client) — React context exposing `{ locale, setLocale }`; on mount reads `localStorage.getItem("locale")`, falls back to `siteConfig.i18n.defaultLocale` when absent or not in `availableLocales`; `setLocale` persists via `localStorage.setItem("locale", …)` (TECH_REQUIREMENTS.md §22.8)
- [x] `components/i18n/useLocale.ts` — hook returning the active locale (and `setLocale`) from `LocaleProvider` context
- [x] `components/i18n/LocaleSwitcher.tsx` (client) — one control per `availableLocale`; calls `setLocale()`; **returns `null` when `siteConfig.i18n.availableLocales.length <= 1`** (DESIGN.md §12)

#### 12b — Localised Rendering
- [x] `components/item/LocalizedItemContent.tsx` (client) — renders the item `<h1>` name and the react-markdown + remark-gfm description; reads `useLocale()` and resolves each via `getLocalizedField(item, "name"/"description", locale)`; both re-render on a locale change (DESIGN.md §10.3, §12; TECH_REQUIREMENTS.md §22.8)
- [x] Convert `components/item/ItemCard.tsx` → `"use client"`; localise the card title via `useLocale()` + `getLocalizedField(item, "name", locale)`

#### 12c — Wiring
- [x] Wrap `app/layout.tsx` children in `<LocaleProvider>` (outermost client provider inside `<body>`) so every page shares one locale context
- [x] Render `<LocaleSwitcher />` in `components/layout/SiteHeader.tsx` (auto-hidden when a single locale is configured)
- [x] Replace the inline name + react-markdown block on `app/[category]/[item]/page.tsx` with `<LocalizedItemContent item={item} />`
- [x] Confirm server-only surfaces (`generateMetadata`, `<title>`, OG, JSON-LD, breadcrumb leaf) keep reading `siteConfig.i18n.defaultLocale` — they are intentionally not runtime-switchable (TECH_REQUIREMENTS.md §22.8 SEO note)

### Acceptance Criteria
- `availableLocales: ["en"]` → `LocaleSwitcher` hidden; no behavioural change vs. a non-i18n build
- `availableLocales: ["en","zh"]` with a translated item → switching to `zh` updates the card title, detail `<h1>`, and Markdown description with no reload; untranslated items fall back to English (no blank, no crash)
- Selected locale persists across navigations and survives a page refresh (localStorage)
- View-source on a cold load shows `defaultLocale` text (SSG) — confirms crawlers see the default language
- `pnpm type-check` → 0 errors

### References
DESIGN.md §10.3, §12, §13 · TECH_REQUIREMENTS.md §22.8

---

## Phase 13 — SEO, Search, Accessibility & Security Hardening ✅
**Goal:** Lighthouse ≥ 80 performance, ≥ 90 accessibility. Full-text search working. All TECH_REQUIREMENTS.md §14 and §15 checks pass.

### Tasks

#### Full-Text Search
- [x] Write `scripts/build-search-index.ts` — imports `buildSearchIndex()` from `lib/search/index.ts`, writes the result to `public/search-index.json`, logs entry count, exits 1 on error. (fuse.js and its types are already installed in Phase 0; fuse.js v7 ships its own TypeScript types, no `@types/fuse.js` needed)
- [x] Update `prebuild` script in `package.json` to chain: `tsx scripts/check-config.ts && tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts` (the `check-config` gate — added later — fails the build on a placeholder `baseUrl` or incomplete `UIStrings` translations; see TECH_REQUIREMENTS.md §7 for the full scripts block)
- [x] Verify: `pnpm build` generates `public/search-index.json` before `next build` renders any page (index built once in prebuild, not per-page)
- [x] Write `components/search/SearchBar.tsx` (client) — loaded via `next/dynamic({ ssr: false })`; on mount fetches `/search-index.json`; graceful 404 handling (empty index, no crash — see TECH_REQUIREMENTS.md §22.1); debounce 150 ms; shows results inline with cover image, name, category, price badge; clicking navigates to detail page
- [x] Write `components/search/useSearch.ts` — loads index on mount, manages query + results state
- [x] Wire `SearchBar` into `SiteHeader` (shown when `siteConfig.search.enabled === true`)
- [ ] Verify: search for a brand name, tag, course code, ISBN, edition — all return results
- [ ] Verify: in `pnpm dev` without a prior build — SearchBar shows no results, no crash

#### SEO
- [x] Verify every route has `<title>` and `<meta name="description">` populated
- [x] Verify OG tags on all 3 route types (home, category, item)
- [x] Verify `sitemap.xml` + `robots.txt` are generated when `siteConfig.sitemap.enabled` (v1 feature, on by default; config-toggleable per TECH_REQUIREMENTS.md §22.7; `scripts/postbuild.ts` runs `next-sitemap` after the build and prints a skip notice when disabled)

#### Accessibility
- [ ] All images have non-empty `alt` text — audit with axe or browser DevTools
- [ ] All interactive elements have `focus-visible:ring` — tab-through pages
- [ ] Colour contrast ≥ 4.5:1 for body text — use browser colour picker
- [ ] `QRModal` focus trap verified — tab stays inside modal
- [ ] Status/condition badges verified for text label (not colour only)

#### Security
- [ ] Grep rendered HTML for `reserved_for` → must not appear
- [ ] Verify `meta_description` truncated to 160 chars
- [ ] Verify `original_link` validated as URL (invalid → empty, no rendered link)
- [x] Verify `poweredByHeader: false` in `next.config.ts`
- [ ] Verify all external links have `rel="noopener noreferrer"`

#### Performance
- [ ] Run Lighthouse mobile on category page → target ≥ 80
- [ ] Check first-load JS bundle ≤ 150 KB gzipped
- [ ] Verify no layout shift from geo-pending → geo-resolved price change

### Acceptance Criteria
- Lighthouse Performance ≥ 80 (mobile)
- Lighthouse Accessibility ≥ 90
- 0 occurrences of `reserved_for` in any rendered HTML
- All external links: `target="_blank" rel="noopener noreferrer"`

---

## Phase 14 — Deployment ✅
**Goal:** Site is live on GitHub Pages with a custom domain, images on Cloudflare R2, and full seller workflow validated end-to-end.

### Tasks

#### One-time Setup — Cloudflare R2
- [ ] Cloudflare Dashboard → R2 → Create bucket (e.g. `usedexchange-images`)
- [ ] Enable public access or attach custom subdomain (e.g. `images.your-domain.com`)
- [ ] Create R2 API token: **Object Read & Write**, scoped to this bucket only
- [ ] Configure CORS on the bucket (Cloudflare Dashboard → R2 → bucket → Settings → CORS):
  ```json
  [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
  ```
- [ ] Copy `.env.example` → `.env.local`; fill in all `CF_R2_*` values
- [ ] Configure `content/config.ts`: `deploymentMode: "static"`, `imageStorage.provider: "cloudflare-r2"`, correct `baseUrl`, seller `location` coordinates

#### One-time Setup — GitHub Pages
- [ ] GitHub repo → Settings → Pages → Source: **GitHub Actions**
- [ ] GitHub repo → Settings → Variables → Actions → add `NEXT_PUBLIC_SITE_URL = https://your-domain.com`
- [ ] Custom domain: GitHub repo → Settings → Pages → Custom domain → set `your-domain.com`; configure DNS CNAME to `<username>.github.io`
- [x] Verify `.github/workflows/deploy.yml` is committed (ships with the project)

#### Initial Content & Deploy
- [ ] Add real listing photos to `content/items/` folders
- [ ] Run `pnpm upload-images` → verify R2 upload succeeds; manifest written
- [ ] Commit `lib/generated/image-manifest.json` + `content/**/*.json`
- [ ] Push a version tag (`git tag v1.0.0 && git push origin --tags`) → `release-seller.yml` creates `release` branch → `deploy.yml` triggers → verify workflow passes (green check)
- [ ] Navigate to deployed URL → verify all pages, images, and pricing work
- [ ] Verify HTTPS (Geolocation API requires HTTPS — enforced by GitHub Pages + custom domain)

#### Final Checks
- [ ] Open DevTools → Network tab → confirm image URLs point to `CF_R2_PUBLIC_URL` domain
- [ ] Run `pnpm upload-images` once more with any final photo edits → commit → push → verify live
- [ ] Verify seller workflow end-to-end: add item.json + photos → upload → commit → push → live

### Acceptance Criteria
- Site live at custom domain with HTTPS
- All images served from Cloudflare R2 CDN (verify via DevTools Network → R2 URL)
- Geolocation permission prompt appears on category + item pages
- GitHub Actions workflow passes with no secrets configured (no CDN credentials in CI)
- `pnpm upload-images` on seller's machine → item appears on live site after push

---

## Phase 15 — AI Skill Files (Setup Wizard + Item Generator + Item Translator) ✅
**Goal:** All three Claude Code skills are complete, tested, and ship with the project. A seller using Claude Code (or any capable AI tool) can run `/setup`, `/update-items`, and `/translate-items` to generate `content/config.ts`, generate `item.json` files, and add locale translations — all without editing any code.

**No API keys, no new dependencies, no custom scripts.** The deliverable is Markdown instruction files and a CI workflow.

**Architecture:** Skills are split by audience. Developer context lives in `.claude/` (develop branch). Seller-facing skills live in `.claude/commands/` — Claude Code's slash-command convention (`/setup`, `/update-items`, `/translate-items`, plus `/setup-shipping` from Phase 16) — and ship identically on both the `develop` and `release` branches. `.claude/seller/` holds only the seller-focused `CLAUDE.md`. Sellers fork/clone the `release` branch.

**Can be developed in parallel with Phases 5–14.**

### Dependencies
- Phase 3 (Content Schema) must be done — skills reference the full `item.json` schema and must stay in sync with it
- Phase 2 (Type System & Config) must be done — skills reference `content/config.ts` field names and types

### Tasks

#### 15a — Project CLAUDE.md
- [x] `.claude/CLAUDE.md` (dev-focused) already exists with project context, iron rules, and doc references
- [x] `.claude/seller/CLAUDE.md` created — seller-focused context: `content/` folder rule, three skill entry points, common tasks table, status/pricing reference
- [x] Test: open Claude Code in project directory; confirm AI has correct project context without further explanation

#### 15b — `update-items.md` Skill
- [x] Create `.claude/commands/update-items.md` (slash command `/update-items`; ships on both the `develop` and `release` branches)
- [x] Include: trigger description, vision instructions for photo analysis, description file format support (`.txt`, `.md`, `.yaml`, `.json` in priority order), field extraction table (with confidence levels), merge rules (description overrides vision), output spec (`status: "draft"`, `reserved_for` never set), confirmation flow (confirm / edit / skip / accept-all), scope instructions (natural language targets)
- [x] Include full `item.json` schema from DESIGN.md §5 as a reference block
- [ ] Test with Claude Code: create a test item folder with 2 photos + notes.txt → invoke skill → verify generated JSON validates against Zod schema
- [ ] Test scope targeting: "just update the electronics folder"
- [ ] Test with no description file (photos only)
- [ ] Test with partial `info.yaml` (description file with some fields set)

#### 15c — `setup.md` Skill
- [x] Create `.claude/commands/setup.md` (slash command `/setup`; ships on both the `develop` and `release` branches)
- [x] Include: all 8 question groups, location resolution instructions (AI uses knowledge to suggest lat/lng, shows for confirmation), category scaffold instructions, idempotency instructions (read existing config before asking), partial re-run support ("just update my contact info")
- [x] Include full `content/config.ts` template from DESIGN.md §13 as the output reference
- [x] Include validation rules for all fields before writing
- [ ] Test with Claude Code: run `/setup` from scratch → verify generated `content/config.ts` compiles (`pnpm type-check`)
- [ ] Test idempotency: run again after config exists → verify AI reads existing values and pre-fills
- [ ] Test partial re-run: "just update my contact info"

#### 15d — `translate-items.md` Skill
- [x] Create `.claude/commands/translate-items.md` (slash command `/translate-items`; ships on both the `develop` and `release` branches)
- [x] Include: trigger, locale detection from `siteConfig.i18n.availableLocales` (dynamic — not hardcoded to any specific locale), fields to translate (`name`→`name_{locale}`, `description`→`description_{locale}`), fields preserved verbatim (brand, model, color, tags, course, isbn, edition, prices, dates, status, URLs), Markdown preservation with examples, per-item confirmation flow (confirm / edit / skip / accept-all / re-translate), natural-language scope, status filter (translate all statuses incl. draft/sold), output rules (write only locale fields; preserve everything else)
- [x] Include Zod-schema precondition: skill verifies `name_{locale}`/`description_{locale}` exist in `lib/content/schema.ts`; if absent, prints the exact Zod + `Item` type snippet to add and stops
- [x] Include per-locale translation quality guidance (zh: Simplified default; es: neutral Latin American; fr/ja/ko notes)
- [ ] Test with Claude Code: add `"zh"` to `availableLocales`, run `/translate-items` → `name_zh`/`description_zh` written, other fields untouched, Markdown preserved
- [ ] Test idempotency: items with existing non-empty translations are skipped (no overwrite)

#### 15e — Validation & Documentation
- [x] Create `SETUP_GUIDE.md` at the project root — plain-English seller guide. Covers: (1) adding a new item with photos + AI, (2) marking an item sold, (3) creating from template, (4) changing prices, (5) uploading new photos, (6) what to back up, (7) who to contact if something breaks. Includes `pnpm type-check` step after AI writes files.
- [x] Create `.github/workflows/release-seller.yml` — CI workflow triggered on `v*` tags; resets `release` branch to the tagged commit; replaces `.claude/CLAUDE.md` with `.claude/seller/CLAUDE.md`; force-pushes `release`. Seller skills travel via `.claude/commands/` unchanged on both branches (the workflow's `.claude/skills/` copy step is a no-op — `.claude/seller/` contains only `CLAUDE.md`). `workflow_dispatch` supported for manual runs.
- [ ] Test all three skills in at least one non-Claude AI tool (Cursor or GitHub Copilot) to verify compatibility
- [ ] Confirm `content/` rule: AI never modifies any file outside `content/`

### Acceptance Criteria
- `/update-items` in Claude Code → generates valid `item.json`; Zod schema validates it
- `/setup` in Claude Code → `content/config.ts` generated; `pnpm type-check` passes
- `/translate-items` in Claude Code → writes `name_{locale}`/`description_{locale}` only; other fields untouched; existing translations not overwritten; locale detected from `siteConfig.i18n.availableLocales` (not hardcoded)
- CI: pushing a `v*` tag regenerates a `release` branch whose `.claude/CLAUDE.md` is the seller-focused one; seller skills ship via `.claude/commands/` on both branches
- No new npm dependencies added
- No API keys required
- No files written outside `content/`

---

## Phase 16 — Shipping Calculator Integration (Optional) ✅
**Goal:** Sellers can optionally enable a live shipping cost estimate (Shippo/EasyPost) for items in the open-ended "Shipping" price tier, with the shipping cost payer (seller or buyer) configurable site-wide and per item. Disabled by default — zero impact on sites that don't opt in. API keys never enter the static bundle; they are held by an independently-deployed Cloudflare Worker.

**Architecture:** A pure helper module (`lib/utils/shipping.ts`, mirrors `lib/utils/pricing.ts` — no `"use client"`) decides eligibility and payer. A client hook + component (`useShippingRate`, `ShippingEstimator`) call a Cloudflare Worker proxy (`workers/shipping-rate-proxy/`, independently deployed, excluded from root tsconfig/eslint/test scope) which holds the provider API key as a `wrangler secret`.

### Dependencies
- Phase 7 (Geolocation & Pricing System) — reuses `PriceTier`/`Price` types and the open-ended-tier convention
- Phase 12 (i18n Runtime) — adds new `UIStrings` keys

### Tasks

#### 16a — Types & Schema
- [x] `lib/utils/shipping.ts` — `isShippingTier()`, `resolveShippingPayer()`, `canEstimateShipping()`; pure, no `"use client"`
- [x] `lib/utils/shipping.test.ts` — 10 unit tests covering all three functions
- [x] `Price.shipping_payer?: "seller" | "buyer"` added to `lib/content/types.ts` and `lib/content/schema.ts` (`z.enum(...).optional().catch(undefined)`)
- [x] `SiteConfig.shipping?` (`enabled`, `proxyUrl`, `defaultPayer`, `origin`) added to `lib/config/types.ts`
- [x] 6 new `UIStrings` keys added to `lib/config/types.ts`, `lib/i18n/translations.ts` (`EN_FALLBACK`), and `content/config.ts` (English + commented zh template)

#### 16b — Client Hook & Component
- [x] `components/pricing/useShippingRate.ts` (client) — `{ status: idle|loading|ready|error }` state machine; `AbortController` cancels in-flight requests on re-fetch
- [x] `components/item/ShippingEstimator.tsx` (client) — returns `null` unless `canEstimateShipping()`; renders "included by seller" or a ZIP input + live rate depending on `resolveShippingPayer()`
- [x] Wired into `components/item/PricingSection.tsx` and `app/[category]/[item]/page.tsx` (passes `weight`/`dimensions`)

#### 16c — Cloudflare Worker Proxy
- [x] `workers/shipping-rate-proxy/` — independent subproject (own `package.json`, `tsconfig.json`, `wrangler.toml`)
- [x] `src/index.ts` — CORS-restricted `POST` handler; `getShippoRate()` / `getEasyPostRate()`; returns cheapest rate as `RateResponseBody`
- [x] `.dev.vars.example` documents required secrets (`SHIPPO_API_KEY` / `EASYPOST_API_KEY`)
- [x] `README.md` — deploy walkthrough (get API key, `wrangler secret put`, `wrangler deploy`, enable in `content/config.ts`) + API contract
- [x] Root `tsconfig.json` `exclude` and `eslint.config.mjs` `ignores` updated to exclude `workers/`
- [x] `.gitignore` updated: `.dev.vars`, `.wrangler/` ignored; `.dev.vars.example` kept

#### 16d — Verification & Documentation
- [x] `pnpm type-check`, `pnpm lint`, `pnpm test` all pass (216 tests across 21 files at the Phase 16 snapshot)
- [x] `pnpm exec tsx scripts/check-config.ts` passes (feature commented out by default — template still valid)
- [x] DESIGN.md / DESIGN_zh.md §21 — full feature design (config, per-item override, eligibility, display-by-payer, privacy, deployment)
- [x] ARCHITECTURE.md / ARCHITECTURE_zh.md — module reference, data flow diagram, component tables, key invariants, directory structure
- [x] TECH_REQUIREMENTS.md / TECH_REQUIREMENTS_zh.md §29 — implementation contracts (types, hook/component API, Worker request/response shapes, test cases, security)
- [x] FEATURES_ROADMAP.md / FEATURES_ROADMAP_zh.md §4.3 marked implemented
- [x] CURRENT_FUNCTIONALITY.md / CURRENT_FUNCTIONALITY_zh.md — seller-facing functional description
- [x] `.claude/commands/setup-shipping.md` — seller skill for enabling/configuring the feature

### Acceptance Criteria
- `siteConfig.shipping` absent or `enabled: false` → `ShippingEstimator` renders nothing; no behavior change vs. pre-Phase-16
- Seller-pays item → "Free shipping (included by seller)" shown, no network call
- Buyer-pays item with weight + dimensions on the Shipping tier → ZIP input shown; valid ZIP returns a live rate from the Worker
- Shipping API keys never appear in `out/` (static export) or any client bundle
- `lib/utils/shipping.ts` has no `"use client"` and is importable from both server and client code
- `workers/` does not affect `pnpm type-check` / `pnpm lint` / `pnpm test` for the main app

### References
DESIGN.md §21 · TECH_REQUIREMENTS.md §29 · ARCHITECTURE.md (lib/ Module Reference, Shipping Estimate data flow) · `workers/shipping-rate-proxy/README.md`

---

## Phase 17 — Facebook Marketplace Smart Export ✅

**Goal:** `pnpm fb-export` lets sellers export available items as a Facebook Marketplace bulk-upload CSV through an interactive three-step CLI. A smart export history prevents duplicate listings on re-run.

**Version:** v1.3.0

### Tasks

#### 17a — Category Mapper
- [x] `scripts/lib/fbCategoryMap.ts` — 50+ regex rules mapping item corpus (name + tags + brand + model + categorySlug) to FB `"Top//Sub//Leaf"` category string; slug fallback map for unmatched categories

#### 17b — Export Script
- [x] `scripts/export-facebook.ts` — interactive 3-step CLI (Step 0: history filter shown on 2nd+ run; Step 1: all/category/multi-select with comma and range notation `1-4`; Step 2: price tier: lowest / highest / pickup (miles-limited tiers) / shipping (open-ended tiers))
- [x] FB CSV field mapping: `name`→TITLE (150 chars), `price`→PRICE, `condition`→CONDITION, `description`→DESCRIPTION (5000 chars), category→CATEGORY, weight→SHIPPING WEIGHT (pounds; converted from the item's stored unit), shipping flags→OFFER FREE SHIPPING / OFFER SHIPPING
- [x] PHOTO columns: up to 10 per row, filled with CDN URLs from the image manifest; items without CDN photos trigger a warning to run `pnpm upload-images` first, and their local photos are copied to `exports/facebook-marketplace-photos/` for manual upload (post-v1.3.0 enhancement)
- [x] Auto-batches into numbered files when > 50 items (FB per-upload limit)
- [x] Appends `ExportRun` to export history after each successful write

#### 17c — Export History
- [x] `scripts/lib/exportHistory.ts` — `loadHistory()`, `allExportedSlugs()`, `lastRun()`, `appendRun()`, `formatRunDate()`
- [x] History stored in `exports/.export-history.json` (gitignored); `exports/.gitkeep` tracks the directory
- [x] Identity key: `{categorySlug}/{itemSlug}` — stable across renames

#### 17d — Wiring & Documentation
- [x] `package.json` `"fb-export"` script; version bumped to `1.3.0`
- [x] `.gitignore` updated: `exports/` ignored wholesale; `exports/.gitkeep` stays tracked so the directory exists
- [x] `.claude/CLAUDE.md` — added `pnpm fb-export` row to Common Seller Tasks table
- [x] `docs/CURRENT_FUNCTIONALITY.md` / `_zh` — fb-export + export history documented in Seller CLI Tools table
- [x] `docs/FEATURES_ROADMAP.md` / `_zh` — §3.4 updated with export history description
- [x] `README.md` / `README_zh.md` — fb-export added to seller workflow
- [x] `SETUP_GUIDE.md` — §8 "Exporting to Facebook Marketplace" added (seller-facing plain-language walkthrough)
- [x] `pnpm type-check`, `pnpm lint` pass (CI green)

### Acceptance Criteria
- `pnpm fb-export` runs interactively with TTY; guides through all steps without errors
- Output CSV conforms to Facebook Marketplace bulk upload template column order
- Items with > 50 selected auto-batch into `facebook-marketplace-1.csv`, `facebook-marketplace-2.csv`, …
- Second run shows Step 0 with count of previously exported items; selecting "skip" filters them out
- History file written atomically; corrupted file falls back to `{ runs: [] }` without crashing

---

## Phase 18 — Seller Studio ✅

**Goal:** `pnpm studio` starts a local-only web GUI (never part of the build output, never deployed) for managing listings in a browser: photo upload/reorder/CDN push, bulk status changes, a schema-driven edit form, item creation, and one-click publish — without the seller editing `item.json` by hand.

**Version:** unreleased — merged on `develop` after v1.4.2 (no release tag contains it yet)

### Tasks

#### 18a — Item table & bulk status (Part 1)
- [x] `studio/vite.config.ts` + `studio/index.html` + `studio/src/main.tsx` — Vite dev app; `studio/` is unreachable from `next build`
- [x] `scripts/studio.ts` — `pnpm studio` launcher: serves the app and the API on a single local port, bound to 127.0.0.1 only; `--port` validated 1024–65535 (default 5174); auto-loads `.env.local`; the CDN image adapter is constructed per sync run, so missing credentials surface as a sync error, not a startup failure; clear "run `pnpm update-site`" error when `studio/vite.config.ts` is missing
- [x] `studio/src/App.tsx` + `studio/src/panes/{ItemList,Drawer,BulkToolbar}.tsx` — item table, per-item drawer, bulk status changes (available / reserved / pending / sold / draft)
- [x] `studio/csrfGuard.ts` + middleware wiring in `studio/vite.config.ts` — CSRF guard for the API: all non-GET/HEAD methods require `Content-Type: application/json` (→ 415) and, when an `Origin` header is present, it must equal the server's own origin (→ 403); fails closed for every unsafe method so future PUT/PATCH/DELETE routes are covered automatically; unit-tested in `studio/csrfGuard.test.ts`
- [x] `GET /api/items` returns every item with its image files; `reserved_for` is never read, written, or sent to the client

#### 18b — Photos & CDN sync (Part 2A)
- [x] `scripts/lib/studioImages.ts` — list an item's image files; serve image files; upload, reorder, delete through the API
- [x] `scripts/lib/studioSync.ts` — image-sync runner with a sync mutex (one sync at a time) and server-sent-event progress streaming
- [x] `studio/src/panes/{ImagePane,SyncBar}.tsx` — drag-and-drop upload, drag-to-reorder, CDN push with live progress; state resyncs after a failed mutation

#### 18c — Edit form, item creation & publish (Part 2B)
- [x] `scripts/lib/itemEdit.ts` + `itemFields.ts` — strict field grammar for `item.json` edits; every write validated against the schema; `reserved_for` denied
- [x] `scripts/lib/studioApi.ts` — `GET`/`PATCH /api/items/:cat/:name` (changed fields only), `POST /api/items` (create from template)
- [x] `scripts/lib/studioGit.ts` — `publishChanges()`: re-reads the change list before committing; refuses to publish while an image sync is running; stages only the publishable paths (`content/` + `lib/generated/image-manifest.json`, never `git add -A`, so `.env.local` can't ride along)
- [x] `studio/src/fields.ts` + `studio/src/api.ts` — declarative `FIELD_GROUPS` driving the EditForm (paths must match the `scripts/lib/itemFields.ts` authority) and fetch wrappers for all `/api/*` routes, including the SSE `streamSync` parser built on fetch/ReadableStream (no EventSource — POST required)
- [x] `studio/src/panes/{EditForm,NewItemDialog,PublishPane}.tsx` — grouped edit form, item creation dialog, publish pane with the uncommitted-change count most prominent in the header
- [x] Test coverage in `scripts/lib/studioApi.test.ts` / `studioImages.test.ts` / `studioSync.test.ts` / `studioGit.test.ts` / `itemEdit.test.ts` / `itemFields.test.ts`, plus `scripts/studioFields.test.ts` (EditForm↔itemFields drift) and `studio/csrfGuard.test.ts` (backend only — no React tests)

#### 18d — Distribution & documentation
- [x] `studio` added to `TEMPLATE_PATHS` in `scripts/update-site.ts` so `pnpm update-site` delivers it to downstream sites
- [x] `docs/UPDATE_GUIDE.md` / `_zh` — `studio` added to the manual `git checkout` path list in both languages
- [x] `scripts/update-site.test.ts` — drift test keeping `TEMPLATE_PATHS` and both UPDATE_GUIDE path lists in sync
- [x] `docs/CURRENT_FUNCTIONALITY.md` / `_zh` — "Seller Studio" section in both languages
- [x] `docs/FEATURES_ROADMAP.md` / `_zh` — "Seller dashboard (local-only GUI)" marked ✅ in both languages
- [x] `.claude/CLAUDE.md` — `pnpm studio` row added to the Common Seller Tasks table

### Acceptance Criteria
- `pnpm studio` starts the GUI locally; the four operations (photos, bulk status, edit form, publish) work end to end
- Studio writes only to `content/` and `lib/generated/image-manifest.json`; `reserved_for` is never read or written
- None of the studio markers (Seller Studio, studio-api, `handleStudioRequest`, `StudioError`, carbon-pale, bulk-status, ImagePane, EditForm, PublishPane, stamp-press, fontsource, `publishChanges`) appear anywhere in `out/` after `pnpm build`
- `pnpm update-site` copies `studio/`; the drift test fails if `TEMPLATE_PATHS` and either UPDATE_GUIDE path list disagree

---

## Phase 19 — Seller Studio Item Defaults ✅

- [x] `scripts/lib/itemDefaults.ts`: parse/validate/merge for two-tier sparse `_defaults.json`
      (site + category); `reserved_for` and per-item fields rejected; merged over
      `buildItemTemplate()` with `name`/`listed_date`/`status` re-applied last
- [x] Studio API: `GET/PUT /api/defaults?scope=…` (empty save deletes the file; PUT creates
      missing category folders); `POST /api/items` gains `applyDefaults` (default true)
- [x] `pnpm create-item` applies the same merge
- [x] Studio UI: Defaults pane (scope tabs, per-field enable switches, Price/Platform pinned,
      site-inheritance hints), FieldInput extraction from EditForm, Apply-defaults toggle in the
      new-item dialog
- [x] Docs sync (DESIGN, CURRENT_FUNCTIONALITY, ARCHITECTURE, SCRIPTS, this plan) — both languages

---

## Phase 20 — Seller Studio UI Visual Refresh ✅

- [x] Dual-theme token system in `studio/src/tokens.css`: light values from the storefront palette (`app/globals.css`), matching dark set, semantic tokens only
- [x] `data-theme` on `<html>` with localStorage persistence and a system-preference fallback, applied before React mounts (`studio/src/theme.ts`)
- [x] Fonts: IBM Plex Sans + IBM Plex Mono bundled via `@fontsource` (Courier Prime and Archivo Narrow removed)
- [x] Shared components in `studio/src/components/`: `Button`, `StatusBadge`, `ThemeToggle`, and the `useDialogBehavior` focus hook
- [x] Status badges for all five states; the SOLD stamp presses once then settles into its badge
- [x] Dialog focus management (initial focus, Tab trap, Esc, focus restore), styled empty state, skeleton loading rows
- [x] WCAG AA contrast verified for every text pair in both themes
- [x] Docs sync (TECH_REQUIREMENTS, CURRENT_FUNCTIONALITY, ARCHITECTURE) — both languages

---

## Phase 21 — Seller Studio List Search & Filtering ✅

- [x] `listStudioItems` carries `tags` and `listedDate` (read-only additions; no new API parameters)
- [x] `studio/src/filtering.ts`: status → category → fuzzy search (fuse.js, name/category/tags) → sort pipeline, with nulls sinking last in both price and date directions; `countByStatus` for tab counts
- [x] `studio/src/panes/FilterBar.tsx`: status tabs with counts (Active hides sold), search box, category dropdown, sort dropdown, live result count
- [x] `App` owns the filter state; select-all and bulk actions operate on the visible rows only; changing a filter clears the selection; just-changed rows stay visible until the next filter change
- [x] Filtered-empty state distinct from the no-items state, with a clear-filters action
- [x] Unit tests for the filter pipeline (`studio/src/filtering.test.ts`) — the first studio front-end logic tests
- [x] Docs sync (CURRENT_FUNCTIONALITY, ARCHITECTURE, this plan) — both languages

---

## Phase 22 — Seller Studio Edit Form Experience ✅

- [x] `studio/src/fields.ts` re-partitioned into eight groups with a stable `id: GroupId` and a `defaultOpen` flag; all 43 descriptors keep their exact paths (a test pins the count so a regrouping cannot drop a field)
- [x] Listing and Price open on arrival; Translations, Specs, Payment & pickup, Books & courses, Extras and Dates render as collapsed `<details>` with a badge (unsaved count, else filled-field count)
- [x] The price tier editor moved inside the Price group, right after Currency
- [x] `studio/src/editForm.ts` — `buildEdits`, `draftFromFields` and the dirty computation extracted as pure functions, with `studio/src/editForm.test.ts` (19 tests); `fieldIsDirty` is the single definition of "changed" shared by the counter, the markers and the edits sent
- [x] `studio/src/fieldValues.ts` — `toInput` / `fromInput` moved out of `FieldInput.tsx` so the pure module imports no component
- [x] Per-field unsaved markers, a sticky Save / Discard / unsaved-count bar, and collapsed groups that open themselves when a failed save names a field inside them
- [x] The draft is rebuilt from the server's re-read file after a save; "Saved." clears on the next keystroke; "Nothing changed" is a neutral notice, not a red error
- [x] `Drawer` keeps visited tabs mounted — switching to Photos no longer discards a draft — and marks the Details tab while anything is unsaved
- [x] Fixed a pre-existing `TierEditor` render loop (React "Maximum update depth exceeded" on every drawer open): the collector moved from state into a ref behind a stable registrar
- [x] `DefaultsPane` pins groups by `GroupId` instead of by title, so a group rename is a compile error rather than a silent collapse
- [x] Docs sync (CURRENT_FUNCTIONALITY, ARCHITECTURE, TECH_REQUIREMENTS, this plan) — both languages

---

## Phase 23 — Seller Studio Config Panel ✅

- [x] `scripts/lib/configEdit.ts`: TypeScript-AST `readConfig` (dotted paths, literal kinds, enum options from the types file, docs and section titles from the file's own comments) and `writeConfigValue` (single value replaced by character range; all 182 comment lines preserved)
- [x] Per-field validation: enum membership, number bounds, http(s) URLs, template-literal injection refused, array fields read-only
- [x] `GET/PUT /api/config` with a `tsc --noEmit` gate — a write that fails type-check is discarded and the file left byte-identical
- [x] `ConfigPane`: fields grouped as the file groups them, the file's comments as hints, danger warnings on `deploymentMode`/`baseUrl`/`imageStorage.provider`, UI translations collapsed, per-field save
- [x] Docs sync (CURRENT_FUNCTIONALITY, ARCHITECTURE, this plan) — both languages
## Phase 24 — First-Run Setup Guide ✅

- [x] `scripts/lib/siteReadiness.ts`: tiered readiness checklist (core: identity, image storage, first item, first item live, git, contact; optional: translations, shipping, Aceternity) with config and env injected so it is unit-testable and can report a broken config instead of crashing
- [x] `scripts/lib/i18nRequiredKeys.ts`: required UI string keys extracted so `check-config.ts` and the readiness engine share one list
- [x] `pnpm setup-check`: prints the checklist with a next step per item; exits 1 while core steps remain. Named setup-check because `pnpm doctor` is a pnpm builtin that shadows package.json scripts
- [x] `GET /api/readiness` + `GettingStarted` panel: opens itself on a not-ready site, collapses when everything core is done, always reachable from the header
- [x] Docs sync (CURRENT_FUNCTIONALITY, ARCHITECTURE, SCRIPTS, this plan) — both languages

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Aceternity component API changes between CLI install and adapter code | Medium | Medium | Pin `@aceternity/*` to the version installed; commit `components/ui/` to git so versions are locked |
| Tailwind v4 incompatibility with specific Aceternity components | Low | Medium | Aceternity components are installed via `npx shadcn@latest` which targets the current Tailwind version; verify with `pnpm type-check` + `pnpm dev` after `pnpm setup-ui`; if a specific component fails to render correctly, use the `"simple"` fallback for that slot until the component is updated |
| Vercel Blob token not available during local `pnpm upload-images` | Low | Low | Use `.env.local` for local uploads; clearly documented in TECH_REQUIREMENTS.md §3 |
| `pnpm setup-ui` fails mid-run (network error) | Medium | Low | Script is idempotent; re-run from the failed component; partial installs don't break existing code |
| Geolocation API blocked by browser settings or corporate proxy | Medium | Low | Fallback to highest tier is already implemented; buyer can always enter distance manually |
| Some Aceternity components require additional peer dependencies (e.g. `three.js` for 3D Globe) | Low | Medium | Only install dependencies actually needed by the 27 selected components; verify `pnpm type-check` after `setup-ui` |
| Item photos exceed Vercel Blob free tier (500 MB) | Low (early) | Medium | Track Blob usage in Vercel Dashboard; upgrade plan or migrate to Cloudflare R2 (config switch = one line) |
| Haversine distance off for non-US locations | Low | Low | Formula is standard WGS84; unit test with known city pairs before shipping |
| AI misidentifies item or hallucinates brand/model in skill output | Medium | Low | Skill always instructs the AI to show a confirmation preview; `status: "draft"` until seller confirms; empty string preferred over guessing |
| Skill file format incompatible with a specific AI tool | Medium | Low | Skill files are plain Markdown — universally compatible; test with Claude Code + one other tool before shipping |
| Generated `content/config.ts` has TypeScript errors | Low | Medium | Skill instructs AI to verify against the type definition; seller runs `pnpm type-check` as the final gate |
| Seller has no AI coding tool | Low | Low | `pnpm create-item` and `pnpm create-template` provide a non-AI fallback; skill files also work as a copy-paste prompt in Claude.ai |

---

## Definition of Done (per phase)

A phase is **done** when:
1. All checkboxes are checked
2. `pnpm type-check` → 0 errors
3. `pnpm lint` → 0 warnings
4. The phase's acceptance criteria are all met
5. Changes are committed to git with Conventional Commit message

The project is **ready for v1 launch** when:
1. All 16 core phases (0–15) are done (Phase 15 may ship slightly after Phases 0–14 if the AI skill files are delayed)
2. AI skill `/setup` generates a valid `content/config.ts` — `pnpm type-check` passes (Phase 15)
3. At least one complete real listing (generated via AI skill `/update-items`) exists
4. Site is live and passing Lighthouse ≥ 80/90
5. Seller has successfully completed the full workflow: add item → upload photos → commit → push → verify live

---

## Developer Notes

### Start here
```bash
git clone <repo>
pnpm install
pnpm setup-ui          # Phase 1 — install all Aceternity components
pnpm dev               # Phase 0 verification — should start after Phase 0
```

### Key design document cross-references
| Implementation question | Where to look |
|---|---|
| What fields does `item.json` have? | DESIGN.md §5 |
| How does sold item retention work? | DESIGN.md §8 |
| How does geo price resolution work? | DESIGN.md §17 |
| Which component is a "use client"? | DESIGN.md §12, TECH_REQUIREMENTS.md §20 |
| How does `resolveItemPrice` work? | DESIGN.md §17, TECH_REQUIREMENTS.md §20 |
| How does PricingSection get its initial tier? | DESIGN.md §10.3, TECH_REQUIREMENTS.md §21 |
| How do image adapters work? | DESIGN.md §3, TECH_REQUIREMENTS.md §7 |
| What does `loadAllItems()` filter? | TECH_REQUIREMENTS.md §8 — available only, for home recently-listed strip |
| What does the /all page use instead of loadAllItems()? | DESIGN.md §11, TECH_REQUIREMENTS.md §8 — loadItemsByCategory() aggregated |
| How are UI slots wired? | DESIGN.md §18, TECH_REQUIREMENTS.md §21 |
| What's the deployment checklist? | TECH_REQUIREMENTS.md §19 |

### Never violate these invariants
1. `reserved_for` is never rendered on any page
2. `content/config.ts` uses no Node.js APIs (it's in the browser bundle)
3. `lib/utils/pricing.ts` has no `"use client"` (must be importable by server components)
4. `components/ui-adapters/` files begin with `⚠️ DO NOT EDIT`
5. Sellers never need to edit anything outside `content/`
6. `lib/generated/image-manifest.json` is git-tracked — never add it to `.gitignore`
7. `public/search-index.json` is gitignored — generated each build by `scripts/build-search-index.ts` in the `prebuild` step; never committed to git
