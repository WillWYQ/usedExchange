# UsedExchange — Implementation Plan

**Version:** 1.3  
**Date:** 2026-06-01  
**Based on:** DESIGN.md v0.9.1 · TECH_REQUIREMENTS.md v0.9.1  
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
| **Total** | | **~24 days** | |

**Critical path:** 0 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 13 → 14  
**Parallelisable:** Phase 1 ∥ Phase 2; Phase 4 ∥ Phase 3; Phase 10 ∥ Phase 7; Phase 12 (i18n) ∥ Phases 10, 11, 13; Phase 15 ∥ Phases 5–14

---

## Phase 0 — Project Bootstrap
**Goal:** A clean, runnable Next.js 15 repo with all tooling configured. `pnpm dev` starts without errors (blank page is fine).

### Tasks
- [ ] `pnpm create next-app@latest usedExchange --typescript --tailwind --app --use-pnpm`
- [ ] Remove all Next.js boilerplate content from `app/`
- [ ] Configure Tailwind v4: add `@import "tailwindcss"` and `@plugin "@tailwindcss/typography"` to `app/globals.css`; create `postcss.config.mjs` with `{ plugins: { "@tailwindcss/postcss": {} } }`; omit `tailwind.config.ts` unless theme customisation is needed. See TECH_REQUIREMENTS.md §22.2.
- [ ] Configure `tsconfig.json` per TECH_REQUIREMENTS.md §5 (strict, noUncheckedIndexedAccess, `@/*` alias, correct include)
- [ ] Configure `next.config.ts` skeleton (no Aceternity remotePatterns yet — added in Phase 1)
- [ ] Configure ESLint per TECH_REQUIREMENTS.md §16 (including `scripts/` override for no-console)
- [ ] Configure Prettier per TECH_REQUIREMENTS.md §16
- [ ] Verify `.gitignore` matches TECH_REQUIREMENTS.md §18 (content/items images, public/items/, public/contact/, public/search-index.json, .image-cache/) — note: `lib/generated/image-manifest.json` is git-tracked and must NOT be gitignored
- [ ] Install production deps: `next react react-dom zod react-markdown remark-gfm clsx tailwind-merge fuse.js @vercel/analytics @vercel/speed-insights framer-motion @tabler/icons-react`
  > `@vercel/analytics` and `@vercel/speed-insights` are no-ops outside Vercel; include them so the option is available without a reinstall.
- [ ] Install dev deps: `typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss @tailwindcss/typography eslint eslint-config-next prettier prettier-plugin-tailwindcss tsx next-sitemap`
- [ ] Create full directory skeleton (all folders from DESIGN.md §16, empty `.gitkeep` where needed)
- [ ] Create `content/` folder with placeholder `config.ts` and sample `items/` structure
- [ ] Verify `pnpm dev` starts without TypeScript or lint errors

### Acceptance Criteria
- `pnpm dev` → blank page, no console errors
- `pnpm type-check` → 0 errors
- `pnpm lint` → 0 warnings

---

## Phase 1 — Aceternity UI Setup
**Goal:** All 27 supported Aceternity components installed in `components/ui/` and committed to git. Can be run in parallel with Phase 2.

### Tasks
- [ ] Write `scripts/setup-ui.sh` with all 27 install commands (TECH_REQUIREMENTS.md §21)
- [ ] Add `"setup-ui": "bash scripts/setup-ui.sh"` to `package.json`
- [ ] Run `pnpm setup-ui` (requires internet, ~5 min)
- [ ] Resolve any dependency conflicts from Aceternity installs (peer dep warnings)
- [ ] Commit all generated `components/ui/*.tsx` files
- [ ] Verify `pnpm type-check` still passes after installs

### Acceptance Criteria
- `components/ui/` contains all 27 component files (13 background + 3 grid + 4 gallery + 7 card)
- `pnpm type-check` → 0 errors
- No Aceternity import errors at build time

### Notes
- Run only once per machine; subsequent clones get these files from git
- Some Aceternity components may bring in additional peer dependencies (e.g. `three`, `d3`) — install only what the component truly requires, not the full peer list

---

## Phase 2 — Type System & Config
**Goal:** All TypeScript types, `SiteConfig`, and `content/config.ts` defined. No implementation yet — just the type contracts every subsequent phase depends on.

### Tasks
- [ ] Write `lib/ui/types.ts` — `BackgroundOption`, `ItemGridOption`, `GalleryOption`, `ItemCardOption`, `UIConfig` (TECH_REQUIREMENTS.md §21)
- [ ] Write `lib/config/types.ts` — `SiteConfig` type (all fields from DESIGN.md §13; includes `UIConfig`)
- [ ] Write `content/config.ts` — fully populated starter config with all fields, comments, sensible defaults (DESIGN.md §13)
- [ ] Write `lib/content/types.ts` — `Item`, `Category`, `Price`, `PriceTier`, `Condition`, `Status`, `Dimensions`, `Weight`, `ResolvedDistance`, `GeolocationState` (TECH_REQUIREMENTS.md §8, §20)
- [ ] Verify `pnpm type-check` passes (types self-consistent)

### Acceptance Criteria
- All types compile with 0 errors
- `content/config.ts` imports and exports `siteConfig` without errors
- No `any` types

---

## Phase 3 — Content Schema & Loader
**Goal:** The data layer is complete. `loadCategories()`, `loadItemsByCategory()`, `loadItem()`, `loadAllItems()` all work against real `content/items/` folders. **This is the single most important phase — all pages depend on it.**

### Tasks

#### 3a — Zod Schema (`lib/content/schema.ts`)
- [ ] Write `itemJsonSchema` — Zod schema for `item.json` with all defaults per TECH_REQUIREMENTS.md §6 (safe defaults, `.safeParse()` contract)
- [ ] Write `categoryJsonSchema` — Zod schema for `_category.json`
- [ ] Implement `withDefaults<T>()` helper per TECH_REQUIREMENTS.md §6.2
- [ ] Unit-test edge cases: missing `name` (skip item), invalid enum (default to valid), null number (→ null), zero number (→ 0, not null), negative number (→ null), invalid ISO date (→ null)

#### 3b — Pure Utilities (`lib/utils/`)
- [ ] Write `lib/utils/haversine.ts` — `haversineInMiles(lat1, lng1, lat2, lng2)` (TECH_REQUIREMENTS.md §20)
- [ ] Write `lib/utils/pricing.ts` — `resolveItemPrice(price, resolved)` pure function (DESIGN.md §17; importable by server components)
- [ ] Write `lib/utils/date.ts` — `formatRelativeDate(isoDate: string | null, now?: Date): string` → "Today" / "3 days ago" / "" (`now` defaults to `new Date()`; pass explicitly in tests only — TECH_REQUIREMENTS.md §22.11)
- [ ] Write `lib/utils/jsonld.ts` — `buildProductJsonLd(item, baseUrl)` and `buildBreadcrumbJsonLd(crumbs)` (TECH_REQUIREMENTS.md §22.4)
- [ ] Write `lib/utils/i18n.ts` — `getLocalizedField(item, field, locale)` and `t(key)` (TECH_REQUIREMENTS.md §22.8)
- [ ] Test `haversineInMiles` against known coordinates
- [ ] Test `resolveItemPrice` for all branches: Infinity, exact match, gap, empty tiers, open-ended tier

#### 3c — Loader (`lib/content/loader.ts`)
- [ ] Implement `loadCategories()` — reads `content/items/`, parses `_category.json`, applies sort logic (DESIGN.md §6), excludes `_`-prefixed folders
- [ ] Implement `loadItemsByCategory()` — reads item folders, applies visibility rules (draft excluded, sold+retention check), reads manifest for image URLs
- [ ] Implement `loadItem()` — returns `null` if missing, never throws
- [ ] Implement `loadAllItems()` — `available` status ONLY; sorted by `listedDate` desc; capped at `siteConfig.recentlyListedCount`. **Home page recently-listed strip only.** Do NOT use for the /all page (see Phase 8b).
- [ ] Implement `loadSoldItems()` — returns ALL sold items regardless of `soldItemRetentionDays`; sorted by `soldDate` desc (falls back to `listedDate`); used by `/sold` archive page (TECH_REQUIREMENTS.md §8)
- [ ] Write `lib/search/index.ts` — `buildSearchIndex()`: reads all available items, returns `SearchIndexEntry[]` with fields: `name`, `description`, `brand`, `model`, `tags`, `course`, `isbn`, `edition`. The function only returns the array; the caller (`scripts/build-search-index.ts`, run in `prebuild`) writes the result to `public/search-index.json` (NOT `lib/generated/`) so SearchBar can fetch it via HTTP (TECH_REQUIREMENTS.md §22.1 and §7)
- [ ] Image URL resolution: `manifest[key] ?? "/items/{key}"` fallback (DESIGN.md §11)
- [ ] Image sorting: `filenames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))` — explicit sort, never rely on `readdir` order (DESIGN.md §4)
- [ ] Verify `reserved_for` field is never included in returned `Item` type

#### 3d — Seed Data & Content CLI Scripts
- [ ] Create 2 sample categories (`content/items/houseware/`, `content/items/electronics/`)
- [ ] Create 3–4 sample `item.json` files covering all status values and edge cases
- [ ] Create `lib/generated/image-manifest.json` with `{}` (empty starter)
- [ ] Write `scripts/mark-sold.ts` — reads `content/items/<cat>/<name>/item.json`, sets `status: "sold"` and `sold_date: today (ISO 8601)`, writes file in place; exits 1 with a clear error if the item path does not exist (TECH_REQUIREMENTS.md §22.3)
- [ ] Write `scripts/create-item.ts` — creates `content/items/<category>/<name>/` folder and `item.json` from template; opens in `$EDITOR` if set; validates category exists (TECH_REQUIREMENTS.md §22.3)
- [ ] Write `scripts/create-template.ts` — creates `content/items/<category>/_template.json` or global `content/items/_template.json` without an argument (TECH_REQUIREMENTS.md §22.3)
- [ ] Verify loader returns correct data for sample items

### Acceptance Criteria
- All 4 loader functions return typed data from sample `content/items/`
- Missing `item.json` → `loadItem()` returns `null`, no throw
- Invalid field values → defaults applied, no crash
- `reserved_for` not present in any returned `Item` object
- All unit tests pass

### References
DESIGN.md §4, §5, §6, §8, §11 · TECH_REQUIREMENTS.md §6, §7, §8

---

## Phase 4 — Image Pipeline
**Goal:** `pnpm dev` shows images from `content/items/`. `pnpm upload-images` successfully uploads to **Cloudflare R2** (the recommended/primary provider) and writes a manifest; the Vercel Blob path is implemented in parallel as the alternate. Can be developed in parallel with Phase 3.

### Tasks

#### 4a — Adapter Interface
- [ ] Write `lib/images/adapter.ts` — `ImageStorageAdapter` interface (TECH_REQUIREMENTS.md §7)

#### 4b — Provider Implementations
- [ ] Write `lib/images/local.ts` — copies to `public/items/`, returns `/items/{key}`, skips unchanged
- [ ] Write `lib/images/cloudflare-r2.ts` (primary) — SHA-256 compare, `@aws-sdk/client-s3 PutObjectCommand`, returns CDN URL; clear error if `CF_R2_*` missing
- [ ] Write `lib/images/vercel-blob.ts` (alternate) — SHA-256 compare, `@vercel/blob put()`, returns CDN URL; clear error if `BLOB_READ_WRITE_TOKEN` missing
- [ ] Install provider devDeps: `pnpm add -D @aws-sdk/client-s3` (Cloudflare R2 — recommended). Add `pnpm add -D @vercel/blob` only if also exercising the Vercel Blob path.

#### 4c — Sync Script (`scripts/sync-images.ts`)
- [ ] Implement `--mode upload`: scan, SHA-256, upload new/changed, purge stale manifest entries, copy contact/, write manifest, write checksum cache, print backup reminder (TECH_REQUIREMENTS.md §7)
- [ ] Implement `--mode dev-sync`: copy to `public/items/`, copy contact/, graceful if `content/items/` missing
- [ ] Implement `--mode build-check`: local provider → copy locally; cloud provider → verify manifest exists, warn if missing; always copy contact/
- [ ] Update `next.config.ts` to add Vercel Blob / R2 remote patterns (TECH_REQUIREMENTS.md §4)

#### 4d — Integration Test
- [ ] `pnpm dev` → sample images appear at `/items/houseware/item/cover.jpg`
- [ ] `pnpm upload-images` with `CF_R2_*` set → images uploaded to R2; manifest written with R2 CDN URLs (repeat with `BLOB_READ_WRITE_TOKEN` if validating the Vercel Blob path)
- [ ] `pnpm build` in a CI-like environment (no local images) → manifest read in build-check mode, no upload attempted, build succeeds

### Acceptance Criteria
- Local dev: images served from `public/items/`
- Upload run: `lib/generated/image-manifest.json` written with valid CDN URLs
- Build-check with cloud provider: reads manifest, does not attempt upload
- Deleted item folder: manifest entry purged on next upload run
- Exit code 1 on any unrecoverable error

### References
DESIGN.md §3, §14 · TECH_REQUIREMENTS.md §7

---

## Phase 5 — Common Components
**Goal:** All shared presentational components are ready. No pages yet.

### Tasks
- [ ] `components/common/AdaptiveImage.tsx` — `next/image` vs `<img>` based on `deploymentMode` (TECH_REQUIREMENTS.md §9)
- [ ] `components/layout/SiteHeader.tsx` — site name/logo, navigation placeholder
- [ ] `components/layout/SiteFooter.tsx` — site name, last-build timestamp, ContactSection slot
- [ ] `components/layout/Breadcrumb.tsx` — Home → Category → Item, correct hrefs
- [ ] `components/item/StatusBadge.tsx` — colour-coded label, must not rely on colour alone (text label required)
- [ ] `components/item/ConditionBadge.tsx` — same constraint
- [ ] `components/item/MetadataTable.tsx` — renders brand, model, dimensions, weight, original source (linked), original price; hides any null/empty fields

### Acceptance Criteria
- All components render without runtime errors with real `Item` data
- `AdaptiveImage` uses `<Image>` in vercel mode; `<img>` in static mode
- All interactive elements have `focus-visible:ring` classes
- Badges display text label (not colour only)

---

## Phase 6 — Home Page
**Goal:** `/` renders fully with hero, category grid, and recently listed section. Categories and items load from `content/`.

### Tasks
- [ ] `components/category/CategoryCard.tsx` — icon, display name, available item count, cover image background
- [ ] `components/category/CategoryGrid.tsx` — responsive grid of `CategoryCard`
- [ ] `components/item/ItemCard.tsx` — cover photo, name, condition badge, status badge, price prop (receives resolved price from parent). Renders `item.name` directly for now; **Phase 12** converts it to a `"use client"` locale-consumer (localised title) — see DESIGN.md §12
- [ ] `components/home/RecentlyListedSection.tsx` (client component) — owns `useGeolocation()` + `useDistancePricing()` state; renders item cards with resolved prices; no `LocationPriceBar` (prices update silently)
- [ ] `app/layout.tsx` — root layout, `BackgroundEffect` wrapper, `SiteHeader`, `SiteFooter`, global font/metadata
- [ ] `components/common/RecentlyViewed.tsx` (client) — reads `sessionStorage`; renders horizontal strip of last 5 viewed items; **hidden when empty** (returns `null`). Accepts optional `itemSlug?: string` prop — when provided, records that slug in `sessionStorage` on mount (used by the item detail page). Build here (Phase 6) since the component has no dependencies beyond `sessionStorage` + `Item` types; this avoids a Phase 9 → Phase 6 backward dependency.
- [ ] `app/page.tsx` — hero, `CategoryGrid`, `RecentlyListedSection`, `RecentlyViewed` strip (hidden on first visit; appears after any item detail page is viewed in the same session)
- [ ] OG metadata for home page (DESIGN.md §10.1: most recent available item's cover as og:image)

### Acceptance Criteria
- Home page renders with real content from `content/items/`
- Category cards show correct available item counts
- Recently Listed shows max `recentlyListedCount` items, `available` status only
- Zero available items → Recently Listed section hidden
- `RecentlyViewed` strip hidden on first visit (sessionStorage empty); visible after item pages are visited
- `pnpm type-check` → 0 errors

---

## Phase 7 — Geolocation & Pricing System
**Goal:** The full geolocation + distance-pricing stack works in isolation. Tested with `pnpm dev` before wiring into pages.

### Tasks

#### 7a — Hooks
- [ ] `components/pricing/useGeolocation.ts` — `idle → pending → granted/denied/unavailable`; `idle` treated same as `pending` in all rendering (DESIGN.md §17)
- [ ] `components/pricing/useDistancePricing.ts` — returns `{ source: "fallback" }` for `idle`/`pending`; exports `setManualMiles`; internally uses `resolveItemPrice` from `lib/utils/pricing.ts` (callers always import directly from that module — never re-exported from this hook)
- [ ] Verify `useDistancePricing` with `{ source: "fallback" }` → calls `resolveItemPrice` with fallback → highest tier

#### 7b — LocationPriceBar
- [ ] `components/pricing/LocationPriceBar.tsx` (client) — all 4 rendered states (idle/pending, granted-detected, manual, fallback); inline distance input; accessible (Enter/Space on toggle)
- [ ] Test all states by temporarily forcing each `geoState` value in dev

#### 7c — PricingTable & Toggle
- [ ] `components/item/PricingTable.tsx` — presentational; renders resolved tier row + `PricingTableToggle`; "Contact for price" if no tiers
- [ ] `components/item/PricingTableToggle.tsx` (client) — expand/collapse; visually accents resolved tier row; keyboard accessible; state persists through distance changes

#### 7d — PricingSection & FilterBar
- [ ] `components/item/PricingSection.tsx` (client) — owns geo+distance state for item detail; renders `LocationPriceBar` above `PricingTable`; accepts `initialResolvedTier` for SSG initial render
- [ ] `components/filters/SortSelect.tsx` (client) — sort dropdown: Price low→high · Price high→low · Date listed (newest) · Condition (new first); child of `FilterBar`; separate component so it can hold its own dropdown state. **Must be created before `FilterBar`** (FilterBar renders SortSelect as a child).
- [ ] `components/filters/useFilters.ts` — condition chips, price range slider (`[min, max]` on resolved prices), status toggle; slider hidden when no items have tiers; slider resets on distance change
- [ ] `components/filters/FilterBar.tsx` (client) — renders useFilters controls (including `SortSelect`); receives `resolvedDistanceMi` prop; passes `Infinity` from parent when source = fallback

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

## Phase 8 — Category Page, Browse All & Sold Archive
**Goal:** `/[category]`, `/all`, and `/sold` all render. Filter bar, item grid, and location-resolved prices complete.

### Tasks

#### 8a — Category Page
- [ ] `components/item/ItemGrid.tsx` (client) — owns `resolvedDistance` state; renders `LocationPriceBar` + `FilterBar` (with `SortSelect`) + item cards; passes `resolvedDistanceMi={Infinity}` to FilterBar when fallback. Prop `browseAll?: boolean` — when `true`, each `ItemCard` receives `showCategoryChip: true` so an "Items in: {Category}" chip (linking to `/[category]`) appears on each card; omit or `false` on individual category pages.
- [ ] `app/[category]/page.tsx` — `generateStaticParams` from `loadCategories()`; `generateMetadata` with OG; renders `ItemGrid` with items
- [ ] Sold item overlay on item cards (status badge + dimming)
- [ ] "Browse All" prominent link in the category page body — distinct from the header navigation link; points to `/all` (DESIGN.md §10.2)
- [ ] Empty category (all sold/draft items or all expired sold) → renders empty grid with "No items currently available in this category" message; the route is still generated because `loadCategories()` does not filter by item visibility (DESIGN.md §10.2; §15 governs item-level visibility, not route generation)

#### 8b — Browse All Page (`/all`)
- [ ] `app/all/page.tsx` — server component; calls `loadCategories()` then `loadItemsByCategory()` for each and flattens into a single `Item[]`; renders `<ItemGrid browseAll={true} ...>` (which adds the "Items in: {category}" chip to each card) without a category-level header (DESIGN.md §10.4)
- [ ] Verify: `available` + `reserved`/`pending` all appear; sold items hidden by toggle (default) but visible when on; `draft` items never appear
- [ ] Verify: filter bar condition chips, price slider, sort, status toggle all work

#### 8c — Sold Items Archive (`/sold`)
- [ ] `app/sold/page.tsx` — server component; calls `loadSoldItems()`; renders a simple item grid (no filter bar, no pricing, no contact); sorted by `soldDate` desc; shows cover image, name, condition badge, sold date, category chip (DESIGN.md §10.5)
- [ ] Verify all sold items appear regardless of `soldItemRetentionDays`
- [ ] Verify no pricing shown; no contact section

### Acceptance Criteria
- All category routes statically generated at build time
- Filter bar: condition chips, price slider, status toggle all work independently
- Sold items show "SOLD" overlay but are present in grid (until retention expires)
- `draft` items never render
- `/all` page shows `reserved`/`pending` with badges; `loadAllItems()` is NOT used for this page
- `/sold` archive shows every sold item; no retention filter applied

---

## Phase 9 — Item Detail Page
**Goal:** `/[category]/[item]` renders with gallery, SSG pricing, contact section, and all metadata.

> **⚠️ Ordering note:** Phase 9 depends on Phase 10 (Contact System). Despite appearing first in this document, Phase 10 must be completed before Phase 9 can be wired together. Complete Phase 10 first, then return here.

### Tasks

#### 9a — Supporting Components (build before wiring into page)
- [ ] `components/item/FreshnessLabel.tsx` (`"use client"`) — uses `useState<string|null>(null)` + `useEffect(() => { setLabel(formatRelativeDate(listedDate)) }, [listedDate])` to compute the relative date against the visitor's live browser clock on mount. Renders `null` before hydration (no stale SSG date). (TECH_REQUIREMENTS.md §22.11)
- [ ] `components/item/QuantityBadge.tsx` — renders "3 available" when `item.quantity > 1`; hidden otherwise
- [ ] `components/item/TextbookBadge.tsx` — renders "For CS101 · 3rd Edition" badge + "Compare prices" link (`bookfinder.com/search/?isbn={isbn}`); only shown when `isbn` or `course` is present (DESIGN.md §10.3)
- [ ] `components/item/MakeOfferButton.tsx` (client) — renders when `price.negotiable: true` AND `min_acceptable_offer` is set; inline offer form; pre-fills contact message on submit; client-side rejection below threshold (DESIGN.md §10.3)
- [ ] `components/item/ConditionGuide.tsx` (client) — `?` icon next to `ConditionBadge`; opens tooltip/modal explaining each condition value; closes on Escape; keyboard accessible
- [ ] `components/common/ShareButton.tsx` (client) — `navigator.share()` on mobile; `navigator.clipboard.writeText()` fallback on desktop; shows "Copied!" toast for 2s (TECH_REQUIREMENTS.md §22.10)
- [ ] Wire `RecentlyViewed` (built in Phase 6) into the item detail page: pass `itemSlug={item.itemSlug}` so the component records the current item in `sessionStorage` on mount. This makes the strip populate on the home page and other detail pages after a first item view.
- [ ] `components/common/JsonLd.tsx` — server component; renders `<script type="application/ld+json">{JSON.stringify(data)}</script>` (TECH_REQUIREMENTS.md §22.4)

#### 9b — Gallery
- [ ] `components/item/ItemGallery.tsx` (client) — simple default: large main image + thumbnail strip; click to swap (used by `GalleryAdapter` for `"simple"` config)

#### 9c — Item Detail Page
- [ ] `app/[category]/[item]/page.tsx`:
  - [ ] `generateStaticParams` from `loadCategories()` + `loadItemsByCategory()`
  - [ ] `generateMetadata` — title, description, og:image, og:title, Twitter card, Pinterest rich pin meta (TECH_REQUIREMENTS.md §22.5)
  - [ ] Server-side: calls `resolveItemPrice(item.price, { source: "fallback" })` for `initialResolvedTier`
  - [ ] Inject `<JsonLd data={buildProductJsonLd(item, siteConfig.baseUrl)} />` and `<JsonLd data={buildBreadcrumbJsonLd(crumbs)} />`
  - [ ] Renders: `Breadcrumb`, gallery (`GalleryAdapter`), `FreshnessLabel`, status+condition badges (`ConditionGuide` attached to `ConditionBadge`), `QuantityBadge`, name + description (react-markdown; **Phase 12** wraps these two into `LocalizedItemContent` for runtime locale switching), `TextbookBadge`, `PricingSection` (with `MakeOfferButton`, "Pay Deposit" + "Pay with Venmo" buttons), `MetadataTable`, `ContactSection`, tags, `ShareButton`, `RecentlyViewed`
  - [ ] Payment buttons (inline in `PricingSection`/page): render "Pay Deposit" when `stripe_payment_link` is set and "Pay with Venmo" when `venmo_payment_request` is set; each opens its URL in a new tab with `rel="noopener noreferrer"`; neither renders when its field is empty (DESIGN.md §10.3, TECH_REQUIREMENTS.md §22.9)
  - [ ] Sold item: "SOLD" banner prominent; contact section CTA disabled; `sold_date` shown if present
- [ ] `app/not-found.tsx` — site header, "Page not found" message, link to home

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

## Phase 10 — Contact System
**Goal:** Contact section renders correctly on item detail page and in footer. QR modal works.

### Tasks
- [ ] `components/contact/PlatformButton.tsx` (client) — link-based: `<a>` with correct URL per platform table (DESIGN.md §7); QR-based: `<button>` triggering modal
- [ ] `components/contact/QRModal.tsx` (client) — `<dialog>`; closes on backdrop click + Escape; focus trapped inside while open; restores focus on close
- [ ] `components/contact/ContactSection.tsx` (client) — `reveal_behavior: "click"` toggle; renders platform buttons; hides `preferredPayment`/`contactNote` blocks when empty; footer usage: pass `preferredPayment={[]}` and `contactNote=""`
- [ ] Wire into item detail page and `SiteFooter`

### Acceptance Criteria
- All link platforms open in new tab with `rel="noopener noreferrer"`
- WeChat/LINE QR modal opens, focuses, closes on Escape
- `reveal_behavior: "always"` shows platforms immediately
- `reveal_behavior: "click"` hides behind toggle
- Footer shows only platform buttons (no payment/note section)

---

## Phase 11 — UI Slot Adapters (Wiring)
**Goal:** All 4 adapter files fully wired. `content/config.ts` `ui.*` values drive the correct Aceternity component everywhere.

### Dependencies: Phases 1, 8, 9 must be complete.

### Tasks
- [ ] `components/ui-adapters/BackgroundEffect.tsx` — all 13 background options pre-imported, full `COMPONENTS` map, `⚠️ DO NOT EDIT` header
- [ ] `components/ui-adapters/ItemGridAdapter.tsx` — all 3 grid options + `"simple"` fallback, render prop interface, data normalisation per TECH_REQUIREMENTS.md §21
- [ ] `components/ui-adapters/GalleryAdapter.tsx` — all 4 gallery options + `"simple"` fallback, data normalisation
- [ ] `components/ui-adapters/ItemCardAdapter.tsx` — all 8 card options + `"simple"` fallback, children pass-through, data normalisation (direction-aware-hover note)
- [ ] Wire `BackgroundEffect` into `app/layout.tsx`
- [ ] Wire `ItemGridAdapter` into `components/item/ItemGrid.tsx` (replaces raw grid div)
- [ ] Wire `GalleryAdapter` into item detail page (replaces `ItemGallery` directly)
- [ ] Wire `ItemCardAdapter` into `ItemCard.tsx` as outermost wrapper
- [ ] Test each slot by cycling through 2–3 values in `content/config.ts` and verifying no crashes

### Acceptance Criteria
- Changing `ui.background` in `content/config.ts` → correct Aceternity background renders after rebuild
- Unknown config value → silent fallback to `"simple"`/`"none"` (no crash, no TypeScript error)
- All adapter files begin with `⚠️ DO NOT EDIT` comment
- `pnpm type-check` → 0 errors across all adapter files

---

## Phase 12 — Internationalisation Runtime
**Goal:** Visitors switch language at runtime via a `LocaleSwitcher` in the header. Item names (cards + detail) and the detail-page Markdown description re-render in the selected locale with no reload; the selection persists across pages and refreshes. SSG still emits `defaultLocale` content. When `availableLocales.length === 1` the switcher is hidden and behaviour is identical to a single-locale build.

### Dependencies
- Phase 3b (`lib/utils/i18n.ts` — `getLocalizedField`, `t`) must be done
- Phase 5 (SiteHeader — hosts `LocaleSwitcher`), Phase 6 (`ItemCard`, `app/layout.tsx`), Phase 9 (item detail page — hosts `LocalizedItemContent`)

**Can be developed in parallel with Phases 10, 11, and 13.**

### Tasks

#### 12a — i18n Runtime Components
- [ ] `components/i18n/LocaleProvider.tsx` (client) — React context exposing `{ locale, setLocale }`; on mount reads `localStorage.getItem("locale")`, falls back to `siteConfig.i18n.defaultLocale` when absent or not in `availableLocales`; `setLocale` persists via `localStorage.setItem("locale", …)` (TECH_REQUIREMENTS.md §22.8)
- [ ] `components/i18n/useLocale.ts` — hook returning the active locale (and `setLocale`) from `LocaleProvider` context
- [ ] `components/i18n/LocaleSwitcher.tsx` (client) — one control per `availableLocale`; calls `setLocale()`; **returns `null` when `siteConfig.i18n.availableLocales.length <= 1`** (DESIGN.md §12)

#### 12b — Localised Rendering
- [ ] `components/item/LocalizedItemContent.tsx` (client) — renders the item `<h1>` name and the react-markdown + remark-gfm description; reads `useLocale()` and resolves each via `getLocalizedField(item, "name"/"description", locale)`; both re-render on a locale change (DESIGN.md §10.3, §12; TECH_REQUIREMENTS.md §22.8)
- [ ] Convert `components/item/ItemCard.tsx` → `"use client"`; localise the card title via `useLocale()` + `getLocalizedField(item, "name", locale)`

#### 12c — Wiring
- [ ] Wrap `app/layout.tsx` children in `<LocaleProvider>` (outermost client provider inside `<body>`) so every page shares one locale context
- [ ] Render `<LocaleSwitcher />` in `components/layout/SiteHeader.tsx` (auto-hidden when a single locale is configured)
- [ ] Replace the inline name + react-markdown block on `app/[category]/[item]/page.tsx` with `<LocalizedItemContent item={item} />`
- [ ] Confirm server-only surfaces (`generateMetadata`, `<title>`, OG, JSON-LD, breadcrumb leaf) keep reading `siteConfig.i18n.defaultLocale` — they are intentionally not runtime-switchable (TECH_REQUIREMENTS.md §22.8 SEO note)

### Acceptance Criteria
- `availableLocales: ["en"]` → `LocaleSwitcher` hidden; no behavioural change vs. a non-i18n build
- `availableLocales: ["en","zh"]` with a translated item → switching to `zh` updates the card title, detail `<h1>`, and Markdown description with no reload; untranslated items fall back to English (no blank, no crash)
- Selected locale persists across navigations and survives a page refresh (localStorage)
- View-source on a cold load shows `defaultLocale` text (SSG) — confirms crawlers see the default language
- `pnpm type-check` → 0 errors

### References
DESIGN.md §10.3, §12, §13 · TECH_REQUIREMENTS.md §22.8

---

## Phase 13 — SEO, Search, Accessibility & Security Hardening
**Goal:** Lighthouse ≥ 80 performance, ≥ 90 accessibility. Full-text search working. All TECH_REQUIREMENTS.md §14 and §15 checks pass.

### Tasks

#### Full-Text Search
- [ ] Write `scripts/build-search-index.ts` — imports `buildSearchIndex()` from `lib/search/index.ts`, writes the result to `public/search-index.json`, logs entry count, exits 1 on error. (fuse.js and its types are already installed in Phase 0; fuse.js v7 ships its own TypeScript types, no `@types/fuse.js` needed)
- [ ] Update `prebuild` script in `package.json` to chain: `tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts` (see TECH_REQUIREMENTS.md §7 for the full scripts block)
- [ ] Verify: `pnpm build` generates `public/search-index.json` before `next build` renders any page (index built once in prebuild, not per-page)
- [ ] Write `components/search/SearchBar.tsx` (client) — loaded via `next/dynamic({ ssr: false })`; on mount fetches `/search-index.json`; graceful 404 handling (empty index, no crash — see TECH_REQUIREMENTS.md §22.1); debounce 150 ms; shows results inline with cover image, name, category, price badge; clicking navigates to detail page
- [ ] Write `components/search/useSearch.ts` — loads index on mount, manages query + results state
- [ ] Wire `SearchBar` into `SiteHeader` (shown when `siteConfig.search.enabled === true`)
- [ ] Verify: search for a brand name, tag, course code, ISBN, edition — all return results
- [ ] Verify: in `pnpm dev` without a prior build — SearchBar shows no results, no crash

#### SEO
- [ ] Verify every route has `<title>` and `<meta name="description">` populated
- [ ] Verify OG tags on all 3 route types (home, category, item)
- [ ] Verify `sitemap.xml` + `robots.txt` are generated when `siteConfig.sitemap.enabled` (v1 feature, on by default; config-toggleable per TECH_REQUIREMENTS.md §22.7)

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
- [ ] Verify `poweredByHeader: false` in `next.config.ts`
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

## Phase 14 — Deployment
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
- [ ] Verify `.github/workflows/deploy.yml` is committed (ships with the project)

#### Initial Content & Deploy
- [ ] Add real listing photos to `content/items/` folders
- [ ] Run `pnpm upload-images` → verify R2 upload succeeds; manifest written
- [ ] Commit `lib/generated/image-manifest.json` + `content/**/*.json`
- [ ] Push to `main` → GitHub Actions triggers → verify workflow passes (green check)
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

## Phase 15 — AI Skill Files (Setup Wizard + Item Generator + Item Translator)
**Goal:** All three Claude Code skills are complete, tested, and ship with the project. A seller using Claude Code (or any capable AI tool) can run `/setup`, `/update-items`, and `/translate-items` to generate `content/config.ts`, generate `item.json` files, and add locale translations — all without editing any code.

**No API keys, no new dependencies, no custom scripts.** The deliverable is three Markdown instruction files.

**Can be developed in parallel with Phases 5–14.**

### Dependencies
- Phase 3 (Content Schema) must be done — skills reference the full `item.json` schema and must stay in sync with it
- Phase 2 (Type System & Config) must be done — skills reference `content/config.ts` field names and types

### Tasks

#### 14a — Project CLAUDE.md
- [ ] Create `.claude/CLAUDE.md` with project context: what the project is, the `content/` folder rule, common seller tasks, pointers to relevant DESIGN.md sections
- [ ] Test: open Claude Code in project directory; confirm AI has correct project context without further explanation

#### 14b — `update-items.md` Skill
- [ ] Create `.claude/skills/update-items.md`
- [ ] Include: trigger description, vision instructions for photo analysis, description file format support (`.txt`, `.md`, `.yaml`, `.json`), field extraction table (with confidence levels), merge rules (description overrides vision), output spec (`status: "draft"`, `reserved_for` never set), confirmation flow, scope instructions (natural language targets)
- [ ] Include full `item.json` schema from DESIGN.md §5 as a reference block
- [ ] Test with Claude Code: create a test item folder with 2 photos + notes.txt → invoke skill → verify generated JSON validates against Zod schema
- [ ] Test scope targeting: "just update the electronics folder"
- [ ] Test with no description file (photos only)
- [ ] Test with partial `info.yaml` (description file with some fields set)

#### 14c — `setup-wizard.md` Skill
- [ ] Create `.claude/skills/setup-wizard.md`
- [ ] Include: all 8 question groups, location resolution instructions (AI uses knowledge to suggest lat/lng, shows for confirmation), personality calibration examples, category scaffold instructions, idempotency instructions (read existing config before asking)
- [ ] Include full `content/config.ts` template from DESIGN.md §13 as the output reference
- [ ] Test with Claude Code: run `/setup` from scratch → verify generated `content/config.ts` compiles (`pnpm type-check`)
- [ ] Test idempotency: run again after config exists → verify AI reads existing values and pre-fills
- [ ] Test partial re-run: "just update my contact info"

#### 14d — `translate-items.md` Skill
- [ ] Create `.claude/skills/translate-items.md`
- [ ] Include full required content per TECH_REQUIREMENTS.md §23.8: trigger (scan for missing `name_{locale}`/`description_{locale}`), locale detection from `siteConfig.i18n.availableLocales`, fields to translate (`name`→`name_{locale}`, `description`→`description_{locale}`), fields preserved verbatim (brand, model, color, tags, course, isbn, edition, prices, dates, status, URLs), Markdown preservation, per-item confirmation flow (confirm / edit / skip / accept-all), natural-language scope, status filter (translate all statuses incl. draft/sold), output rules (write only locale fields; preserve everything else)
- [ ] Include the Zod-schema precondition: skill verifies `name_{locale}`/`description_{locale}` exist in `lib/content/schema.ts`; if absent, prints the exact Zod + `Item` type snippet to add and stops (TECH_REQUIREMENTS.md §23.8)
- [ ] Test with Claude Code: add `"zh"` to `availableLocales`, run `/translate-items` → `name_zh`/`description_zh` written, other fields untouched, Markdown preserved
- [ ] Test idempotency: items with existing non-empty translations are skipped (no overwrite)

#### 14e — Validation & Documentation
- [ ] Create `SETUP_GUIDE.md` at the project root — plain-English seller guide with no code, no terminal jargon, no git commands. Contents per TECH_REQUIREMENTS.md §22.12: (1) adding a new item, (2) marking an item sold, (3) creating from template, (4) changing prices, (5) uploading new photos, (6) what to back up, (7) who to contact if something breaks.
- [ ] Add a "Verify skill output" step to `SETUP_GUIDE.md`: after running `/update-items`, run `pnpm type-check` to confirm generated JSON is valid
- [ ] Test all three skills in at least one non-Claude AI tool (Cursor or GitHub Copilot) to verify compatibility
- [ ] Confirm `content/` rule: AI never modifies any file outside `content/`

### Acceptance Criteria
- `/update-items` in Claude Code → generates valid `item.json`; Zod schema validates it
- `/setup` in Claude Code → `content/config.ts` generated; `pnpm type-check` passes
- `/translate-items` in Claude Code → writes `name_{locale}`/`description_{locale}` only; other fields untouched; existing translations not overwritten
- All three skills work in at least one other AI tool (Cursor / GitHub Copilot)
- No new npm dependencies added
- No API keys required
- No files written outside `content/`

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
1. All 15 phases are done (Phase 15 may ship slightly after Phases 0–14 if the AI skill files are delayed)
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
