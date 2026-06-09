# UsedExchange — Architecture

> Developer reference. For the full design specification see [DESIGN.md](DESIGN.md); for the build plan see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); for non-technical seller operations see [../SETUP_GUIDE.md](../SETUP_GUIDE.md).
>
> 🇨🇳 Chinese version: [ARCHITECTURE_zh.md](ARCHITECTURE_zh.md)

---

## Directory Structure

```
usedExchange/
├── app/                              ← Next.js App Router pages + root layout
│   ├── layout.tsx                    ← Root layout: ThemeProvider > LocaleProvider > BackgroundEffect > SiteHeader/Footer
│   ├── globals.css                   ← Tailwind v4 directives + CSS custom properties
│   ├── page.tsx                      ← Home page (/)
│   ├── about/page.tsx                ← Project intro for the template's own demo domain
│   ├── all/page.tsx                  ← Browse All (/all)
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
│   ├── i18n/                         ← LocaleProvider, LocaleSwitcher, useLocale
│   ├── intro/                        ← ProjectIntro (shown before seller configures baseUrl)
│   ├── item/                         ← All item-rendering components (see §Item Components)
│   ├── layout/                       ← Breadcrumb, SiteHeader, SiteFooter
│   ├── pricing/                      ← DistancePricingContext, LocationPriceBar, useDistancePricing, useGeolocation
│   ├── search/                       ← SearchBar, SearchBarClient, useSearch
│   ├── theme/                        ← ThemeProvider, ThemeToggle
│   ├── ui/                           ← Aceternity UI library (27 components; installed once by `pnpm setup-ui`)
│   └── ui-adapters/                  ← BackgroundEffect, GalleryAdapter, ItemCardAdapter, ItemGridAdapter
│
├── content/                          ← ⚠️ THE ONLY FOLDER SELLERS EVER TOUCH
│   ├── config.ts                     ← SiteConfig export (must match lib/config/types.ts)
│   └── items/
│       └── <category>/
│           ├── _category.json        ← Optional: display_name, icon, sort_order, description
│           └── <item>/
│               ├── item.json         ← Required: item metadata (all fields in DESIGN.md §5)
│               ├── cover.jpg         ← Pinned thumbnail (optional naming convention)
│               └── *.jpg/png/webp    ← Additional gallery images (gitignored)
│
├── lib/
│   ├── config/types.ts               ← SiteConfig TypeScript type definition
│   ├── content/
│   │   ├── loader.ts                 ← ★ Public data-access API (see §Loader API)
│   │   ├── schema.ts                 ← Zod schemas for item.json and _category.json
│   │   └── types.ts                  ← TypeScript types: Item, Category, Price, PriceTier, etc.
│   ├── generated/
│   │   └── image-manifest.json       ← CDN URL map (committed; written by pnpm upload-images)
│   ├── images/
│   │   ├── adapter.ts                ← ImageStorageAdapter interface
│   │   ├── cloudflare-r2.ts          ← CloudflareR2Adapter
│   │   ├── local.ts                  ← LocalAdapter + copyIfChanged helper
│   │   ├── normalizeR2Url.ts         ← Strips trailing slash from R2 public URL
│   │   └── vercel-blob.ts            ← VercelBlobAdapter
│   ├── search/index.ts               ← buildSearchIndex(): SearchIndexEntry[]
│   ├── ui/types.ts                   ← UIConfig type (background, itemGrid, gallery, itemCard slots)
│   └── utils/
│       ├── concurrency.ts            ← mapWithConcurrency<T,R>(items, limit, fn)
│       ├── date.ts                   ← formatRelativeDate(), formatAbsoluteDate()
│       ├── haversine.ts              ← haversineInMiles(lat1, lng1, lat2, lng2)
│       ├── i18n.ts                   ← getLocalizedField(item, field, locale)
│       ├── index.ts                  ← Re-exports cn() (clsx + tailwind-merge)
│       ├── jsonld.ts                 ← buildProductJsonLd(), buildBreadcrumbJsonLd()
│       ├── pricing.ts                ← resolveItemPrice(price, resolved) — NO "use client"
│       ├── slug.ts                   ← isValidSlug() — kebab-case validation
│       └── templateStatus.ts         ← isTemplateConfigured() — detects unconfigured template
│
├── scripts/                          ← pnpm run scripts (tsx, Node.js, no browser APIs)
│   ├── build-search-index.ts         ← Prebuild: writes public/search-index.json
│   ├── check-config.ts               ← Prebuild: fails build if baseUrl is still placeholder
│   ├── create-item.ts                ← pnpm create-item / pnpm new
│   ├── create-template.ts            ← pnpm create-template
│   ├── mark-sold.ts                  ← pnpm mark-sold
│   ├── postbuild.ts                  ← Postbuild: next-sitemap
│   └── sync-images.ts                ← pnpm upload-images / dev-sync / build-check
│
├── public/
│   ├── items/                        ← Local images (gitignored; populated at dev/build time)
│   ├── contact/                      ← QR code images (gitignored; copied from content/contact/)
│   └── search-index.json             ← Fuse.js index (gitignored; built in prebuild)
│
├── .github/workflows/
│   ├── ci.yml                        ← Type-check + lint + test on push
│   ├── deploy.yml                    ← Build + deploy to GitHub Pages from release branch
│   └── release-seller.yml            ← Automated release branch management
│
├── content/config.ts                 ← (see above — seller configuration)
├── next.config.ts                    ← Static export flag, image domains
├── tsconfig.json                     ← strict + noUncheckedIndexedAccess + @/* path alias
├── vitest.config.ts                  ← Vitest (jsdom environment, path aliases)
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
    ├──► loadBrowseAllPageData()──► app/all/page.tsx
    └──► loadSoldItems()       ──► app/sold/page.tsx
    │
    ▼  next build
    All pages rendered to static HTML → out/
    No server, no database, no runtime credentials required
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
| `loadAllItemsRaw()` | `Item[]` | scripts and `buildSearchIndex()` only — no visibility filter |
| `resetManifestCache()` | `void` | tests only |

**Performance invariant:** The image manifest (`lib/generated/image-manifest.json`) is read once per process via a module-level Promise cache. Functions that need both categories and items (`loadHomePageData`, `loadBrowseAllPageData`) parse every item exactly once — do not compose `loadCategories()` + `loadItemsByCategory()` in the same render pass, as that would parse every item twice.

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

### `lib/images/` — Storage Adapter Pattern

`ImageStorageAdapter` interface (defined in `lib/images/adapter.ts`) is implemented by three classes:

| Class | Provider key | File |
|---|---|---|
| `CloudflareR2Adapter` | `"cloudflare-r2"` | `lib/images/cloudflare-r2.ts` |
| `VercelBlobAdapter` | `"vercel-blob"` | `lib/images/vercel-blob.ts` |
| `LocalAdapter` | `"local"` | `lib/images/local.ts` |

`scripts/sync-images.ts` instantiates the correct adapter at runtime based on `siteConfig.imageStorage.provider`. All three implement `syncImage(sourcePath, manifestKey, checksum)` and an incremental skip mechanism via `loadChecksums` / `getUpdatedChecksums`.

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
    <ThemeProvider>          ← next-themes, follows siteConfig.darkMode
      <LocaleProvider>       ← locale state in localStorage; exposes useLocale()
        <BackgroundEffect>   ← reads siteConfig.ui.background, renders Aceternity background
          <SiteHeader />     ← logo, search bar (when enabled), locale switcher
          <main>
            {children}       ← page content
          </main>
          <SiteFooter />     ← contact platforms, build timestamp
        </BackgroundEffect>
      </LocaleProvider>
    </ThemeProvider>
  </body>
</html>
```

### `"use client"` Policy

Server Components render static HTML during `next build`. The client boundary is kept as high as possible to maximise pre-rendered content.

**Always Client Components** (`"use client"` at the top):
- All pricing: `DistancePricingContext`, `LocationPriceBar`, `useDistancePricing`, `useGeolocation`
- All i18n runtime: `LocaleProvider`, `LocaleSwitcher`, `useLocale`
- All filtering: `FilterBar`, `SortSelect`, `useFilters`
- Search: `SearchBarClient`, `useSearch`
- `RecentlyViewed`, `ShareButton`, `MakeOfferButton`, `QRModal`
- `ThemeProvider`, `ThemeToggle`
- All `components/ui/*` (Aceternity) components

**Server Components** (no `"use client"`):
- All `app/*/page.tsx` files
- `CategoryGrid`, `CategoryCard`
- `ItemGrid`, `ItemCard`
- `Breadcrumb`, `SiteHeader`, `SiteFooter`
- `MetadataTable`, `StatusBadge`, `ConditionBadge`, `QuantityBadge`, `TextbookBadge`, `FreshnessLabel`
- `JsonLd`, `AdaptiveImage`

### UI Slot Adapters (`components/ui-adapters/`)

Four adapters read `siteConfig.ui.*` at render time and forward to the appropriate Aceternity component. This decouples page components from specific UI library choices — a seller changing `ui.gallery` in `content/config.ts` requires no code edits.

| Adapter | Config key | Default | Alternatives |
|---|---|---|---|
| `BackgroundEffect` | `ui.background` | `"none"` | 13 Aceternity backgrounds |
| `GalleryAdapter` | `ui.gallery` | `"simple"` | apple-cards-carousel, images-slider, carousel, parallax-scroll |
| `ItemCardAdapter` | `ui.itemCard` | `"simple"` | 8 Aceternity card effects |
| `ItemGridAdapter` | `ui.itemGrid` | `"simple"` | bento-grid, layout-grid, focus-cards |

### Item Components (`components/item/`)

| Component | Type | Purpose |
|---|---|---|
| `ItemCard` | Server | Summary card on grids — name, cover image, price, status badge |
| `ItemGrid` | Server | Wraps `ItemCardAdapter` + client filter/sort controls |
| `ItemGallery` | Client | Base gallery implementation |
| `LocalizedItemContent` | Client | Renders `nameZh`/`descriptionZh` when locale is `zh` |
| `PricingSection` | Client | Resolved tier display + "View all tiers" toggle |
| `PricingTable` / `PricingTableToggle` | Client | Full tier list expandable |
| `MakeOfferButton` | Client | Appears when `negotiable: true` and `minAcceptableOffer` is set |
| `ConditionBadge` | Server | Condition label chip |
| `ConditionGuide` | Client | `?` popover explaining condition scale |
| `StatusBadge` | Server | `available`/`pending`/`reserved`/`sold` pill |
| `QuantityBadge` | Server | "3 available" badge when `quantity > 1` |
| `FreshnessLabel` | Client | "Listed 3 days ago" relative timestamp |
| `TextbookBadge` | Server | Course + edition + ISBN section |
| `MetadataTable` | Server | Brand, model, dimensions, weight, original source/price |

---

## Scripts Reference

All scripts are invoked via `tsx` (TypeScript execution, no compilation step).

| Command | Script | What it does |
|---|---|---|
| `pnpm dev` | `sync-images.ts --mode dev-sync` + `next dev` | Copies photos to `public/items/`; starts dev server |
| `pnpm build` | `prebuild` + `next build` + `postbuild` | Full production build |
| `pnpm upload-images` | `sync-images.ts --mode upload` | SHA-256 incremental upload to CDN; writes manifest |
| `pnpm new <cat>/<item>` | `create-item.ts` | Creates item folder + draft `item.json`; validates slug |
| `pnpm create-item <cat>/<item>` | Same as above | Alias for `pnpm new` |
| `pnpm mark-sold <cat>/<item>` | `mark-sold.ts` | Sets `status: "sold"` + `sold_date: today` |
| `pnpm create-template [cat]` | `create-template.ts` | Creates `_template.json` scaffold for a category |
| `pnpm push` | inline git commands | `git add content/ image-manifest.json && git commit && git push` |
| `pnpm type-check` | `tsc --noEmit` | TypeScript type validation (no emit) |
| `pnpm lint` | `eslint . --max-warnings 0` | ESLint (zero warnings allowed) |
| `pnpm test` | `vitest run` | Full test suite (once) |
| `pnpm test:watch` | `vitest` | Test suite in watch mode |
| `pnpm test:coverage` | `vitest run --coverage` | Test coverage report |

### Build Pipeline Detail

```
pnpm build
  ├── prebuild (runs before next build)
  │     ├── tsx scripts/check-config.ts
  │     │       Fails with exit code 1 if siteConfig.baseUrl still contains
  │     │       "your-domain.com" — prevents accidental production deploys
  │     │       of an unconfigured template.
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
| `ci.yml` | Push to `develop` or `release`; any PR | `pnpm type-check` → `pnpm lint` → `pnpm test` |
| `deploy.yml` | Push to `release`; completion of `release-seller.yml` | `pnpm build` → `actions/upload-pages-artifact` → `actions/deploy-pages` |
| `release-seller.yml` | Seller-initiated (workflow_dispatch) | Automated release branch management |

**CI does not need CDN credentials.** The committed `lib/generated/image-manifest.json` is read at build time — all image URLs are pre-resolved and baked into the static HTML.

---

## Key Invariants

These are enforced by code and must never be violated:

| Invariant | Enforced by |
|---|---|
| `reserved_for` never rendered | Zod `strip` mode in `schema.ts`; field absent from `Item` type |
| `lib/utils/pricing.ts` has no `"use client"` | Required for server + client import paths to coexist |
| `lib/generated/image-manifest.json` stays in git | Not in `.gitignore`; CI build depends on it |
| Item + category slugs are kebab-case only | `isValidSlug()` in `create-item.ts`, `mark-sold.ts`, `generateStaticParams` |
| Sellers write only to `content/` | AI skill files + all scripts enforce this boundary |
| Draft items have no static route | Loader visibility filter excludes `status: "draft"` from `generateStaticParams` |
| `soldItemRetentionDays: -1` hides immediately | Explicit `< 0` guard in `isSoldItemVisible()` |
| Sold items without `sold_date` stay visible | Conservative default: no date → no expiry basis |

---

## Environment Variables

Only needed on the seller's local machine when running `pnpm upload-images`. CI needs none of these.

| Variable | Provider | Required when |
|---|---|---|
| `CF_R2_ACCOUNT_ID` | Cloudflare R2 | `imageStorage.provider === "cloudflare-r2"` |
| `CF_R2_ACCESS_KEY_ID` | Cloudflare R2 | same |
| `CF_R2_SECRET_ACCESS_KEY` | Cloudflare R2 | same |
| `CF_R2_BUCKET` | Cloudflare R2 | same |
| `CF_R2_PUBLIC_URL` | Cloudflare R2 | same |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | `imageStorage.provider === "vercel-blob"` |
| `NEXT_PUBLIC_SITE_URL` | CI / build | Optional; used for sitemap + OG tag base URL (set as GitHub Actions Variable) |

See [`.env.example`](../.env.example) for setup instructions and [setup_instruction.md](setup_instruction.md) for the full CDN configuration walkthrough.

---

## Cross-References

| Topic | Document |
|---|---|
| Full `item.json` schema (38 fields) | [DESIGN.md §5](DESIGN.md) |
| `content/config.ts` full template | [DESIGN.md §13](DESIGN.md) |
| Distance-tiered pricing algorithm | [DESIGN.md §17](DESIGN.md) |
| Component architecture + `"use client"` list | [DESIGN.md §12](DESIGN.md) |
| UI slot options (27 Aceternity components) | [DESIGN.md §18](DESIGN.md) |
| i18n runtime | [DESIGN.md §12](DESIGN.md), [TECH_REQUIREMENTS.md §22.8](TECH_REQUIREMENTS.md) |
| Sold item retention formula | [DESIGN.md §8](DESIGN.md) |
| Deployment checklist | [TECH_REQUIREMENTS.md §19](TECH_REQUIREMENTS.md) |
| Testing strategy | [TECH_REQUIREMENTS.md §25](TECH_REQUIREMENTS.md) |
| CDN setup walkthrough | [setup_instruction.md](setup_instruction.md) |
| Seller operations guide | [../SETUP_GUIDE.md](../SETUP_GUIDE.md) |
| 15-phase build plan | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
