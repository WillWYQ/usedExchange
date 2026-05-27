# UsedExchange — Project Design Document

**Version:** 0.3.0  
**Date:** 2026-05-26  
**Status:** Decisions Resolved — Ready for Implementation

---

## 1. Project Overview

UsedExchange is a statically-generated personal web storefront for listing second-hand items for sale. Content is managed entirely through the local file system — no database, no CMS. The seller adds a folder per item, drops in photos and a `item.json` metadata file, then triggers a build; the site regenerates automatically.

The UI is built on [Aceternity UI](https://ui.aceternity.com) (React + Tailwind CSS) for a polished browsing experience. The architecture is modularised so any part — deployment target, image strategy, contact platforms — can be swapped without restructuring the codebase.

---

## 2. Goals & Non-Goals

### Goals
- Zero-database, file-system-driven content management
- Build-time static generation; output hostable on Vercel Hobby or any static host
- Modularised deployment adapter: Vercel-optimised by default, self-host ready via config switch
- Graceful schema degradation: missing optional JSON fields never crash the build or the page
- Distance-tiered pricing per item
- Photo gallery per item, sourced from the item folder
- Rich, privacy-respecting contact section with social platform links and QR code support
- Clean, extensible codebase designed for second development

### Non-Goals (v1)
- Real-time inventory updates without a rebuild
- Buyer-facing checkout or payment processing
- User authentication or seller dashboard
- Full-text search (client-side filtering only)

---

## 3. Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Build-time FS reads via `generateStaticParams`; two output modes |
| Language | **TypeScript 5** | Type-safe schema parsing; compile-time missing-field detection |
| UI library | **Aceternity UI** | Pre-built animated components; Tailwind-based |
| Styling | **Tailwind CSS v4** | Required by Aceternity; utility-first |
| Schema validation | **Zod 3** | `.safeParse()` with defaults; never throws on bad input |
| Markdown | **react-markdown + remark-gfm** | Renders `description` field |
| Package manager | **pnpm** | Fast installs, disk-efficient |
| Linting | **ESLint + Prettier** | Consistent code style |
| Primary host | **Vercel Hobby** | Zero-config deploys from Git |
| Alternate host | **Any static server** | Via `output: 'export'` mode |

### Deployment Modes

The app supports two modes toggled by a single config value in `site.config.ts`:

| Mode | `deploymentMode` | Next.js config | Image strategy |
|---|---|---|---|
| Vercel (default) | `"vercel"` | Default (server functions allowed) | `next/image` with Vercel optimisation |
| Self-hosted static | `"static"` | `output: 'export'` | Plain `<img>` via `UnoptimizedImage` wrapper |

The `<AdaptiveImage>` component switches internally based on `deploymentMode` — no callsite changes needed when switching modes.

### Image Storage Architecture

#### The Problem

Vercel Hobby has a **100 MB deployment size limit**. This limit covers everything in the built output — including images copied into `public/`. A personal used-goods site with 100 items × 5 photos × 2 MB = 1 GB of images would instantly exceed this, even though the actual HTML/CSS/JS is tiny.

The naive solution (copy images into `public/` at build time) breaks on Vercel. The seller-hostile solution (manually upload images to a storage console) defeats the file-system-first design. The correct solution is an **automated image storage adapter** that runs transparently during the build.

#### Design Principle

The seller's workflow is **never changed**:
1. Put photos in the item folder → done.

The build script detects the configured provider, uploads new/changed images automatically, writes a URL manifest, and the deployment stays small. Switching providers requires one line in `site.config.ts` and one env var.

#### Image Storage Tiers

| `imageStorage.provider` | Best for | Deployment size | Seller effort |
|---|---|---|---|
| `"local"` | Local dev / self-hosted (no size limit) | Images included | None |
| `"vercel-blob"` *(recommended for Vercel Hobby)* | Vercel Hobby, Vercel Pro | Images excluded (served from Blob CDN) | Add 1 env var once |
| `"cloudflare-r2"` | Self-hosted, large collections, zero egress cost | Images excluded (served from R2 CDN) | Add 4 env vars once |

#### How It Works

```
pnpm build (on Vercel or locally)
  │
  └── prebuild: scripts/sync-images.ts
        │
        ├── Scans items/**  for all image files
        │
        ├── [provider: "local"]
        │     └── Copy to public/items/...  (deployment includes images)
        │
        ├── [provider: "vercel-blob"]
        │     ├── Compare SHA-256 of each file vs. .image-cache/checksums.json
        │     ├── Upload new/changed files via @vercel/blob SDK
        │     └── Record returned CDN URLs
        │
        └── [provider: "cloudflare-r2"]
              ├── Compare SHA-256 vs. .image-cache/checksums.json
              ├── Upload via @aws-sdk/client-s3 (R2 is S3-compatible)
              └── Record returned CDN URLs
        │
        └── Write lib/generated/image-manifest.json
              { "houseware/ikea-desk-lamp/cover.jpg": "https://cdn.example/cover.jpg", … }
        └── Write .image-cache/checksums.json  (gitignored — skips re-upload of unchanged files)
```

#### Image URL Resolution (in `lib/content/loader.ts`)

```
For each image file found in an item folder:
  key  = "{categorySlug}/{itemSlug}/{filename}"
  url  = manifest[key]           // CDN URL if provider uploaded it
       ?? "/items/{key}"         // local public path fallback (dev mode / "local" provider)
```

This means local development works without any credentials: the sync script copies to
`public/items/`, the manifest maps to local paths, and everything renders normally.

#### Incremental Uploads

The `.image-cache/checksums.json` file stores `{ relativePath: sha256 }` for every
previously uploaded image. On the next build, only files whose checksum changed (or
new files with no entry) are uploaded. This keeps Vercel build times fast even as the
collection grows.

`.image-cache/` is **gitignored** — it is a build-machine cache. On a fresh Vercel build
runner (which has no cache), all images are re-uploaded. This is safe because cloud
providers are idempotent (overwriting an existing file with identical content is free).
To persist the upload cache across Vercel builds, configure Vercel's build cache to
include `.image-cache/` (optional optimisation, not required for correctness).

#### What Stays in Git

| Content | Git-tracked? | Reason |
|---|---|---|
| `items/**/*.json` | Yes | Source of truth for metadata |
| `items/**/*.jpg/png/…` | Yes | Source of truth for images; git is the backup |
| `lib/generated/image-manifest.json` | **No** (gitignored) | Regenerated every build |
| `.image-cache/checksums.json` | **No** (gitignored) | Build machine cache |
| `public/items/` | **No** (gitignored) | Generated by build script |

> **Git repo size note:** Keeping photos in git is intentional — it gives the seller a
> single backup location and a clear source of truth. For a typical personal resale
> site (< 500 photos, < 500 MB), GitHub handles this comfortably. If the repo grows
> beyond ~1 GB, consider enabling Git LFS for image extensions (one-time
> `.gitattributes` change, no seller workflow change).

---

## 4. File System Content Model

```
items/                              ← content root (git-tracked alongside code)
├── houseware/                      ← category folder (created by seller)
│   ├── _category.json              ← optional category metadata
│   ├── ikea-desk-lamp/             ← individual item folder
│   │   ├── item.json               ← item metadata (name is the only required field)
│   │   ├── cover.jpg               ← pinned thumbnail (optional naming convention)
│   │   ├── photo1.jpg              ← additional gallery images
│   │   └── photo2.png
│   └── cast-iron-pan/
│       ├── item.json
│       └── pan.jpg
├── electronics/
│   ├── _category.json
│   └── iphone-14-pro/
│       ├── item.json
│       ├── front.jpg
│       └── back.jpg
└── contact/                        ← seller-managed contact assets
    └── wechat-qr.png               ← QR code images for platforms without profile URLs
```

### Folder & File Rules

| Rule | Detail |
|---|---|
| Category slug | Folder name; auto-capitalised, hyphens → spaces for display |
| Item slug | Folder name; becomes the URL segment |
| Gallery images | All `.jpg .jpeg .png .webp .gif` files in the item folder |
| Thumbnail | File named `cover.*` takes priority; otherwise first alphabetically |
| Other files | Silently ignored (no crash) |
| Reserved prefix | Folders/files beginning with `_` are metadata, never treated as items/categories |
| `contact/` folder | Reserved at root of `items/`; holds QR code images |

---

## 5. JSON Schema — `item.json`

Only `name` is required. Every other field is optional; the build applies safe defaults when absent.

```jsonc
{
  // ── Identity ───────────────────────────────────────────────────────────────
  "name": "IKEA TRÅDFRI Desk Lamp",          // string, REQUIRED

  // ── Pricing ───────────────────────────────────────────────────────────────
  "price": {
    "currency": "USD",                        // ISO 4217, default "USD"
    "tiers": [
      // Each tier needs at minimum a label and amount.
      // miles_min / miles_max are both optional (open-ended tier = omit miles_max).
      { "label": "Pickup / ≤ 5 mi",  "miles_max": 5,   "amount": 15 },
      { "label": "6 – 15 mi",        "miles_min": 6,   "miles_max": 15, "amount": 20 },
      { "label": "16 – 30 mi",       "miles_min": 16,  "miles_max": 30, "amount": 25 },
      { "label": "Shipping",         "miles_min": 31,  "amount": 35 }
    ],
    "negotiable": true                        // boolean, default false; renders "OBO" on price
  },

  // ── Item details ──────────────────────────────────────────────────────────
  "description": "Works perfectly. Bought 2 years ago.",
  // ^ string; GitHub-flavoured Markdown supported; default ""

  "condition": "good",
  // ^ enum: "new" | "like-new" | "good" | "fair" | "for-parts"; default "good"

  "brand": "IKEA",                            // string; default ""
  "model": "TRÅDFRI E14",                     // string; default ""
  "age_years": 2,                             // number, approximate; default null
  "dimensions": {
    "length": 45, "width": 15, "height": 15,
    "unit": "cm"                              // "cm" | "in"; default "cm"
  },
  "weight": { "value": 0.8, "unit": "kg" },  // unit: "kg" | "lb"
  "color": "white",                           // string; default ""
  "quantity": 1,                              // integer ≥ 1; default 1

  // ── Provenance ────────────────────────────────────────────────────────────
  "original_source": "IKEA",                  // string; e.g. "Amazon", "Costco"
  "original_link": "https://www.ikea.com/…",  // URL string
  "original_price": 29.99,                    // number; default null

  // ── Listing lifecycle ─────────────────────────────────────────────────────
  "status": "available",
  // ^ enum: "available" | "pending" | "reserved" | "sold" | "draft"
  //   default "available"

  "listed_date": "2026-05-25",               // ISO 8601; default: build date
  "sold_date": "2026-05-28",                 // ISO 8601; used for retention calculation
  // ^ if status is "sold" and sold_date is absent, listed_date is used as fallback

  "reserved_for": "",
  // ^ string; buyer name/contact — NOT rendered on page, kept private in json

  // ── Contact preferences (item-level overrides; site config is the default) ─
  "preferred_payment": ["Venmo", "Cash"],     // array of strings; default []
  "contact_note": "",                         // string; shown below contact links on item page

  // ── Categorisation ────────────────────────────────────────────────────────
  "tags": ["lighting", "smart-home"],         // string[]; default []
  "category_override": "",
  // ^ if non-empty, overrides the folder-derived category slug for display purposes

  // ── SEO ───────────────────────────────────────────────────────────────────
  "meta_description": ""
  // ^ if empty, auto-generated from first 160 chars of description
}
```

### Field defaults summary

| Field | Default |
|---|---|
| `price.currency` | `"USD"` |
| `price.tiers` | `[]` → shows "Contact for price" |
| `price.negotiable` | `false` |
| `condition` | `"good"` |
| `quantity` | `1` |
| `status` | `"available"` |
| `listed_date` | build date (ISO string) |
| `sold_date` | falls back to `listed_date` if absent and status is `"sold"` |
| `tags` | `[]` |
| all other strings | `""` |
| all other numbers | `null` (not rendered when null) |

---

## 6. Optional Category Metadata — `_category.json`

```jsonc
{
  "display_name": "Houseware & Kitchen",
  // ^ overrides auto-capitalised folder name; default: folder name

  "description": "Pots, pans, lamps, and other home goods.",
  // ^ shown at top of category page; default ""

  "icon": "🏠",
  // ^ emoji shown on category card; default ""

  "sort_order": 1
  // ^ integer; lower = appears earlier on home page
  //   if absent on any category, all categories sort alphabetically
  //   if present on SOME categories, those categories sort by sort_order first,
  //   then remaining categories append alphabetically after
}
```

### Category Sort Logic

1. Categories with `sort_order` defined → sorted ascending by `sort_order`
2. Categories without `sort_order` → sorted alphabetically by folder name, appended after sorted group
3. If no category has `sort_order`, all categories sort alphabetically (pure default)

---

## 7. Contact Platform Configuration

Configured in `site.config.ts`. Supports two platform types:

**Link-based platforms** — rendered as icon + label button that reveals a URL on click.

**QR-code platforms** (e.g. WeChat) — rendered as icon + label button that opens a modal showing the QR image.

```ts
contact: {
  reveal_behavior: "click",     // "click" | "always"
  // "click"  → contact info hidden behind a "Show contact" toggle
  // "always" → contact info always visible

  platforms: [
    // Link-based: value is the username/handle/phone/email
    { type: "email",     value: "you@example.com" },
    { type: "facebook",  value: "your.username" },
    { type: "instagram", value: "your_handle" },
    { type: "snapchat",  value: "your_username" },
    { type: "whatsapp",  value: "+11234567890" },   // E.164 format
    { type: "twitter",   value: "your_handle" },
    { type: "tiktok",    value: "@your_handle" },
    { type: "linkedin",  value: "in/your-name" },
    { type: "youtube",   value: "@your_channel" },

    // QR-based: qr_image path relative to /public
    { type: "wechat",    qr_image: "/contact/wechat-qr.png",   label: "WeChat" },
    // Any future platform without a web profile URL follows the same pattern:
    { type: "line",      qr_image: "/contact/line-qr.png",     label: "LINE" },
  ],
}
```

### URL Construction per Platform

| `type` | URL pattern |
|---|---|
| `email` | `mailto:{value}` |
| `facebook` | `https://facebook.com/{value}` |
| `instagram` | `https://instagram.com/{value}` |
| `snapchat` | `https://snapchat.com/add/{value}` |
| `whatsapp` | `https://wa.me/{value}` (strips leading `+`) |
| `twitter` | `https://x.com/{value}` |
| `tiktok` | `https://tiktok.com/{value}` |
| `linkedin` | `https://linkedin.com/{value}` |
| `youtube` | `https://youtube.com/{value}` |
| `wechat` / `line` / QR type | Opens modal with `<img src={qr_image}>` |

All link-based platforms open in `target="_blank" rel="noopener noreferrer"`.

---

## 8. Sold Item Retention

```ts
// site.config.ts
soldItemRetentionDays: 3,   // default; set to 0 to keep forever, -1 to hide immediately
```

At build time, the loader applies:

```
visible = (status !== "sold") OR (today − sold_date ≤ soldItemRetentionDays)
```

Items past retention are excluded from all pages and `generateStaticParams` entirely — their detail page is not generated.

---

## 9. URL Structure

```
/                              Home — category overview + recently listed
/[category]                    Category page — item grid with filters
/[category]/[item]             Item detail — gallery, pricing, metadata, contact
```

All routes are statically generated at build time. No `/sold` archive page in v1 (sold items stay visible on category pages with a "SOLD" overlay until retention expires).

---

## 10. Page Specifications

### 10.1 Home Page (`/`)

- **Hero** — site name, tagline, CTA button (configurable in `site.config.ts`)
- **Category grid** — one card per non-empty category; shows icon, display name, available item count, cover image background
- **Recently Listed** — last N available items sorted by `listed_date` (configurable, default 6)
- **Footer** — contact platform links, last-build timestamp, site name

### 10.2 Category Page (`/[category]`)

- Category title, icon, description
- **Filter bar** (client-side): condition chips, price range slider, status toggle (hide sold)
- **Item grid**: card per item — cover photo, name, condition badge, status badge, lowest price tier
- Sold items: rendered with "SOLD" overlay, not hidden (until retention expires)

### 10.3 Item Detail Page (`/[category]/[item]`)

- **Breadcrumb**: Home → Category → Item name
- **Photo gallery** — carousel with thumbnail strip; Aceternity animated card
- **Status + condition badges** — top-right of hero
- **Name + description** (Markdown rendered)
- **Pricing table** — one row per tier; "OBO" appended if `negotiable: true`; "Contact for price" if no tiers
- **Metadata table** — brand, model, dimensions, weight, original source (linked), original price
- **Contact section** — platform buttons behind click-to-reveal (configurable); preferred payment methods; item-level `contact_note`
- **Tags** — rendered as chips (click → future filter)

---

## 11. Data Loading Architecture

```
items/  (file system, build-time only)
  │
  ├── scripts/sync-images.ts
  │     ├── [local provider]    → copies to public/items/
  │     ├── [vercel-blob]       → uploads to Blob CDN
  │     └── [cloudflare-r2]    → uploads to R2 CDN
  │     └── writes lib/generated/image-manifest.json
  │
  ▼
lib/content/loader.ts
  ├── reads lib/generated/image-manifest.json   (CDN URLs or local paths)
  ├── loadCategories()              → Category[]
  ├── loadItemsByCategory(slug)     → Item[]
  └── loadItem(catSlug, itemSlug)   → Item | null
  │
  ▼
lib/content/schema.ts              Zod schema; .safeParse() + default merge
  │
  ▼
lib/content/types.ts               Exported TS types (Category, Item, PriceTier, …)
  │
  ▼
app/…/page.tsx                     generateStaticParams() + React Server Component
```

### Loader Guarantees
- All `fs` calls are confined to `lib/content/loader.ts`; no page component touches the file system directly
- `loadItem()` returns `null` (not throws) if the item folder or `item.json` is missing
- `generateStaticParams` filters out `null` results before creating routes
- Image URLs are resolved via manifest first, then fall back to `/items/{category}/{item}/{filename}` if the manifest has no entry (safe for local dev with no manifest file)

---

## 12. Component Architecture

```
components/
├── ui/                            ← Aceternity UI (installed via CLI — never edit directly)
│
├── layout/
│   ├── SiteHeader.tsx
│   ├── SiteFooter.tsx
│   └── Breadcrumb.tsx
│
├── category/
│   ├── CategoryCard.tsx
│   └── CategoryGrid.tsx
│
├── item/
│   ├── ItemCard.tsx
│   ├── ItemGrid.tsx
│   ├── ItemGallery.tsx            ← photo carousel (client component)
│   ├── PricingTable.tsx
│   ├── MetadataTable.tsx
│   ├── StatusBadge.tsx
│   └── ConditionBadge.tsx
│
├── contact/
│   ├── ContactSection.tsx         ← reveal wrapper + platform list
│   ├── PlatformButton.tsx         ← single platform button (link or QR trigger)
│   └── QRModal.tsx                ← modal with QR image (client component)
│
├── filters/
│   ├── FilterBar.tsx              ← client component
│   └── useFilters.ts
│
└── common/
    └── AdaptiveImage.tsx          ← next/image vs <img> switch by deploymentMode
```

### Component Rules
- `ui/` — Aceternity originals; extend by wrapping, never modifying in place
- Prop types derived from `lib/content/types.ts`; no raw JSON objects passed to components
- `"use client"` only on: `ItemGallery`, `FilterBar`, `ContactSection`, `QRModal`
- All other components are React Server Components

---

## 13. Configuration — `site.config.ts`

```ts
import type { SiteConfig } from "@/lib/config/types";

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────────────────────
  name: "Will's Used Exchange",
  tagline: "Quality second-hand items — local pickup preferred.",
  logo: "",                                   // path in /public, or "" for text logo

  // ── Deployment ───────────────────────────────────────────────────────────
  deploymentMode: "vercel",                   // "vercel" | "static"
  baseUrl: "https://your-domain.com",         // used for OG tags + sitemap
  // baseUrl can also be "https://your-name.vercel.app"

  // ── Image Storage ─────────────────────────────────────────────────────────
  // See DESIGN.md §3 "Image Storage Architecture" for the full rationale.
  imageStorage: {
    provider: "vercel-blob",
    // "local"         → copy to public/items/ at build (good for local dev & self-hosted)
    // "vercel-blob"   → auto-upload to Vercel Blob CDN; set BLOB_READ_WRITE_TOKEN in Vercel
    // "cloudflare-r2" → auto-upload to Cloudflare R2; set CF_R2_* env vars
  },

  // ── Content defaults ──────────────────────────────────────────────────────
  currency: "USD",
  recentlyListedCount: 6,
  soldItemRetentionDays: 3,                   // 0 = keep forever; -1 = hide immediately

  // ── Contact ───────────────────────────────────────────────────────────────
  contact: {
    reveal_behavior: "click",                 // "click" | "always"
    platforms: [
      { type: "email",     value: "you@example.com" },
      { type: "instagram", value: "your_handle" },
      { type: "wechat",    qr_image: "/contact/wechat-qr.png", label: "WeChat" },
    ],
  },

  // ── Home page ─────────────────────────────────────────────────────────────
  hero: {
    cta_label: "Browse Items",
    cta_href: "#categories",
  },

  // ── SEO ───────────────────────────────────────────────────────────────────
  meta: {
    description: "Personal second-hand marketplace.",
    twitterHandle: "",
  },
};
```

---

## 14. Build Pipeline

```
pnpm build
  │
  ├── [prebuild]  scripts/sync-images.ts
  │     │
  │     ├── Scans items/**/*.{jpg,jpeg,png,webp,gif}
  │     ├── Loads .image-cache/checksums.json  (skips unchanged files)
  │     │
  │     ├── [provider: "local"]
  │     │     └── Copies to public/items/**
  │     │
  │     ├── [provider: "vercel-blob"]
  │     │     └── Uploads new/changed files via @vercel/blob
  │     │         (reads BLOB_READ_WRITE_TOKEN from env)
  │     │
  │     └── [provider: "cloudflare-r2"]
  │           └── Uploads new/changed files via @aws-sdk/client-s3
  │               (reads CF_R2_* env vars)
  │
  │     Writes lib/generated/image-manifest.json  ← URL map for loader
  │     Writes .image-cache/checksums.json        ← incremental cache
  │     Logs: provider=X, uploaded N, skipped M (unchanged)
  │
  ├── next build
  │     loader.ts reads image-manifest.json to resolve all image URLs
  │     generateStaticParams runs for /[category] and /[category]/[item]
  │     All pages rendered to static HTML + JSON
  │     If deploymentMode === "static": output: 'export' → out/
  │
  └── [postbuild] (optional)
        next-sitemap → sitemap.xml + robots.txt
```

---

## 15. Status & Visibility Rules

| Status | Home page | Category grid | Detail page | Notes |
|---|---|---|---|---|
| `available` | Yes | Yes | Yes | |
| `reserved` | Yes + badge | Yes + badge | Yes | Buyer info stays private |
| `pending` | Yes + badge | Yes + badge | Yes | |
| `sold` | No | Yes + overlay | Yes | Hidden after `soldItemRetentionDays` |
| `draft` | No | No | No | Never generates a route |

---

## 16. Directory Layout

```
usedExchange/
├── items/                         ← content root (seller-managed, git-tracked)
│   └── contact/                   ← QR code images (git-tracked)
│
├── public/
│   └── items/                     ← GITIGNORED; generated by prebuild (local provider only)
│
├── .image-cache/                  ← GITIGNORED; incremental upload checksum cache
│   └── checksums.json
│
├── app/
│   ├── layout.tsx                 ← root layout + global metadata
│   ├── page.tsx                   ← home
│   ├── [category]/
│   │   ├── page.tsx
│   │   └── [item]/
│   │       └── page.tsx
│   └── not-found.tsx
│
├── components/                    ← see §12
│
├── lib/
│   ├── content/
│   │   ├── loader.ts
│   │   ├── schema.ts
│   │   └── types.ts
│   ├── images/
│   │   ├── adapter.ts             ← ImageStorageAdapter interface
│   │   ├── local.ts               ← "local" provider implementation
│   │   ├── vercel-blob.ts         ← "vercel-blob" provider implementation
│   │   └── cloudflare-r2.ts       ← "cloudflare-r2" provider implementation
│   ├── generated/
│   │   └── image-manifest.json    ← GITIGNORED; written by prebuild, read by loader
│   └── config/
│       └── types.ts               ← SiteConfig TypeScript type
│
├── scripts/
│   └── sync-images.ts             ← reads siteConfig.imageStorage, dispatches to adapter
│
├── site.config.ts                 ← seller-facing configuration
├── tailwind.config.ts
├── next.config.ts                 ← reads deploymentMode + imageStorage for remote patterns
├── tsconfig.json
├── package.json
├── DESIGN.md                      ← this file
└── TECH_REQUIREMENTS.md           ← detailed technical spec
```

---

## 17. Extensibility Register

| Future feature | Designated extension point |
|---|---|
| Client-side search | `fuse.js`; index JSON built from `loadCategories()` at build time, embedded in page |
| Contact form / enquiry | Serverless function; `ContactSection` has a reserved slot |
| Analytics | Script tag in `SiteHeader.tsx`; no other changes |
| Dark mode | `tailwind darkMode: 'class'` + toggle in `SiteHeader`; Aceternity components inherit |
| i18n | `site.config.ts` string keys; item JSON can carry `name_zh`, `description_zh`, etc. |
| Sitemap / RSS | `next-sitemap`; all static routes already known at build |
| Draft preview | Next.js middleware on `/preview/[category]/[item]`; reads `status: "draft"` items |
| Tag filtering | Tags already stored; add tag index to loader + filter UI |

---

*All open questions from v0.1.0 are resolved. Implementation may begin.*
