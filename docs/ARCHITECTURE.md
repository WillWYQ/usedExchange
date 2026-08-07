# UsedExchange — Architecture

> Developer reference. For the full design specification see [DESIGN.md](DESIGN.md); for the build plan see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); for non-technical seller operations see [../SETUP_GUIDE.md](../SETUP_GUIDE.md).
>
> **Version:** v1.2 · **Date:** 2026-08-02
>
> 🇨🇳 Chinese version: [ARCHITECTURE_zh.md](ARCHITECTURE_zh.md)

---

## Directory Structure

```
usedExchange/
├── app/                              ← Next.js App Router pages + root layout (100% Server Components)
│   ├── layout.tsx                    ← Root layout: ThemeProvider > LocaleProvider > MeasurementUnitProvider > BackgroundEffect > SiteHeader/Footer
│   ├── globals.css                   ← Tailwind v4 directives + CSS custom properties
│   ├── page.tsx                      ← Home page (/)
│   ├── about/page.tsx                ← Project intro: shown at "/" pre-setup, permanent home afterwards
│   ├── all/page.tsx                  ← Browse All (/all)
│   ├── newly-listed/page.tsx         ← Newly Listed (/newly-listed) — server shell → NewlyListedClient
│   ├── sold/page.tsx                 ← Sold Archive (/sold)
│   ├── not-found.tsx                 ← Global 404 page
│   ├── [category]/page.tsx           ← Category listing page (/[category])
│   └── [category]/[item]/page.tsx    ← Item detail page (/[category]/[item])
│
├── components/
│   ├── category/                     ← CategoryCard, CategoryGrid
│   ├── common/                       ← AdaptiveImage, JsonLd, RecentlyViewed, ShareButton, useIncrementalReveal
│   ├── contact/                      ← ContactSection, PlatformButton, QRModal
│   ├── filters/                      ← FilterBar, SortSelect, useFilters
│   ├── home/                         ← RecentlyListedSection
│   ├── i18n/                         ← LocaleProvider, LocaleSwitcher, useLocale, useT
│   ├── intro/                        ← ProjectIntro + UISlotPlayground + projectIntro.dictionary (6-locale copy)
│   ├── item/                         ← All item-rendering components (see §Item Components)
│   ├── layout/                       ← Breadcrumb, SiteHeader, SiteFooter
│   ├── newly-listed/                 ← NewlyListedClient (client component for /newly-listed)
│   ├── pricing/                      ← DistancePricingContext, LocationPriceBar, useDistancePricing, useGeolocation, useShippingRate
│   ├── search/                       ← SearchBar, SearchBarClient, useSearch
│   ├── theme/                        ← ThemeProvider, ThemeToggle
│   ├── ui/                           ← Aceternity UI library: 27 supported slot components, ~30 files (installed once by `pnpm setup-ui`)
│   ├── ui-adapters/                  ← BackgroundEffect, GalleryAdapter, ItemCardAdapter, ItemGridAdapter
│   ├── units/                        ← MeasurementUnitProvider, MeasurementUnitToggle, useMeasurementUnit
│   └── *-demo.tsx                    ← Unused Aceternity demo scaffolds (not imported; safe to remove)
│
├── content/                          ← ⚠️ THE ONLY FOLDER SELLERS EVER TOUCH
│   ├── config.ts                     ← SiteConfig export (must match lib/config/types.ts)
│   └── items/
│       └── <category>/
│           ├── _category.json        ← Optional: display_name, icon, sort_order, description
│           └── <item>/
│               ├── item.json         ← Required: item metadata (all fields in DESIGN.md §5)
│               ├── cover.jpg         ← Pinned thumbnail (optional naming convention)
│               └── *.jpg/jpeg/png/webp/gif ← Additional gallery images (gitignored)
│
├── lib/
│   ├── config/types.ts               ← SiteConfig TypeScript type definition
│   ├── content/
│   │   ├── loader.ts                 ← ★ Public data-access API (see §Loader API)
│   │   ├── schema.ts                 ← Zod schemas for item.json and _category.json
│   │   └── types.ts                  ← TypeScript types: Item, Category, Price, PriceTier, etc.
│   ├── generated/
│   │   └── image-manifest.json       ← CDN URL map (committed; written by pnpm upload-images and Seller Studio's CDN sync)
│   ├── images/
│   │   ├── adapter.ts                ← ImageStorageAdapter interface
│   │   ├── cloudflare-r2.ts          ← CloudflareR2Adapter
│   │   ├── local.ts                  ← LocalAdapter + copyIfChanged helper
│   │   ├── normalizeR2Url.ts         ← Strips trailing slash from R2 public URL
│   │   ├── stripMetadata.ts          ← stripImageMetadata(): sharp EXIF/GPS removal before upload
│   │   └── vercel-blob.ts            ← VercelBlobAdapter
│   ├── i18n/
│   │   ├── translations.ts           ← EN_FALLBACK: UIStrings — built-in English defaults for all 87 keys
│   │   └── getTranslations.ts        ← getTranslations(): UIStrings — server-side resolution (always defaultLocale)
│   ├── search/index.ts               ← buildSearchIndex(): SearchIndexEntry[]
│   ├── ui/types.ts                   ← UIConfig type (background, itemGrid, gallery, itemCard slots) + PriceFilterStrategy
│   └── utils/
│       ├── concurrency.ts            ← mapWithConcurrency<T,R>(items, limit, fn)
│       ├── date.ts                   ← formatRelativeDate(), formatAbsoluteDate()
│       ├── haversine.ts              ← haversineInMiles(lat1, lng1, lat2, lng2)
│       ├── i18n.ts                   ← getLocalizedField(item, field, locale)
│       ├── index.ts                  ← Re-exports cn() (clsx + tailwind-merge)
│       ├── jsonld.ts                 ← buildProductJsonLd(), buildBreadcrumbJsonLd()
│       ├── priceFilterStrategies.ts  ← computePriceBounds(), computePriceBuckets() — price-bucket strategies
│       ├── pricing.ts                ← resolveItemPrice(price, resolved) — NO "use client"
│       ├── shipping.ts               ← isShippingTier(), resolveShippingPayer(), canEstimateShipping() — NO "use client"
│       ├── slug.ts                   ← isValidSlug() — kebab-case validation
│       ├── templateStatus.ts         ← isTemplateConfigured() — detects unconfigured template
│       └── units.ts                  ← resolveMeasurementUnit(), formatDimensions(), formatWeight() — NO "use client"
│
├── scripts/                          ← pnpm run scripts (mostly tsx, Node.js, no browser APIs)
│   ├── build-search-index.ts         ← Prebuild: writes public/search-index.json
│   ├── bump-version.ts               ← pnpm bump — interactive version bump + GitHub release
│   ├── check-config.ts               ← Prebuild: fails build if baseUrl is still placeholder or a locale's translations are incomplete
│   ├── create-item.ts                ← pnpm create-item / pnpm new
│   ├── create-template.ts            ← pnpm create-template
│   ├── export-facebook.ts            ← pnpm fb-export — interactive Facebook Marketplace CSV export
│   ├── mark-sold.ts                  ← pnpm mark-sold
│   ├── migrate-config.ts             ← pnpm migrate-config — splices missing optional config fields
│   ├── postbuild.ts                  ← Postbuild: next-sitemap
│   ├── setup-ui.sh                   ← pnpm setup-ui — bash installer for all Aceternity components
│   ├── studio.ts                     ← pnpm studio — Seller Studio launcher (Vite bound to 127.0.0.1)
│   ├── sync-images.ts                ← pnpm upload-images / dev-sync / build-check
│   ├── update-site.ts                ← pnpm update-site — pulls a tagged template release
│   └── lib/                          ← Shared support modules (see §scripts/lib); tests colocated as *.test.ts
│
├── studio/                           ← Seller Studio Vite SPA (pnpm studio; served only on 127.0.0.1)
│   ├── index.html, vite.config.ts    ← Vite entry + studioApiPlugin middleware (CSRF → 32 MB cap → /api/*)
│   ├── csrfGuard.ts                  ← checkStudioCsrf — CSRF/Origin guard for the /api/* middleware
│   └── src/                          ← React app: App.tsx, api.ts, fields.ts, fieldValues.ts, editForm.ts, filtering.ts, components/ (Button, StatusBadge, ThemeToggle, useDialogBehavior), panes/ (ItemList, EditForm, ImagePane, PublishPane, SyncBar, …)
│
├── hooks/                            ← Shared React hooks: use-outside-click.tsx (useOutsideClick)
│
├── exports/                          ← fb-export output (gitignored): CSV(s), facebook-marketplace-photos/, .export-history.json
│
├── public/
│   ├── items/                        ← Local images (gitignored; populated at dev/build time)
│   ├── contact/                      ← QR code images (gitignored; copied from content/contact/)
│   └── search-index.json             ← Fuse.js index (gitignored; built in prebuild)
│
├── .github/workflows/
│   ├── ci.yml                        ← Type-check + lint + test (push / PR / manual)
│   ├── deploy.yml                    ← Build + deploy to GitHub Pages from release branch
│   └── release-seller.yml            ← Release branch management (v* tags / manual)
│
├── workers/                           ← Independently deployed Cloudflare Workers (own tsconfig/eslint scope)
│   └── shipping-rate-proxy/          ← Optional: shipping rate proxy (see DESIGN.md §21)
│       ├── src/index.ts              ← fetch handler — calls Shippo/EasyPost, returns cheapest rate
│       ├── wrangler.toml             ← Worker config (vars + secrets — see workers/shipping-rate-proxy/README.md)
│       └── README.md                 ← Deploy walkthrough + API contract
│
├── next.config.ts                    ← Static export flag, image domains
├── tsconfig.json                     ← strict + noUncheckedIndexedAccess + @/* path alias
├── vitest.config.ts                  ← Vitest (node environment, esbuild JSX automatic, @ path alias)
├── .env.example                      ← Environment variable documentation
└── next-sitemap.config.js            ← next-sitemap configuration
```

---

## Data Flow

### Build Time (Static Export)

```
content/items/**/item.json
    │
    ▼  lib/content/schema.ts
    Zod validates + normalises all fields
    reserved_for stripped; URL schemes allowlisted; unsafe values coerced to defaults
    │
    ▼  lib/content/loader.ts
    Reads item folders + image-manifest.json (Promise cached)
    Applies visibility filter (draft hidden; sold past retention hidden)
    Resolves CDN URLs from manifest, or falls back to /items/<key>
    │
    ├──► loadHomePageData()    ──► app/page.tsx
    ├──► loadCategories() +
    │    loadItemsByCategory() ──► app/[category]/page.tsx
    ├──► loadItem()            ──► app/[category]/[item]/page.tsx
    ├──► loadBrowseAllPageData()──► app/all/page.tsx + app/newly-listed/page.tsx
    └──► loadSoldItems()       ──► app/sold/page.tsx
    │
    ▼  next build
    All pages rendered to static HTML → out/
    No server, no database, no runtime credentials required
```

### Search Index (Build Time → Client Runtime)

```
prebuild: scripts/build-search-index.ts
    └─► public/search-index.json (gitignored)
            │
            ▼  Browser
SearchBarClient fetches /search-index.json → Fuse.js fuzzy matching
```

### Client Runtime (Browser)

```
Browser hydration
    ├─► useGeolocation()          Requests Geolocation API permission
    │       │ granted → { lat, lng }
    │       │ denied  → fallback
    │       ▼
    ├─► useDistancePricing()      haversineInMiles(seller, visitor) → ResolvedDistance
    │       │
    │       ▼
    └─► resolveItemPrice()        Selects the matching PriceTier from price.tiers
            (lib/utils/pricing.ts — importable from both server and client)
```

### Shipping Estimate (Optional, Client Runtime)

```
ShippingEstimator (components/item/ShippingEstimator.tsx)
    │  rendered only if canEstimateShipping() — see lib/utils/shipping.ts
    │
    ├─► resolveShippingPayer() === "seller"
    │       └─► renders t.shippingIncludedBySeller (no network call)
    │
    └─► resolveShippingPayer() === "buyer"
            │  buyer enters destination ZIP
            ▼  useShippingRate() (components/pricing/useShippingRate.ts)
            POST siteConfig.shipping.proxyUrl
                { destinationZip, destinationCountry, weight, dimensions, currency }
            │
            ▼  workers/shipping-rate-proxy (Cloudflare Worker — holds API keys)
            Calls Shippo or EasyPost, returns the cheapest rate
            │
            ▼  ShippingRate { amount, currency, carrier, service, estimatedDays }
            Displayed inline; errors shown as t.shippingUnavailable
```

### Image Upload (Seller Machine Only)

```
content/items/<category>/<item>/*.jpg
    │
    ▼  pnpm upload-images   (scripts/sync-images.ts --mode upload)
    SHA-256 checksum per file → skip unchanged files
    Upload new/changed files to CDN (R2, Vercel Blob, or local)
    Write lib/generated/image-manifest.json  ← committed to git
    Write .image-cache/checksums.json        ← gitignored
    │
    ▼  git commit lib/generated/image-manifest.json
    CI reads this manifest — no CDN credentials needed in CI
```

### Seller Studio (Local Only)

```
pnpm studio (scripts/studio.ts)
    └─► Vite dev server bound to 127.0.0.1:5174 — serves the studio/ SPA + /api/*
            │
            ├─► GET/PATCH /api/items/…   Surgical JSONC edits to content/items/**/item.json
            │                            (comments + reserved_for untouched)
            ├─► GET/PUT /api/defaults    Sparse two-tier _defaults.json (site-wide or per-category;
            │                            merged into new items unless applyDefaults: false)
            ├─► POST /api/sync-images    SSE progress stream → imageSync.syncImagesToCdn
            │                            writes lib/generated/image-manifest.json → resets manifest cache
            └─► POST /api/publish        git add content + image-manifest.json → commit → push
            │
            ▼  App.tsx keeps no client-side item state — every write triggers a full re-fetch
```

---

## lib/ Module Reference

### `lib/content/loader.ts` — Public Data API

All page components must call these functions. Never read `content/items/` directly from a page.

| Function | Returns | Use in |
|---|---|---|
| `loadHomePageData()` | `{ categories: Category[], recentItems: Item[] }` | `app/page.tsx` |
| `loadCategories()` | `Category[]` | `app/[category]/page.tsx`, `app/[category]/[item]/page.tsx` |
| `loadItemsByCategory(slug, manifest?)` | `Item[]` | category + item pages |
| `loadItem(categorySlug, itemSlug)` | `Item \| null` | `app/[category]/[item]/page.tsx` |
| `loadBrowseAllPageData()` | `{ items: Item[], categories: Category[] }` | `app/all/page.tsx` |
| `loadSoldItems()` | `Item[]` | `app/sold/page.tsx` |
| `loadAllItems()` | `Item[]` | Home-page "recently listed" strip — available items only, sorted by `listedDate` desc, capped at `recentlyListedCount` |
| `loadAllItemsRaw()` | `Item[]` | scripts and `buildSearchIndex()` only — no visibility filter |
| `resetManifestCache()` | `void` | tests; also called by Studio after a CDN sync so fresh CDN URLs are served |

**Performance invariant:** The image manifest (`lib/generated/image-manifest.json`) is read once per process via a module-level Promise cache. Functions that need both categories and items (`loadHomePageData`, `loadBrowseAllPageData`) parse every item exactly once — do not compose `loadCategories()` + `loadItemsByCategory()` in the same render pass, as that would parse every item twice.

**`item.json`/`_category.json` are parsed as JSONC** via `jsonc-parser` (`readJsonc()` helper) — `//` comments and trailing commas are allowed. Strict JSON parses with zero errors too, so this is purely additive; a parse error → `undefined`, handled the same as the old `JSON.parse` throw (item → `null` / category → defaults).

### `lib/content/schema.ts` — Zod Validation

Validates and normalises raw `item.json` data. Key behaviours:

- `reserved_for` is stripped by Zod's default `strip` mode and never appears in the `Item` type.
- URL fields (`original_link`, `stripe_payment_link`, `venmo_payment_request`, `youtube_link`) are validated against an `http:`/`https:` allowlist — `javascript:`, `data:`, and other schemes are coerced to `""`.
- Negative number fields coerce to `null`; invalid `dimensions`/`weight` sub-objects coerce to `null` rather than failing the entire item parse.
- `quantity` coerces to `1` when absent or `< 1`.
- When `name` is present but other fields have schema errors, the loader recovers by re-parsing with just `{ name }` and all defaults — the item appears rather than disappearing silently.

### `lib/utils/pricing.ts` — Price Tier Resolution

```ts
resolveItemPrice(price: Price, resolved: ResolvedDistance): PriceTier | null
```

- Returns `null` when `price.tiers` is empty → callers show "Contact for price".
- `resolved.source === "fallback"` (geo denied/unavailable/idle): returns the open-ended tier (no `miles_max`) first; otherwise returns the highest-amount tier.
- `resolved.source === "detected" | "manual"`: returns the first tier where `D >= miles_min && D <= miles_max`. On a gap between tiers, returns the tier whose `miles_max` is closest to D from below. When D is below every tier's lower bound, returns the tier with the smallest `miles_min`.

**⚠ Must never have `"use client"`** — this function is called both in Server Components (for the SSG initial render, so the static HTML never shows a blank price) and in `useDistancePricing` (a client hook). Adding `"use client"` would break the server import path.

### `lib/utils/units.ts` — Dimension/Weight Unit Conversion

```ts
convertLength(value: number, from: "cm" | "in", to: "cm" | "in"): number
convertWeight(value: number, from: "kg" | "lb", to: "kg" | "lb"): number
resolveMeasurementUnit(locale: string, config: SiteConfig): "metric" | "imperial"
formatDimensions(dimensions: Dimensions, targetSystem: "metric" | "imperial"): string
formatWeight(weight: Weight, targetSystem: "metric" | "imperial"): string
```

- `resolveMeasurementUnit()` — `siteConfig.i18n.localeMeasurementUnits?.[locale] ?? siteConfig.measurementUnit ?? "metric"`.
- `formatDimensions`/`formatWeight` — convert an item's stored `dimensions`/`weight` (whatever unit the seller entered) to the resolved unit system, rounding to 2 decimals. Used by `MetadataTable` (`components/item/MetadataTable.tsx`) with `unitSystem = resolveMeasurementUnit(useLocale().locale, siteConfig)`.

**No `"use client"`** — same invariant as `pricing.ts`/`shipping.ts`, importable from both server and client components.

### `lib/utils/shipping.ts` — Shipping Eligibility & Payer Resolution

```ts
isShippingTier(tier: PriceTier | null): boolean
resolveShippingPayer(price: Price, shipping: NonNullable<SiteConfig["shipping"]>): "seller" | "buyer"
canEstimateShipping(shipping, weight, dimensions, resolvedTier): boolean
```

- `isShippingTier()` — `true` only for the open-ended pricing tier (`miles_max` absent), the convention used to mean "Shipping" (see DESIGN.md §17).
- `resolveShippingPayer()` — `price.shipping_payer` (per-item override) falls back to `siteConfig.shipping.defaultPayer`.
- `canEstimateShipping()` — gates the `ShippingEstimator` UI: requires `shipping.enabled`, both `weight` and `dimensions` present on the item, and the resolved tier to be the shipping tier.

**Same invariant as `pricing.ts`: no `"use client"`** — kept pure so it can be unit-tested and reused from both the server-rendered item page and the `ShippingEstimator` client component. See DESIGN.md §21 for the full feature design.

### `lib/utils/priceFilterStrategies.ts` — Price Filter Buckets

```ts
computePriceBounds(amounts: number[], config: PriceFilterConfig): PriceBoundsResult | null
computePriceBuckets(amounts: number[], currency: string, customBoundaries?: number[]): PriceBucket[]
```

Implements the five `PriceFilterStrategy` values from `lib/ui/types.ts`: `"none"`, `"percentile"`, `"logarithmic"`, `"preset-buckets"`, `"iqr"`. Consumed by `useFilters`, `FilterBar`, and `ItemGrid` when `siteConfig.ui.priceFilterStrategy` is set. Both config fields (`ui.priceFilterStrategy?`, `ui.priceFilterBuckets?`) are TypeScript-optional with a runtime default of `"none"` at every consumption site (see Key Invariants — config backward compatibility), so sites on older templates keep type-checking after `pnpm update-site`.

**No `"use client"`** — pure functions, same invariant as `pricing.ts`.

### `lib/images/` — Storage Adapter Pattern

`ImageStorageAdapter` interface (defined in `lib/images/adapter.ts`) is implemented by three classes:

| Class | Provider key | File |
|---|---|---|
| `CloudflareR2Adapter` | `"cloudflare-r2"` | `lib/images/cloudflare-r2.ts` |
| `VercelBlobAdapter` | `"vercel-blob"` | `lib/images/vercel-blob.ts` |
| `LocalAdapter` | `"local"` | `lib/images/local.ts` |

`scripts/sync-images.ts` instantiates the correct adapter at runtime based on `siteConfig.imageStorage.provider`. All three implement `syncImage(sourcePath, manifestKey, checksum, body?)` and an incremental skip mechanism via `loadChecksums` / `getUpdatedChecksums`.

**`lib/images/stripMetadata.ts`** — `stripImageMetadata(input: Buffer, ext: string): Promise<Buffer>`. Used by `runUpload()` in `scripts/sync-images.ts` to re-encode every new/changed JPEG, PNG, and WebP via `sharp` before upload, dropping all EXIF/IPTC/XMP metadata (including GPS coordinates) while applying the EXIF orientation tag so the image still displays right-side-up. The resulting buffer is passed as the optional `body` argument to `syncImage`, which adapters use instead of reading `sourcePath` directly. GIFs pass through unchanged (no EXIF segment; re-encoding would collapse animation).

### `lib/utils/concurrency.ts`

```ts
mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>
```

Bounded-concurrency `Promise.all` replacement. Used by `loader.ts` (category parse: 6, item parse: 24) and `sync-images.ts` (uploads: 8, quality checks: 8) to keep file-descriptor usage below the OS `ulimit`. Without this, a large catalogue would throw `EMFILE: too many open files`.

### `lib/utils/i18n.ts`

```ts
getLocalizedField(item: Item, field: "name" | "description", locale: string): string
```

Returns the localised `name_{locale}` or `description_{locale}` value when non-empty; falls back to the default-locale value when the locale is unknown, the field is empty, or the locale matches the default. To add a new locale, add one entry to `LOCALE_FIELD_MAP` and add the corresponding `name_{locale}` / `description_{locale}` fields to `Item` and `itemJsonSchema`.

### `lib/utils/haversine.ts`

```ts
haversineInMiles(lat1: number, lng1: number, lat2: number, lng2: number): number
```

Great-circle distance in miles between two WGS-84 points. Used by `useDistancePricing` to compute the buyer–seller distance that drives tier selection.

### `lib/utils/date.ts`

| Function | Input | Output |
|---|---|---|
| `formatRelativeDate(isoDate, now?)` | `"YYYY-MM-DD"` | `"3 days ago"`, `"Today"`, or `""` |
| `formatAbsoluteDate(isoDate)` | `"YYYY-MM-DD"` | `"June 5, 2026"` (locale-stable, UTC) |

`formatAbsoluteDate` parses date components explicitly instead of using `toLocaleDateString()` — this produces a deterministic result in CI regardless of the runner's locale or timezone.

### `lib/utils/templateStatus.ts`

```ts
isTemplateConfigured(): boolean
```

Returns `true` once the seller has replaced `baseUrl` with a real domain (i.e. it no longer contains `"your-domain.com"` or the template's own demo domain). Used by `app/page.tsx` to decide whether to show `ProjectIntro` or the actual storefront. Also enforced at build time by `scripts/check-config.ts`.

---

## Component Architecture

### Root Layout Hierarchy

```
<html>
  <body>
    <ThemeProvider>          ← next-themes, class-based, defaultTheme="system"; ThemeToggle persists choice
      <LocaleProvider>       ← locale state in localStorage; exposes useLocale()
        <MeasurementUnitProvider>  ← measurement-unit state in localStorage; exposes useMeasurementUnit()
          <BackgroundEffect>   ← reads siteConfig.ui.background, renders Aceternity background
            <SiteHeader />     ← logo, search bar (when enabled), locale switcher
            <main>
              {children}       ← page content
            </main>
            <SiteFooter />     ← contact platforms, build timestamp
          </BackgroundEffect>
        </MeasurementUnitProvider>
      </LocaleProvider>
    </ThemeProvider>
  </body>
</html>
```

### `"use client"` Policy

Server Components render static HTML during `next build`. The client boundary is kept as high as possible to maximise pre-rendered content.

**Always Client Components** (`"use client"` at the top):
- All pricing: `DistancePricingContext`, `LocationPriceBar`, `useDistancePricing`, `useGeolocation`
- Shipping estimate (optional, see §21 of DESIGN.md): `useShippingRate`, `ShippingEstimator`
- All i18n runtime: `LocaleProvider`, `LocaleSwitcher`, `useLocale`, `useT`
- Measurement units: `MeasurementUnitProvider`, `MeasurementUnitToggle`, `useMeasurementUnit`
- All filtering: `FilterBar`, `SortSelect`, `useFilters`
- Search: `SearchBar`, `SearchBarClient`, `useSearch`
- Item rendering: `ItemCard`, `ItemGrid` (it is itself a client wrapper around `ItemCardAdapter` + filter/sort controls), `ItemGallery`, `LocalizedItemContent`, `PricingSection`, `PricingTable`, `PricingTableToggle`, `MetadataTable`, `ConditionBadge`, `ConditionGuide`, `StatusBadge`, `FreshnessLabel`, `MakeOfferButton`
- Contact + sharing: `ContactSection`, `PlatformButton`, `QRModal`, `ShareButton`
- Home / newly listed: `RecentlyListedSection`, `RecentlyViewed`, `NewlyListedClient`
- Intro / playground: `ProjectIntro`, `UISlotPlayground`
- Layout chrome + theme: `SiteHeader`, `ThemeProvider`, `ThemeToggle`
- Helpers: `useIncrementalReveal`
- All four `components/ui-adapters/*`: `BackgroundEffect`, `GalleryAdapter`, `ItemCardAdapter`, `ItemGridAdapter`
- All `components/ui/*` (Aceternity) components

**Server Components** (no `"use client"`):
- All `app/*/page.tsx` files (use `getTranslations()` for any UI strings needed server-side)
- `CategoryGrid`, `CategoryCard`
- `Breadcrumb`, `SiteFooter`
- `QuantityBadge`, `TextbookBadge`
- `JsonLd`, `AdaptiveImage`

### UI Slot Adapters (`components/ui-adapters/`)

Four adapters read `siteConfig.ui.*` at render time and forward to the appropriate Aceternity component. This decouples page components from specific UI library choices — a seller changing `ui.gallery` in `content/config.ts` requires no code edits.

| Adapter | Config key | Default | Alternatives |
|---|---|---|---|
| `BackgroundEffect` | `ui.background` | `"none"` | 13 Aceternity backgrounds |
| `GalleryAdapter` | `ui.gallery` | `"simple"` | apple-cards-carousel, images-slider, carousel, parallax-scroll |
| `ItemCardAdapter` | `ui.itemCard` | `"simple"` | card-hover-effect, card-spotlight, 3d-card, evervault-card, wobble-card, direction-aware-hover, glare-card |
| `ItemGridAdapter` | `ui.itemGrid` | `"simple"` | bento-grid, layout-grid, focus-cards |

### Item Components (`components/item/`)

| Component | Type | Purpose |
|---|---|---|
| `ItemCard` | Client | Summary card on grids — name, cover image, price, status badge |
| `ItemGrid` | Client | Client wrapper around `ItemCardAdapter` + filter/sort controls (incl. price-bucket filtering) |
| `ItemGallery` | Client | Base gallery implementation |
| `LocalizedItemContent` | Client | Renders `nameZh`/`descriptionZh` when locale is `zh` |
| `PricingSection` | Client | Resolved tier display + "View all tiers" toggle |
| `PricingTable` / `PricingTableToggle` | Client | Full tier list expandable |
| `ShippingEstimator` | Client | Optional shipping cost estimate (see DESIGN.md §21) |
| `MakeOfferButton` | Client | Appears when `negotiable: true` and `minAcceptableOffer` is set |
| `ConditionBadge` | Client | Condition label chip |
| `ConditionGuide` | Client | `?` popover explaining condition scale |
| `StatusBadge` | Client | `available`/`pending`/`reserved`/`sold` pill |
| `QuantityBadge` | Server | "3 available" badge when `quantity > 1` |
| `FreshnessLabel` | Client | "Listed 3 days ago" relative timestamp |
| `TextbookBadge` | Server | Course + edition + ISBN section |
| `MetadataTable` | Client | Brand, model, dimensions, weight, original source/price |

---

## Scripts Reference

Most scripts run via `tsx` (TypeScript execution, no compilation step). Exceptions: `setup-ui` is a bash script (`scripts/setup-ui.sh`), `push` is inline git, and `build`/`lint`/`format`/`test*` invoke Next.js / ESLint / Prettier / Vitest directly. The complete reference — flags, prompts, touched files, env vars — lives in [SCRIPTS.md](SCRIPTS.md).

| Command | What it does |
|---|---|
| `pnpm dev` | `sync-images.ts --mode dev-sync` then `next dev --turbo` — copies photos to `public/items/`; starts the dev server (Turbopack) |
| `pnpm build` | `prebuild` + `next build` + `postbuild` — full production build |
| `pnpm prebuild` | `check-config.ts` → `sync-images.ts --mode build-check` → `build-search-index.ts` (runs automatically before `build`) |
| `pnpm postbuild` | `postbuild.ts` — next-sitemap generates sitemap.xml + robots.txt (runs automatically after `build`) |
| `pnpm studio [--port <n>]` | `studio.ts` — starts Seller Studio on 127.0.0.1 (port 1024–65535, default 5174); see §Seller Studio |
| `pnpm upload-images` | `sync-images.ts --mode upload` — SHA-256 incremental upload to CDN; strips EXIF/GPS; writes the committed manifest |
| `pnpm create-item <cat>/<item>` | `create-item.ts` — creates the item folder + draft `item.json` from the 36-field template; validates the slug; opens `$EDITOR` if set |
| `pnpm new <cat>/<item>` | Alias for `pnpm create-item` |
| `pnpm create-template [cat]` | `create-template.ts` — creates a fully-commented `_template.json` scaffold |
| `pnpm mark-sold <cat>/<item>` | `mark-sold.ts` — sets `status: "sold"` + `sold_date: today` via surgical JSONC edits |
| `pnpm fb-export` | `export-facebook.ts` — interactive Facebook Marketplace CSV export (50-item batches, photo copy, run-history dedupe into `exports/`) |
| `pnpm push` | `git add content lib/generated/image-manifest.json && git commit -m 'chore: update listings' && git push` — Seller Studio's publish mirrors exactly these two paths |
| `pnpm setup-ui` | `bash scripts/setup-ui.sh` — one-time install of all 27 Aceternity components into `components/ui/` (template maintenance) |
| `pnpm update-site [tag] [--list]` | `update-site.ts` — pulls a tagged template release without touching `content/`; restores `lib/generated/image-manifest.json` from HEAD; ships `studio/`; migrates config (template maintenance; see [UPDATE_GUIDE.md](UPDATE_GUIDE.md)) |
| `pnpm migrate-config` | `migrate-config.ts` — additively splices missing optional config fields from `scripts/lib/configDefaults.ts` (template maintenance) |
| `pnpm bump` | `bump-version.ts` — interactive version bump, tag, and `gh release` (template maintenance; requires an authenticated `gh` CLI) |
| `pnpm type-check` | `tsc --noEmit` — TypeScript type validation (no emit) |
| `pnpm lint` | `eslint . --max-warnings 0` — ESLint (zero warnings allowed) |
| `pnpm format` | `prettier --write .` — Prettier over the whole repo (template maintenance) |
| `pnpm test` | `vitest run` — full test suite (once) |
| `pnpm test:watch` | `vitest` — test suite in watch mode |
| `pnpm test:coverage` | `vitest run --coverage` — test coverage report |

`workers/shipping-rate-proxy/` is a separate package with its own scripts: `pnpm dev` (wrangler dev), `pnpm deploy` (wrangler deploy), `pnpm type-check` — see [workers/shipping-rate-proxy/README.md](../workers/shipping-rate-proxy/README.md).

### `scripts/lib/` — Shared Support Modules

Not standalone runnables — imported by the CLIs above. 10 of the 14 modules have a colocated `*.test.ts` run by `pnpm test` (scripts tests include `scripts/update-site.test.ts` and `scripts/studioFields.test.ts`; the repo-wide suite is ~37 test files / 619 tests).

| Module | Purpose |
|---|---|
| `loadEnv.ts` | `loadDotEnvLocal()` — parses `.env.local` into `process.env` (existing env wins); used by `sync-images.ts` and `studio.ts` since tsx does not auto-load it |
| `imageSync.ts` | Pure CDN pipeline: SHA-256 checksums, `UPLOAD_CONCURRENCY = 8`, per-file failure isolation, EXIF stripping, progress callbacks; drives both `pnpm upload-images` and Studio's sync |
| `itemTemplate.ts` | 36-field `item.json` scaffold with `// options:` comments; shared by `create-item`, `create-template`, and Studio item creation (`reserved_for` excluded) |
| `itemDefaults.ts` | Two-tier sparse `_defaults.json`: parse/validate/merge (`loadMergedDefaults`, `mergeDefaultsIntoTemplate`); shared by the studio defaults routes and `create-item`; `reserved_for` and per-item fields rejected |
| `configEdit.ts` | TypeScript-AST reader and surgical writer for `content/config.ts`: flattens the config into a field list (value, kind, enum options from `lib/config/types.ts`, the file's own comments as docs) and replaces one value by character range, leaving all other bytes — including all 182 comment lines — untouched |
| `siteReadiness.ts` | The one place that decides what a fresh site is still missing: a tiered checklist (core path + optional extras) built from config, env vars and the filesystem. Config and env are injected, so it is unit-testable offline and can report a broken `content/config.ts` instead of crashing on it. Shared by `pnpm setup-check` and studio's readiness route |
| `i18nRequiredKeys.ts` | The UI string keys every locale must resolve, shared by `check-config.ts` and `siteReadiness.ts` |
| `itemEdit.ts` | Surgical JSONC edits via `jsonc-parser` — comments, formatting, and `reserved_for` survive every write |
| `itemFields.ts` | Strict Zod allowlist of browser-writable field paths; `resolveFieldSchema(path)` is the single authority; `reserved_for` denied |
| `markSold.ts` | `applyMarkSold(text, today)` — status → sold + `sold_date`; null when already sold |
| `fbCategoryMap.ts` | Ordered regex → `Top//Sub//Leaf` Facebook category rules used by `fb-export` |
| `exportHistory.ts` | Reads/appends `exports/.export-history.json` (gitignored) backing fb-export's skip-already-exported step |
| `configDefaults.ts` | Declarative registry (key / afterKey / lines) of injectable optional config fields, consumed by `pnpm migrate-config`; `pnpm update-site` runs the migration automatically |
| `studioApi.ts` | Framework-agnostic Studio HTTP handler: Zod validation, slug allowlist + resolved-path containment under `content/items/` |
| `studioGit.ts` | `readChanges`/`publishChanges` restricted to `content` + `lib/generated/image-manifest.json`; `execFile` argument arrays only (no shell); never `git add -A` |
| `studioImages.ts` | Photo upload/delete/reorder filesystem ops: filename allowlist, magic-byte sniffing, `IMAGE_EXTENSIONS` = jpg\|jpeg\|png\|webp\|gif |
| `studioSync.ts` | Single-run CDN sync wrapper (mutex on `globalThis`) delivering SSE progress events |

### Build Pipeline Detail

```
pnpm build
  ├── prebuild (runs before next build)
  │     ├── tsx scripts/check-config.ts
  │     │       Fails with exit code 1 if (a) siteConfig.baseUrl still contains
  │     │       "your-domain.com" — prevents accidental production deploys of an
  │     │       unconfigured template — or (b) any availableLocales locale is
  │     │       missing from i18n.translations or lacks required UIStrings keys
  │     │       (default-locale values may fill the gaps).
  │     ├── tsx scripts/sync-images.ts --mode build-check
  │     │       Cloud providers: verifies lib/generated/image-manifest.json exists.
  │     │       Local provider: copies photos from content/items/ → public/items/.
  │     │       Also copies content/contact/ → public/contact/ (always).
  │     └── tsx scripts/build-search-index.ts
  │             Calls buildSearchIndex() and writes public/search-index.json.
  │             Excludes draft and sold items; description truncated to 200 chars.
  │
  ├── next build
  │       Calls generateStaticParams() on all dynamic routes.
  │       Renders all pages to static HTML in out/.
  │       Each page component uses React.cache() to share one parse pass between
  │       generateMetadata() and the page render function.
  │
  └── postbuild
        tsx scripts/postbuild.ts
              Runs next-sitemap to generate sitemap.xml + robots.txt in out/.
```

---

## Seller Studio

Seller Studio is a local-only browser GUI for managing `content/` — started with `pnpm studio`, with the SPA and API served by a single Vite dev server bound to `127.0.0.1` (never the network). It is shipped to downstream sites by `pnpm update-site` (the `studio/` directory is part of the template paths).

### Launcher (`scripts/studio.ts`)

- Binds `127.0.0.1` only; default port `5174`, overridable with `--port <n>` (validated 1024–65535; `strictPort: false`, so a busy port falls through to the next free one).
- Fails fast when `vite` is not installed (message points at `pnpm install`) or `studio/vite.config.ts` is missing (message points at `pnpm update-site`).
- Loads `.env.local` via `scripts/lib/loadEnv.ts` and prints the resolved URL.
- The CDN image adapter (R2 / Vercel Blob / local, per `siteConfig.imageStorage.provider`) is built per sync run, not at startup — missing CDN credentials surface as an SSE `error` event in the UI, not a launch failure.

### Frontend (`studio/`)

A small Vite + React SPA (`index.html` → `src/main.tsx` → `src/App.tsx`). Panes in `src/panes/`: `ItemList`, `BulkToolbar`, `Drawer`, `EditForm`, `ImagePane`, `NewItemDialog`, `PublishPane`, `SyncBar`. `App.tsx` keeps **no client-side item state** — every mutation is followed by a full server re-fetch, so there is no drift. `src/fields.ts` declares the edit-form field groups (their paths must match `scripts/lib/itemFields.ts`, the server-side authority); each group carries a stable `id: GroupId` and a `defaultOpen` flag.

- `studio/src/components/` — shared presentational components: `Button`, `StatusBadge`, `ThemeToggle`, and the `useDialogBehavior` focus-management hook
- `studio/src/editForm.ts` — pure save logic behind `EditForm`: `buildEdits` (leaf edits plus the whole-object merge for `dimensions`/`weight`), `draftFromFields`, and the dirty computation. `fieldIsDirty` is the single definition of "changed" that the unsaved counter, the per-field marker, the group badges and the sent edits all derive from
- `studio/src/fieldValues.ts` — `toInput` / `fromInput`, the JSON-value ↔ input-string converters shared by `EditForm`, `DefaultsPane` and `editForm.ts` (React-free, so the pure module never imports a component)
- `studio/src/filtering.ts` — pure client-side filter pipeline (status → category → fuzzy search via fuse.js → sort) plus `countByStatus` for the tab counts; `studio/src/panes/FilterBar.tsx` renders the controls
- `studio/src/panes/ConfigPane.tsx` — the site-config pane: fields grouped as `content/config.ts` groups them, that file's comments as hints, per-field save through `GET/PUT /api/config`
- `studio/src/panes/GettingStarted.tsx` — the first-run checklist panel, rendered inline above the item table; its actions open the Defaults pane or the new-item dialog

### API surface (`/api/*`)

The `studioApiPlugin` middleware in `studio/vite.config.ts` runs every request through `checkStudioCsrf` → a 32 MB body cap → `handleStudioRequest` (`scripts/lib/studioApi.ts`), which returns JSON, a file stream, or an SSE stream:

| Route | Purpose |
|---|---|
| `GET /api/items` | List every item with its photos and lowest-tier price (per-item errors isolated) |
| `POST /api/items` | Create an item (category + kebab-case slug → 36-field template; optional `applyDefaults: false` scaffolds the bare template without defaults) |
| `POST /api/items/bulk-status` | Mark a selection sold/pending/available/draft with per-item failure reporting |
| `GET /api/items/<cat>/<item>` | Read the editable fields of one item |
| `PATCH /api/items/<cat>/<item>` | Apply `FieldEdit[]` — surgical JSONC writes, comments preserved |
| `GET/PUT /api/defaults?scope=site\|<cat>` | Read / write the sparse `_defaults.json` for that scope; an empty PUT body deletes the file, and PUT creates missing category folders |
| `GET …/images`, `GET …/images/<file>` | List photos / serve one photo (containment-checked, `no-store`) |
| `POST …/images` | Upload (base64, magic-byte sniffing, sanitised filename) |
| `POST …/images/reorder`, `DELETE …/images/<file>` | Reorder / delete photos |
| `POST /api/sync-images` | CDN sync as a server-sent-event stream (`progress` / `done` / `error`) |
| `GET /api/changes` | Git status of publishable paths |
| `POST /api/publish` | Stage `content` + the manifest, commit, push — `409` while a sync is running |

The SSE stream is consumed with a plain `fetch` + `ReadableStream` (POST is required, so `EventSource` cannot be used). After a successful sync the loader's manifest cache is reset (`resetManifestCache()`) so subsequent reads see the fresh CDN URLs.

### Security model

- **CSRF guard** (`studio/csrfGuard.ts`): every non-GET/HEAD request must carry `Content-Type: application/json` (else `415`) and, when an `Origin` header is present, it must equal the server's own origin (else `403`). The check applies by method, so future PUT/PATCH/DELETE routes fail closed automatically; GET/HEAD are exempt.
- **Body cap**: request bodies over 32 MB are rejected before parsing.
- **Path safety**: route regexes match the raw percent-encoded path and decode each segment only after the match; the slug allowlist plus resolved-path containment keep every read/write inside `content/items/`.
- **Publish safety**: `studioGit.ts` stages only `content` and `lib/generated/image-manifest.json` (mirroring `pnpm push`), never `git add -A` — so `.env.local` with CDN credentials cannot ride along; it refuses out-of-band staged files and commits touching anything unpublishable, and uses `execFile` argument arrays (no shell).
- **Single-run sync**: a mutex on `globalThis` (shared across the tsx and Vite-bundled module copies) guarantees one sync at a time; the lock is released when the work settles, not when the client disconnects.
- `reserved_for` is never read, written, or sent by any Studio code path.

---

## CI/CD Pipeline

### Branch Model

```
develop    ← active development; all feature work; CI runs here
    │
    ▼  PR / merge → release
release    ← production-ready; triggers GitHub Pages deploy
    │
    ▼  GitHub Actions deploy.yml
gh-pages   ← live site (GitHub Pages managed branch)
```

### Workflow Summary

| File | Trigger | Steps |
|---|---|---|
| `ci.yml` | Push to `develop` or `release`; any PR; manual dispatch | `pnpm type-check` → `pnpm lint` → `pnpm test` |
| `deploy.yml` | Push to `release`; completion of "Release Seller Template" (`workflow_run`); manual dispatch | `pnpm build` → `actions/upload-pages-artifact` → `actions/deploy-pages` |
| `release-seller.yml` | Push of a `v*` tag; manual dispatch (workflow_dispatch) | Automated release branch management |

**CI does not need CDN credentials.** The committed `lib/generated/image-manifest.json` is read at build time — all image URLs are pre-resolved and baked into the static HTML.

---

## Key Invariants

These are enforced by code and must never be violated:

| Invariant | Enforced by |
|---|---|
| `reserved_for` never rendered | Zod `strip` mode in `schema.ts`; field absent from `Item` type |
| `lib/utils/pricing.ts` has no `"use client"` | Required for server + client import paths to coexist |
| `lib/generated/image-manifest.json` stays in git | Not in `.gitignore`; CI build depends on it |
| Item + category slugs are kebab-case only | `isValidSlug()` in `lib/utils/slug.ts`, used by `create-item.ts`, `mark-sold.ts`, `generateStaticParams` |
| Sellers write only to `content/` | AI skill files + all scripts enforce this boundary (Seller Studio additionally writes `lib/generated/image-manifest.json` and runs git over `content/` + the manifest) |
| New config fields are backward-compatible | Post-core fields (`shipping?`, `measurementUnit?`, `localeMeasurementUnits?`, `defaultPriceTiers?`, `ui.priceFilterStrategy?`, `ui.priceFilterBuckets?`) are TypeScript-optional with runtime `??` defaults; `scripts/lib/configDefaults.ts` + `pnpm migrate-config` (run automatically by `pnpm update-site`) splice them into older configs |
| Studio binds `127.0.0.1` only and never uses `git add -A` | Host binding in `scripts/studio.ts`; `PUBLISHABLE_PATHS` in `scripts/lib/studioGit.ts` protects `.env.local` |
| Draft items have no static route | Loader visibility filter excludes `status: "draft"` from `generateStaticParams` |
| `soldItemRetentionDays: -1` hides immediately | Explicit `< 0` guard in `isSoldItemVisible()` |
| Sold items without `sold_date` stay visible | Conservative default: no date → no expiry basis |
| `lib/utils/shipping.ts` has no `"use client"` | Same reasoning as `pricing.ts` — shared by server page render and `ShippingEstimator` |
| Shipping API keys never reach the browser | Held only as `wrangler secret` values in `workers/shipping-rate-proxy`; static site only knows `siteConfig.shipping.proxyUrl` |
| `workers/` excluded from root build/lint/test | `tsconfig.json` `exclude`, `eslint.config.mjs` `ignores` — independent subproject with its own `package.json` |

---

## Environment Variables

Only needed on the seller's local machine when running `pnpm upload-images` or a Seller Studio CDN sync (`POST /api/sync-images`). `.env.local` is parsed by `scripts/lib/loadEnv.ts` (existing environment values always win), since tsx does not auto-load it. CI needs none of these.

| Variable | Provider | Required when |
|---|---|---|
| `CF_R2_ACCOUNT_ID` | Cloudflare R2 | `imageStorage.provider === "cloudflare-r2"` |
| `CF_R2_ACCESS_KEY_ID` | Cloudflare R2 | same |
| `CF_R2_SECRET_ACCESS_KEY` | Cloudflare R2 | same |
| `CF_R2_BUCKET` | Cloudflare R2 | same |
| `CF_R2_PUBLIC_URL` | Cloudflare R2 | same |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | `imageStorage.provider === "vercel-blob"` |
| `NEXT_PUBLIC_SITE_URL` | CI / build | Optional; used for sitemap + OG tag base URL (set as GitHub Actions Variable) |
| `EDITOR` | any | Optional; `create-item.ts` opens the new `item.json` in this editor (`spawnSync`, no shell interpolation) |
| `GH_TOKEN` (or prior `gh auth login`) | GitHub | `pnpm bump` shells out to `gh` for CI status and release creation |

The shipping-rate-proxy Worker keeps its own variables and secrets (`SHIPPO_API_KEY`, `EASYPOST_API_KEY`, `SHIPPING_PROVIDER`, `ALLOWED_ORIGIN`, `ORIGIN_ZIP`, `ORIGIN_COUNTRY`) inside `workers/shipping-rate-proxy/` — see [workers/shipping-rate-proxy/README.md](../workers/shipping-rate-proxy/README.md). They never live in the root `.env.local`.

See [`.env.example`](../.env.example) for setup instructions and [setup_instruction.md](setup_instruction.md) for the full CDN configuration walkthrough.

---

## Cross-References

| Topic | Document |
|---|---|
| Full `item.json` schema (36 top-level fields; 37 counting the stripped `reserved_for` note) | [DESIGN.md §5](DESIGN.md) |
| `content/config.ts` full template | [DESIGN.md §13](DESIGN.md) |
| Distance-tiered pricing algorithm | [DESIGN.md §17](DESIGN.md) |
| Component architecture + `"use client"` list | [DESIGN.md §12](DESIGN.md) |
| UI slot options (27 Aceternity components) | [DESIGN.md §18](DESIGN.md) |
| i18n runtime | [DESIGN.md §12](DESIGN.md), [TECH_REQUIREMENTS.md §22.8](TECH_REQUIREMENTS.md) |
| Sold item retention formula | [DESIGN.md §8](DESIGN.md) |
| Shipping calculator integration (optional) | [DESIGN.md §21](DESIGN.md), [workers/shipping-rate-proxy/README.md](../workers/shipping-rate-proxy/README.md) |
| Deployment checklist | [TECH_REQUIREMENTS.md §19](TECH_REQUIREMENTS.md) |
| Testing strategy | [TECH_REQUIREMENTS.md §25](TECH_REQUIREMENTS.md) |
| CDN setup walkthrough | [setup_instruction.md](setup_instruction.md) |
| Seller operations guide | [../SETUP_GUIDE.md](../SETUP_GUIDE.md) |
| Complete scripts & tooling reference | [SCRIPTS.md](SCRIPTS.md) |
| Template updates (`pnpm update-site`) | [UPDATE_GUIDE.md](UPDATE_GUIDE.md) |
| Seller Studio + Facebook export (feature docs) | [CURRENT_FUNCTIONALITY.md](CURRENT_FUNCTIONALITY.md) |
| Build plan (Phases 0–18) | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
